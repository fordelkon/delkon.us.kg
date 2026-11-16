---
title: "并发编程（五）：消息传递、任务池与背压"
description: "区分消息交付、工作接纳与处理完成，介绍任务池、流水线、背压与信号量，分析容量和吞吐的关系，以及排空或取消工作的关停协议。"
publishDate: "10 Oct 2026"
tags: ["concurrency", "rust", "go"]
---

上一篇[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/)讨论了共享状态下的错误与等待。本篇换一个组织方式：让任务通过消息协作，把状态的修改集中在明确的所有者手里。

换一种协作方式并不豁免上一篇讨论的[活性问题](/posts/concurrency/deadlock-livelock-correctness/#结果正确与任务推进)：消费者等待断连、生产者等待接收、双方互等，仍然是“需要完成的事情最终能够发生”落空的情形；变化的只是死锁的位置——从锁的获取顺序变成通道拓扑与关闭责任。消息传递减少直接共享，却仍然需要回答三个问题：谁处理任务，积压放在哪里，下游停止后上游怎样退出？

## 消息传递与状态所有权

Go 的 Effective Go 用“不要通过共享内存来通信，而要通过通信共享内存”（Don't communicate by sharing memory; share memory by communicating）概括这种设计：发送者通过通道交付工作，接收者负责后续处理。它强调用通信组织数据访问，并不要求所有问题都改用 Channel[^1]。

消息传递也不自动转移全部所有权。Rust 发送一个 `String` 会移动该值，发送 `Arc<Mutex<T>>` 则仍在[共享同一份状态](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)；Go 发送指针也不会复制指向的数据。是否仍需同步，取决于消息内容与后续访问协议。

**Actor** 把消息与状态所有者结合起来：每个 Actor 管理自己的状态，通过消息与外界交互。以 Akka 为例，一个 Actor 按顺序处理消息，外部通过消息请求它修改状态；其他 Actor 可以并发运行。这种串行处理边界不保证整个业务流程自动原子化，也不保证 mailbox 不会积压[^3]。

比较通信接口时，可以把 Actor 与 Go 采用的 **CSP**（Communicating Sequential Processes）衍生风格放在一起看：Go 的通道是一等值，可以传递给其他任务，通信双方通过持有的通道协作；Actor 则通过接收者的身份投递消息，由其 mailbox 接收。这是通信组织方式的对照，不是两类模型全部语义的区别。历史上，Hoare 1978 年的原始 CSP 按进程名通信；一等通道是 Go 所继承的 Newsqueak、Alef、Limbo 分支的特征，不能把它直接归给原始 CSP[^9]。

## 通道：发送、接收与关闭

**通道**（Channel）连接发送端与接收端。发送消息的一方称为生产者，领取消息的一方称为消费者。选择通道时，先看它允许多少个发送者和接收者：

- **多生产者、单消费者**（multiple producer, single consumer，简称 MPSC）：多个发送者提交消息，由一个消费者接收。
- **多生产者、多消费者**（multiple producer, multiple consumer，简称 MPMC）：多个发送者提交消息，多个消费者从同一通道领取消息。

这里的“多个消费者”表示分摊消息，不表示每个消费者都收到一份副本。Rust 标准库的 `mpsc` 属于前一种：发送端可以复制，接收端由一个消费者持有[^2]。

**消息队列**（message queue）通常强调缓冲与分发：生产者提交消息，消费者独立处理。Channel 也可以带缓冲，因此两者不是按“有没有队列”划分的互斥类别。进程内队列与跨进程消息服务的契约还可能不同，持久化、确认、重试和重复投递都需由具体接口说明。

### 有界缓冲与正常结束

下面让两个生产者提交任务，一个消费者处理。使用容量为 2 的有界通道，发送方在缓冲区满时等待：

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::sync_channel(2);

    thread::scope(|scope| {
        scope.spawn(move || {
            for task in rx {
                println!("handled {task}");
            }
        });

        for producer_id in 0..2 {
            let tx = tx.clone();
            scope.spawn(move || {
                for task_id in 0..5 {
                    tx.send(producer_id * 100 + task_id).unwrap();
                }
            });
        }
        // The receiver exits only after every sender has been dropped.
        drop(tx);
    });
}
```

输出应恰好包含 0–4 和 100–104，各一次；两个生产者的消息可以交错。最后一个发送端被丢弃后，消费者会先取完已缓冲的消息，再结束迭代。遗漏主线程中的 `drop(tx)`，消费者就会一直等待，作用域也无法结束。

`mpsc::channel()` 使用无界缓冲，发送不会因为队列已满而等待；`sync_channel(n)` 的缓冲有上限，`n == 0` 时发送与接收直接会合。接收端断开后，发送会返回错误；示例用 `unwrap()` 简化错误处理，实际生产者可以据此停止提交[^2]。

### 消息交付与处理完成

消息传递除了交付值，还能提供发送方与接收方之间的同步顺序，但要按具体通道契约确定配对条件。例如 Go 内存模型明确规定，一次发送同步于对应接收的完成；把发送前的数据写入与接收后的访问接到两端，就得到第三篇所说的[happens-before 链](/posts/concurrency/atomics-memory-model/#release--acquire发布与接收的边界)[^11]。交接消息不意味着对共享状态的所有后续访问都已同步：发送值可以交付已构造的数据，发送指针或共享所有权句柄则仍需约定后续修改的访问规则。

还要区分三个时刻：发送成功、接收成功、处理完成。有缓冲的接口通常允许消息入队后发送就返回；直接会合可以等待接收方接手，但接手也不等于完成后续业务。这些边界要落到接口上核对：Rust 的 `Sender::send` 返回 `Ok` 不保证消息最终一定被接收，接收端可能随后断开；`SyncSender::send` 在容量为 0 时成功返回，才保证消息已被接收。Go 的无缓冲通道也明确规定接收与对应发送完成之间的同步，但这条边不包含接收后的处理步骤[^12][^11]。

如果生产者必须等到处理完成才能继续，应让消费者在处理后发送确认，并等待这条确认，而不是把 `send` 返回当作完成凭证。多个生产者的消息可以交错；消费者接收到 A 的一条消息，也不能据此认定 B 已发送或完成。这与前面的示例只要求十个任务各处理一次、不规定生产者之间的全局执行顺序一致。

还要给“接受任务”规定明确含义。若提交接口在成功入队后返回，它承诺的是工作已交付给队列，而不是工作已成功执行；worker 失败时，已接受的任务仍需要可观察的失败结果或另行约定的恢复方式。若工作已经产生外部副作用，但确认未送达，调用方无法仅凭超时判断它是否执行；直接重试可能重复执行。任务编号、去重或幂等处理应围绕业务效果设计，通道的线程安全不会自动提供“恰好执行一次”的保证。这个区别会继续影响第六篇的[取消与外部副作用](/posts/concurrency/async-concurrency-task-lifecycle/#丢弃-future-与清理资源)。

## 任务池与流水线

### 任务池：复用执行单元

**任务池**（worker pool）让一组执行单元反复领取任务，而不是每来一个任务就创建一个线程；池里被复用的是执行单元，不是任务。线程池用线程作为 worker，异步任务池也可以用固定数量的异步 worker。[执行单元与任务](/posts/concurrency/parallelism-execution-units/#任务与执行单元)的生命周期由此分开；Oracle 的线程池教程用内部任务队列解释了这种复用方式[^4]。

前面的 Rust 示例只有一个消费者。下面仍用标准库，让两个 worker 分摊六个任务；任务与结果通道的容量都设为 2。`Receiver` 不能直接复制给多个 worker，因此用 `Arc<Mutex<Receiver<T>>>` 串行化领取，在锁外计算。这是共享接收端的适配方式，没有把标准库通道变成原生 MPMC 接口[^2]。此任务池示例仅依赖标准库，采用默认的 panic 展开行为。

```rust
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

fn main() {
    let (task_tx, task_rx) = mpsc::sync_channel::<usize>(2);
    let (result_tx, result_rx) = mpsc::sync_channel(2);
    let task_rx = Arc::new(Mutex::new(task_rx));

    thread::scope(|scope| {
        let workers: Vec<_> = (0..2)
            .map(|_| {
                let task_rx = Arc::clone(&task_rx);
                let result_tx = result_tx.clone();
                scope.spawn(move || loop {
                    let task = {
                        let receiver = task_rx.lock().unwrap();
                        receiver.recv()
                    }; // Release the lock before computing or sending.
                    let Ok(id) = task else { break };
                    result_tx.send((id, id * id)).unwrap();
                })
            })
            .collect();
        // Only workers should retain ownership of the task receiver.
        drop(task_rx);
        drop(result_tx);

        let producer = scope.spawn(move || {
            for id in 0..6 {
                task_tx.send(id).unwrap();
            }
            drop(task_tx);
        });

        // Drain results while the producer is still submitting tasks.
        let mut results: Vec<_> = result_rx.into_iter().collect();
        producer.join().unwrap();
        for worker in workers {
            worker.join().unwrap();
        }
        results.sort_unstable();
        assert_eq!(results, vec![(0, 0), (1, 1), (2, 4), (3, 9), (4, 16), (5, 25)]);
    });
}
```

显式块让接收锁只覆盖 `recv()`；等待任务时会持锁，但取到任务后就释放，另一个 worker 可以领取下一项并在锁外计算。结果顺序不固定，排序后与完整预期列表比较，检查六项结果各出现一次；它不保证两个 worker 恰好均分任务，也不证明某次运行发生了并行执行。

提交与收集应同时推进：任务足够多时，如果主线程先提交全部任务，再接收结果，结果队列可能先满，worker 堵在发送上，不再领取任务；任务队列随后也满，主线程就无法完成提交。这里单独启动提交线程，主线程持续取结果，解除这条等待环。提交结束时丢弃任务发送端，worker 排空任务后退出并丢弃各自的结果发送端；主线程提前丢弃原始 `result_tx`，所以结果迭代最终也能结束。最后显式 `join` 提交线程和全部 worker，确认生命周期完成。

worker 创建完毕后，主线程也丢弃原始 `task_rx`，只让 worker 持有任务接收端。若全部 worker 提前退出或在锁外业务处理中 panic，最后一份接收端会被释放，使阻塞于满队列的生产者从 `send` 得到错误，避免主线程一直卡在 `producer.join()`[^12]。示例用 `unwrap()` 让意外断连或线程 panic 暴露为失败；`unwrap()` 本身无法解除阻塞，退出还依赖上述所有权释放。这里讨论默认的 panic 展开行为；`panic=abort` 会直接终止进程。若 worker 一直阻塞在业务操作中而没有退出，释放主线程的引用也不能强行取消它。

### fan-out / fan-in：分工与汇总

**流水线**（pipeline）把工作拆成由通道连接的阶段。一个阶段可以有多个 worker：它们从同一输入领取工作，称为 **fan-out**；把多个输出合并为一个输出，称为 **fan-in**。这里的 fan-out 是分摊任务，每条消息由一个接收者取走，并非广播[^6]。

前面的 Rust 任务池已经体现了分摊与汇总：两个 worker 领取同一输入，再把结果发送到同一结果通道。Go 官方[流水线示例](https://go.dev/blog/pipelines)采用另一种拓扑：`gen` 产生数据，两个 `sq` 从同一输入分摊计算，各自输出到独立通道，再由 `merge` 汇总。任务池强调执行单元复用，fan-out / fan-in 强调数据怎样分流与合流，两种视角可以描述同一个系统[^6]。

```mermaid title="Go 流水线的分发与汇聚" description="两个 sq 从共享输入分摊任务，每条消息仅由一个 worker 领取，并非广播。它们分别写入自己的输出通道，再由 merge 合并输出。"
flowchart TB
 gen["gen：产生数据"] --> input["共享输入通道"]
 input -->|领取| sq1["sq 1：计算"]
 input -->|领取| sq2["sq 2：计算"]
 sq1 --> out1["输出通道 1"]
 sq2 --> out2["输出通道 2"]
 out1 --> merge["merge：合并输出"]
 out2 --> merge
```

这里引入 Go，是因为它允许多个接收者直接共享通道，且后面可以用 `select` 清楚展示取消信号与数据发送之间的选择。Go 的结束协议需要另行说明：向已关闭通道发送、重复关闭通道都会 panic，因此应由发送方负责关闭；多个发送者共享输出时，需由协调者确认全部发送结束后再关闭，官方 `merge` 就用 `WaitGroup` 等待所有转发结束。关闭后仍可取完缓冲中的值，随后接收得到零值，`v, ok := <-ch` 返回 `ok == false`，`for range` 随之结束；`nil` 通道的发送与接收都会永远阻塞，在 `select` 中相应分支永远不会就绪。Rust 标准库通道通过最后一个发送端被丢弃表示不再有消息；两种机制都需要明确结束发送的责任[^2][^6][^13]。

## 背压与队列容量

任务池解决了“谁来处理”，却还没解决“能积压多少”。固定 worker 数量不会自动限制队列；若提交速度长期高于处理能力，无界队列仍会不断增长。Tokio 的多线程运行时也复用 worker 线程来轮询异步任务，但 worker 线程数并不是异步任务数量的上限[^5]。

**背压**（backpressure）让下游的处理压力传回上游。例如有界通道已满时，发送方等待空位，使生产速度受到消费速度的约束。Rust 的 `sync_channel` 会阻塞发送线程，Tokio 的有界 `mpsc` 则让 `send().await` 异步等待[^2][^7]。

有界缓冲限制的是**队列中等待领取的消息数**，不是所有在途工作。假设队列容量为 Q，有 W 个 worker，且每个 worker 同时只处理一个任务，那么队列加正在处理的工作至多是 Q + W；发送者手里尚未入队的数据、上游队列和其他缓冲还要另算。

因此还需检查压力有没有真正传回入口。如果每次提交都先创建一个任务，再让它等待 `send().await`，消息虽然没进队列，等待发送的任务仍可能无限增长。消息大小不受限时，消息数量有界也不等于内存占用有固定上限。

队列满时的策略取决于业务：

| 策略       | 适用要求                       | 需要处理的问题                     |
| ---------- | ------------------------------ | ---------------------------------- |
| 等待空位   | 上游可以放慢，工作不应直接丢弃 | 取消、超时与等待者数量             |
| 拒绝提交   | 入口需要快速响应过载           | 明确错误与重试策略                 |
| 丢弃或合并 | 旧状态可被新状态替代           | 哪些数据允许丢失，丢弃旧值还是新值 |

有界队列能约束积压，却不保证延迟上界：worker 可能长期阻塞，单个任务也可能没有完成期限。无界通道则应以可证明的提交总量或速率约束为前提，不能仅靠“平时消费者足够快”支撑[^7]。

### 容量、吞吐与等待时间

队列容量回答“允许多少工作等待”，处理能力回答“单位时间能完成多少工作”。在到达负载不变时，增大缓冲可以吸收短时突发；如果长期提交速度超过处理能力，只增大容量只会推迟队列再次填满。系统最终仍需放慢上游、拒绝部分提交或改变处理能力，无法同时维持无限接受、有限积压与全部及时完成。

因此，观察过载要区分提交尝试、成功接纳和处理完成三个速率。只统计已完成任务的耗时，会漏掉入口等待和拒绝；只看瞬间队列为空，也可能漏掉 worker 已领取却阻塞在外部资源上的工作。至少应分别观察入口等待、排队、处理与结果交付，并确认结果队列和等待发送者是否也在积压。

worker 数量增加后，瓶颈也可能转移到接收锁、共享结果、数据库连接或其他串行阶段。前面的标准库任务池在锁外计算，但领取任务仍需串行通过同一接收锁；当业务计算很短时，这种协调成本就可能占据较大比例。这与第一篇的[任务粒度与负载均衡](/posts/concurrency/parallelism-execution-units/#任务粒度与负载均衡)是同一个问题：更多 worker 和更多排队空间都不是吞吐提升的充分条件。

## 信号量与资源并发数

队列容量限制了等待领取的消息，但处理任务还可能占用数据库连接、GPU 执行槽等有限资源。这些资源需要单独限制并发使用数量。第二篇把管理资源许可的**信号量**（Semaphore）留到本篇：它用许可数量约束同时占用资源的任务数，进入前获取许可，离开时归还。下面用 Tokio 展示[^10]：此处只需理解 `tokio::spawn` 创建可并发推进的任务、`.await` 等待其完成，[`.await` 的驱动机制](/posts/concurrency/async-concurrency-task-lifecycle/#future由-poll-推进的计算)留到下一篇。

下面共有六个任务，最多两个任务同时持有许可。先获取许可再启动任务，使生产端也受到限制：

```rust
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let slots = Arc::new(Semaphore::new(2));
    let mut handles = Vec::new();

    for id in 0..6 {
        let permit = Arc::clone(&slots).acquire_owned().await.unwrap();
        handles.push(tokio::spawn(async move {
            // Keep the permit until the protected operation is complete.
            let _permit = permit;
            tokio::time::sleep(Duration::from_millis(10)).await;
            id
        }));
    }

    for handle in handles {
        println!("finished {}", handle.await.unwrap());
    }
}
```

`acquire_owned` 返回的许可可以移入新任务；任务结束时许可被丢弃并归还。许可的作用域必须覆盖完整的资源使用过程，而不能刚开始请求就提前释放[^8]。

有界通道与信号量限制的是不同位置：

| 工具             | 直接限制的数量             | 不自动保证的事情       |
| ---------------- | -------------------------- | ---------------------- |
| 固定 worker 数量 | 同时处理任务的 worker 数   | 队列长度有界           |
| 有界 Channel     | 缓冲中等待领取的消息数     | 总任务数、处理时长有界 |
| Semaphore        | 同时持有许可的资源使用者数 | 每秒请求数有上限       |

限并发不等于限速：请求越快完成，同一组许可每秒就可能服务越多请求。需要每秒配额时，还需基于时间的速率控制。信号量也不是只能用于资源计数，它还能参与互斥或事件排序；这里按用途比较，延续第二篇的[同步工具划分](/posts/concurrency/locks-condvars-shared-memory-sync/#共享内存保护状态与协调推进)：按主要用途划分只是讲解视角，并不是互不重叠的分类。

## 提前退出与取消

限制队列和资源占用后，还要处理下游不再需要结果的情况。前面的 Rust 任务池持续收集到结果通道断连，并等待全部线程结束。这里转向 Go 官方流水线讨论的另一种情形：下游只取一个结果就停止接收，又没有通知上游退出，上游便可能永远卡在发送上。goroutine 无法推进也不会自动被回收，这类问题称为 **goroutine 泄漏**（goroutine leak）。扩大缓冲只对已知的剩余消息量有效，不能替代退出协议[^6]。

Go 可以关闭一个独立的 `done` 通道广播取消，让发送者同时等待“可以发送”或“下游已退出”。这个“同时等待”由 **`select`** 语句实现：没有 `default` 分支时，它阻塞到某个分支可以执行；多个分支同时就绪时随机选择一个，避免固定偏序；存在 `default` 分支时不再阻塞，没有就绪分支就执行 `default`[^13]。标准库还提供 `time.After` 等以通道形式出现的定时信号，常与 `select` 搭配实现超时，[超时的系统讨论](/posts/concurrency/async-concurrency-task-lifecycle/#timeout-与-select)留到下一篇。下面用单阶段示例保留这个机制，并等待生产者确认退出：

```go
package main

import "fmt"

func main() {
	done := make(chan struct{})
	stopped := make(chan struct{})
	out := make(chan int)

	go func() {
		defer close(stopped)
		defer close(out)
		for n := 0; ; n++ {
			select {
			case out <- n:
			case <-done:
				return
			}
		}
	}()

	fmt.Println(<-out)
	close(done) // Cancel through a signal, not by closing the data channel.
	<-stopped
}
```

主 goroutine 取到 0 后停止消费，关闭 `done`，再等生产者退出。若把这种协议扩展到多阶段流水线，每个可能阻塞的发送、接收或外部操作都需要参与取消；关闭 `done` 不会强行中断正在计算的 goroutine[^6]。

Rust 标准库通道可以利用接收端断开，让正在发送或之后发送的生产者得到错误并退出。反方向上，全部发送端丢弃后，接收方取完缓冲才能观察到断连；`recv()` 返回 `Err`，迭代结束。Tokio `mpsc::Receiver::recv()` 则以 `None` 表示结束。退出行为应按实际 API 解释，不能混用返回值[^2][^7]。

## 关停时怎样处置已接受的工作

通道结束只是协作协议中的一个事件。一个任务处理器还需要区分停止接受新工作、处置已接受工作和等待执行单元退出。可以沿前面的有界任务池检查两种关停策略：

| 阶段 | 排空后退出 | 取消剩余工作 |
| ---- | ---------- | ------------ |
| 停止接纳 | 让所有提交入口不再接受新任务，并处理尚未入队的提交 | 同样先停止接纳，明确这些提交被拒绝或取消 |
| 队列中的工作 | worker 继续领取，直到队列排空且不会再有消息 | 明确丢弃、退回或转移责任，不能默默视为成功 |
| 正在处理的工作 | 按约定执行到完成，并交付结果 | 发出取消请求；已产生的外部效果仍需单独确认 |
| 结果与退出 | 持续接收结果，再等待全部 worker 结束 | 接收完成、失败或取消状态，再确认 worker 已结束 |

顺序很关键。排空策略若先停掉结果接收者，worker 可能堵在发送结果上，反而无法排空输入；只丢弃主线程的一份发送端，也无法关闭其他生产者保留的入口。前面的示例通过结束生产者、释放全部任务发送端、持续收集结果，最后 join 全部线程，完成了正常结束路径。若引入可随时触发的关停，则需要进一步协调所有提交入口与未完成提交。

停止接纳也要有可判定的边界。例如先检查一个 `stopping` 标志，再独立入队，如果检查与关停交错，仍可能在标志变更后入队。协议可以把检查与登记纳入同一同步边界，也可以规定“已获得接纳资格的提交仍可完成”，但必须明确谁被纳入已接受集合，不能把一次状态读取当成完整的入口关闭。这正是第四篇[线性化点](/posts/concurrency/deadlock-livelock-correctness/#线性化点完整操作何时生效)在关停接口上的应用。

Tokio 的有界 `mpsc` 还提供 `Receiver::close()`：接收端保留队列，拒绝新的普通发送，并可继续 `recv()` 排空。不过，关闭前已取得的 `Permit` / `OwnedPermit` 仍能发送；要确认通道完全结束，需要消费消息直到 `None`，已有许可也必须被使用或释放。直接丢弃接收端则会丢弃未读消息，这与“关闭入口后排空”是不同的处置策略[^14]。第六篇的[容量预约与取消](/posts/concurrency/async-concurrency-task-lifecycle/#取消安全中断后能否重来)会进一步解释许可与消息归属。

## 总结

- 消息传递把协作边界显式化，但消息若仍引用共享可变数据，原有同步要求仍然存在。
- 任务池复用执行单元，fan-out 分摊工作，fan-in 汇总结果；关闭输出前必须确认所有发送结束。
- 背压必须沿调用链传回入口。有界队列、固定 worker 和信号量分别约束不同位置，不能互相替代。
- 下游提前退出时，上游需要能观察到取消或断连；关停还需明确接纳边界、已接受工作的处置，以及谁等待全部执行单元退出。

下一篇[《并发编程（六）：异步并发与任务的生命周期》](/posts/concurrency/async-concurrency-task-lifecycle/)继续解释 Future 如何推进，以及取消、超时和结构化并发怎样管理任务的结束。

## 延伸阅读

- Rust 示例可在 [Rust Playground](https://play.rust-lang.org) 运行，Go 示例可在 [Go Playground](https://go.dev/play/) 运行

[^1]: [Effective Go: Share by communicating](https://go.dev/doc/effective_go#sharing)——用通信组织共享数据访问的设计思路及其适用边界

[^2]: [Rust `std::sync::mpsc`](https://doc.rust-lang.org/std/sync/mpsc/)——多生产者单消费者、缓冲、同步发送与断连语义

[^3]: [Akka: What is an Actor?](https://doc.akka.io/libraries/akka-core/current/typed/guide/actors-intro.html)——Actor 的状态封装、消息处理与协作边界

[^4]: [Oracle Java Tutorial: Thread Pools](https://docs.oracle.com/javase/tutorial/essential/concurrency/pools.html)——worker 复用、内部任务队列及执行单元数量控制

[^5]: [Tokio runtime](https://docs.rs/tokio/latest/tokio/runtime/)——多线程 worker、任务调度与运行时的公平性条件

[^6]: [Go Blog: Pipelines and cancellation](https://go.dev/blog/pipelines)——fan-out / fan-in 示例参考、输出关闭顺序、下游提前退出与广播取消

[^7]: [Tokio `mpsc`](https://docs.rs/tokio/latest/tokio/sync/mpsc/)——有界与无界通道、背压、断连与接收结束语义

[^8]: [Tokio `Semaphore`](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html)——许可生命周期、`acquire_owned` 与启动任务前限制并发的用法

[^9]: [Rob Pike：Go Concurrency Patterns，History / Distinction](https://go.dev/talks/2012/concurrency.slide)——区分原始 CSP 按进程名通信与 Go 所继承的一等通道分支；历史来源见 [C. A. R. Hoare, Communicating Sequential Processes, 1978](https://dl.acm.org/doi/10.1145/359576.359585)

[^10]: `#[tokio::main(flavor = "current_thread")]` 表示示例在单线程的 Tokio 运行时上运行，仅为让示例自包含；运行时形态与 worker 线程见 [Tokio runtime 文档](https://docs.rs/tokio/latest/tokio/runtime/)

[^11]: [Go 内存模型：Channel communication](https://go.dev/ref/mem#chan)——发送到对应接收完成的同步，以及无缓冲通道接收到发送完成的反向同步；两者均不把接收后的处理纳入发送完成保证

[^12]: [Rust `Sender::send`](https://doc.rust-lang.org/std/sync/mpsc/struct.Sender.html#method.send)与[`SyncSender::send`](https://doc.rust-lang.org/std/sync/mpsc/struct.SyncSender.html#method.send)——发送成功不保证最终接收、有缓冲发送与零容量会合的保证差别；接收保证不包含后续业务处理完成

[^14]: [Tokio 1.53.3 `Receiver::close`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/struct.Receiver.html#method.close)与[`mpsc` 的 Clean Shutdown](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/index.html#clean-shutdown)——关闭接收入口后排空消息、未使用许可对通道结束的影响，以及直接丢弃接收端会丢弃未读消息的区别

[^13]: [Go 规范：Channel types](https://go.dev/ref/spec#Channel_types)、[Close](https://go.dev/ref/spec#Close)与[Select statements](https://go.dev/ref/spec#Select_statements)——通道阻塞、关闭与 nil 通道语义，以及 select 的伪随机分支选择和 default 规则
