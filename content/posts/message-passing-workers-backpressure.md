---
title: "并发编程（五）：消息传递、任务池与背压"
description: "从 Channel 的发送、接收与关闭出发，介绍任务池和 fan-out / fan-in 流水线，区分队列容量、资源并发数与速率限制，并讨论背压和提前退出。"
publishDate: "10 Oct 2026"
tags: ["concurrency", "rust", "go"]
---

上一篇[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/deadlock-livelock-correctness/)讨论了共享状态下的错误与等待。本篇换一个组织方式：让任务通过消息协作，把状态的修改集中在明确的所有者手里。

换一种协作方式并不豁免上一篇讨论的[活性问题](/posts/deadlock-livelock-correctness/#结果正确与任务推进)：消费者等待断连、生产者等待接收、双方互等，仍然是“需要完成的事情最终能够发生”落空的情形；变化的只是死锁的位置——从锁的获取顺序变成通道拓扑与关闭责任。消息传递减少直接共享，却仍然需要回答三个问题：谁处理任务，积压放在哪里，下游停止后上游怎样退出？

## 消息传递与状态所有权

Go 的 Effective Go 用“不要通过共享内存来通信，而要通过通信共享内存”（Don't communicate by sharing memory; share memory by communicating）概括这种设计：发送者通过通道交付工作，接收者负责后续处理。它强调用通信组织数据访问，并不要求所有问题都改用 Channel[^1]。

消息传递也不自动转移全部所有权。Rust 发送一个 `String` 会移动该值，发送 `Arc<Mutex<T>>` 则仍在[共享同一份状态](/posts/locks-condvars-shared-memory-sync/#mutex独占访问)；Go 发送指针也不会复制指向的数据。是否仍需同步，取决于消息内容与后续访问协议。

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

消息传递除了交付值，还能提供发送方与接收方之间的同步顺序，但要按具体通道契约确定配对条件。例如 Go 内存模型明确规定，一次发送同步于对应接收的完成；把发送前的数据写入与接收后的访问接到两端，就得到第三篇所说的[happens-before 链](/posts/atomics-memory-model/#release--acquire发布与接收)[^11]。交接消息不意味着对共享状态的所有后续访问都已同步：发送值可以交付已构造的数据，发送指针或共享所有权句柄则仍需约定后续修改的访问规则。

还要区分三个时刻：发送成功、接收成功、处理完成。有缓冲的接口通常允许消息入队后发送就返回；直接会合可以等待接收方接手，但接手也不等于完成后续业务。这些边界要落到接口上核对：Rust 的 `Sender::send` 返回 `Ok` 不保证消息最终一定被接收，接收端可能随后断开；`SyncSender::send` 在容量为 0 时成功返回，才保证消息已被接收。Go 的无缓冲通道也明确规定接收与对应发送完成之间的同步，但这条边不包含接收后的处理步骤[^12][^11]。

如果生产者必须等到处理完成才能继续，应让消费者在处理后发送确认，并等待这条确认，而不是把 `send` 返回当作完成凭证。多个生产者的消息可以交错；消费者接收到 A 的一条消息，也不能据此认定 B 已发送或完成。这与前面的示例只要求十个任务各处理一次、不规定生产者之间的全局执行顺序一致。

## 任务池与流水线

### 任务池：复用执行单元

**任务池**（worker pool）让一组执行单元反复领取任务，而不是每来一个任务就创建一个线程；池里被复用的是执行单元，不是任务。线程池用线程作为 worker，异步任务池也可以用固定数量的异步 worker。[执行单元与任务](/posts/concurrency-parallelism-execution-units/#任务与执行单元)的生命周期由此分开；Oracle 的线程池教程用内部任务队列解释了这种复用方式[^4]。

前面的 Rust 示例只有一个消费者。要让多个 worker 共同领取任务，还需检查接收端的共享方式：标准库的 `Receiver` 不能直接复制给多个 worker，可以用 `Arc<Mutex<Receiver<T>>>` 串行化领取、在锁外处理。这是一种共享接收端的适配方式，并没有把标准库通道变成原生 MPMC 接口。若确实需要原生 MPMC，Rust 生态的 crossbeam-channel 提供接收端可复制的实现，本篇示例仍以标准库为准。

### fan-out / fan-in：分工与汇总

**流水线**（pipeline）把工作拆成由通道连接的阶段。一个阶段可以有多个 worker：它们从同一输入领取工作，称为 **fan-out**；把多个输出合并为一个输出，称为 **fan-in**。这里的 fan-out 是分摊任务，每条消息由一个接收者取走，并非广播[^6]。

下面改用允许多个接收者共享通道的 Go，直接展示分工与汇总：两个 `square` 从同一通道领取数据，正是任务池“固定 worker 反复领取任务”的最小雏形。完整程序参考 Go 官方流水线示例：`gen` 产生数据，两个 `square` 分摊计算，`merge` 汇总结果。

```go
package main

import (
	"fmt"
	"sync"
)

func gen(nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			out <- n
		}
	}()
	return out
}

func square(in <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := range in {
			out <- n * n
		}
	}()
	return out
}

func merge(inputs ...<-chan int) <-chan int {
	out := make(chan int)
	var wg sync.WaitGroup
	wg.Add(len(inputs))
	for _, in := range inputs {
		go func(in <-chan int) {
			defer wg.Done()
			for n := range in {
				out <- n
			}
		}(in)
	}
	go func() {
		wg.Wait() // Close only after all forwarding sends have finished.
		close(out)
	}()
	return out
}

func main() {
	in := gen(2, 3, 4, 5)
	for n := range merge(square(in), square(in)) {
		fmt.Println(n)
	}
}
```

输出应包含 4、9、16、25，各一次，顺序不固定。多个 worker 可以并发推进，但这份输出不能证明某次运行一定发生了并行执行。

本例使用无缓冲通道：每次发送都要等待接收者。Go 中向已关闭通道发送会 panic，因此 `merge` 必须在全部转发结束后关闭输出。关闭通道在 Go 里是一套固定规则：只有发送方应关闭通道，发送方多于一个时需要单独约定关闭时机；重复关闭同一个通道会 panic；关闭之后接收仍可继续，取完缓冲中的值后得到零值，`v, ok := <-ch` 形式返回 `ok == false`，`for range` 随之结束；`nil` 通道的发送与接收都会永远阻塞，在 `select` 中相应分支永远不会就绪。Rust 标准库通道则通过最后一个发送端被丢弃表示不再有消息；两种机制都需要明确谁负责结束发送[^2][^6][^13]。

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

## 信号量与资源并发数

队列容量限制了等待领取的消息，但处理任务还可能占用数据库连接、GPU 执行槽等有限资源。这些资源需要单独限制并发使用数量。第二篇把管理资源许可的**信号量**（Semaphore）留到本篇：它用许可数量约束同时占用资源的任务数，进入前获取许可，离开时归还。下面用 Tokio 展示[^10]：此处只需理解 `tokio::spawn` 创建可并发推进的任务、`.await` 等待其完成，[`.await` 的驱动机制](/posts/async-concurrency-task-lifecycle/#future由-poll-推进的计算)留到下一篇。

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

限并发不等于限速：请求越快完成，同一组许可每秒就可能服务越多请求。需要每秒配额时，还需基于时间的速率控制。信号量也不是只能用于资源计数，它还能参与互斥或事件排序；这里按用途比较，延续第二篇的[同步工具划分](/posts/locks-condvars-shared-memory-sync/#共享内存保护状态与协调推进)：按主要用途划分只是讲解视角，并不是互不重叠的分类。

## 提前退出与取消

限制队列和资源占用后，还要处理下游不再需要结果的情况。前面的流水线依赖下游持续消费，直到所有输出关闭。如果下游只取一个结果就离开，上游可能永远卡在发送上：goroutine 既无法推进也无法被回收，这类问题称为 **goroutine 泄漏**（goroutine leak）。扩大缓冲只对已知的剩余消息量有效，不能替代退出协议[^6]。

Go 可以关闭一个独立的 `done` 通道广播取消，让发送者同时等待“可以发送”或“下游已退出”。这个“同时等待”由 **`select`** 语句实现：没有 `default` 分支时，它阻塞到某个分支可以执行；多个分支同时就绪时随机选择一个，避免固定偏序；存在 `default` 分支时不再阻塞，没有就绪分支就执行 `default`[^13]。标准库还提供 `time.After` 等以通道形式出现的定时信号，常与 `select` 搭配实现超时，[超时的系统讨论](/posts/async-concurrency-task-lifecycle/#timeout-与-select)留到下一篇。下面用单阶段示例保留这个机制，并等待生产者确认退出：

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

## 总结

- 消息传递把协作边界显式化，但消息若仍引用共享可变数据，原有同步要求仍然存在。
- 任务池复用执行单元，fan-out 分摊工作，fan-in 汇总结果；关闭输出前必须确认所有发送结束。
- 背压必须沿调用链传回入口。有界队列、固定 worker 和信号量分别约束不同位置，不能互相替代。
- 下游提前退出时，上游需要能观察到取消或断连，并有明确的退出与等待方式。

下一篇[《并发编程（六）：异步并发与任务的生命周期》](/posts/async-concurrency-task-lifecycle/)继续解释 Future 如何推进，以及取消、超时和结构化并发怎样管理任务的结束。

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

[^13]: [Go 规范：Channel types](https://go.dev/ref/spec#Channel_types)、[Close](https://go.dev/ref/spec#Close)与[Select statements](https://go.dev/ref/spec#Select_statements)——通道阻塞、关闭与 nil 通道语义，以及 select 的伪随机分支选择和 default 规则
