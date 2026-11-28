---
title: "并发编程（一）：并发、并行与执行单元"
description: "区分并发、并行、执行单元与调度模型，讨论任务粒度、负载均衡和并行成本，再通过错误示例识别数据竞争。"
publishDate: "2 Sep 2026"
tags: ["concurrency", "async", "rust"]
---

这是并发编程系列的第一篇。先把两件事说清楚：并发与并行到底差在哪，进程、线程、协程这些**执行单元**（execution unit）各自承担什么角色——它们是后面五篇讨论锁、原子操作、死锁与正确性、消息传递与异步时共用的坐标系。示例以 Rust 为主，控制块用 C 风格伪代码表示。

## 并发与并行

**并发**（concurrency）关心怎样组织能独立推进的工作，**并行**（parallelism）关心工作是否在同一时刻执行[^1]。单个逻辑 CPU 可以交替处理网络请求和后台任务，这是并发，不是并行；两个逻辑 CPU 在同一时刻各推进一项工作，才有并行执行。

## 任务与执行单元

并发编程真正关注的对象不是进程、线程或协程本身，而是**任务**（task）：程序中可以独立推进的一项逻辑工作，例如一次网络请求、一次文件读写或一次用户事件处理。

这里要分开两个问题：执行抽象回答“谁持有什么资源、在哪里保存进度”，调度策略回答“谁决定下一步运行什么、何时能切换”。两者是独立的维度。进程提供地址空间和资源边界，内核把可运行的 OS 线程调度到逻辑 CPU；如果还有用户态运行时，它再安排线程推进哪个任务。Linux 内核用自己的 task 结构记录各个可调度的执行流，这里的 task 不是应用层的一项逻辑工作[^2][^3][^4]。

进程中的线程共享地址空间，但各有自己的栈。对用户态异步来说，任务是运行时调度的单位，Future 则表示可被轮询的计算：一个任务可以推进多个 Future，不是每个 Future 都要独立调度[^3][^5][^6]。

| 抽象 | 持有的资源或状态 | 谁推进 |
| ---- | ---------------- | ------ |
| Linux 进程 | 虚拟地址空间、打开的文件等共享资源[^4] | 内核调度其中各自可运行的线程 |
| OS 线程 | 独立的栈、寄存器上下文[^3] | 内核把线程调度到逻辑 CPU |
| Go goroutine | 运行时管理的独立栈和挂起现场[^7] | Go 运行时安排线程执行 |
| Tokio 任务 | 根 Future、调度与唤醒记录[^5] | Tokio 调度任务，任务轮询根 Future |
| Rust Future | `async fn` 生成的状态机保存跨挂起点所需的值[^5] | 调用方轮询；可以是任务，也可以是另一个 Future |

内核把 OS 线程换到另一个逻辑 CPU，与运行时把任务换到另一个 OS 线程是两回事；后者还受具体运行时和类型约束，例如 Tokio 的 `spawn` 对 Future 的 `Send` 要求[^4][^6]。

### 进程

一个进程通常对应一个正在运行的程序实例。它既包含用户态的虚拟地址空间，也包含内核态维护的进程控制信息——其中最核心的是**进程控制块**（Process Control Block, PCB）：操作系统用它保存进程状态，并在调度切换时恢复对应的运行上下文[^2]。

不同进程拥有相互独立的虚拟地址空间，一个进程中的内存错误通常不会破坏另一个进程。这种隔离提高了安全性和稳定性，但代价通常是更高的创建和切换成本：进程之间交换数据要借助管道、消息队列、共享内存、Socket 等**进程间通信**（inter-process communication, IPC）机制，具体成本取决于隔离需求、通信机制和传输量。

下面的结构体是 PCB 的简化示意（并非可编译实现，也不对应某个内核的精确字段布局）。真实内核中的上下文保存点常在每线程的内核栈上——例如 Linux v6.12 的 `task_struct` 描述单个 task，线程组通过组 ID、组首领以及共享资源等关系组织[^4]。每份控制块回答的都是同一组问题：这个执行单元是谁、能不能被调度、停在了哪里——再加上这一层特有的资源。后面两份控制块会反复出现这副骨架：

:::note[深入阅读：PCB 的简化布局]

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

:::

### 线程

线程是进程内部的执行流，也是操作系统进行 CPU 调度的重要单位。一个进程可以包含多个线程，它们共享所属进程的虚拟地址空间、打开的文件等进程级资源，自身只保留少量私有状态：

- 程序计数器
- 寄存器上下文
- 线程栈
- 调度状态

每个线程也需要一份自己的**线程控制块**（Thread Control Block, TCB），调度器才能在进程之内单独调度和切换它们。下面的 TCB 同样只是抽象示意，它的不少字段与 PCB 对位[^3]：

:::note[深入阅读：TCB 的简化布局]

```c
/* Simplified TCB: per-thread scheduling and execution context */
enum thread_state { THREAD_NEW, THREAD_RUNNING, THREAD_READY, THREAD_WAITING, THREAD_TERMINATED };

struct thread_control_block {
    pid_t tid;                      /* Identity: thread ID */
    enum thread_state state;        /* Per-thread scheduler state; independent of peers */

    /* Context serves the same save/restore role as in the PCB, scoped to this thread */
    uintptr_t program_counter;
    uintptr_t registers[4];
    uintptr_t stack_pointer;

    /* Address space and open files stay owned by the process, not duplicated here. */
};
```

:::

线程切换通常比进程切换轻量，因为不需要切换整个地址空间。多个线程可以在同一进程内执行相同的代码逻辑，只是执行位置、调用栈和运行状态彼此独立。

这也是很多语言在线程库中要求提供**线程入口函数、闭包或任务对象**的原因：创建线程时，本质上要告诉系统这个新线程从哪里开始执行、执行什么逻辑。

以 Rust 为例，`thread::spawn` 接收的闭包就是新线程的入口；`join` 则让 main 线程等待这个线程结束：

```rust
use std::thread;

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..10 {
            println!("worker: {i}");
        }
    });

    for i in 100..110 {
        println!("main: {i}");
    }

    // Join before returning; otherwise process exit tears down the worker early.
    handle.join().unwrap();
}
```

不过，共享进程资源也带来了新问题。多个线程同时访问同一份可变数据时，可能产生竞态条件、数据不一致、死锁等并发错误，因此线程编程通常需要锁、原子操作、条件变量等**同步**（synchronization）机制保护共享状态、协调任务推进——[《并发编程（二）：锁、条件变量与共享内存同步》](/posts/concurrency/locks-condvars-shared-memory-sync/)将展开这些访问协议。

### 协程

**协程**（coroutine）能够挂起并在之后恢复，实际运行仍要依托线程。语言运行时或**事件循环**（event loop）可以在一个或多个线程上推进协程；若等待 I/O 只挂起协程而不占住线程，同一线程就能去执行其他就绪的工作。能否抢占协程则是调度策略，不是协程这一抽象本身的属性。

操作系统为每个线程维护一份 TCB；把调度搬到用户态之后，这份簿记并没有消失，只是换了主人。有栈协程的运行时同样要为每个协程保存栈边界和挂起现场——Go runtime 里与 TCB 对位的结构体叫 `g`，简化后是这样[^7]（所引用的 Go 1.23.0 源码中，`atomicstatus` 是 `atomic.Uint32` 类型，示意图仍以普通整数表示）：

:::note[深入阅读：Go goroutine 的简化布局]

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

:::

`m` 字段记录当前关联的 OS 线程，并非终身绑定；goroutine 可调用 `runtime.LockOSThread` 把自己绑定到当前线程[^6]。这是 Go 的**有栈**（stackful）设计，挂起现场包含栈和执行上下文；Rust 的 `async fn` 则采用**无栈**（stackless）设计，把跨挂起点所需的状态保存在 Future 中，不为每个 Future 分配独立调用栈[^5]。[《并发编程（六）：异步并发与任务的生命周期》](/posts/concurrency/async-concurrency-task-lifecycle/)会继续讨论 Future 与任务如何配合。

### 阻塞、挂起与唤醒

线程执行阻塞式等待时，当前线程不能继续推进调用方代码；操作系统可以调度其他就绪线程。异步 Future 等待尚未就绪的操作时，可以保存进度并返回 Pending，让执行器在同一线程上推进其他任务。若在异步任务里直接调用阻塞式 I/O，占住的仍是线程。

唤醒只表示等待者有机会再次推进，不表示条件必然满足，也不表示立即获得 CPU。线程的上下文切换需要操作系统保存与恢复执行现场；Future 分支的轮询切换则可以发生在同一线程内，不必每次都触发操作系统级线程切换。第六篇会解释[执行器如何处理轮询与唤醒](/posts/concurrency/async-concurrency-task-lifecycle/#执行器轮询与唤醒的循环)。

## 抢占式与协作式

先说清比较的是哪一层，再问切换是否要等当前工作交还控制权。用户态不等于协作式：Go 1.14 引入异步抢占，使没有函数调用的循环也能被打断。反过来，Rust Future 的 `poll` 需返回，调用它的执行器才能在同一线程上推进其他任务；承载它的 OS 线程仍可被内核抢占[^8][^5]。能否并行则取决于是否有多个执行资源可以同时推进工作，不由抢占或协作决定。

### 抢占式并发

**抢占式调度**（preemptive scheduling）允许调度器在当前执行单元未主动让出时发起切换，例如操作系统在**时间片**（time slice）用尽后切换线程。实际何时能切换，还受执行状态与实现约束。

前面 `thread::spawn` 的示例没有显式让出执行权，两个线程仍由操作系统独立调度。它们可能交替执行，也可能在不同核心上同时执行。打印顺序只是一份运行结果；输出交错还可能涉及 I/O 阻塞，不能单凭日志证明发生了抢占。

抢占式调度的关键约束是：**不能假设当前线程会连续执行完一组操作**。假设一次计数器加一需要读取、计算和写回，就可能出现下面的交错：

| 步骤 | 线程 A           | 线程 B           |
| ---- | ---------------- | ---------------- |
| 1    | 读取 0，计算出 1 |                  |
| 2    |                  | 读取 0，计算出 1 |
| 3    | 写回 1           |                  |
| 4    |                  | 写回 1           |

两次加一最终只留下了一次更新。这是解释丢失更新的抽象模型；真实程序还必须遵守语言内存模型，不能直接把没有同步的普通读写当成合法的交错执行。

这说明共享状态的正确性不能依赖线程恰好按某种顺序执行。本篇末尾会区分逻辑层面的竞态条件与语言内存模型所定义的数据竞争。

### 协作式并发

**协作式调度**（cooperative scheduling）依靠当前任务交还执行权来切换。例如，Rust 的异步计算在等待未就绪操作时可以返回 `Pending`；若 `await` 的对象已经就绪，计算可以直接继续，不一定发生切换。下面两个异步分支在同一个线程上推进。

```rust
use tokio::task::yield_now;

async fn first_branch() {
    for i in 1..5 {
        println!("first branch: {i}");
        // Yield Pending so join! can poll the sibling branch inside this task.
        yield_now().await;
    }
}

async fn second_branch() {
    for i in 100..105 {
        println!("second branch: {i}");
        yield_now().await;
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Both async fns run as concurrent branches polled within a single Tokio task.
    tokio::join!(first_branch(), second_branch());
}
```

`join!` 把两个 Future 分支放在同一个任务中轮询，并不创建新任务或并行线程[^9]。Future 可以先理解为保存异步计算进度的对象；执行器轮询任务，任务内部再轮询这些分支。`yield_now().await` 让当前分支暂时返回 `Pending`，`join!` 因而有机会推进另一分支。只有外层任务也返回 `Pending`，执行权才交还执行器；组合器可能使一次让出无法一直向上传播。第六篇会展开[Future 与任务的关系](/posts/concurrency/async-concurrency-task-lifecycle/#future由-poll-推进的计算)。

删掉两处 `yield_now().await` 后，每个分支都能在一次轮询中运行到底，循环内部不再交错。这里不把哪个分支先执行作为接口保证；`join!` 默认会轮换优先轮询的分支，显式使用 `biased;` 才按源码顺序轮询[^9]。加上让出后，在 Tokio 1.53.3 的一次运行中得到如下交错；这里只截取前四行：

```text
first branch: 1
second branch: 100
second branch: 101
first branch: 2
...
```

这里要观察的是分支有机会交替推进，不是严格轮流输出。`yield_now` 不保证下一次一定调度另一个任务；程序不能依赖这样的顺序[^9]。

协作式任务若长时间计算而不让出，或者直接调用会阻塞线程的同步 I/O，同一线程上的其他任务就无法继续推进。需要并行消耗 CPU 时，应把工作安排到多个线程或进程上，而不是只增加同一线程上的异步任务。

两种模型可以放在一张表里对比：

| 维度 | 抢占式调度 | 协作式调度 |
| ---- | ---------- | ---------- |
| 切换时机 | 调度器可在当前工作未让出时发起切换 | 等当前工作交还控制权 |
| 本篇例子 | 内核调度 OS 线程；Go 运行时抢占 goroutine | Tokio 在同一线程上轮询异步任务 |
| 读代码时要问 | 不主动让出的操作之间，是否依然允许交错？ | 哪些步骤会挂起？长计算或阻塞调用会不会占住整个线程？ |

## 并行任务的划分与成本

多个线程能够同时执行，只是加速的前提。还需看任务之间有多少依赖、工作怎样分配，以及协调花费了多少时间。以处理一批数据为例，如果读取输入、汇总输出必须串行，只有中间计算可以分摊，那么增加线程只能缩短中间部分。

**阿姆达尔定律**（Amdahl's law）刻画固定工作量下的强扩展限制：假设原来 20% 的执行时间不能并行，另外 80% 可以理想分摊到四个执行单元，耗时也只能降到原来的 40%，加速为 2.5 倍；即使可并行部分耗时趋近于零，也仍留下原来的 20%。这是忽略额外开销的理想模型，不能把它当成实际性能承诺；如果随执行单元增加同步放大问题规模，可并行工作占比往往随之提高，这就进入了**古斯塔夫森定律**（Gustafson's law）讨论的弱扩展视角[^10]。无论哪种扩展模型，真实并行都要付出额外开销：任务创建与派发、线程唤醒与调度、锁或原子同步、跨核缓存一致性通信，以及最终结果汇总。

### 任务粒度与负载均衡

把每个元素都分成一个任务，和把整批数据只分成两个任务，会面临不同的成本：

| 划分方式 | 可能的收益 | 主要限制 |
| -------- | ---------- | -------- |
| 少量大块 | 创建、派发与汇总次数少，容易保留连续访问 | 各块耗时不均时，先完成的执行单元会空闲 |
| 大量小块 | 工作可以持续分摊，较容易吸收任务耗时差异 | 排队、唤醒、同步和任务管理可能占去更多时间 |
| 分块计算后局部汇总 | 减少对共享计数器或输出容器的频繁访问 | 最终合并仍有成本，结果顺序与数值语义也需保持 |

**任务粒度**（granularity）描述每次派发承担多少工作；**负载均衡**（load balancing）关注这些工作是否让执行单元都得到有效利用。等量数据不一定对应等量计算：解析不同复杂度的记录、搜索不同深度的子树，都可能产生不均衡。动态领取任务可以改善分配，但不能消除算法中的依赖，也不保证比静态分块更快[^10]。

**工作窃取**（work stealing）是动态分配的一种做法：找不到工作的一方尝试从另一方的本地队列领任务。以 Go 1.23.0 的 G/M/P 调度模型为例——其中 G 代表 goroutine、M 代表 OS 线程、P 代表执行 Go 代码所需的处理器上下文资源——M 必须持有 P 才能执行用户 Go 代码。每个 P 除了普通本地队列外，还有一个单槽位、优先级更高的 `runnext` 字段（目标普通本地队列为空时，窃取路径在某些条件下也可能转而尝试 `runnext`）；运行时也有全局就绪队列。当持有 P A 的线程本地没有工作时，通常会从另一个 P B 的普通本地队列分走约一半就绪 goroutine（一个立即执行，其余转入 A 的本地队列），但这不代表查找工作的固定顺序，也不是 Go 语言保证[^11]。

第五篇的[任务池](/posts/concurrency/message-passing-workers-backpressure/#任务池复用执行单元)展示了另一种领取方式：多个 worker 从同一个队列取任务。无论任务如何领取，粒度仍由算法决定，worker 数量与任务数量也不必相同。

### 性能测量回答什么

并行计算通常比较同一输入下的完成耗时；服务程序还要分别看吞吐量与请求延迟。每秒完成更多请求，不代表每个请求更快，过长的排队还可能恶化尾延迟，例如延迟分布的第 99 百分位（p99），而平均耗时未必能反映这些慢请求。第五篇会进一步区分[队列容量、处理能力与等待](/posts/concurrency/message-passing-workers-backpressure/#容量吞吐与等待时间)。

比较实现前，应先固定工作量、编译优化、结果要求与计时边界；端到端耗时应包括该实现实际需要的创建、派发、同步和汇总，若只测计算内核则应明确范围。循环里的日志、首次初始化与多次运行的波动都可能掩盖差异。Playground 适合观察输出与协议行为，共享运行环境中的耗时不能单独支撑稳定的性能结论。第二篇的[锁粒度](/posts/concurrency/locks-condvars-shared-memory-sync/#临界区范围与锁的粒度)和第三篇的[原子操作](/posts/concurrency/atomics-memory-model/#原子操作与原子性)同样需要按实际争用分析，不能只比较接口名称。

## 数据竞争：一个可以精确定义的问题

前面已经两次提到线程共享数据的风险，值得在系列开篇把这个问题说得精确一些。中文讨论里常笼统地称之为“竞态条件”，而并发文献里有一个定义明确、边界清晰的术语：**数据竞争**（data race）。

下面把范围限定在普通线程的读写；完整的 C++ 冲突定义还涉及对象生命周期开始、结束与重叠存储，不在这里展开[^12]。

[Go 内存模型](https://go.dev/ref/mem)给出的非正式定义是：对某个内存位置的写，与对同一位置的另一个读或写**并发发生**，就构成数据竞争——除非所有相关访问都是原子操作[^13]。C++ 标准走得更远：两个**潜在并发**（potentially concurrent）的冲突访问，若至少一个是写、至少一个不是原子操作，且相互之间没有建立 happens-before 关系，程序的行为就是**未定义行为**（undefined behavior, UB）[^12]。happens-before 是语言用来刻画内存访问先后关系的偏序：同一线程中由语言保证的求值先后可以建立这种顺序，跨线程则要靠同步操作连接——细节留到第三篇的[跨线程同步与 happens-before](/posts/concurrency/atomics-memory-model/#跨线程同步与-happens-before)。

Rust 同样将数据竞争列为未定义行为；`unsafe` 允许执行需要开发者证明安全的操作，并不免除避免数据竞争的义务[^14]。下面保留一份完整的**错误示例**：访问 `static mut` 需要 `unsafe`，但程序没有给并发读写建立同步关系。

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

    // join waits for workers, but does NOT order their COUNTER accesses against each other.
    for handle in handles {
        handle.join().unwrap();
    }

    let result = unsafe { COUNTER };
    println!("expected 2000000, got {result}");
}
```

这份程序用于识别错误，不应把它的运行结果当成调度实验。两个工作线程对 `COUNTER` 的非原子访问相互之间没有建立 happens-before 顺序，已经构成数据竞争。末尾的 `join` 只让主线程等待它们结束，不会把两个工作线程之间的访问排出先后。

未定义行为不能简单解释为“偶尔少加几次”：程序不保证输出偏小，也不保证开启优化后会输出什么。即使某次恰好得到 2000000，也不能证明程序正确。修复需要改变访问协议，例如把整次加一放进同一把锁的临界区，或使用合适的原子读改写操作。另一种思路是不共享：把可变状态的所有权交给单一所有者，任务之间通过消息传递协作——[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/)会展开这一方向。

如果只需要累计次数，可以直接把上面的共享变量、更新和最终读取换成下面三处。每次 `fetch_add` 都为同一个计数器执行一次原子读改写；主线程在两个 `join` 返回后读取，得到 2000000。这里没有用计数器发布其他数据，`Relaxed` 已足够。第三篇会完整演示[原子读改写计数器](/posts/concurrency/atomics-memory-model/#把锁保护的加一换成原子加一)[^15]。

```diff lang="rust"
+use std::sync::atomic::{AtomicU64, Ordering};
-// Incorrect: concurrent non-atomic accesses cause undefined behavior.
-static mut COUNTER: u64 = 0;
+static COUNTER: AtomicU64 = AtomicU64::new(0);
@@
-                unsafe { COUNTER += 1 };
+                COUNTER.fetch_add(1, Ordering::Relaxed);
@@
+    // Relaxed suffices: joining workers synchronizes before the final read.
-    let result = unsafe { COUNTER };
+    let result = COUNTER.load(Ordering::Relaxed);
```

**竞态条件**（race condition）的范围更广：程序结果取决于不合要求的执行先后——它也不限于线程，单线程事件驱动程序同样可能因事件到达顺序而产生竞态。例如，即使对共享数据的每次访问都加了锁（因此没有数据竞争），“检查余额”和“扣款”这一先检查后扣款的复合操作仍可能被交错执行，让两个线程都通过余额检查。排除数据竞争是基础，维护完整操作的不变量才是程序的目标。[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/)会用原子性违规、顺序违规等具体错误类别展开这个区分。

本篇先识别这类错误；[《并发编程（三）：原子操作与内存模型》](/posts/concurrency/atomics-memory-model/)会用 happens-before 解释同步顺序如何建立，以及原子性与操作组合的区别。这里需要带走的结论是：**只要可变数据被多个任务并发访问，数据竞争就是一个必须正面回答的问题**。

## 总结

- 并发关注能独立推进的工作结构，并行需要多个执行资源在同一时刻同时推进。
- 任务是逻辑工作；进程划分地址空间与共享资源，线程拥有私有栈和寄存器上下文并由内核调度到逻辑 CPU，协程和异步 Future 由用户态运行时在线程上推进。
- 抢占式与协作式描述调度策略，不决定执行层位置或能否并行；两者都可能出现交错，协作式分支只有交还控制权才让出当前线程。
- 并行加速受串行部分（阿姆达尔定律）、规模扩展方式（古斯塔夫森定律）、任务粒度、负载均衡及同步通信开销制约；性能测量需固定工作量与端到端边界。
- 无同步的冲突并发访问构成数据竞争（在 C++ 与 Rust 中属于未定义行为）；消除数据竞争之后，仍需维护复合操作的不变量以防止逻辑竞态条件。

那么，多个任务如何安全地访问同一份数据？下一篇[《并发编程（二）：锁、条件变量与共享内存同步》](/posts/concurrency/locks-condvars-shared-memory-sync/)将从锁、条件变量与屏障出发，讨论如何保护共享状态、协调线程推进。

## 延伸阅读

- [Core Dumped](https://www.youtube.com/playlist?list=PL9vTTBa7QaQPdvEuMTqS9McY-ieaweU8M)——进程与线程调度的动画演示，适合建立直观认识
- [Writing an OS in Rust](https://os.phil-opp.com/zh-CN/)——从操作系统层面介绍硬件中断与协作式多任务（async/await），适合继续理解底层异步实现
- 不想在本机配置环境的话，Rust 代码可以放到 [Rust Playground](https://play.rust-lang.org) 运行

[^1]: [Rob Pike: Concurrency is not Parallelism](https://go.dev/blog/waza-talk)——并发与并行概念区分的经典演讲，“并发关于结构、并行关于执行”的出处。

[^2]: [OSTEP ch4: The Abstraction: The Process](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-intro.pdf)——进程的地址空间、寄存器和 I/O 状态，以及 PCB 的作用；用于支撑抽象模型，不对应示意结构的精确字段。

[^3]: [OSTEP ch26: Concurrency: An Introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-intro.pdf)——线程共享地址空间、各自保存执行上下文和栈，以及 TCB 的作用。

[^4]: Linux v6.12 [`task_struct`](https://github.com/torvalds/linux/blob/v6.12/include/linux/sched.h) 与 [`__schedule` / `context_switch`](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/core.c)——task 与线程组字段、线程切换和地址空间切换的实现。

[^5]: [The Rust Programming Language: Futures and the Async Syntax](https://doc.rust-lang.org/book/ch17-01-futures-and-syntax.html)与[Tokio 1.53.3 任务源码](https://docs.rs/tokio/1.53.3/src/tokio/runtime/task/mod.rs.html)——前者说明 `async fn` 生成 Future，后者展示任务内部的 Future、调度状态与唤醒信息。

[^6]: [Go `runtime.LockOSThread`](https://pkg.go.dev/runtime#LockOSThread)、[Rust `Future::poll`](https://doc.rust-lang.org/std/future/trait.Future.html#tymethod.poll) 与 [Tokio 1.53.3 `spawn`](https://docs.rs/tokio/1.53.3/tokio/task/fn.spawn.html)——线程绑定、轮询与跨线程调度约束。

[^7]: [Go runtime: src/runtime/runtime2.go](https://raw.githubusercontent.com/golang/go/go1.23.0/src/runtime/runtime2.go)——Go 1.23.0 中 `type g` 与 `type gobuf` 的定义，协程控制块示意图的原型。

[^8]: [Go 1.14 Release Notes: Runtime](https://go.dev/doc/go1.14#runtime)——goroutine 异步抢占的引入，说明用户态调度不等于只能协作式让出。

[^9]: [Tokio 1.53.3 `join!`](https://docs.rs/tokio/1.53.3/tokio/macro.join.html)与[`yield_now`](https://docs.rs/tokio/1.53.3/tokio/task/fn.yield_now.html)——同任务内的并发轮询，以及让出执行权不保证固定调度顺序的边界。

[^10]: [LLNL: Introduction to Parallel Computing](https://hpc.llnl.gov/documentation/tutorials/introduction-parallel-computing-tutorial)——固定工作量下的阿姆达尔定律、随规模同步放大的古斯塔夫森定律、任务粒度、负载均衡、通信与同步成本，以及并行加速的测量范围。

[^11]: Go 1.23.0 运行时的 [G、M、P 说明](https://github.com/golang/go/blob/go1.23.0/src/runtime/HACKING.md#gs-ms-ps)、[`stealWork`](https://github.com/golang/go/blob/go1.23.0/src/runtime/proc.go#L3654) 和 [`runqgrab` / `runqsteal`](https://github.com/golang/go/blob/go1.23.0/src/runtime/proc.go#L6873-L6945)——普通本地队列取走约一半就绪 goroutine（队列为空且条件允许时也可能尝试 `runnext`）；调度器拿到其中一个，其余转入自己的本地队列。

[^12]: [C++ 标准草案：Data races](https://eel.is/c++draft/intro.races)——C++ 中数据竞争与 happens-before 关系的规范表述。

[^13]: [The Go Memory Model](https://go.dev/ref/mem)——数据竞争的非正式定义与对原子访问的限定。

[^14]: [The Rust Reference: Behavior considered undefined](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)——Rust 将数据竞争列为未定义行为，`unsafe` 不改变这一约束。

[^15]: [Rust 原子操作 `fetch_add`](https://doc.rust-lang.org/std/sync/atomic/struct.Atomic.html#method.fetch_add) 与 [`JoinHandle::join`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html#method.join)——原子读改写以及工作线程完成到 join 返回的同步。
