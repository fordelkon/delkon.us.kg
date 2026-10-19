---
title: "并发编程（六）：异步并发与任务的生命周期"
description: "解释 Future、Waker 与执行器如何配合，区分 I/O 就绪与完成通知，讨论 Future 丢弃、任务取消、超时和结构化并发，并说明阻塞工作的处理边界。"
publishDate: "17 Oct 2026"
tags: ["concurrency", "async", "rust", "go"]
---

上一篇[《并发编程（五）：消息传递、任务池与背压》](/posts/message-passing-workers-backpressure/)讨论了消息流动与提前退出。本篇回到第一篇的[协作式并发](/posts/concurrency-parallelism-execution-units/#协作式并发)：等待中的异步任务由谁继续驱动，调用方放弃结果以后，任务又该怎样结束？示例以 Rust 和 Tokio 为主，取消部分用 Go context 作对照。

## Future、Waker 与执行器

### Future：由 poll 推进的计算

调用 Rust 的 `async fn` 会得到一个 Future，函数体不会因此立即执行。执行器通过 `poll` 推进它：返回 `Poll::Ready(value)` 表示完成，返回 `Poll::Pending` 表示暂时不能完成，并需要安排后续唤醒。`poll` 应快速返回，不能在其中用阻塞等待占住线程[^1]。

`.await` 会轮询被等待的 Future；如果它已完成，当前任务可以直接继续。如果它返回 `Pending`，等待会沿外层 Future 向上传递，让执行器有机会运行其他任务。因此，写了 `.await` 不等于每次都会切换任务。

Future 也不必对应一个独立任务。`join!` 可以在同一个任务里轮询多个 Future；执行器维护的是任务的调度状态，Future 则保存计算本身的状态。

### Waker：请求再次轮询

`poll` 的 `Context` 提供当前任务的 **Waker**。当等待条件发生变化时，调用 `wake()` 请求执行器再次轮询关联任务。唤醒不是“操作已经完成”的保证，再次轮询仍可能得到 `Pending`；多次唤醒也可能被合并[^2]。第三篇已[区分唤醒与内存同步](/posts/atomics-memory-model/#唤醒与同步以-park--unpark-为例)；本节的 Waker 是另一种接口，具体保证应以 Waker 的契约为准，不能套用 park/unpark 的 token 规则。

下面的定时器改写自 Async Book。它用一个线程模拟定时事件，再通过 Waker 通知异步任务，完整程序可在 Tokio 中运行[^3]：

```rust
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};
use std::thread;
use std::time::Duration;

struct State {
    done: bool,
    waker: Option<Waker>,
}

struct Timer {
    state: Arc<Mutex<State>>,
}

impl Timer {
    fn new(duration: Duration) -> Self {
        let state = Arc::new(Mutex::new(State {
            done: false,
            waker: None,
        }));
        let shared = Arc::clone(&state);
        thread::spawn(move || {
            thread::sleep(duration);
            let waker = {
                let mut state = shared.lock().unwrap();
                state.done = true;
                state.waker.take()
            };
            // Wake outside the lock so polling can acquire it immediately.
            if let Some(waker) = waker {
                waker.wake();
            }
        });
        Self { state }
    }
}

impl Future for Timer {
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        let mut state = self.state.lock().unwrap();
        if state.done {
            Poll::Ready(())
        } else {
            // The latest poll may come from a different task.
            state.waker = Some(cx.waker().clone());
            Poll::Pending
        }
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    Timer::new(Duration::from_millis(10)).await;
    println!("timer finished");
}
```

与第二篇的[条件变量等待协议](/posts/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)一样，这里也要把状态检查与登记等待放在同一把锁下。锁覆盖“检查完成状态并登记 Waker”，避免定时线程恰好在两步之间完成、造成遗漏唤醒。如果线程先完成，下一次 `poll` 直接看到 `done`；如果登记先完成，线程就取走 Waker 并唤醒。每次等待都保留最新的 Waker，因为同一 Future 后续可能由不同任务轮询。

这只是展示协议的教学实现：每个定时器创建一个线程，不能代表运行时管理大量定时器的方式。丢弃 Timer 也不会中断已启动的睡眠线程；外部工作的生命周期与 Future 本身需要分别考虑。

### 执行器：轮询与唤醒的循环

**执行器**（executor）负责轮询任务、维护调度状态并处理唤醒。可以把基本流程理解为：

```text
新任务或唤醒请求 → 进入就绪队列 → poll
                                      ├─ Ready：记录结果，结束任务
                                      └─ Pending：等待后续唤醒 ←── wake()
```

任务可以在 `poll` 返回前就被唤醒，执行器也必须保留这次重新调度的请求。这个循环让执行器无需持续扫描所有等待者；它描述的是调度思路，不是保证每次 wake 都对应一次独立排队[^2][^4]。

第一篇[协作式并发示例中的 `yield_now()`](/posts/concurrency-parallelism-execution-units/#协作式并发) 会主动请求再次调度，但不保证下一次一定运行其他任务。尤其 `join!` 的多个分支仍属于同一个任务，不能把分支让出理解成创建了新的调度单位[^5]。

## I/O 就绪与完成通知

网络 Future 等待数据时，运行时的 I/O 驱动负责把操作系统事件连接到 Waker；执行器负责后续任务调度。这里要区分两种通知模型：

| 模型                   | 通知的含义                         | 代表接口                        |
| ---------------------- | ---------------------------------- | ------------------------------- |
| 就绪通知（readiness）  | 可以尝试读写，实际操作仍由程序发起 | Linux epoll、BSD / macOS kqueue |
| 完成通知（completion） | 提交的异步操作已有结果             | Windows IOCP、Linux io_uring    |

Mio 对外提供就绪事件抽象，在不同平台上适配底层机制；按接口读写事件时，必须先分清底层是就绪还是完成模型，上层抽象与底层通知方式不必一一对应[^6][^7]。io_uring 通过提交与完成队列组织操作，也不是只有它才支持完成模型[^8]。

本节的“就绪”指 I/O 可以尝试读写，不是上文 poll 返回 `Ready` 表示的“完成”。收到就绪事件后仍要检查实际操作结果。Mio 文档允许虚假就绪，尝试读写可能返回 `WouldBlock`，Future 因此还需继续等待；“被唤醒”与“读写已完成”不能画等号[^6]。

## 取消与超时

### 丢弃 Future 与清理资源

未完成的 Future 被其所有者丢弃后，就不会再由这个 Future 继续推进。对于 `async fn` 生成的 Future，已经构造并仍由它持有的局部值会按析构规则清理，例如释放锁 guard 或许可。普通 `Drop` 是同步的，不能在其中直接 `.await` 完成异步善后[^9]。

因此，“丢弃即取消”只描述这个 Future 的生命周期，不代表外部请求被撤回，更不代表已经提交的写入被回滚。需要异步收尾时，应显式发出停止信号，等待操作结束后再退出。

对于 `async fn` 返回的 Future，首次轮询前函数体尚未执行，因此函数体内部声明的局部值尚未初始化；但调用时传入并被 Future 捕获的参数已经存在，丢弃 Future 时仍需按析构规则清理[^21]。手写 Future 的构造过程还可能已经创建资源或启动外部工作，例如前面的 `Timer::new`。对正在执行一次 `poll` 的 Tokio 任务，取消不会强行切断同步代码；运行时需要等任务交还控制权，才能销毁它。取消也不必等任务再次被唤醒才发生[^10]。

### timeout 与 select

`timeout` 等待结果或期限：内部 Future 及时完成则返回 `Ok`，超时则返回错误并取消内部操作。下面直接传入 `query()` 返回的 Future，没有另外启动后台任务[^11]：

```rust
use std::time::Duration;
use tokio::time::{sleep, timeout};

async fn query() -> &'static str {
    sleep(Duration::from_secs(10)).await;
    "payload"
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    match timeout(Duration::from_millis(20), query()).await {
        Ok(value) => println!("finished: {value}"),
        Err(_) => println!("timed out"),
    }
}
```

`tokio::select!` 则同时等待多个分支：当某个分支完成并匹配其模式时，执行对应处理代码，其余分支不再继续等待。若分支持有 Future 的所有权，退出选择时会丢弃它；若传入的是对外部 Future 的可变引用，被丢弃的是等待用的引用，外部 Future 仍可保留[^12]。

超时不是同步代码的强制中断。Tokio 文档说明，内部 Future 会先被轮询，再检查超时；如果它长时间不让出，就可能超过期限仍返回成功[^11]。

### 取消安全：中断后能否重来

在循环中的 `select!` 里，未完成分支可能不断被丢弃、重建。**取消安全**（cancellation safety）关注这一步是否会丢掉需要保留的进度[^12]：

| Tokio 操作                                             | 取消后重新等待的影响                             |
| ------------------------------------------------------ | ------------------------------------------------ |
| `mpsc::Receiver::recv`、`TcpListener::accept`          | 文档保证取消安全，不会因中止等待而丢掉消息或连接 |
| `AsyncReadExt::read_exact`、`AsyncWriteExt::write_all` | 可能已部分读写，重新开始不能假定从未发生过       |
| `Mutex::lock`、`Semaphore::acquire`                    | 会失去在公平等待队列中的位置                     |

失去排队位置与丢掉消息不同：锁或许可本来就没有拿到，反复取消再重试可能让任务在公平队列中迟迟轮不到——这正是[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/deadlock-livelock-correctness/#活锁与饥饿)讨论的饥饿在取消协议下的形态。这里的取消语义也不同于第五篇的[通道结束](/posts/message-passing-workers-backpressure/#提前退出与取消)：全部发送端丢弃且缓冲已取空后，Tokio 的 `mpsc::Receiver::recv()` 返回 `None` 表示通道结束，而 select 丢弃未完成分支只是让这个等待中的 Future 消亡。

取消安全是具体操作的契约，不能只按方法名概括所有 `recv` 或 `read`。取消不安全也不等于绝不能取消：程序整体关停时，丢弃某些进度可能符合需求；重试支付或继续解析协议时，则需要更严格的处理。

### Go context：传播退出信号

Go 的 context 用信号表达取消：第五篇手写的[`close(done)` 通道广播](/posts/message-passing-workers-backpressure/#提前退出与取消)，正是 `WithCancel` 内建的语义。派生出的 Context 在取消时关闭 `Done()` 通道，使用者需要主动监听；信号不会强行终止 goroutine，也不会中断一个不支持 context 的阻塞调用。`WithCancel` 或 `WithTimeout` 返回的 cancel 函数，可以及时释放关联资源[^13]。

下面让工作 goroutine 在模拟操作与超时信号之间选择。主 goroutine 等待工作结果，确认它已经走到退出路径：

```go
package main

import (
	"context"
	"fmt"
	"time"
)

func query(ctx context.Context) error {
	timer := time.NewTimer(10 * time.Second)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	result := make(chan error)
	go func() {
		result <- query(ctx)
	}()
	fmt.Println(<-result)
}
```

通常会输出 `context deadline exceeded`；如果工作 goroutine 长时间未被调度，恢复时模拟操作与取消信号可能都已就绪，也可能选择操作分支并返回 `nil`。与先执行不可取消的 `time.Sleep` 再检查信号相比，这里在等待期间就响应取消。若两个分支同时就绪，`select` 不保证优先处理取消，因此也不应把取消信号理解为“从此绝不发生任何后续操作”。

## 结构化并发与任务收束

### 结果与生命周期的归属

**结构化并发**（structured concurrency）要求子任务的生命周期受父作用域管理：作用域退出前收束子任务，结果与错误有接收者，取消也沿依赖关系传播。它是一种组织原则，需要具体接口执行这些约束[^14]。

`tokio::join!` 在当前任务内组合多个 Future，正常返回前等待全部完成，但不会因某个分支返回 `Err` 就自动停止其他分支。`tokio::spawn` 则创建独立任务，丢弃返回的 `JoinHandle` 只是放弃等待，任务仍可能在运行时存活期间继续执行；父任务结束也不会自动取消它[^10][^15]。

### abort 后等待结束

需要从外部停止 Tokio 异步任务时，可以请求 `abort()`，再等待 JoinHandle 确认结束。下面让任务保持未完成状态，避免它在取消前已经正常结束：

```rust
#[tokio::main(flavor = "current_thread")]
async fn main() {
    let handle = tokio::spawn(std::future::pending::<()>());
    handle.abort();

    let error = handle.await.unwrap_err();
    assert!(error.is_cancelled());
    println!("task cancelled");
}
```

一般程序中，任务也可能在取消生效前完成，此时等待仍会得到正常结果。`abort()` 只是提交取消请求，调用返回不表示析构已经完成；等待 JoinHandle 才能确认任务结束[^10]。

这个区别也影响超时：把 `tokio::spawn(query())` 返回的 JoinHandle 直接交给 `timeout`，超时后丢弃的是句柄，后台任务并不会因此停止。若要管理该任务，应保留句柄，以可变引用等待；超时后请求取消，再等待收束。

启动多个任务时，同样需要决定成功、失败与关停三条路径如何等待所有任务。只在正常路径逐个 `await`，还不足以保证父任务被取消时自动完成结构化清理。

Tokio 为这些约束提供了现成接口：`try_join!` 在某个分支返回 `Err` 时立即返回，未完成的分支随宏返回被丢弃。直接组合并拥有这些 Future 时，丢弃可以停止它们继续推进；若分支持有的是 JoinHandle，丢弃句柄不会中止后台任务，若借用外部 Future，也不会销毁被借用的计算[^10]。`JoinSet` 把 `spawn` 出的任务登记成组，丢弃时请求中止尚未结束的任务，但不等待清理完成；需要确认退出时，可用 `shutdown().await` 请求中止并等待收束；`tokio_util` 的 `TaskTracker` 不中止任务，配合 `close` 与 `wait` 等待全部登记任务退出，适合优雅关停[^18]。

## 公平性与阻塞工作

### 让出与调度公平性

协作式执行器不能抢占一次长时间运行的 `poll`。同步 I/O 或长计算会占住所在 worker；即使其他 worker 还在运行，也可能造成延迟或依赖阻塞。

`select!` 默认随机选择先检查的分支，`join!` 默认轮换先轮询的分支，以避免某一分支长期占先。使用 `biased;` 时则由调用方负责顺序，例如把关停信号放在繁忙消息流前面。与[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/deadlock-livelock-correctness/#活锁与饥饿)对公平性的提醒一致，这些策略不能为任意程序提供等待时间上界[^12][^15]。

Tokio 的调度公平性保证本身也有条件，包括任务数量有界、每次 `poll` 在有界时间内返回；它不保证任务严格轮流运行[^16]。是否需要拆分计算或迁移阻塞工作，应根据任务耗时和服务延迟目标判断；Tokio 团队成员的文章曾以两次 `.await` 之间 10–100 微秒作为参考预算[^19]，但它同样不是所有应用都能直接套用的统一规范。

### 持锁跨 `.await` 的等待依赖

第四篇的[等待依赖分析](/posts/deadlock-livelock-correctness/#等待不只发生在锁上)同样适用于异步任务。例如任务 A 持有一把锁，向任务 B 发出请求后等待回复；B 必须取得同一把锁才能生成回复。A 等 B 回复，B 等 A 解锁，双方都无法完成。即使用异步 Mutex，让等锁只挂起任务、不阻塞线程，这个逻辑上的等待环仍然存在。

使用同步 Mutex 还要检查执行器线程是否被阻塞：A 持锁后在 `.await` 处挂起，运行在同一线程上的 B 再调用阻塞式 `lock()`，就可能占住线程，使 A 无法恢复并释放锁。某些 `Send` 约束会在编译时拒绝持有同步 guard 的跨任务用法，但本地任务或同一任务内的分支不能依赖这层检查排除死锁。Tokio 的 Mutex 文档因此特别提醒同步 guard 跨 `.await` 的风险[^20]。

可在进入等待前完成状态读写并结束 guard 的作用域，让 B 获取锁并继续处理；若业务确实要求跨 `.await` 持锁，可以使用支持这种用法的异步 Mutex，同时检查被等待的操作是否直接或间接需要同一资源。异步锁解决等待方式，不替调用方证明协议没有循环依赖[^20]。

### 异步与线程的分工

| 工作类型               | 常见安排               | 需要注意的边界                                                                        |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| 大量网络等待           | 异步任务配合非阻塞 I/O | 仍需[限制任务与缓冲数量](/posts/message-passing-workers-backpressure/#背压与队列容量) |
| 有限时长的同步阻塞操作 | `spawn_blocking`       | 启动后不能靠 abort 强行停止                                                           |
| 长期阻塞的常驻循环     | 独立线程与显式退出协议 | 退出时仍需等待与回收                                                                  |
| 大量 CPU 计算          | 有界计算线程池         | 限制并行数量，避免占满异步 worker                                                     |

Tokio 的阻塞线程池默认上限为 512 个线程，不能把大量 CPU 工作无约束地交给 `spawn_blocking`。已经开始执行的阻塞闭包也不会因句柄被 abort 而中断[^17]。

`join!` 与 `select!` 在同一任务中提供并发推进；多线程运行时上的独立任务可以并行，但异步本身不保证并行。线程同样可以承载 I/O 工作，选择依据应是等待方式、资源数量和生命周期要求。

## 总结

- Future 保存计算状态，执行器推进任务，Waker 请求再次轮询；唤醒不等于完成，也不保证立刻运行。
- 就绪通知与完成通知是不同接口模型；实际读写结果仍需按接口契约处理。
- 丢弃 Future 会运行相应析构，但不会自动撤回外部副作用；丢弃 JoinHandle 也不会取消后台任务。
- 超时、取消安全与结构化并发分别回答何时放弃、放弃后能否重来，以及谁负责等待任务结束。
- 并发数量、单次轮询耗时与退出协议，需要一起约束，才能让等待密集的程序持续响应。

六篇文章从执行单元、共享状态和原子同步，走到错误分析、消息协作与任务生命周期。它们共同要求的是：明确谁拥有数据，哪些操作需要整体完成，任务何时可以推进，以及谁负责让它结束。共享内存与消息传递、线程与异步可以组合使用，每一层仍需有可解释的访问与退出协议。

## 延伸阅读

- [Async Book: Build an Executor](https://rust-lang.github.io/async-book/02_execution/04_executor.html)——继续实现任务队列与执行循环
- Rust 示例可在 [Rust Playground](https://play.rust-lang.org) 运行，Go 示例可在 [Go Playground](https://go.dev/play/) 运行

[^1]: [Rust `Future`](https://doc.rust-lang.org/std/future/trait.Future.html)——poll、Ready / Pending、唤醒责任与非阻塞要求

[^2]: [Rust `Waker`](https://doc.rust-lang.org/std/task/struct.Waker.html)——任务关联、后续轮询保证与唤醒合并

[^3]: [Async Book: Task Wakeups with Waker](https://rust-lang.github.io/async-book/02_execution/03_wakeups.html)——定时器示例参考、共享完成状态与最新 Waker 的保存

[^4]: [Async Book: Build an Executor](https://rust-lang.github.io/async-book/02_execution/04_executor.html)——就绪队列与唤醒驱动的执行循环

[^5]: [Tokio `yield_now`](https://docs.rs/tokio/latest/tokio/task/fn.yield_now.html)——重新调度与组合器内让出行为的限制

[^6]: [Mio `Poll`](https://docs.rs/mio/latest/mio/struct.Poll.html)——跨平台就绪抽象、系统实现与虚假就绪

[^7]: [Microsoft: I/O Completion Ports](https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports)——Windows 完成端口与已完成异步 I/O 的通知

[^8]: [Linux io_uring(7)](https://man7.org/linux/man-pages/man7/io_uring.7.html)——提交队列、完成队列与操作结果

[^9]: [Rust `Drop`](https://doc.rust-lang.org/std/ops/trait.Drop.html)——析构契约与同步的 `drop` 接口

[^10]: [Tokio task：Cancellation](https://docs.rs/tokio/latest/tokio/task/#cancellation)与[`JoinHandle`](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html)——任务取消时机、句柄丢弃、abort 与等待结束

[^11]: [Tokio `timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html)——超时返回、内部 Future 的取消与非让出操作的限制

[^12]: [Tokio `select!`](https://docs.rs/tokio/latest/tokio/macro.select.html)——分支生命周期、取消安全、默认与 biased 轮询顺序

[^13]: [Go `context`](https://pkg.go.dev/context)——Done、截止时间、派生取消与取消函数的资源释放责任

[^14]: [Async Book: Structured concurrency](https://rust-lang.github.io/async-book/part-reference/structured.html)——任务归属、作用域与取消传播原则

[^15]: [Tokio `join!`](https://docs.rs/tokio/latest/tokio/macro.join.html)——同任务并发、等待所有分支与轮询公平性

[^16]: [Tokio runtime：Detailed runtime behavior](https://docs.rs/tokio/latest/tokio/runtime/#detailed-runtime-behavior)——调度公平性的前提与顺序限制

[^17]: [Tokio `spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)与[`Builder::max_blocking_threads`](https://docs.rs/tokio/latest/tokio/runtime/struct.Builder.html#method.max_blocking_threads)——阻塞线程池默认上限 512、CPU 工作限制与无法中断已开始闭包的边界

[^18]: [Tokio `try_join!`](https://docs.rs/tokio/latest/tokio/macro.try_join.html)、[`JoinSet`](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html)与[tokio-util 的 `TaskTracker`](https://docs.rs/tokio-util/latest/tokio_util/task/struct.TaskTracker.html)——一败俱停的分支组合、丢弃即中止的分组任务与优雅关停的等待接口

[^19]: [Async: What is blocking?](https://ryhl.io/blog/async-what-is-blocking/)——两次 `.await` 之间 10–100 微秒的参考预算，及其“取决于应用”的限定

[^20]: [Tokio `Mutex`：Which kind of mutex should you use?](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html#which-kind-of-mutex-should-you-use)——同步 guard 跨 await 的死锁风险，以及异步 Mutex 允许跨 await 持有 guard 的用途

[^21]: [Rust Reference：Async functions](https://doc.rust-lang.org/reference/items/functions.html#async-functions)——调用 async fn 时将参数捕获进 Future，轮询时才执行函数体
