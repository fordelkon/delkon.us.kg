---
title: "并发编程（五）：消息传递、任务池与背压"
description: "区分消息交付、工作接纳与处理完成，介绍任务池、流水线、背压与信号量，分析容量和吞吐关系、提前退出，以及排空或取消工作的关停协议。"
publishDate: "10 Oct 2026"
tags: ["concurrency", "rust", "go"]
---

上一篇[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/)讨论了共享状态下的错误与等待。本篇换一个组织方式：让任务通过消息协作，把状态的修改集中在明确的所有者手里。

换一种协作方式并不豁免上一篇讨论的[活性问题](/posts/concurrency/deadlock-livelock-correctness/#结果正确与任务推进)：消费者等待断连、生产者等待接收、双方互等，仍然是“需要完成的事情最终能够发生”落空的情形；变化的只是死锁的位置——从锁的获取顺序变成通道拓扑与关闭责任。消息传递减少直接共享，却仍然需要回答三个问题：谁处理任务，积压放在哪里，下游停止后上游怎样退出？

## 消息传递与状态所有权

Go 的 Effective Go 用“不要通过共享内存来通信，而要通过通信共享内存”（Don't communicate by sharing memory; share memory by communicating）概括这种设计：发送者通过通道交付工作，接收者负责后续处理。它强调用通信组织数据访问，并不要求所有问题都改用通道[^1]。

消息传递也不自动转移全部所有权。Rust 发送一个 `String` 会移动该值，发送 `Arc<Mutex<T>>` 则仍在[共享同一份状态](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)；Go 发送指针也不会复制指向的数据。是否仍需同步，取决于消息内容与后续访问协议。

**Actor** 把消息与状态所有者结合起来：每个 Actor 管理自己的状态，通过消息与外界交互。以 Akka 为例，一个 Actor 按顺序处理消息，外部通过消息请求它修改状态；其他 Actor 可以并发运行。这种串行处理边界不保证整个业务流程自动原子化，也不保证 mailbox 不会积压[^2]。

比较通信接口时，可以把 Actor 与 Go 采用的 **CSP**（Communicating Sequential Processes）衍生风格放在一起看：Go 的通道是一等值，可以传递给其他任务，通信双方通过持有的通道协作；Actor 则通过接收者的身份投递消息，由其 mailbox 接收。这是通信组织方式的对照，不是两类模型全部语义的区别。历史上，Hoare 1978 年的原始 CSP 按进程名通信；一等通道是 Go 所继承的 Newsqueak、Alef、Limbo 分支的特征，不能把它直接归给原始 CSP[^3]。

## 通道：发送、接收与关闭

**通道**（channel）连接发送端与接收端。发送消息的一方称为生产者，领取消息的一方称为消费者。选择通道时，先看它允许多少个发送者和接收者：

- **多生产者、单消费者**（multiple producer, single consumer，简称 MPSC）：多个发送者提交消息，由一个消费者接收。
- **多生产者、多消费者**（multiple producer, multiple consumer，简称 MPMC）：多个发送者提交消息，多个消费者从同一通道领取消息。

这里的“多个消费者”表示分摊消息，不表示每个消费者都收到一份副本。Rust 标准库的 `mpsc` 属于前一种：发送端可以复制，接收端由一个消费者持有[^4]。

**消息队列**（message queue）通常强调缓冲与分发：生产者提交消息，消费者独立处理。通道也可以带缓冲，因此两者不是按“有没有队列”划分的互斥类别。进程内队列与跨进程消息服务的契约还可能不同，持久化、确认、重试和重复投递都需由具体接口说明。

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

输出应恰好包含 `handled 0`..`4` 与 `handled 100`..`104` 共十条，每项各出现一次；两个生产者的消息可以交错。最后一个发送端被丢弃后，消费者会先取完已缓冲的消息，再结束迭代。遗漏主线程中的 `drop(tx)`，消费者就会一直等待，作用域也无法结束。

`mpsc::channel()` 使用无界缓冲，发送不会因为队列已满而等待；`sync_channel(n)` 的缓冲有上限，`n == 0` 时发送与接收直接会合。接收端断开后，阻塞的 `send` 会返回错误；非阻塞调用 `try_send` / `try_recv` 则会显式区分 `TrySendError::Full` 与 `Disconnected`、`TryRecvError::Empty` 与 `Disconnected`，方便生产者按队列满（背压）还是对端退出采取不同策略（示例用 `unwrap()` 简化错误处理）[^4]。

### 消息交付与处理完成

消息传递除了交付值，还能提供发送方与接收方之间的同步顺序，但要按具体通道契约确定配对条件。例如 Go 内存模型明确规定，一次发送同步于对应接收的完成；把发送前的数据写入与接收后的访问接到两端，就得到第三篇所说的[happens-before 链](/posts/concurrency/atomics-memory-model/#release--acquire发布与接收的边界)[^5]。交接消息不意味着对共享状态的所有后续访问都已同步：发送值可以交付已构造的数据，发送指针或共享所有权句柄则仍需约定后续修改的访问规则。

以下四个术语描述本篇进程内任务池的协议边界。它们不一定对应四次可观察的返回：例如直接交接时，接纳与领取可以同时发生。

| 阶段 | 协议边界 | 不代表什么 |
| ---- | -------- | ---------- |
| **已接纳**（Accepted） | 任务池接管任务；本文以成功入队或直接交接为界 | 等待空位或仅预约容量，还不算接纳 |
| **已领取**（Claimed） | worker 取走任务，接手处理责任 | 还没有业务结果 |
| **已完成**（Completed） | worker 产出成功结果或明确的业务失败 | 结果不一定已入队，更不一定已送达 |
| **已确认**（Acknowledged） | 提交方收到协议约定的最终状态，通常随结果送达 | 确认不等于成功；协议也可以确认取消或故障 |

```mermaid mobile-direction="TB" title="接纳、领取、完成与确认" description="在这条处理路径上，任务入队即被接纳，随后由 Worker 领取。Worker 先完成处理，提交方收到结果才算确认；若结果端关闭，任务即使已完成也可能未获确认。"
flowchart LR
 submit["提交任务"] -->|入队成功| accepted["Accepted<br/>已接纳"]
 accepted -->|Worker 取走| claimed["Claimed<br/>已领取"]
 claimed -->|产出业务结果| completed["Completed<br/>已完成"]
 completed -->|提交方收到结果| acknowledged["Acknowledged<br/>已确认"]
 completed -.->|结果端关闭| lost["结果无法交付"]
 class submit actor
 class accepted,claimed state
 class completed,acknowledged result
 class lost risk
```

有缓冲的接口通常允许消息入队后发送就返回；直接会合可以等待接收方接手，但接手也不等于完成后续业务。这些边界要落到接口上核对：Rust 的 `Sender::send` 返回 `Ok` 不保证消息最终一定被接收，接收端可能随后断开；`SyncSender::send` 在容量为 0 时成功返回，才保证消息已被接收。Go 的无缓冲通道也明确规定接收与对应发送完成之间的同步，但这条边不包含接收后的处理步骤[^6][^5]。

如果提交方必须等到处理完成才能继续，应等待与该任务对应的结果或确认，而不是把 `send` 返回当作完成凭证。多个生产者的消息可以交错；消费者领取了 A 的一条消息，也不能据此认定 B 的任务已接纳或已完成。这与前面的示例只要求十个任务各处理一次、不规定生产者之间的全局执行顺序一致。

进程崩溃可能丢掉仍在内存中的任务和结果。持久消息服务还需分别约定持久化、确认和重投递；“至多一次”允许漏投，“至少一次”允许重复投递，“恰好一次”必须说明指哪一段协议的哪个效果。进程内任务池没有这些跨故障交付保证。提交方等待确认超时，只能说明没等到确认，不能据此判断工作尚未执行。若工作已经产生外部副作用，直接重试可能重复执行。任务编号、去重或幂等处理应围绕业务效果设计，通道的线程安全不会自动提供“恰好执行一次”的保证。这个区别会继续影响第六篇的[取消与外部副作用](/posts/concurrency/async-concurrency-task-lifecycle/#丢弃-future-与清理资源)。

## 任务池与流水线

### 任务池：复用执行单元

**任务池**（worker pool）让一组执行单元反复领取任务，而不是每来一个任务就创建一个线程；池里被复用的是执行单元，不是任务。线程池用线程作为 worker，异步任务池也可以用固定数量的异步 worker。[执行单元与任务](/posts/concurrency/parallelism-execution-units/#任务与执行单元)的生命周期由此分开；Oracle 的线程池教程用内部任务队列解释了这种复用方式[^7]。

前面的 Rust 示例只有一个消费者。下面仍用标准库，让两个 worker 分摊八个任务；任务与结果通道的容量都设为 2。`Receiver` 不能直接复制给多个 worker，因此用 `Arc<Mutex<Receiver<T>>>` 串行化领取，在锁外计算。这是共享接收端的适配方式，没有把标准库通道变成原生 MPMC 接口[^4]。此任务池示例仅依赖标准库，采用默认的 panic 展开行为。

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
        // Drop main's copy of result_tx so result_rx stops iterating once all workers exit.
        drop(result_tx);

        let producer = scope.spawn(move || {
            for id in 0..8 {
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
        assert_eq!(
            results,
            vec![(0, 0), (1, 1), (2, 4), (3, 9), (4, 16), (5, 25), (6, 36), (7, 49)]
        );
    });
}
```

显式块让接收锁只覆盖 `recv()`；等待任务时会持锁，但取到任务后就释放，另一个 worker 可以领取下一项并在锁外计算。结果顺序不固定，排序后与完整预期列表比较，检查八项结果各出现一次；它不保证两个 worker 恰好均分任务，也不证明某次运行发生了并行执行。

提交与收集应同时推进：本例的任务队列（$Q=2$）、两个 worker 槽（$W=2$）和结果队列（$R=2$）一共最多暂存 $2 + 2 + 2 = 6$ 项工作；如果主线程先按顺序提交全部 8 项任务、再收集结果，前 6 项填满[两条有界通道与 worker](#背压与队列容量)后，负责收集的主线程就会在第 7 次 `send` 处阻塞，谁也无法消费结果。这里单独启动提交线程，主线程持续取结果，解除这条等待环。提交结束时丢弃任务发送端，worker 排空任务后退出并丢弃各自的结果发送端；主线程提前丢弃原始 `result_tx`，所以结果迭代最终也能结束。最后显式 `join` 提交线程和全部 worker，确认这些线程都已退出。

worker 创建完毕后，主线程也丢弃原始 `task_rx`，只让 worker 持有任务接收端。若其中某一个 worker 在锁外处理中提前 panic，只要仍有其他 worker 存活并持有 `task_rx`，`Arc` 引用计数尚未归零，通道就不会立刻断连（故障会在随后 `worker.join()` 时暴露）；只有当全部 worker 都退出并释放各自的 `task_rx` 后，阻塞于满队列的生产者才会从 `send` 收到断连错误，避免卡在 `producer.join()`[^6]。示例用 `unwrap()` 让意外断连或线程 panic 暴露为失败；`unwrap()` 本身无法解除阻塞，退出还依赖上述所有权释放。这里讨论默认的 panic 展开行为；`panic=abort` 会直接终止进程。若 worker 一直阻塞在业务操作中而没有退出，释放主线程的引用也不能强行取消它。

还需防备另一类拓扑陷阱——**任务池自我提交死锁**：固定 $W$ 个 worker 在处理父任务时，又把子任务投递回同一个任务池并阻塞等待子任务结果。一旦并发父任务占满全部 $W$ 个 worker 槽都在等子任务完成，即便任务队列本身无界，也没有空闲执行单元来消费队列里的子任务，整个池子仍会互锁卡死，这正是上一篇[跨资源等待依赖](/posts/concurrency/deadlock-livelock-correctness/#等待不只发生在锁上)在消息池里的常见翻版。解决方式通常是拆分为层级隔离的不同任务池、使用支持工作窃取的异步/Fork-Join 调度，或让工作本身不阻塞等待同一池里的后续派发。

正常结果与预期业务失败可以作为 `Result` 经同一结果通道交回。Worker 在领取后 panic 时，原示例通过 `join` 暴露故障，该任务可能没有结果；如果允许重试，所有者需要记录已领取的任务及其业务标识。调用方提前退出时，结果发送失败应走明确的停止或回收路径；丢弃通道端可解除对应的通信等待，已经在执行的工作仍需自己的停止协议。

```mermaid title="Worker 或下游失效后的任务归属" description="预期的业务失败作为结果返回。若 Worker 在处理时 panic，由任务池所有者检查尚未收到结果的任务；若结果接收端关闭，由 Worker 根据关停协议结束或回收结果。图中不自动重试，避免未知副作用被重复执行。"
flowchart TB
 work["Worker 已领取任务"]
 business["产出 Result（含业务失败）"]
 panic["Worker panic"]
 output["结果端关闭"]
 owner["所有者核对任务与已产生的效果"]
 stop["按协议退出或回收结果"]
 work --> business
 work -.-> panic
 panic --> owner
 business -.->|send 返回断连| output
 output --> stop
 class work,owner actor
 class business result
 class stop state
 class panic,output risk
```

### 共享接收端与调度队列

| 接收方式 | 谁能领取 | 等待方式与协调成本 |
| -------- | -------- | ------------------ |
| `std::sync::mpsc` 加 `Arc<Mutex<Receiver<T>>>` | 多个 worker 通过同一接收锁分摊 | `recv` 阻塞线程，领取串行化 |
| `crossbeam_channel::bounded` | 原生 MPMC，各 worker 可持有自己的接收端 | `recv` 阻塞线程，竞争由通道实现协调 |
| `async-channel` 等异步 MPMC | 多个异步 worker 任务可直接共享 `Receiver` | `recv().await` 挂起任务，避免持有跨池同步锁 |
| Tokio `mpsc` | 单个接收端可由派发任务持有，再将工作交给其他任务 | `recv().await` 挂起任务，派发仍需限制在途工作 |

这些接口的吞吐取决于消息大小、任务粒度、高并发下的队列头尾[缓存行争用](/posts/concurrency/atomics-memory-model/#缓存一致性与伪共享)以及线程与异步调度成本，应在相同负载与退出语义下比较[^4][^8][^9]。

队列还可以放在调度器内部，用于分摊**就绪任务**。以 Tokio 1.53.3 的多线程运行时为例，每个 worker 有本地队列，另有一个全局队列供共享；本地和全局队列均无可取工作时，worker 可从其他 worker 的本地队列**窃取工作**（work stealing）。本地领取减少频繁访问共享队列的开销，窃取让空闲 worker 分担不均的负载，但也涉及跨线程协调与缓存局部性。这里移动的是可运行任务；外部业务队列仍需定义自己的接纳与容量，执行器的调度策略不会替应用限制请求数[^10]。

### fan-out / fan-in：分工与汇总

**流水线**（pipeline）把工作拆成由通道连接的阶段。一个阶段可以有多个 worker：它们从同一输入领取工作，称为 **fan-out**；把多个输出合并为一个输出，称为 **fan-in**。这里的 fan-out 是分摊任务，每条消息由一个接收者取走，并非广播[^11]。

前面的 Rust 任务池已经体现了分摊与汇总：两个 worker 领取同一输入，再把结果发送到同一结果通道。Go 官方[流水线示例](https://go.dev/blog/pipelines)采用另一种拓扑：`gen` 产生数据，两个 `sq` 从同一输入分摊计算，各自输出到独立通道，再由 `merge` 汇总。任务池强调执行单元复用，fan-out / fan-in 强调数据怎样分流与合流，两种视角可以描述同一个系统[^11]。

```mermaid title="Go 流水线的分发与汇聚" description="两个 sq 从共享输入分摊任务，每条消息仅由一个 worker 领取，并非广播。merge 转发各路结果，不恢复输入顺序；输入 2、3 时，接收方可能先看到 9。"
flowchart TB
 gen["gen：输入 2、3"] --> input["共享输入通道"]
 input -->|领取| sq1["sq 1：计算"]
 input -->|领取| sq2["sq 2：计算"]
 sq1 --> out1["输出通道 1"]
 sq2 --> out2["输出通道 2"]
 out1 --> merge["merge：合并输出"]
 out2 --> merge
 merge --> receive["4、9 或 9、4"]
 class gen,sq1,sq2,merge actor
 class input,out1,out2 resource
 class receive result
```

先领取不等于先完成，先完成也不等于先被接收：哪个结果先到还取决于发送与转发的调度。Go 示例的 `merge` 不按输入编号排序，所以 `gen(2, 3)` 的结果既可能是 `4, 9`，也可能是 `9, 4`[^11]。若调用方需要按输入顺序逐项输出，可以在分发前编号，汇总端暂存提前到达的结果，直到缺少的编号补齐。这会增加缓存占用；较慢的首项还会拖住已经就绪的后续结果。长流水线若要求重排缓存有界，就要限制领先于最早未输出项的在途工作数，并为失败或取消的编号约定处置方式，否则汇总端可能一直等缺项。前面的 Rust 示例在整批收齐后才排序，适用于这个小批次，不提供按序流式输出。

这里引入 Go，是因为它允许多个接收者直接共享通道，且后面可以用 `select` 清楚展示取消信号与数据发送之间的选择。Go 的结束协议需要另行说明：向已关闭通道发送、重复关闭通道以及关闭 `nil` 通道（`close(nil)`）都会触发 panic，因此应由发送方负责关闭；多个发送者共享输出时，需由协调者确认全部发送结束后再关闭，官方 `merge` 就用 `WaitGroup` 等待所有转发结束。通道关闭且缓冲取空后，`<-ch` 不会阻塞，而是**立即不断返回零值**（`v, ok := <-ch` 得到 `ok == false`，`for range` 随之退出）；相对地，对 `nil` 通道发送与接收都会永久阻塞——在 `select` 里这会让对应分支被永久跳过，因此 Go 的 fan-in 汇总器常在观察到 `!ok` 后显式把该输入变量置为 `nil`，避免在已关闭通道上空转死循环。Rust 标准库通道通过最后一个发送端被丢弃表示不再有消息；两种机制都需要明确结束发送的责任[^4][^11][^12]。

## 背压与队列容量

任务池解决了“谁来处理”，却还没解决“能积压多少”。固定 worker 数量不会自动限制队列；若提交速度长期高于处理能力，无界队列仍会不断增长。Tokio 的多线程运行时也复用 worker 线程来轮询异步任务，但 worker 线程数并不是异步任务数量的上限[^10]。

**背压**（backpressure）让下游的处理压力传回上游。以前面的 Rust 任务池为例，任务队列和结果队列都是有界的，且发送等到有空位才继续。如果下游持续取结果比 worker 产出结果慢，结果队列会先填满。worker 逐个卡在发送上，不能领取下一项；若上游继续提交，任务队列也会填满，入口便要等空位才能接纳新任务[^4]。

```mermaid mobile-direction="TB" title="背压怎样传回提交入口" description="两端都是有界队列，且满时发送等待空位。下游持续取结果过慢，结果队列填满，Worker 等待发送而不能继续领取；在上游仍提交的情况下，任务队列也填满，最终入口等待接纳。箭头表示压力传播的因果顺序，不表示消息流向。"
flowchart LR
 slow["下游取结果慢"] --> output["有界结果队列<br/>填满"]
 output --> blocked["Worker 等待发送<br/>不能再领取"]
 blocked --> input["有界任务队列<br/>填满"]
 input --> upstream["上游提交等待<br/>尚未接纳"]
 class slow actor
 class output,input resource
 class blocked,upstream risk
```

下游恢复取结果后，结果队列空出位置，worker 才能交出结果并重新领取，进而给入口腾出任务队列空间。上图只适用于等待型发送：Rust 的 `SyncSender::send` 阻塞线程，Tokio 有界 `mpsc` 的 `send().await` 挂起任务等待容量；同一 Tokio 通道的 `try_send` 在满时立即返回错误，入口可以用它拒绝提交，而不是继续等[^4][^13]。

压力传到提交接口，不等于真正传到了生产者。如果每次提交都先创建一个任务，再让它等待 `send().await`，消息虽然没进队列，等待发送的任务仍可能无限增长。要让这条反馈放慢生产，就应让生产者直接等待，或在创建等待者之前限制数量。

上一张图追踪压力如何传播，下面沿消息流向检查积压存在哪里。设入口最多保留 $S$ 个待提交值，有容量为 $Q$ 的任务队列、$W$ 个 worker 槽和容量为 $R$ 的结果队列。若每个 worker 只领取一项，等结果进入队列后才领下一项，且不另留副本，这段管线中至多有 $S + Q + W + R$ 项。等待许可、执行业务、等待发送结果都占用同一个 worker 槽；许可数 $K \le W$ 仅进一步限制同时占用外部资源的工作。若把等待许可移到独立派发任务，那些任务也需要自己的上限。

```mermaid title="任务池中的容量与等待位置" description="顺着消息流向，入口等待 S、任务队列 Q、Worker 持有 W、结果队列 R 是四处积压位置。等待许可、执行业务、等待发送结果共用 W 个 Worker 槽；资源许可 K（K ≤ W）单独限制同时占用的外部资源。"
flowchart TB
 submit["待提交<br/>最多 S 项"] -->|接纳| queue["任务队列<br/>容量 Q"]
 subgraph workers["W 个 Worker 槽"]
  direction LR
  permit["等待或取得许可"] --> run["占用资源并执行<br/>至多 K 份许可"]
  run --> send["等待发送结果"]
 end
 queue -->|领取| permit
 send -->|结果入队| resultq["结果队列<br/>容量 R"]
 resultq -->|取走| consume["结果接收方"]
 class queue,resultq resource
 class permit,send state
 class submit,run,consume actor
```

上下游若额外缓存已构造的任务、结果或重试记录，需另计。消息数量有界不等于内存用量有上限：还要限制单条消息的大小；若一个任务同时保留输入和结果，内存预算要计入两份数据。

队列满时，不一定采用图中的等待策略：

| 策略       | 适用要求                       | 需要处理的问题                     |
| ---------- | ------------------------------ | ---------------------------------- |
| 等待空位   | 上游可以放慢，工作不应直接丢弃 | 取消、超时与等待者数量             |
| 拒绝提交   | 入口需要快速响应过载           | 明确错误与重试策略                 |
| 丢弃或合并 | 旧状态可被新状态替代           | 依据场景决定丢弃最旧未处理项（`drop-oldest`，常用于仅看最新状态的遥测环形缓冲）或丢弃新入队项（`drop-newest`） |

有界队列能约束积压，却不保证延迟上界：worker 可能长期阻塞，单个任务也可能没有完成期限；共享一条 FIFO 队列时，少数慢任务或大批量突发请求还会造成**队头阻塞**（head-of-line blocking），把所有后续请求一起拖慢，工程上常需按优先级或租户拆分为多条独立队列与配额隔离。无界通道则应以可证明的提交总量或速率约束为前提，不能仅靠“平时消费者足够快”支撑[^9]。

## 容量、吞吐与等待时间

队列容量回答“允许多少工作等待”，处理能力回答“单位时间能完成多少工作”。在到达负载不变时，增大缓冲可以吸收短时突发；如果长期提交速度超过处理能力，只增大容量只会推迟队列再次填满。系统最终仍需放慢上游、拒绝部分提交或改变处理能力，无法同时维持无限接受、有限积压与全部及时完成。

在长期稳定、统计边界一致的情况下，Little 定律给出 $L = \lambda T$：$L$ 是边界内的平均在途量，$\lambda$ 是流经该边界的有效吞吐率，$T$ 是工作在其中的平均停留时间。只分析任务队列时，停留时间指从入队到领取；若改为从接纳到确认，就不能用任务队列的平均长度搭配端到端耗时[^14]。

- 稳定时：假设任务只通过 worker 领取来离开队列，长期平均每秒入队、领取各 100 项，队内平均等 20 毫秒，那么平均排队 $100 \times 0.020 = 2$ 项。这不表示容量设为 2 就够了，也不能推出等待时间的上界；突发和尾延迟需要另行评估。
- 持续过载时：如果上游每秒尝试提交 120 项，而 worker 最多每秒领取 100 项，照单全收时积压每秒至少多 20 项，不再是上面的稳定队列。有界队列填满后，超出领取能力的提交就要在入口等待、被拒绝或按策略舍弃。若接纳流量随后稳定，可对新的稳定队列用 Little 定律；不能把每秒 120 次提交尝试当作队列吞吐率来算安全容量。

因此，观察过载要区分提交尝试、已接纳、已领取、已完成和已确认。只统计已完成任务的耗时，会漏掉入口等待和拒绝；只看瞬间队列为空，也可能漏掉 worker 已领取却阻塞在外部资源上的工作。至少应分别观察入口等待、排队、处理与结果交付，并确认结果队列和等待发送者是否也在积压。

worker 数量增加后，瓶颈也可能转移到接收锁、共享结果、数据库连接或其他串行阶段。前面的标准库任务池在锁外计算，但领取任务仍需串行通过同一接收锁；当业务计算很短时，这种协调成本就可能占据较大比例。这与第一篇的[任务粒度与负载均衡](/posts/concurrency/parallelism-execution-units/#任务粒度与负载均衡)是同一个问题：更多 worker 和更多排队空间都不是吞吐提升的充分条件。

## 信号量与资源并发数

队列容量限制了等待领取的消息，但处理任务还可能占用数据库连接、GPU 执行槽等有限资源。这些资源需要单独限制并发使用数量。第二篇把管理资源许可的[信号量](/posts/concurrency/locks-condvars-shared-memory-sync/#semaphore许可决定能否进入)（Semaphore）留到本篇：它用许可数量约束同时占用资源的任务数，进入前获取许可，离开时归还。下面用 Tokio 展示[^15][^10]：此处只需理解 `tokio::spawn` 创建可并发推进的任务、`.await` 等待其完成，[`.await` 的驱动机制](/posts/concurrency/async-concurrency-task-lifecycle/#future由-poll-推进的计算)留到下一篇。

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
        // Acquire before spawning so waiting for a permit applies backpressure to the loop
        // instead of creating unbounded suspended tasks up front.
        let permit = Arc::clone(&slots).acquire_owned().await.unwrap();
        handles.push(tokio::spawn(async move {
            // Bind to `_permit` (not `_`) so the OwnedSemaphorePermit drops only when this
            // async task finishes.
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

`acquire_owned` 返回的许可可以移入新任务；注意要用具名变量（如 `_permit`）持有到作用域末尾，若写成 `let _ = permit;` 则会立刻丢弃并归还许可。许可的作用域必须覆盖完整的资源使用过程，而不能刚开始请求就提前释放；与有界通道结合时，也可以用类似的容量预约再入队模式与[失败或超时后收束任务](/posts/concurrency/async-concurrency-task-lifecycle/#综合示例失败或超时后收束任务)配合使用[^15]。

有界通道与信号量限制的是不同位置：

| 工具             | 直接限制的数量             | 不自动保证的事情       |
| ---------------- | -------------------------- | ---------------------- |
| 固定 worker 数量 | 同时处理任务的 worker 数   | 队列长度有界           |
| 有界通道         | 缓冲中等待领取的消息数     | 总任务数、处理时长有界 |
| Semaphore        | 同时持有许可的资源使用者数 | 每秒请求数有上限       |

限并发不等于限速：请求越快完成，同一组许可每秒就可能服务越多请求。需要每秒配额时，还需基于时间的速率控制。信号量也不是只能用于资源计数，它还能参与互斥或事件排序；这里按用途比较，延续第二篇的[同步工具划分](/posts/concurrency/locks-condvars-shared-memory-sync/#共享内存保护状态与协调推进)：按主要用途划分只是讲解视角，并不是互不重叠的分类。

## 提前退出与取消

限制队列和资源占用后，还要处理下游不再需要结果的情况。前面的 Rust 任务池持续收集到结果通道断连，并等待全部线程结束。这里转向 Go 官方流水线讨论的另一种情形：下游只取一个结果就停止接收，又没有通知上游退出，上游便可能永远卡在发送上。goroutine 无法推进也不会自动被回收，这类问题称为 **goroutine 泄漏**（goroutine leak）。扩大缓冲只对已知的剩余消息量有效，不能替代退出协议[^11]。

Go 可以关闭一个独立的 `done` 通道广播取消，让发送者同时等待“可以发送”或“下游已退出”。这个“同时等待”由 `select` 语句实现：没有 `default` 分支时，它阻塞到某个分支可以执行；多个分支同时就绪时伪随机选择一个，避免固定偏序；存在 `default` 分支时不再阻塞，没有就绪分支就执行 `default`[^12]。标准库还提供 `time.After` 等以通道形式出现的定时信号，常与 `select` 搭配实现超时，[超时的系统讨论](/posts/concurrency/async-concurrency-task-lifecycle/#timeout-与-select)留到下一篇。下面用单阶段示例保留这个机制，并等待生产者确认退出：

```go
package main

import "fmt"

func main() {
	done := make(chan struct{})
	stopped := make(chan struct{})
	// Unbuffered output ensures sending synchronizes with receiving or cancellation.
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

主 goroutine 取到 0 后停止消费，关闭 `done`，再等生产者退出。注意这里特意使用无缓冲的 `out` 通道；一旦换作带缓冲通道且缓冲区尚有空位，即使 `done` 已关闭，`select` 在多个就绪分支间仍会伪随机挑中发送支路（如果协议要求零延迟止步，通常会在进入 `select` 前先用非阻塞 `select` 检查一次 `<-done`）。若把这种协议扩展到多阶段流水线，每个可能阻塞的发送、接收或外部操作都需要参与取消；关闭 `done` 不会强行中断正在计算的 goroutine[^11]。

Rust 标准库通道可以利用接收端断开，让正在发送或之后发送的生产者得到 `SendError`（或 `TrySendError::Disconnected`）并退出。反方向上，全部发送端丢弃后，接收方取完缓冲才能观察到断连：`recv()` 返回 `Err`，`try_recv()` 返回 `TryRecvError::Disconnected`，迭代结束。Tokio `mpsc::Receiver::recv()` 则以 `None` 表示结束。退出行为应按实际 API 解释，不能混用返回值[^4][^9]。

## 关停时怎样处置已接受的工作

通道结束只是关停协议中的一个事件。任务池所有者还要划定接纳边界，选择怎样处置已接纳的任务，并确认执行单元退出。下面是一种关停状态机：排空和取消是两种策略，不是每次都要依次经过的阶段。

```mermaid mobile-direction="TB" title="有界任务池的关停状态机" description="停止新接纳并处理未决提交后，可以排空已接纳的工作，也可以处置未领取的任务并通知执行中的任务取消。等待超时不是终态：所有者继续监督或明确移交。只有全部执行单元确认退出且结果已处置，才算关停完成。"
flowchart LR
 running["运行中"] -->|关停请求| closing["停止新接纳"]
 closing --> drain["排空"]
 closing --> cancel["取消"]
 drain --> wait["等待退出（join）<br/>并处置结果"]
 cancel --> wait
 wait -->|已收束| stopped(["已关停"])
 wait -.->|超时| timedout["未收束<br/>继续监督"]
 timedout -->|继续等待| wait
 class running,closing,drain,cancel,wait state
 class timedout risk
 class stopped result
```

**停止接纳**必须覆盖所有入口。先读 `stopping` 标志再独立入队，仍可能在关停开始后入队。协议可以让检查与登记落在同一个同步边界，也可以允许关闭前已获准的一批提交先完成；后一种做法必须明确哪些预约仍可兑现、哪些提交被拒绝或撤销。按本文的[接纳边界](#消息交付与处理完成)，单有预约还不算已接纳，获准者成功入队或直接交接后才纳入处置范围。这是第四篇[线性化点](/posts/concurrency/deadlock-livelock-correctness/#线性化点完整操作何时生效)在关停入口上的应用。

Tokio 的有界 `mpsc` 提供 `Receiver::close()`：接收端保留队列，拒绝新的普通发送，并可继续 `recv()` 排空。但关闭前已经取得的 `Permit` / `OwnedPermit` 仍能发送；要确认通道结束，需读到 `None`，此前已有许可都必须被使用或释放。直接丢弃接收端会丢弃未读消息，并不是排空[^16]。

- **排空**：不再有新任务入队后，worker 继续领取、处理已接纳的任务，结果端也继续接收，否则 worker 可能卡在发送上，无法排空输入。对于同构 worker 共享单条队列的场景，关闭发送端比手工投递“毒丸消息”（poison pill）更稳妥：投递 $W$ 份退出哨兵要求哨兵数与存活 worker 数严格一致，一旦此前有 worker 意外退出，剩余哨兵未被领走或部分 worker 没领到哨兵都会让关停卡死；毒丸更适合多阶段拓扑或异构路由需要按消息顺序传播阶段边界的情形，通常仍需配合通道关闭兜底。前面的 Rust 示例释放全部任务发送端，同时收集结果，最后 `join` 提交线程和 worker，走的就是正常排空路径。
- **取消**：为已接纳但未领取的任务明确退回、记录取消或移交；向执行中的工作发出取消请求，并保留处理结果或清理状态的路径。请求发出不等于取消生效：任务可能抢先完成，也可能仍在运行；已产生的外部效果需按业务协议核对。

等待执行单元退出时，结果接收或回收仍须推进，不能让 `join` 挡住 worker 唯一的结果发送路径。期限届满只能说明本轮等待没有收束：报告哪些执行单元仍存活或尚未确认退出、哪些工作或结果尚待处置，由原所有者继续监督，或连同退出确认和处置责任明确移交给监督者。若排空期限已到且策略允许，也可改为取消，再继续等。只有所有执行单元都已确认退出，且每项已接纳工作的结果或处置状态都已按协议交付、记录或移交，任务池才进入关停终态。`join` 证实执行单元已退出，并不证明业务成功或提交方已收到确认。

第六篇会进一步说明[容量预约与取消](/posts/concurrency/async-concurrency-task-lifecycle/#取消安全中断后能否重来)中的消息归属，以及怎样给[一次等待加上超时](/posts/concurrency/async-concurrency-task-lifecycle/#timeout-与-select)而不把它误当成退出确认。

## 总结

- 消息传递把协作边界显式化，但消息若仍引用共享可变数据，原有同步要求仍然存在。
- 任务池复用执行单元，fan-out 分摊工作，fan-in 汇总结果；关闭输出前必须确认所有发送结束。
- 背压必须沿调用链传回入口。有界队列、固定 worker 和信号量分别约束不同位置，不能互相替代。
- 下游提前退出时，上游需要能观察到取消或断连；关停先停止新接纳，再排空或取消。等待超时不是终态，仍有工作就必须有人负责监督和处置。

下一篇[《并发编程（六）：异步并发与任务的生命周期》](/posts/concurrency/async-concurrency-task-lifecycle/)继续解释 Future 如何推进，以及取消、超时和结构化并发怎样管理任务的结束。

## 延伸阅读

- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)——结合异步消息通道、共享状态与任务池模型理解队列与背压的异步编排
- [Go Blog: Context](https://go.dev/blog/context)——从请求作用域出发理解取消信号如何在多阶段调用链与 goroutine 间传递
- Rust 示例可在 [Rust Playground](https://play.rust-lang.org) 运行，Go 示例可在 [Go Playground](https://go.dev/play/) 运行

[^1]: [Effective Go: Share by communicating](https://go.dev/doc/effective_go#sharing)——用通信组织共享数据访问的设计思路及其适用边界。

[^2]: [Akka: What is an Actor?](https://doc.akka.io/libraries/akka-core/current/typed/guide/actors-intro.html)——Actor 的状态封装、消息处理与协作边界。

[^3]: [Rob Pike：Go Concurrency Patterns，History / Distinction](https://go.dev/talks/2012/concurrency.slide)——区分原始 CSP 按进程名通信与 Go 所继承的一等通道分支；历史来源见 [C. A. R. Hoare, Communicating Sequential Processes, 1978](https://dl.acm.org/doi/10.1145/359576.359585)。

[^4]: [Rust `std::sync::mpsc`](https://doc.rust-lang.org/std/sync/mpsc/index.html)、[`TrySendError`](https://doc.rust-lang.org/std/sync/mpsc/enum.TrySendError.html)与[`TryRecvError`](https://doc.rust-lang.org/std/sync/mpsc/enum.TryRecvError.html)——多生产者单消费者、缓冲、同步发送及阻塞与非阻塞（队列满/空与断连）的错误语义。

[^5]: [Go 内存模型：Channel communication](https://go.dev/ref/mem#chan)——发送到对应接收完成的同步，以及无缓冲通道接收到发送完成的反向同步；两者均不把接收后的处理纳入发送完成保证。

[^6]: [Rust `Sender::send`](https://doc.rust-lang.org/std/sync/mpsc/struct.Sender.html#method.send)与[`SyncSender::send`](https://doc.rust-lang.org/std/sync/mpsc/struct.SyncSender.html#method.send)——发送成功不保证最终接收、有缓冲发送与零容量会合的保证差别；接收保证不包含后续业务处理完成。

[^7]: [Oracle Java Tutorial: Thread Pools](https://docs.oracle.com/javase/tutorial/essential/concurrency/pools.html)——worker 复用、内部任务队列及执行单元数量控制。

[^8]: [Crossbeam Channel 0.5.17：Sharing channels](https://docs.rs/crossbeam-channel/0.5.17/crossbeam_channel/#sharing-channels)与[`async-channel`](https://docs.rs/async-channel/latest/async_channel/)——面向多线程与异步任务池的可复制多消费者接收端及分摊方式。

[^9]: [Tokio 1.53.3 `mpsc`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/index.html)——有界与无界通道、背压、断连与接收结束语义。

[^10]: [Tokio 1.53.3 runtime](https://docs.rs/tokio/1.53.3/tokio/runtime/index.html)与[Multi threaded runtime](https://docs.rs/tokio/1.53.3/tokio/runtime/#multi-threaded-runtime-behavior-at-the-time-of-writing)——本地与全局队列、工作窃取与 `current_thread` 等运行时形态边界；示例中使用 `#[tokio::main(flavor = "current_thread")]` 仅为保证单文件自包含。

[^11]: [Go Blog: Pipelines and cancellation](https://go.dev/blog/pipelines)——fan-out / fan-in 示例参考、输出关闭顺序、下游提前退出与广播取消。

[^12]: [Go 规范：Channel types](https://go.dev/ref/spec#Channel_types)、[Close](https://go.dev/ref/spec#Close)与[Select statements](https://go.dev/ref/spec#Select_statements)——关闭 `nil` 或已关闭通道的 panic 规则、关闭后立即读取零值与 `nil` 通道在 `select` 中永久阻塞的行为。

[^13]: [Tokio 1.53.3 `Sender::send`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/struct.Sender.html#method.send)与[`Sender::try_send`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/struct.Sender.html#method.try_send)——有界通道中等待容量与立即返回队列已满的区别。

[^14]: John D. C. Little, [A Proof for the Queuing Formula: L = λW](https://doi.org/10.1287/opre.9.3.383), Operations Research 9(3), 1961——平均在途量、吞吐率与平均停留时间之间的关系；正文用 $T$ 表示停留时间，避免与 worker 数 $W$ 混淆。

[^15]: [Tokio 1.53.3 `Semaphore`](https://docs.rs/tokio/1.53.3/tokio/sync/struct.Semaphore.html)——许可生命周期、`acquire_owned` 与启动任务前限制并发的用法。

[^16]: [Tokio 1.53.3 `Receiver::close`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/struct.Receiver.html#method.close)与[`mpsc` 的 Clean Shutdown](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/index.html#clean-shutdown)——关闭接收入口后排空消息、未使用许可对通道结束的影响，以及直接丢弃接收端会丢弃未读消息的区别。
