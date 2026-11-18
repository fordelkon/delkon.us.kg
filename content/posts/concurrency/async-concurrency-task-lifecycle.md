---
title: "并发编程（六）：异步并发与任务的生命周期"
description: "解释 Future、Waker、执行器与 I/O 通知，结合消息归属讨论取消安全，区分请求期限、任务收束与外部副作用，并说明阻塞工作的边界。"
publishDate: "17 Oct 2026"
tags: ["concurrency", "async", "rust", "go"]
---

上一篇[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/)讨论了消息流动与提前退出。本篇回到第一篇的[协作式并发](/posts/concurrency/parallelism-execution-units/#协作式并发)：等待中的异步任务由谁继续驱动，调用方放弃结果以后，任务又该怎样结束？示例以 Rust 和 Tokio 为主，取消部分用 Go context 作对照。

阅读时可以沿两条线索展开：理解异步计算怎样运行，先读 [Future、Waker 与执行器](#futurewaker-与执行器)和 [I/O 通知模型](#io-就绪与完成通知)；处理任务怎样退出，重点读[取消与超时](#取消与超时)和[结构化并发与任务收束](#结构化并发与任务收束)。最后的[公平性与阻塞工作](#公平性与阻塞工作)补充运行时的限制：长时间不交还执行权的任务既会影响调度，也会拖延取消与收尾。

## Future、Waker 与执行器

### Future：由 poll 推进的计算

调用 Rust 的 `async fn` 会得到一个 Future，函数体不会因此立即执行。执行器通过 `poll` 推进它：返回 `Poll::Ready(value)` 表示完成，返回 `Poll::Pending` 表示暂时不能完成，并需要安排后续唤醒。`poll` 应快速返回，不能在其中用阻塞等待占住线程[^1]。

`.await` 会轮询被等待的 Future；如果它已完成，当前任务可以直接继续。如果它返回 `Pending`，等待会沿外层 Future 向上传递，让执行器有机会运行其他任务。因此，写了 `.await` 不等于每次都会切换任务。

Future 也不必对应一个独立任务。`join!` 可以在同一个任务里轮询多个 Future；执行器维护的是任务的调度状态，Future 则保存计算本身的状态。

### Pin / Unpin：为什么 poll 接收固定引用

`Future::poll` 的接收者是 `self: Pin<&mut Self>`，而不是普通的 `&mut self`。某些 `async fn` 生成的状态机可能在挂起期间保存指向自身内部数据的引用；进入这种依赖地址的状态后，移动整个 Future 会使引用失效。`Pin` 为这类值提供固定约束：通过安全接口不能把需要固定的值从原位置移走，直到它在原处完成析构[^22]。

`Unpin` 则表示类型不依赖这项约束。对 `T: Unpin`，`Pin<&mut T>` 可以安全地取得普通可变引用；不是每个 Future 都有自引用，也不是创建后就不能移动。接口统一使用 Pin，是为了让需要固定的 Future 也能安全实现同一个 trait。手动轮询时可用 `std::pin::pin!` 或 `Box::pin` 固定值，通常的 `.await` 由编译器处理相关要求。

下面的 Timer 只持有 `Arc<Mutex<State>>`，自身是 `Unpin`；移动这个 Timer 不会移动 Arc 所指向的共享状态。它采用 Pin 接收者是为了满足 Future 接口，并不是这个例子自身存在自引用。

### Waker：请求再次轮询

`poll` 的 `Context` 提供当前任务的 **Waker**。当等待条件发生变化时，调用 `wake()` 请求执行器再次轮询关联任务。唤醒不是“操作已经完成”的保证，再次轮询仍可能得到 `Pending`；多次唤醒也可能被合并[^2]。第三篇已[区分唤醒与内存同步](/posts/concurrency/atomics-memory-model/#唤醒与同步以-park--unpark-为例)；本节的 Waker 是另一种接口，具体保证应以 Waker 的契约为准，不能套用 park/unpark 的 token 规则。

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

与第二篇的[条件变量等待协议](/posts/concurrency/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)一样，这里也要把状态检查与登记等待放在同一把锁下。锁覆盖“检查完成状态并登记 Waker”，避免定时线程恰好在两步之间完成、造成遗漏唤醒。如果线程先完成，下一次 `poll` 直接看到 `done`；如果登记先完成，线程就取走 Waker 并唤醒。每次等待都保留最新的 Waker，因为同一 Future 后续可能由不同任务轮询。

下面展示登记先于完成的一次执行。定时线程可能在 `poll` 释放互斥锁后、返回 Pending 前调用 `wake`。如果完成先发生，Timer 则在持锁检查时直接观察到 `done`，无需依靠补发通知。互斥锁同时保护检查、登记和完成，事件线程不能在检查与登记之间修改状态[^1][^2][^3]。

```mermaid title="Timer 在 poll 返回前被唤醒" description="下图是 Timer 的一种合法时序。检查与登记位于同一临界区；定时线程在释放锁后调用 Waker。执行器保留早于 Pending 的调度请求，下一次 poll 得到结果。"
sequenceDiagram
 participant E as 执行器
 participant F as Timer Future
 participant T as 定时线程
 E->>F: poll
 F->>F: 持锁检查并登记 Waker
 F->>F: 解锁
 T->>T: 持锁置 done，取走 Waker 并解锁
 T->>E: wake 请求重调度
 F-->>E: 此次 poll 返回 Pending
 E->>F: 再次 poll
 F-->>E: Ready
```

在 `Pending` 后，执行器可继续轮询并更新 Waker。Future 一旦返回 `Ready`，调用方应停止轮询该 Future；通用契约允许再次调用时 panic 或永久阻塞。本 Timer 恰好会再次返回 `Ready(())`，这不是其他 Future 的保证[^1]。

这只是展示协议的教学实现：每个定时器创建一个线程，不能代表运行时管理大量定时器的方式。丢弃 Timer 也不会中断已启动的睡眠线程；外部工作的生命周期与 Future 本身需要分别考虑。

### 执行器：轮询与唤醒的循环

**执行器**（executor）负责调度任务和安排轮询；**任务**（task）是运行时管理的调度实体，保存外层 Future 的调度状态并处理其结果。一个任务可以在外层 Future 内嵌套多个内部 Future。I/O 或定时器通过 Waker 通知的是关联任务，这延续了第一篇的[执行层次](/posts/concurrency/parallelism-execution-units/#任务与执行单元)[^1][^2][^4]。

```mermaid title="Executor、Task、Future 与 Waker" description="事件源通过 Waker 请求再次调度任务。执行器安排线程轮询任务的外层 Future，外层可以轮询多个内部 Future。内部 Ready 只是子计算完成；外层 Ready 才表示任务得到正常返回值。"
flowchart TB
 event["I/O 或定时器"] -.->|事件发生时调用| waker["Waker"]
 waker -.->|请求再次调度| executor["Executor"]
 executor -->|安排线程轮询| task["Task<br/>调度状态与结果"]
 task -->|poll| outer["外层 Future"]
 outer -->|按需轮询| inner["内层 Future"]
 outer -->|返回 Ready| complete["任务正常完成"]
 class executor,task actor
 class waker,outer,inner state
 class complete result
```

Wake 是调度请求，内层 `Ready` 表示子计算完成，外层 `Ready` 才使该任务正常完成。把观察对象固定为外层 Future，就得到下面的轮询循环。

```mermaid title="执行器的轮询与唤醒循环" description="这里轮询的是任务外层 Future：Ready 表示任务完成，Pending 表示尚未完成。wake 可在 poll 返回前发生，已有的重新调度请求必须保留；多个唤醒可合并，不保证一一排队。"
flowchart TB
 spawn["新任务"] --> queue["就绪队列"]
 wake["wake 请求<br/>可合并"] --> queue
 queue --> poll["poll 任务外层 Future"]
 poll -->|Ready| done["记录结果<br/>结束任务"]
 poll -->|Pending| wait["等待再次调度<br/>保留已有唤醒"]
 wait -.->|已有或后续 wake| queue
 class spawn,queue actor
 class poll,wait,wake state
 class done result
```

任务可以在 `poll` 返回前就被唤醒，执行器也必须保留这次重新调度的请求。这个循环让执行器无需持续扫描所有等待者；它描述的是调度思路，不是保证每次 wake 都对应一次独立排队[^2][^4]。

第一篇[协作式并发示例中的 `yield_now()`](/posts/concurrency/parallelism-execution-units/#协作式并发) 会主动请求再次调度，但不保证下一次一定运行其他任务。尤其 `join!` 的多个分支仍属于同一个任务，不能把分支让出理解成创建了新的调度单位[^5]。

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
| `mpsc::Sender::send(value)`                          | 未完成的发送被取消时，消息未发送，但 value 会被丢弃 |
| `mpsc::Sender::reserve`                              | 取消后失去排队位置；待发送的 value 可保留在外层 |
| `AsyncReadExt::read_exact`、`AsyncWriteExt::write_all` | 可能已部分读写，重新开始不能假定从未发生过       |
| `Mutex::lock`、`Semaphore::acquire`                    | 会失去在公平等待队列中的位置                     |

`send(value)` 已把 value 移入发送 Future：在 `select!` 中另一个分支胜出时，没有发送消息，并不表示调用方还能取回这个 value。若取消后需要保留它以便重试，可以把 value 留在 `select!` 外层，让分支只等待 `tx.reserve()`，取得许可后再调用 `permit.send(value)`。这样被取消的是容量预约，value 仍由外层持有；但 `reserve` 被取消也会失去公平队列中的位置，重试需要重新排队[^25]。

下面用完整程序区分“取消等待”与“丢掉待发送值”。先填满容量为 1 的通道，使 `reserve()` 无法立即完成，再用已经就绪的取消信号结束等待；之后分别检查成功发送与接收端关闭的路径。示例不需要用睡眠猜测任务何时到达等待点：

```rust
use std::future::{pending, ready, Future};
use tokio::sync::mpsc;

async fn send_or_return(
    tx: &mpsc::Sender<String>,
    value: String,
    cancel: impl Future<Output = ()>,
) -> Result<(), String> {
    tokio::select! {
        _ = cancel => Err(value),
        result = tx.reserve() => match result {
            Ok(permit) => {
                permit.send(value);
                Ok(())
            }
            Err(_) => Err(value),
        },
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let (tx, mut rx) = mpsc::channel(1);
    tx.send(String::from("occupied")).await.unwrap();

    let value = String::from("next");
    let value = send_or_return(&tx, value, ready(())).await.unwrap_err();
    assert_eq!(value, "next");
    assert_eq!(rx.recv().await.as_deref(), Some("occupied"));

    send_or_return(&tx, value, pending()).await.unwrap();
    assert_eq!(rx.recv().await.as_deref(), Some("next"));

    rx.close();
    let value = String::from("unsent");
    let value = send_or_return(&tx, value, pending()).await.unwrap_err();
    assert_eq!(value, "unsent");
    println!("cancelled and closed sends returned their values");
}
```

这里的 `Err(value)` 仅表示未通过此函数发送，示例将取消与通道关闭合并为同一种返回；业务接口可再区分原因。`Ok(())` 仍只表示已发送，不表示对端处理完成。如果容量与取消信号同时就绪，`select!` 可能选择发送；先预约容量保护的是 value 的归属，并未让取消成为禁止发送的原子屏障。取得许可后到 `permit.send(value)` 之间没有 `.await`，也没有把消息再移入一个可能被丢弃的发送 Future[^25]。

这个保证还依赖调用方继续等待 `send_or_return` 返回。若其父任务直接丢弃整个函数 Future，函数持有的 value 仍会随之析构；需要跨父任务取消保留消息时，应把消息或恢复责任放在生命周期更长的所有者中。

失去排队位置与丢掉消息不同：锁或许可本来就没有拿到，反复取消再重试可能让任务在公平队列中迟迟轮不到——这正是[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/#活锁与饥饿)讨论的饥饿在取消协议下的形态。这里的取消语义也不同于第五篇的[通道结束](/posts/concurrency/message-passing-workers-backpressure/#提前退出与取消)：全部发送端丢弃且缓冲已取空后，Tokio 的 `mpsc::Receiver::recv()` 返回 `None` 表示通道结束，而 select 丢弃未完成分支只是让这个等待中的 Future 消亡。

取消安全是具体操作的契约，不能只按方法名概括所有 `recv` 或 `read`。取消不安全也不等于绝不能取消：程序整体关停时，丢弃某些进度可能符合需求；重试支付或继续解析协议时，则需要更严格的处理。

### Go context：传播退出信号

Go 的 context 用信号表达取消：第五篇手写的[`close(done)` 通道广播](/posts/concurrency/message-passing-workers-backpressure/#提前退出与取消)，正是 `WithCancel` 内建的语义。派生出的 Context 在取消时关闭 `Done()` 通道，使用者需要主动监听；信号不会强行终止 goroutine，也不会中断一个不支持 context 的阻塞调用。`WithCancel` 或 `WithTimeout` 返回的 cancel 函数，可以及时释放关联资源[^13]。

| 操作 | 取消怎样传达 | 怎样确认已退出 |
| ---- | ------------ | -------------- |
| Go `CancelFunc` | 关闭 `Done()`，并向派生 Context 传播；工作需主动响应 | 从结果通道接收或另行等待 goroutine |
| 丢弃 Rust 组合中的 Future | 所有者不再轮询它，已持有的值同步析构 | 析构完成后控制权回到调用者；外部工作有独立生命周期 |
| Tokio `JoinHandle::abort` | 请求运行时在任务交还控制权时销毁 Future | `await` 句柄，检查取消、正常完成或 panic |
| Tokio `CancellationToken` | 通知主动等待令牌的任务，允许执行异步善后 | 用句柄或 `TaskTracker` 等待任务退出 |

Go Context 还携带期限和请求范围的值。它的退出通知更接近 Tokio 的协作式 `CancellationToken`，而 Tokio `abort` 走运行时的取消路径。三者都需要额外的退出确认，才能把取消请求与完成善后区分开[^10][^13][^26][^27]。

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

| 组织方式 | 结果归谁 | 停止与收束由谁负责 |
| -------- | -------- | ------------------ |
| `join!` / `try_join!` 直接组合 Future | 当前任务拿到分支结果 | 组合者拥有分支；退出时析构仍由它持有的 Future |
| `spawn` + `JoinHandle` | 保留句柄的一方等待结果 | 句柄持有者可 abort 并 await；仅丢弃句柄会分离任务 |
| `JoinSet` | 集合所有者通过 `join_next` 获得结果 | 所有者可以发出中止请求并等待集合清空 |
| `TaskTracker` + `CancellationToken` | 业务结果另走通道或句柄 | 所有者先停止接纳，再发信号并等待 tracker 关闭且为空 |

### spawn 的 Send 与生命周期约束

`tokio::spawn` 要求传入的 Future 及其输出满足 `Send + 'static`。第二篇的 [Send / Sync](/posts/concurrency/locks-condvars-shared-memory-sync/#send--sync跨线程传递与共享)讨论值能否跨线程传递；这里的 Send 要求意味着任务可能在线程间迁移，尤其需要检查跨 `.await` 保存的状态。即使使用 current-thread 运行时，`tokio::spawn` 的接口也仍然要求 Send[^23]。

`'static` 不表示任务必须永远运行，而是它不能包含生命周期不足的借用。例如把拥有所有权的 String 移进任务可以满足要求；`async move` 若捕获的是一个短期借用，移入的仍然只是那个借用，不会自动延长被引用对象的生命周期。

需要保留 `Rc` 等非 Send 状态时，可以在 `LocalSet` 中使用 `spawn_local`，让任务留在同一线程。它移除了 Send 要求，仍要求 Future 及输出满足 `'static`；仅把运行时改为 current-thread，并不等于已经建立本地任务上下文[^24]。同一任务内直接组合 Future 则不需要 spawn 的这组约束，但仍需遵守借用规则。

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

Tokio 为这些约束提供了现成接口：`try_join!` 在某个分支返回 `Err` 时立即返回，未完成的分支随宏返回被丢弃。直接组合并拥有这些 Future 时，丢弃可以停止它们继续推进；若分支持有的是 JoinHandle，丢弃句柄不会中止后台任务，若借用外部 Future，也不会销毁被借用的计算[^10][^18]。

`JoinSet` 把 `spawn` 出的任务登记成组，丢弃时请求中止尚未结束的任务，但不等待清理完成；需要确认退出时，可用 `shutdown().await` 请求中止并等待收束。它相当于先 `abort_all()`，再循环 `join_next()` 直到集合为空，并会忽略收束期间子任务的 panic[^18]。

`tokio_util` 的 `TaskTracker` 则负责登记和等待，不主动中止任务。`close()` 只是允许 `wait()` 在 tracker 同时关闭且为空时完成；它不阻止之后继续登记任务，也不通知已有任务退出。一套完整的关停协议仍需由所有者关闭新工作入口、协调其他可能派生任务的入口，通过 `CancellationToken` 等机制通知已有任务停止并完成善后，再配合 `close()` 与 `wait().await` 等待登记任务退出。否则，某次等待完成并不表示之后不会再出现新任务[^26]。

下面的教学状态图把取消请求和结束分开。正常完成与取消之间可能发生竞争，调用方要用句柄或任务集合来观察结果[^10][^18]。

```mermaid title="Tokio 异步任务的推进与结束" description="这是外层 Future 的简化生命周期。Pending 后由已有或后续的 wake 请求再次调度。abort 发出请求，运行时取得控制权后才能析构；请求到达时也可能已正常完成。"
stateDiagram-v2
 state "就绪" as Scheduled
 state "轮询中" as Polling
 state "等待唤醒" as Pending
 state "正常完成" as Completed
 state "已请求取消" as CancelRequested
 state "已析构" as Dropped
 [*] --> Scheduled: spawn
 Scheduled --> Polling: poll
 Polling --> Pending: Pending
 Pending --> Scheduled: 记录 wake
 Polling --> Completed: Ready
 Scheduled --> CancelRequested: abort
 Pending --> CancelRequested: abort
 Polling --> CancelRequested: abort
 CancelRequested --> Dropped: 运行时接手
 CancelRequested --> Completed: 正常完成在先
 Completed --> [*]
 Dropped --> [*]
```

### 综合示例：失败或超时后收束任务

本篇的 Tokio 示例可共用下面的依赖配置。在空目录执行 `cargo init --bin --edition 2024`，用下面的内容替换 `Cargo.toml`，把要运行的完整 Rust 示例保存为 `src/main.rs`，然后执行 `cargo run`。重新运行相同的依赖解析结果时保留 Cargo 生成的锁文件，使用 `cargo run --locked`。

```toml title="Cargo.toml"
[package]
name = "concurrency-examples"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "=1.53.3", features = ["macros", "rt", "sync", "time"] }
```

下面用 JoinSet 管理两项工作，用信号量许可代表需要释放的资源。工作函数包含模拟 I/O，也允许返回业务错误；`run` 用同一个 budget 等待这一组任务的结果，成功时收集全部结果，失败或超时时停止剩余任务并等待析构完成。budget 只约束结果等待阶段，之后的 `shutdown().await` 收尾耗时另计，因此它不是整个 `run` 的总耗时上限[^11][^18]：

```rust
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tokio::time::{sleep, timeout};

async fn run(budget: Duration, should_fail: bool) -> Result<Vec<usize>, String> {
    let slots = Arc::new(Semaphore::new(2));
    let mut tasks = JoinSet::new();
    for id in 0..2 {
        let slots = Arc::clone(&slots);
        tasks.spawn(async move {
            let _permit = slots.acquire_owned().await.unwrap();
            sleep(Duration::from_millis(10)).await;
            if should_fail && id == 0 {
                return Err("request failed");
            }
            Ok(id)
        });
    }

    let outcome = timeout(budget, async {
        let mut values = Vec::new();
        while let Some(result) = tasks.join_next().await {
            let value = result.map_err(|error| error.to_string())?
                .map_err(str::to_owned)?;
            values.push(value);
        }
        Ok::<_, String>(values)
    }).await;

    // Request cancellation and wait for every remaining task to finish dropping.
    tasks.shutdown().await;
    assert_eq!(slots.available_permits(), 2);
    outcome.map_err(|_| String::from("deadline exceeded"))?
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    match run(Duration::from_millis(100), false).await {
        Ok(mut values) => {
            values.sort_unstable();
            assert_eq!(values, [0, 1]);
            println!("finished: {values:?}");
        }
        Err(error) => eprintln!("stopped: {error}"),
    }
}
```

把 `should_fail` 改为 true 可观察业务失败路径，缩短 budget 可观察超时路径；时间预算不是确定复现某种调度的工具，运行环境也可能让正常工作超时。任务完成顺序不固定，示例只在输出前排序。每条返回路径都会经过 `shutdown().await`，之后许可数量恢复；收尾本身没有这里的 budget 限制，仍依赖任务及时交还执行权。`shutdown` 会忽略收束期间子任务的 panic，若需要逐一记录这些错误，应显式 abort 后循环接收结果[^18]。

这里等待的是任务持有值的同步析构，不包含异步资源善后，也不会撤销已经发生的外部副作用。若 `run` 本身被父任务丢弃，JoinSet 的析构只请求中止，不能执行后面的异步等待；需要更外层的所有者负责关停与收束。这个例子因此明确了成功、业务失败和超时三条路径，并没有声称任意父级取消都能自动清理完毕。

### 父任务退出后由谁收束

如果父任务可能被外部中止，而调用方必须确认工作已经退出，可以让更长寿的监督者代它启动和管理子任务。下面用两个一次性通道确认子任务已持有资源、父任务已收到启动确认。随后监督者中止父任务并等待其退出，再收束子任务，最后检查许可已经归还[^10][^18]。

```rust
use std::future::pending;
use std::sync::Arc;
use tokio::sync::{oneshot, Semaphore};
use tokio::task::JoinSet;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let slots = Arc::new(Semaphore::new(1));
    let mut children = JoinSet::new();
    let (started_tx, started_rx) = oneshot::channel();
    let child_slots = Arc::clone(&slots);

    children.spawn(async move {
        let _permit = child_slots.acquire_owned().await.unwrap();
        started_tx.send(()).unwrap();
        pending::<()>().await;
    });

    let (parent_ready_tx, parent_ready_rx) = oneshot::channel();
    let parent = tokio::spawn(async move {
        started_rx.await.unwrap();
        parent_ready_tx.send(()).unwrap();
        pending::<()>().await;
    });

    parent_ready_rx.await.unwrap();
    assert_eq!(slots.available_permits(), 0);

    parent.abort();
    assert!(parent.await.unwrap_err().is_cancelled());
    assert_eq!(slots.available_permits(), 0);

    children.shutdown().await;
    assert_eq!(slots.available_permits(), 1);
}
```

这里在父任务退出时仍能观察到孩子占用许可；调用 `shutdown().await` 后才确认其析构结束。需要异步关闭连接或刷出缓冲时，监督者应先发协作式停止信号，让任务执行明确的异步善后，再等它返回。

### 多阶段期限与关停责任

结果等待预算、请求期限和关停预算是不同的边界。一个请求若依次经历排队、获取连接和远程调用，每一阶段都重新等待完整的 1 秒，整个请求就可能远超 1 秒。需要统一请求期限时，可以在入口确定绝对 deadline，并将同一个时刻传给后续阶段，例如用 `timeout_at` 等待；后续阶段只消费剩余时间，而不重新获得一份完整预算。绝对期限也不能强制抢占长时间不返回的 `poll`[^11]。

期限到了以后，已有工作怎样结束仍需单独规定。第五篇的[关停协议](/posts/concurrency/message-passing-workers-backpressure/#关停时怎样处置已接受的工作)先明确接纳边界和排空或取消策略；异步所有者还需保持存活，接收错误、发出停止请求并等待任务退出。若应用另设收尾期限，超期后必须明确未结束工作的归属和处置。再给 `shutdown()` 套一层 timeout，只能限制这一轮等待，不会证明任务已经结束。

因此，客户端停止等结果、工作被请求取消、任务实际结束和外部副作用得到确认，应分别记录。客户端超时后，可以由服务级所有者继续等待任务并报告最终状态；对于已经交付外部系统的操作，还需按业务协议确认结果或做补偿，不能把本地 JoinHandle 的取消状态当成远端没有执行的证据。

## 公平性与阻塞工作

### 让出与调度公平性

协作式执行器不能抢占一次长时间运行的 `poll`。同步 I/O 或长计算会占住所在 worker；即使其他 worker 还在运行，也可能造成延迟或依赖阻塞。

`select!` 默认随机选择先检查的分支，`join!` 默认轮换先轮询的分支，以避免某一分支长期占先。使用 `biased;` 时则由调用方负责顺序，例如把关停信号放在繁忙消息流前面。与[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/#活锁与饥饿)对公平性的提醒一致，这些策略不能为任意程序提供等待时间上界[^12][^15]。

Tokio 的调度公平性保证本身也有条件，包括任务数量有界、每次 `poll` 在有界时间内返回；它不保证任务严格轮流运行[^16]。是否需要拆分计算或迁移阻塞工作，应根据任务耗时和服务延迟目标判断；Tokio 团队成员的文章曾以两次 `.await` 之间 10–100 微秒作为参考预算[^19]，但它同样不是所有应用都能直接套用的统一规范。

### 持锁跨 `.await` 的等待依赖

第四篇的[等待依赖分析](/posts/concurrency/deadlock-livelock-correctness/#等待不只发生在锁上)同样适用于异步任务。例如任务 A 持有一把锁，向任务 B 发出请求后等待回复；B 必须取得同一把锁才能生成回复。A 等 B 回复，B 等 A 解锁，双方都无法完成。即使用异步 Mutex，让等锁只挂起任务、不阻塞线程，这个逻辑上的等待环仍然存在。

使用同步 Mutex 还要检查执行器线程是否被阻塞：A 持锁后在 `.await` 处挂起，运行在同一线程上的 B 再调用阻塞式 `lock()`，就可能占住线程，使 A 无法恢复并释放锁。某些 `Send` 约束会在编译时拒绝持有同步 guard 的跨任务用法，但本地任务或同一任务内的分支不能依赖这层检查排除死锁。Tokio 的 Mutex 文档因此特别提醒同步 guard 跨 `.await` 的风险[^20]。

可在进入等待前完成状态读写并结束 guard 的作用域，让 B 获取锁并继续处理；若业务确实要求跨 `.await` 持锁，可以使用支持这种用法的异步 Mutex，同时检查被等待的操作是否直接或间接需要同一资源。异步锁解决等待方式，不替调用方证明协议没有循环依赖[^20]。

### 异步与线程的分工

| 工作类型               | 常见安排               | 需要注意的边界                                                                                    |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| 大量网络等待           | 异步任务配合非阻塞 I/O | 仍需[限制任务与缓冲数量](/posts/concurrency/message-passing-workers-backpressure/#背压与队列容量) |
| 有限时长的同步阻塞操作 | `spawn_blocking`       | 启动后不能靠 abort 强行停止                                                                       |
| 长期阻塞的常驻循环     | 独立线程与显式退出协议 | 退出时仍需等待与回收                                                                              |
| 大量 CPU 计算          | 有界计算线程池         | 限制并行数量，避免占满异步 worker                                                                 |

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

[^11]: [Tokio 1.53.3 `timeout`](https://docs.rs/tokio/1.53.3/tokio/time/fn.timeout.html)与[`timeout_at`](https://docs.rs/tokio/1.53.3/tokio/time/fn.timeout_at.html)——相对时长与绝对期限、超时返回、内部 Future 的取消与非让出操作的限制

[^12]: [Tokio `select!`](https://docs.rs/tokio/latest/tokio/macro.select.html)——分支生命周期、取消安全、默认与 biased 轮询顺序

[^13]: [Go `context`](https://pkg.go.dev/context)——Done、截止时间、派生取消与取消函数的资源释放责任

[^14]: [Async Book: Structured concurrency](https://rust-lang.github.io/async-book/part-reference/structured.html)——任务归属、作用域与取消传播原则

[^15]: [Tokio `join!`](https://docs.rs/tokio/latest/tokio/macro.join.html)——同任务并发、等待所有分支与轮询公平性

[^16]: [Tokio runtime：Detailed runtime behavior](https://docs.rs/tokio/latest/tokio/runtime/#detailed-runtime-behavior)——调度公平性的前提与顺序限制

[^17]: [Tokio `spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)与[`Builder::max_blocking_threads`](https://docs.rs/tokio/latest/tokio/runtime/struct.Builder.html#method.max_blocking_threads)——阻塞线程池默认上限 512、CPU 工作限制与无法中断已开始闭包的边界

[^18]: [Tokio `try_join!`](https://docs.rs/tokio/latest/tokio/macro.try_join.html)与[Tokio 1.53.3 `JoinSet::shutdown`](https://docs.rs/tokio/1.53.3/tokio/task/struct.JoinSet.html#method.shutdown)——一败俱停的分支组合；JoinSet 丢弃时请求中止任务，shutdown 则请求中止并等待集合清空，忽略收束期间子任务的 panic

[^19]: [Async: What is blocking?](https://ryhl.io/blog/async-what-is-blocking/)——两次 `.await` 之间 10–100 微秒的参考预算，及其“取决于应用”的限定

[^20]: [Tokio `Mutex`：Which kind of mutex should you use?](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html#which-kind-of-mutex-should-you-use)——同步 guard 跨 await 的死锁风险，以及异步 Mutex 允许跨 await 持有 guard 的用途

[^21]: [Rust Reference：Async functions](https://doc.rust-lang.org/reference/items/functions.html#async-functions)——调用 async fn 时将参数捕获进 Future，轮询时才执行函数体

[^22]: [Rust `std::pin`](https://doc.rust-lang.org/std/pin/)与[`Pin`](https://doc.rust-lang.org/std/pin/struct.Pin.html)——地址敏感状态、析构前的固定保证、Unpin 与 Future 接口

[^23]: [Tokio `spawn`](https://docs.rs/tokio/latest/tokio/task/fn.spawn.html)——Future 及输出的 Send 与 static 约束，以及跨 await 保存状态的要求

[^24]: [Tokio `LocalSet`](https://docs.rs/tokio/latest/tokio/task/struct.LocalSet.html)与[`spawn_local`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_local.html)——同线程非 Send 任务、本地上下文和 static 约束

[^25]: [Tokio 1.53.3 `Sender::send`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/struct.Sender.html#method.send)与[`Sender::reserve`](https://docs.rs/tokio/1.53.3/tokio/sync/mpsc/struct.Sender.html#method.reserve)——send 被 select 取消时消息未发送但 value 被丢弃；先预约容量可让 value 保留在外层，取消预约仍会失去排队位置

[^26]: [tokio-util 0.7.20 `TaskTracker::close`](https://docs.rs/tokio-util/0.7.20/tokio_util/task/struct.TaskTracker.html#method.close)与[`TaskTracker::wait`](https://docs.rs/tokio-util/0.7.20/tokio_util/task/struct.TaskTracker.html#method.wait)——close 不阻止登记新任务，wait 以关闭且为空作为完成条件；配合 CancellationToken 分担停止通知与等待退出的责任


[^27]: [tokio-util 0.7.20 `CancellationToken`](https://docs.rs/tokio-util/0.7.20/tokio_util/sync/struct.CancellationToken.html)——取消通知、向子令牌传播，以及任务主动等待取消的接口
