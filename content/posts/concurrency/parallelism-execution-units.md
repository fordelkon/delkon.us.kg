---
title: "并发编程（一）：并发、并行与执行单元"
description: "并发不等于并行。系列第一篇从任务与执行单元出发，区分抢占式与协作式两种调度模型，并通过错误示例识别数据竞争，为后续同步与消息传递篇目铺垫。"
publishDate: "2 Sep 2026"
tags: ["concurrency", "async", "rust", "go"]
---

这是并发编程系列的第一篇。先把两件事说清楚：并发与并行到底差在哪，进程、线程、协程这些**执行单元**（execution unit）各自承担什么角色——它们是后面五篇讨论**锁**（lock）、**原子操作**（atomic operation）、**死锁与正确性**、**消息传递**（message passing）与**异步**（asynchrony）时共用的坐标系。示例以 Rust 为主，控制块用 C 风格伪代码表示。

## 并发与并行

这两个词容易混淆，但关注点不同：

- **并发**（Concurrency）强调任务的组织方式：系统允许多个任务在同一时间段内交替或重叠推进——程序因此可以在等待 I/O、处理用户事件或执行后台任务时保持响应。即使只有一个 CPU 核心，也可以通过任务切换实现并发。
- **并行**（Parallelism）强调任务的执行状态：多个任务在同一时刻真正同时运行，通常依赖多核 CPU 或多处理器硬件支持。

因此，并发关注如何组织任务，并行关注任务是否同时执行。并发程序可以在多核 CPU 上并行运行，但并发本身并不等于并行。Rob Pike 在演讲 [Concurrency is not Parallelism](https://go.dev/blog/waza-talk) 里对这对概念有一个更好的概括：并发是关于结构的，并行是关于执行的[^1]。

## 任务与执行单元

并发编程真正关注的对象不是进程、线程或协程本身，而是**任务**（Task）：程序中可以独立推进的一项逻辑工作，例如一次网络请求、一次文件读写或一次用户事件处理。

任务不一定是操作系统直接调度的对象。进程、线程和协程是承载任务的不同执行抽象。它们的关系可以理解为：任务是要完成的逻辑工作，执行单元是推进任务的载体。三者的差异主要体现在隔离级别、调度层级和运行开销上：

| 执行单元 | 主要特点               | 调度层级          | 适用场景             |
| -------- | ---------------------- | ----------------- | -------------------- |
| 进程     | 地址空间独立，隔离性强 | 操作系统          | 多程序隔离、服务进程 |
| 线程     | 共享进程资源，切换较轻 | 操作系统          | CPU 密集型并行任务   |
| 协程     | 用户态调度，轻量级     | 运行时 / 事件循环 | 高并发 I/O 任务      |

### 进程

一个进程通常对应一个正在运行的程序实例。它既包含用户态的虚拟地址空间，也包含内核态维护的进程控制信息——其中最核心的是**进程控制块**（PCB，Process Control Block）：操作系统用它保存进程状态，并在调度切换时恢复对应的运行上下文[^8]。

不同进程拥有相互独立的虚拟地址空间，一个进程中的内存错误通常不会破坏另一个进程。这种隔离提高了安全性和稳定性，但代价通常是更高的创建和切换成本：进程之间交换数据要借助管道、消息队列、共享内存、Socket 等进程间通信机制，具体成本取决于隔离需求、通信机制和传输量。

下面的结构体是 PCB 的简化示意（并非可编译实现，也不对应某个内核的精确字段布局）。真实内核中的上下文保存点常在每线程的内核栈上——例如 Linux 用 `task_struct` 兼作 TCB，并不区分进程、线程两套控制块。每份控制块回答的都是同一组问题：这个执行单元是谁、能不能被调度、停在了哪里——再加上这一层特有的资源。后面两份控制块会反复出现这副骨架：

```c
/* Simplified PCB: process-level resources and execution context */
enum process_state { NEW, RUNNING, READY, WAITING, TERMINATED };

struct process_control_block {
    pid_t pid;                      /* Identity: process ID */
    enum process_state state;       /* State used by the scheduler */

    /* Context saved and restored across a process switch */
    uintptr_t program_counter;
    uintptr_t registers[4];
    uintptr_t stack_pointer;

    /* Resources owned by the process */
    uintptr_t memory_limits[2];     /* Virtual address-space bounds */
    struct io_device *io_devices;   /* Open I/O devices */
    struct open_file *open_files;   /* Open files */

    /* Relationships used for process lifecycle management */
    struct process_control_block *parent;
    struct process_control_block *children;
};
```

### 线程

线程是进程内部的执行流，也是操作系统进行 CPU 调度的重要单位。一个进程可以包含多个线程，它们共享所属进程的虚拟地址空间、打开的文件等进程级资源，自身只保留少量私有状态：

- 程序计数器
- 寄存器上下文
- 线程栈
- 调度状态

每个线程也需要一份自己的控制块，调度器才能在进程之内单独调度和切换它们。下面的 TCB 同样只是抽象示意，它的不少字段与 PCB 对位[^9]：

```c
/* Simplified TCB: per-thread scheduling and execution context */
struct thread_control_block {
    pid_t tid;                      /* Identity: thread ID */
    enum process_state state;       /* State used by the scheduler */

    /* Context has the same role as in the PCB, but belongs to this thread */
    uintptr_t program_counter;
    uintptr_t registers[4];
    uintptr_t stack_pointer;

    /* Address space and open files belong to the process. */
};
```

线程切换通常比进程切换轻量，因为不需要切换整个地址空间。多个线程可以在同一进程内执行相同的代码逻辑，只是执行位置、调用栈和运行状态彼此独立。

这也是很多语言在线程库中要求提供**线程入口函数、闭包或任务对象**的原因：创建线程时，本质上要告诉系统这个新线程从哪里开始执行、执行什么逻辑。

以 Rust 为例，`thread::spawn` 接收的闭包就是新线程的入口；`join` 则让 main 线程等待这个线程结束：

```rust
use std::thread;

fn main() {
    let handler = thread::spawn(|| {
        for i in 1..10 {
            println!("worker: {i}");
        }
    });

    for i in 100..110 {
        println!("main: {i}");
    }

    // Wait for the worker before returning from main.
    handler.join().unwrap();
}
```

不过，共享进程资源也带来了新问题。多个线程同时访问同一份可变数据时，可能产生竞态条件、数据不一致、死锁等并发错误，因此线程编程通常需要锁、原子操作、条件变量等**同步**（synchronization）机制保护共享状态、协调任务推进——[《并发编程（二）：锁、条件变量与共享内存同步》](/posts/concurrency/locks-condvars-shared-memory-sync/)将展开这些访问协议。

### 协程

**协程**（coroutine）是一种比线程更轻量的并发抽象，但它不是脱离线程独立运行的执行实体。更准确地说，**协程通常运行在线程之上**：操作系统仍然负责调度线程，而语言运行时或**事件循环**（event loop）负责在用户态把多个协程安排到一个或多个线程上执行。

调度发生在两个层级：操作系统可以通过**时间片**（time slice）抢占线程；用户态运行时再决定线程上的哪个任务继续执行。运行在线程之上，并不意味着任务只能主动让出执行权。

用户态调度也不必然等于协作式调度。Go 的 goroutine 就支持运行时抢占，Go 1.14 还引入了异步抢占，使没有函数调用的循环也能被打断[^5]。因此，协程运行在哪里，与它能否被抢占，是两个不同的问题。

一个线程可以承载大量协程，因为大多数 I/O 任务并不会一直占用 CPU。当某个协程等待网络、文件或定时器事件时，线程可以继续执行其他就绪的协程。因此协程特别适合 I/O 密集型场景：高并发 Web 服务、异步文件读写、消息队列消费、多路事件监听等。

操作系统为每个线程维护一份 TCB；把调度搬到用户态之后，这份簿记并没有消失，只是换了主人。有栈协程的运行时同样要为每个协程保存栈边界和挂起现场——Go runtime 里与 TCB 对位的结构体叫 `g`，简化后是这样[^2]（所引用的 Go 1.23.0 源码中，`atomicstatus` 是 `atomic.Uint32` 类型，示意图仍以普通整数表示）：

```c
/* Simplified Go goroutine descriptor, analogous to a TCB
   Source: Go 1.23.0, src/runtime/runtime2.go, type g struct */
struct g {
    uint64_t goid;                  /* Identity: goroutine ID */
    uint32_t atomicstatus;          /* State: _Grunnable / _Grunning / _Gwaiting / _Gsyscall */

    /* Saved context: gobuf contains sp, pc, and related state */
    struct gobuf sched;

    /* Private stack: [lo, hi), managed and resized by the runtime */
    struct stack stack;

    /* Binding: associated OS thread while running */
    struct m *m;
};
```

`m` 字段记录当前关联的 OS 线程；运行中的 `g` 在某个 `m` 上执行，运行时调度器负责把大量 `g` 分摊到少量线程上。这是 Go 运行时的具体设计，不是所有协程都必须采用的布局。

Go 的协程是**有栈的**（stackful），需要保存私有栈与挂起现场；Rust 的 async 则是**无栈的**（stackless），它把 `async fn` 编译成保存挂起状态的 Future 状态机。这里要分清两层：Future 保存计算进行到哪里的状态，执行器仍可为任务维护调度、唤醒和生命周期信息；Tokio 就有这样的任务记录[^10]。[《并发编程（六）：异步并发与任务的生命周期》](/posts/concurrency/async-concurrency-task-lifecycle/)会继续讨论这两层如何配合。

## 抢占式与协作式

讲完执行单元，接下来是调度问题：任务之间如何切换？两种基本模型对应了两种答案。

### 抢占式并发

**抢占式**（preemptive）并发是操作系统常用的调度方式：调度器几乎可以在任意时刻中断当前执行单元，切换到另一个执行单元——切换发生在时钟中断等硬件中断和调度点上。任务不需要主动让出 CPU，操作系统根据时间片、优先级、阻塞状态等因素统一调度。

抢占式并发的典型载体是线程。开发者通过线程库把程序中的不同任务拆分出来，交由操作系统调度；在硬件核心数合适的情况下，这些任务不仅可以并发推进，还可以在多核 CPU 上并行执行。

前面 `thread::spawn` 的示例没有显式让出执行权，两个线程仍由操作系统独立调度。它们可能交替执行，也可能在不同核心上同时执行。打印顺序只是一份运行结果；输出交错还可能涉及 I/O 阻塞，不能单凭日志证明发生了抢占。

抢占式调度的关键约束是：**不能假设当前线程会连续执行完一组操作**。假设一次计数器加一需要读取、计算和写回，就可能出现下面的交错：

| 步骤 | 线程 A           | 线程 B           |
| ---- | ---------------- | ---------------- |
| 1    | 读取 0，计算出 1 |                  |
| 2    |                  | 读取 0，计算出 1 |
| 3    | 写回 1           |                  |
| 4    |                  | 写回 1           |

两次加一最终只留下了一次更新。这是解释丢失更新的抽象模型；真实程序还必须遵守语言内存模型，不能直接把没有同步的普通读写当成合法的交错执行。

这类模型适合视频编码中相互独立的帧、切片（tile/slice）或独立 GOP 的并行处理，也可以让服务器中的多个工作线程独立推进。它的代价是共享状态不能依赖线程执行顺序保持正确：即使没有主动让出，也需要同步协议。这里既可能出现逻辑层面的竞态条件，也可能违反语言规则、形成**数据竞争**，本篇末尾会区分二者。

### 协作式并发

**协作式**（cooperative）并发与抢占式相对应：同一线程上的任务通过在特定位置**主动让出**执行权来切换。Rust async、Python asyncio 等采用这种推进方式。等待尚未就绪的异步操作或显式 `yield` 都可以提供让出点；`await` 的对象若已经就绪，则可能直接继续，不会每次都切换任务。

这种方式把任务切换留在用户态，切换点也更明确，适合组织大量 I/O 等待；实际开销仍取决于运行时和任务本身。现代异步编程模型——JS 的事件循环、Rust 的 async/await、Python 的 asyncio——都是协作式并发的重要实践。

关键在于"主动让出"这个动作本身。下面两个异步分支在同一个线程上推进。创建 Cargo 项目后，在 `Cargo.toml` 中加入 Tokio 依赖，将后面的 Rust 程序保存为 `src/main.rs`，用 `cargo run` 运行：

```toml
[dependencies]
tokio = { version = "1", features = ["macros", "rt"] }
```

```rust
use tokio::task::yield_now;

async fn first_task() {
    for i in 1..5 {
        println!("first task: {i}");
        // Yield the task back to the runtime; join! decides which branch is polled next.
        yield_now().await;
    }
}

async fn second_task() {
    for i in 100..105 {
        println!("second task: {i}");
        yield_now().await;
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Both branches run in this task, on the same thread.
    tokio::join!(first_task(), second_task());
}
```

`join!` 把两个分支放在同一个任务中轮流轮询，并不创建两个并行线程[^6]。这里要区分两层：`yield_now` 让出的是整个任务——任务被放回运行时的待处理队列；分支之间的交替，则来自 `join!` 在任务被重新轮询时轮转各分支的轮询顺序。删掉两处 `yield_now().await` 后，每个分支都能在一次轮询中运行到底，因此会看到一整段 `first task`，再看到一整段 `second task`。加上让出后，在 Tokio 1.53.3 的一次运行中得到如下交错；这里只截取前四行：

```text
first task: 1
second task: 100
second task: 101
first task: 2
...
```

这里要观察的是分支有机会交替推进，不是严格轮流输出。`yield_now` 不保证下一次一定调度另一个任务；程序不能依赖这样的顺序[^6]。

协作式任务若长时间计算而不让出，或者直接调用会阻塞线程的同步 I/O，同一线程上的其他任务就无法继续推进。需要并行消耗 CPU 时，应把工作安排到多个线程或进程上，而不是只增加同一线程上的异步任务。

两种模型可以放在一张表里对比：

| 维度     | 抢占式并发                       | 协作式并发                                                   |
| -------- | -------------------------------- | ------------------------------------------------------------ |
| 切换时机 | 调度器可在任务未主动让出时切换   | 任务在让出点主动切换                                         |
| 典型载体 | OS 线程、支持抢占的运行时任务    | 采用协作式调度的协程、异步任务                               |
| 调度位置 | 操作系统，也可由用户态运行时实现 | 通常在用户态运行时 / 事件循环，也可在内核实现                |
| 主要风险 | 共享数据竞态，需同步保护         | 长计算或阻塞调用卡住整个线程；await 点之间的竞态条件仍需处理 |
| 适合场景 | CPU 密集型、需要真并行           | 大量 I/O 等待、高并发连接                                    |

## 数据竞争：一个可以精确定义的问题

前面已经两次提到线程共享数据的风险，值得在系列开篇把这个问题说得精确一些。中文讨论里常笼统地称之为"竞态条件"，而并发文献里有一个定义明确、边界清晰的术语：**数据竞争**（data race）。

[Go 内存模型](https://go.dev/ref/mem)给出的非正式定义是：对某个内存位置的写，与对同一位置的另一个读或写**并发发生**，就构成数据竞争——除非所有相关访问都是原子操作[^3]。C++ 标准走得更远：两个**潜在并发**（potentially concurrent）的冲突访问，若至少一个是写、至少一个不是原子操作，且相互之间没有建立 happens-before 关系，程序的行为就是**未定义行为**[^4]。happens-before 是语言用来刻画内存访问先后关系的偏序：同一线程中由语言保证的求值先后可以建立这种顺序，跨线程则要靠同步操作连接——细节留到第三篇的[跨线程同步与 happens-before](/posts/concurrency/atomics-memory-model/#跨线程同步与-happens-before)。

Rust 同样将数据竞争列为未定义行为；`unsafe` 允许执行需要开发者证明安全的操作，并不免除避免数据竞争的义务[^7]。下面保留一份完整的**错误示例**：访问 `static mut` 需要 `unsafe`，但程序没有给并发读写建立同步关系。

```rust
use std::thread;

// Incorrect: concurrent non-atomic accesses cause undefined behavior.
static mut COUNTER: u64 = 0;

fn main() {
    let mut handles = Vec::new();
    for _ in 0..2 {
        handles.push(thread::spawn(|| {
            for _ in 0..1_000_000 {
                unsafe { COUNTER += 1 };
            }
        }));
    }

    for handler in handles {
        handler.join().unwrap();
    }

    let result = unsafe { COUNTER };
    println!("expected 2000000, got {result}");
}
```

这份程序用于识别错误，不应把它的运行结果当成调度实验。两个工作线程对 `COUNTER` 的非原子访问相互之间没有建立 happens-before 顺序，已经构成数据竞争。末尾的 `join` 只让主线程等待它们结束，不会把两个工作线程之间的访问排出先后。

未定义行为不能简单解释为“偶尔少加几次”：程序不保证输出偏小，也不保证开启优化后会输出什么。即使某次恰好得到 2000000，也不能证明程序正确。修复需要改变访问协议，例如把整次加一放进同一把锁的临界区，或使用合适的原子读改写操作。另一种思路是不共享：把可变状态的所有权交给单一所有者，任务之间通过消息传递协作——[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/)会展开这一方向。

**竞态条件**（race condition）的范围更广：程序结果取决于不合要求的执行先后——它也不限于线程，单线程事件驱动程序同样可能因事件到达顺序而产生竞态。例如，即使对共享数据的每次访问都加了锁（因此没有数据竞争），“检查余额”和“扣款”这一先检查后扣款的复合操作仍可能被交错执行，让两个线程都通过余额检查。排除数据竞争是基础，维护完整操作的不变量才是程序的目标。[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/)会用原子性违规、顺序违规等具体错误类别展开这个区分。

本篇先识别这类错误；[《并发编程（三）：原子操作与内存模型》](/posts/concurrency/atomics-memory-model/)会用 happens-before 解释同步顺序如何建立，以及原子性与操作组合的区别。这里需要带走的结论是：**只要可变数据被多个任务并发访问，数据竞争就是一个必须正面回答的问题。**

那么，多个任务如何安全地访问同一份数据？下一篇[《并发编程（二）：锁、条件变量与共享内存同步》](/posts/concurrency/locks-condvars-shared-memory-sync/)将从锁、条件变量与屏障出发，讨论如何保护共享状态、协调线程推进。

## 延伸阅读

- [Core Dumped](https://www.youtube.com/playlist?list=PL9vTTBa7QaQPdvEuMTqS9McY-ieaweU8M)——进程与线程调度的动画演示，适合建立直观认识
- [Writing an OS in Rust](https://os.phil-opp.com/zh-CN/)——从操作系统层面介绍并发与调度，适合继续理解系统级实现
- 不想在本机配置环境的话，Rust 代码可以放到 [Rust Playground](https://play.rust-lang.org) 运行

[^1]: [Rob Pike: Concurrency is not Parallelism](https://go.dev/blog/waza-talk)——并发与并行概念区分的经典演讲，"并发关于结构、并行关于执行"的出处

[^2]: [Go runtime: src/runtime/runtime2.go](https://raw.githubusercontent.com/golang/go/go1.23.0/src/runtime/runtime2.go)——Go 1.23.0 中 `type g` 与 `type gobuf` 的定义，协程控制块示意图的原型

[^3]: [The Go Memory Model](https://go.dev/ref/mem)——数据竞争的非正式定义与对原子访问的限定

[^4]: [C++ 标准草案：Data races](https://eel.is/c++draft/intro.races)——C++ 中数据竞争与 happens-before 关系的规范表述

[^5]: [Go 1.14 Release Notes: Runtime](https://go.dev/doc/go1.14#runtime)——goroutine 异步抢占的引入，说明用户态调度不等于只能协作式让出

[^6]: [Tokio `join!`](https://docs.rs/tokio/latest/tokio/macro.join.html)与[`yield_now`](https://docs.rs/tokio/latest/tokio/task/fn.yield_now.html)——同任务内的并发轮询，以及让出执行权不保证固定调度顺序的边界

[^7]: [The Rust Reference: Behavior considered undefined](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)——Rust 将数据竞争列为未定义行为，`unsafe` 不改变这一约束

[^8]: [OSTEP ch4: The Abstraction: The Process](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-intro.pdf)——进程的地址空间、寄存器和 I/O 状态，以及 PCB 的作用；用于支撑抽象模型，不对应示意结构的精确字段

[^9]: [OSTEP ch26: Concurrency: An Introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-intro.pdf)——线程共享地址空间、各自保存执行上下文和栈，以及 TCB 的作用

[^10]: [The Rust Programming Language: Futures and the Async Syntax](https://doc.rust-lang.org/book/ch17-01-futures-and-syntax.html)与[Tokio 任务实现说明](https://docs.rs/tokio/latest/src/tokio/runtime/task/mod.rs.html)——前者说明 async 生成 Future，后者展示执行器维护的任务状态、引用计数与唤醒信息
