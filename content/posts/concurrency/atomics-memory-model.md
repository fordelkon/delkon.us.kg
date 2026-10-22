---
title: "并发编程（三）：原子操作与内存模型"
description: "从原子计数器与数据发布示例出发，解释原子性、happens-before 与五种内存序，区分局部同步与顺序一致性，并介绍 OnceLock 和 Send/Sync 的职责。"
publishDate: "21 Sep 2026"
tags: ["concurrency", "synchronization", "rust"]
---

上一篇[《并发编程（二）：锁、条件变量与共享内存同步》](/posts/concurrency/locks-condvars-shared-memory-sync/)从保护共享状态与协调线程推进两个问题介绍了同步工具。本篇接着向下看：如果共享的只是一个计数器，能否直接完成原子加一？如果用一个标志位通知数据已经就绪，读到标志是否就意味着读到了数据？

这两个问题分别需要**原子性**与**跨线程同步**，而它们的要求并不相同：原子加一可以解决丢失更新，但一个原子的就绪标志并不自动发布另一份数据。本篇以 Rust 示例为主，从计数与数据发布出发，解释内存序如何建立同步关系，以及这些保证怎样被库接口封装。

## 原子操作与原子性

### 把锁保护的加一换成原子加一

**原子操作**（atomic operation）保证一次访问不被任何并发访问观察到部分完成状态：读写不会撕裂，读改写也不会在中间插入另一次修改。例如，`fetch_add` 把读取旧值、加一、写回合成一次原子操作[^1]。

把第二篇的[锁保护的计数器](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)换成 `AtomicUsize`，仍然让四个线程各加 1000 次：

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

static REQUESTS: AtomicUsize = AtomicUsize::new(0);

fn main() {
    let mut handles = Vec::new();
    for _ in 0..4 {
        handles.push(thread::spawn(|| {
            for _ in 0..1000 {
                REQUESTS.fetch_add(1, Ordering::Relaxed);
            }
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let total = REQUESTS.load(Ordering::Relaxed);
    assert_eq!(total, 4000);
    println!("{total}");
}
```

这里不需要保护一整段临界区，只需要加一不丢失更新。代码里的 `Relaxed` 是一种**内存序**（memory ordering），决定原子操作在原子性之外还提供哪些顺序保证；它的含义稍后展开，先记住它保留了原子性。最后的精确值还依赖 `join`：主线程在所有工作线程结束之后读取，线程完成与 `join` 返回之间建立了同步关系[^2]。不过要分清保证的边界：工作线程仍在运行时，一次 `load` 既不保证得到最终值，也不能把计数值当成“其他结果已经可读”的凭证。

### 单次操作与组合操作

常见原子接口可以按“读什么、写什么、返回什么”来理解：

| 操作                      | 语义                 | 典型用途           |
| ------------------------- | -------------------- | ------------------ |
| `load`                    | 原子读取             | 读取状态、观测计数 |
| `store`                   | 原子写入             | 设置标志、发布状态 |
| `swap`                    | 原子替换，返回旧值   | 交换状态           |
| `compare_exchange`        | 值等于期望值时才替换 | 条件状态转换       |
| `fetch_add` / `fetch_sub` | 原子加减，返回旧值   | 计数、分配编号     |

但 `load` 后再 `store` 是两次操作。即使两次都用最强的内存序，两个线程仍可能读到相同的旧值，再写回相同的新值，丢掉一次更新。需要整体完成的“读—改—写”，应使用 `fetch_add`，或后面会展开的**比较并交换**（compare-and-exchange，CAS），或直接用锁。

Mutex、RwLock 保护遵守同一协议的一段访问，可以维护多个字段之间的不变量；原子类型直接约束单个值的访问。两个原子字段分别安全，不代表它们的组合会自动成为一致的快照。这也延续了第二篇[保护状态与协调推进的划分](/posts/concurrency/locks-condvars-shared-memory-sync/#共享内存保护状态与协调推进)：**保护状态与协调推进是两类问题，不是工具的互斥分类。** 原子加一用于维护计数，原子标志位可以参与协调，CAS 也可以用于实现互斥锁。

:::note[原子不等于无等待]
Rust 在支持相应原子类型的平台上保证其操作是 lock-free（无锁），但不保证 wait-free（无等待）：lock-free 只要求至少一个线程能取得进展，不保证每个线程都在有界步骤内完成。应用层的 CAS 重试和自旋等待也仍然可能持续等待[^1]。因此，不能从“用了 Atomic”推导出整个算法无锁、不会等待或一定比 Mutex 快。
:::

## 跨线程同步与 happens-before

单值的原子性已经清楚了。接下来的问题是：一个线程先写数据、再设置标志，另一个线程读到标志后，凭什么能读到那份数据？

### 原子标志与数据发布

先回忆第一篇给出的[数据竞争判定条件](/posts/concurrency/parallelism-execution-units/#数据竞争一个可以精确定义的问题)。对于本文讨论的普通线程读写，两次访问指向可能重叠的内存位置，至少一方写入、至少一方非原子，且两次访问之间没有 happens-before 顺序（这一概念下文正式定义），就构成数据竞争。C++ 与 Rust 都将这种数据竞争视为未定义行为[^4]。这里的“并发”不要求两条机器指令恰好同时执行；即使某次调度让它们先后运行，没有建立规定的同步顺序，也不能据此证明访问安全。

带着这个条件看一个典型的发布场景：生产者写数据、设置标志，消费者等到标志就绪后读取。下面让两个变量的所有访问都用 `Relaxed`：

```rust
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::thread;

static READY: AtomicBool = AtomicBool::new(false);
static PAYLOAD: AtomicUsize = AtomicUsize::new(0);

fn main() {
    let producer = thread::spawn(|| {
        PAYLOAD.store(42, Ordering::Relaxed);
        READY.store(true, Ordering::Relaxed);
    });

    let consumer = thread::spawn(|| {
        while !READY.load(Ordering::Relaxed) {
            std::hint::spin_loop();
        }
        // Exiting the loop does not, by itself, order this load
        // after the payload write.
        assert_eq!(PAYLOAD.load(Ordering::Relaxed), 42);
    });

    producer.join().unwrap();
    consumer.join().unwrap();
}
```

这段程序经常能通过测试。但测试通过不是证明：内存模型允许消费者退出循环之后仍然读到 0。`READY` 上的读取与 `PAYLOAD` 上的写入属于不同对象，两个对象各自的原子性不会自动合成跨对象的顺序；断言是否成立，需要另外的依据。

这里没有数据竞争：所有访问都是原子的，最坏结果也只是读到旧值 0。缺的不是原子性，而是跨对象的顺序。后果的边界值得对照：若被发布的是普通非原子数据，同样的写法就不只是读到旧值——标志位读取与数据写入之间没有 happens-before，按开头的判定条件，这已经构成数据竞争，行为未定义。Release/Acquire 要补的正是这个缺口。**没有数据竞争，是正确性的基础，不是完整证明**——第一篇的丢失更新与这里的例子都在说明这一点。`spin_loop()` 只是忙等提示，不会让线程睡眠，也不提供同步保证；实际需要长时间等待时，应考虑[条件变量](/posts/concurrency/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)等阻塞工具[^7]。

### Release / Acquire：发布与接收的边界

只改 `READY` 的两处内存序，让设置标志的一方用 `Release`、读取标志的一方用 `Acquire`：

```rust
PAYLOAD.store(42, Ordering::Relaxed);
READY.store(true, Ordering::Release);
// ......

while !READY.load(Ordering::Acquire) {
    std::hint::spin_loop();
}
assert_eq!(PAYLOAD.load(Ordering::Relaxed), 42);
```

现在结论变了：只要消费者走出循环，断言就必须成立。由 `Release` 写与读到它的 `Acquire` 读构成的这条协议，就是后文反复提到的**发布协议**。这个保证从哪里来？需要先给“先后”一个可以推理的定义。

**先发生于**（happens-before）是一种用于推理的顺序关系，不是墙上时钟记录的先后。对于本文的示例，可以从两类边理解它[^4]：

- **线程内顺序**（sequenced-before）：同一线程中有顺序保证的求值，例如相邻完整语句的先后；不意味着所有子表达式都按源码从左到右求值，也不禁止保持语义的编译优化。就 Rust 而言，Reference 对多数运算符规定了从左到右的求值顺序，例外如赋值先求右侧、短路求值；这一术语本身沿用 C++ 内存模型[^13]。
- **线程间同步**（synchronizes-with）：由特定操作建立的跨线程关系，例如一次 `Release` 写，被同一原子变量上的 `Acquire` 读观察到。

把这些边接起来，就能传递 happens-before 关系：如果 A 在 B 之前，B 又在 C 之前，那么 A 也在 C 之前。Mutex 的解锁与后续成功加锁、线程完成与 `join` 返回，也提供各自文档规定的同步关系；解锁的作用接近 `Release`、成功加锁接近 `Acquire`，第二篇的 Mutex 正确性正依赖这里定义的机制。

用这套语言重画发布程序：

```text
线程 A                             线程 B
PAYLOAD.store(42, Relaxed)
    │ sequenced-before
READY.store(true, Release) ────────→ READY.load(Acquire) 读到这次 true
                  synchronizes-with    │ sequenced-before
                                   PAYLOAD.load(Relaxed) 得到 42
```

**关键是读到了哪一次写入，而不是只给两个操作贴上 `Release`、`Acquire` 标签。** 如果 `Acquire` 读到的仍是初始的 `false`，就没有从这次发布建立同步边。更一般的规则还允许通过 `Release` 开头的连续原子读改写形成**释放序列**（release sequence）；这里先只讨论直接读到发布值的情况[^5]。

内存模型规定哪些观察结果合法。它不是要求每个操作都“立即刷新到主存”，也不承诺读到某个值所需的时间。

沿着图中的同步链，`PAYLOAD` 的写入 happens-before 消费者对它的读取。为什么最后这次读取用 `Relaxed` 也必须得到 42？原子对象的写—读一致性要求：如果一次写入 happens-before 一次读取，读取必须取得该次写入的值，或该对象修改顺序中更晚的写入值。本例在写入 42 后没有其他写入，因此只能读到 42，初始值 0 已被排除[^4]。

这个协议只发布一次。反复重置 `READY`、覆盖 `PAYLOAD`，需要另外解决轮次识别与读写重叠，不能照搬本例。消费者的保证来自标志位本身；主线程的 `join` 只是等待两个线程结束，消费者并不是先等生产者结束再启动消费。

:::note[`volatile` 不是原子操作]
C++ 的 `volatile` 访问有必须保留的可观察副作用，但既不提供线程间原子性，也不建立 synchronizes-with 边；用普通 `volatile` 标志位发布数据，仍可能构成数据竞争[^14]。Java 的 `volatile` 写与后续对同一变量的读建立 happens-before；C# 的 volatile 读、写分别具有 acquire、release 语义。同名关键字不能跨语言套用同一保证[^15]。Rust 没有这样的 volatile 同步关键字；它提供 `read_volatile`、`write_volatile`，但这些操作同样不是原子操作，也不建立线程间同步。跨线程共享可变数据应使用原子类型、锁或封装了同步协议的接口[^16]。
:::

### 同步边不只来自原子操作

前面的发布示例显式使用 Release/Acquire，但跨线程顺序也可以由锁、线程等待、消息交接和一次性初始化建立。它们提供不同的使用接口，共同的推理方法是：先找到协议中的发布与接收，再把两端的数据访问接入 happens-before 链。同步约束的是访问之间的关系，范围不局限于充当同步点的那个变量；不过，链之外的其他冲突访问仍需单独证明安全。

以第二篇的[互斥锁](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)为例，一个线程先修改状态、再解锁，另一个线程成功获取同一把锁后读取状态。C++ 标准明确规定，同一互斥锁的解锁与后续取得所有权的加锁同步；Go 内存模型也规定了相应的解锁到加锁顺序[^24]。把线程内顺序接上去，才得到数据写入到读取的顺序：

```text
线程 A                            线程 B
修改共享状态
    │ 线程内顺序
释放锁 ─────────────────────────→ 成功获取同一把锁
                  同步关系           │ 线程内顺序
                                  读取共享状态
```

**同步边的成立有条件，不能只看两端都调用了同步接口。** 不同机制需要核对的条件不同：

| 机制                                                                        | 同步的依据                                                                                                                                          | 不能据此推出的结论                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 锁                                                                          | 同一把锁上的释放与后续成功获取；读写锁还要区分独占与共享获取的规则[^24]                                                                             | 两把互不相关的锁自动交接数据；并行读者之间的访问都被排序         |
| 条件等待                                                                    | 在第二篇的[条件变量协议](/posts/concurrency/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)中，状态通过互斥锁发布，等待返回后重新持锁检查谓词[^19] | 收到通知就一定满足条件，或任意通知与等待返回都组成数据发布       |
| 线程等待                                                                    | 被等待线程的完成与等待成功返回之间，存在接口规定的同步；C++ 和 Rust 的 join 都明确提供这一保证[^25][^2]                                             | 主线程分别等待 A、B，就使 A 与 B 的内部访问相互有序              |
| [消息传递](/posts/concurrency/message-passing-workers-backpressure/#消息交付与处理完成) | 按通道契约交付并接收同一条消息；例如 Go 明确规定发送与对应接收完成之间的同步[^26]                                                                   | 发送成功就已处理完成；某个发送者的消息排列了其他发送者的全部操作 |
| [阶段会合](/posts/concurrency/locks-condvars-shared-memory-sync/#barrier阶段之间的会合) | 核对同一轮参与者、到达与完成阶段的规则；C++ barrier 明确规定阶段完成与被解除等待的返回之间的顺序[^27]                                               | 同一阶段内部的冲突访问也已被排序                                 |
| [一次性初始化](#oncelock把认领与完成封装在一起)                             | 初始化完成后，经接口取得已发布的结果；Go 的 Once 和 Rust 的 Once 都明确规定初始化到相应调用返回的顺序[^26][^21]                                     | 线程刚取得初始化资格，其他线程就能读取尚未完成的数据             |

这些是分析协议的入口，并不是一份跨语言通用的 API 规范。尤其要区分“线程结束”与“有同步保证地等待结束”：Go 内存模型明确指出，goroutine 退出本身不保证同步到其他事件；需要通道、锁等同步机制才能观察其效果[^26]。[结构化的任务作用域](/posts/concurrency/async-concurrency-task-lifecycle/#结果与生命周期的归属)则把等待纳入生命周期管理，仍应查清它等待哪些任务、覆盖哪些清理步骤。例如 Rust 的 `thread::scope` 自动 join 作用域线程，但当前文档特别说明，返回时线程局部变量的析构可能仍在运行[^20]。

回到开头的 Rust 计数器：每个 `fetch_add(Relaxed)` 在线程完成之前，线程完成与主线程的 `join` 返回同步，最终 `load(Relaxed)` 又在所有 join 返回之后。于是所有加一都 happens-before 最终读取；结合原子读改写和写—读一致性，最终值是 4000。这里的 Relaxed 操作没有自行发布其他数据，顺序来自线程等待[^2][^4]。

所有权与同步也要分开理解。允许某个值跨线程传递或共享，是类型约束；此前写入如何对接收方可见，是访问协议的保证。Rust 的 `Send`、`Sync` 属于前者，`Arc` 管理共享生命周期；它们不自动给内部数据的任意后续修改建立所需的同步顺序，详见后文的 [Send / Sync](#send--sync跨线程传递与共享)[^11][^12]。同样，[信号量](/posts/concurrency/message-passing-workers-backpressure/#信号量与资源并发数)可用于资源计数，也可参与事件排序，但分析具体程序时，必须查明许可交接的同步契约；只证明同时进入的任务数受限，还没有证明特定写入已被发布。

### 唤醒与同步：以 Park / Unpark 为例

阻塞与唤醒描述线程能否继续运行，内存同步描述访问之间的顺序；分析等待协议时，需要分别回答这两个问题。第二篇的[条件变量等待协议](/posts/concurrency/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)会在等待时释放锁、返回前重新获取锁，数据可见性由该协议中的锁同步链保证。更底层的等待接口可能另有内存顺序契约，不能只凭“被唤醒了”推断结果可读。

例如 Rust 的 `park/unpark` 为每个线程提供一个至多保留一个的 token。文档明确规定：`unpark` 之前的内存操作，对消费该 token 并从 `park` 返回的线程可见；用原子内存序描述，`unpark` 是 Release，消费 token 的 `park` 是对应的 Acquire。同一目标线程的多次 `unpark` 还形成释放序列，不能把 token 当作每次通知都会累加的计数器[^23]。

这个例子的关键条件是**消费 token**。`park` 允许不消费 token 就虚假返回，因此一次返回不能证明另一线程已执行 `unpark`。实际等待通常还需循环检查状态，并防止同一线程中的其他代码提前消费 token。如果状态检查本身使用 Release/Acquire 发布数据，证明中也必须保留这条同步链，不能把正确性全部归因于唤醒[^23]。

画 happens-before 图时，应先标出“读到了哪次发布”“获取了哪把锁”“收到了哪条消息”或“完成了哪一轮会合”，再通过线程内顺序连接实际数据访问。接口是否阻塞、日志先后出现、一次运行是否成功，都不能代替这些配对条件。

:::note[示例语言与规范边界]
本文主要用 Rust 展示原子操作，但不把它视为所有语言的共同规范。Rust Reference 尚未完整定义 Rust 的内存模型；标准库对原子访问采用经 Rust 访问模型调整的 C++20 规则，不含 consume 内存序。高级同步原语仍以各自 API 的契约为准；同名接口也不能直接套用另一语言的全部条款[^17]。
:::

## 内存序的选择

到这里，发布协议用到了 `Relaxed`、`Release` 与 `Acquire`。选择依据是什么？Rust 的 `Ordering` 提供五种内存序，其文档以 C++20 的对应语义为参照[^6]。它们不是五级单向阶梯：Acquire 与 Release 分别约束读取和写入两端，不能简单说其中一个比另一个强。前面的发布示例已经展示了 Acquire 与 Release；本节补上 Relaxed 的保证与读改写操作的内存序，再用一把自旋锁把这些选择组装成第二篇那种完整协议，下一节再讨论 SeqCst 的共同全序。

### Relaxed：只维护原子值本身

`Relaxed` 不会建立 synchronizes-with 边，但也不是“完全无序”：同一个原子对象的所有修改仍有统一的**修改顺序**（modification order），原子读改写不会丢掉并发更新。不同原子对象的修改顺序则不会自动合成同一个全局顺序[^4][^5]。

开头的计数器只统计请求数量，不拿计数值作为读取其他数据的凭证，因此 `fetch_add(Relaxed)` 已经满足需求。若计数还表示“所有任务的结果都已经可读”，就多了一项发布数据的职责，必须另行证明同步关系。

标志位也不是一律需要 `Acquire`/`Release`。如果它只是独立的布尔状态，没有关联数据要发布，`Relaxed` 也可能足够。选择依据是访问协议，而不是变量叫“计数器”还是“标志位”。

### CAS 与 AcqRel：成功和失败是不同路径

再看前面提到的 CAS。它把检查与替换合成一次不可分割的操作，下面用“谁先认领”演示：

```rust
use std::sync::atomic::{AtomicBool, Ordering};

static CLAIMED: AtomicBool = AtomicBool::new(false);

fn try_claim() -> bool {
    CLAIMED
        .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
        .is_ok()
}
```

`compare_exchange` 成功返回 `Ok(旧值)`，失败返回 `Err(读到的值)`；两个内存序参数分别约束成功时的读改写与失败时的读取。成功路径是一次完整的读改写，可以按所选内存序接收先前的发布，或发布此前的访问；失败路径只读取，因此不能使用 `Release` 或 `AcqRel`。

两条路径按各自需要选择：`try_claim` 没有要发布的数据，也没有要接收的发布，两个参数都用 `Relaxed` 就够了。

如果成功认领后才初始化数据，还需要在初始化完成后另行发布完成状态；认领 CAS 即使用 Release，也不能发布发生在它之后的写入。失败参数是否需要 Acquire，则取决于读到的状态是否代表一次发布，以及失败后需要访问什么数据。

读改写两端的这种组合有专门的名字：`AcqRel` 对读的一半提供 `Acquire`、写的一半提供 `Release`。仅使用 `Acquire` 时，写的一半是 `Relaxed`；仅使用 `Release` 时，读的一半是 `Relaxed`[^6]。

:::note[无效的内存序不会自动降级]
给 Rust 的纯 `store` 传 `Acquire` 或 `AcqRel`，给纯 `load` 传 `Release` 或 `AcqRel`，都会 panic。上面的“另一半是 Relaxed”说的是合法的读改写操作，不是纯读、纯写会忽略不合适的参数[^3]。
:::

`compare_exchange_weak` 还允许虚假失败，通常用于能够重试的循环[^3]。

这里的成功只表示取得了资格。如果后面还要初始化数据，其他线程不能把 `CLAIMED == true` 当成“初始化完成”。认领与完成是两个状态——后文的 OnceLock 正是为这个缺口准备的接口。

### 自旋锁：CAS 为什么需要内存序

把场景从 `try_claim` 的认领标志换成第二篇的[互斥锁](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)：锁保护的正是共享状态，获取锁就意味着要接收上一任持有者发布的修改。这样一把最小的自旋锁可以用 CAS 写出：

```rust
use std::sync::atomic::{AtomicBool, Ordering};

static LOCKED: AtomicBool = AtomicBool::new(false);

fn lock() {
    while LOCKED
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        std::hint::spin_loop();
    }
}

fn unlock() {
    LOCKED.store(false, Ordering::Release);
}
```

三个内存序各对应协议的一段：

- 成功路径用 `Acquire`：CAS 成功意味着取得锁，这次读取拿到的 `false` 来自上一任持有者的 `unlock` 写入。按[发布协议](#release--acquire发布与接收的边界)，两个操作建立 synchronizes-with 边，此后对受保护数据的读取可以看见上一任在解锁前的全部修改。
- 失败路径用 `Relaxed`：CAS 失败说明锁仍被占用，线程没有取得访问受保护数据的资格，这次读取也不需要接收任何发布，自旋重试即可。
- `unlock` 用 `Release`：为临界区内的修改建立发布的一端。

完整链路与[同步边不只来自原子操作](#同步边不只来自原子操作)里锁的那张图相同，只是两个端点现在有了具体实现：

```text
线程 A（持锁）                          线程 B（自旋）
修改共享状态
    │ 线程内顺序
unlock: store(false, Release) ────────→ lock: CAS 成功，读到 false
                   synchronizes-with       │ 线程内顺序
                                           读取共享状态，可见 A 的修改
```

前文说“解锁的作用接近 `Release`、成功加锁接近 `Acquire`”——自旋锁里这两个“接近”就是字面本身：标准锁的解锁与后续成功加锁规定的正是这类同步边[^24]。如果 `lock` 与 `unlock` 都改成 `Relaxed`，互斥仍然成立——成功路径依然只有一个线程能把 `false` 换成 `true`——但受保护数据的可见性失去了依据，这正是[原子标志与数据发布](#原子标志与数据发布)那类缺口：标志位是原子的，标志之外的数据却未必可见。

:::note[自旋锁用于演示，不是使用建议]
这个例子把等待画成自旋，是为了让 CAS 上的内存序可见。长时间等待应当让出 CPU：第二篇的[条件变量](/posts/concurrency/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)在锁的保护下阻塞等待，`std::hint::spin_loop` 只是忙等提示[^7]。真实的锁实现也通常把短促自旋与系统级阻塞结合起来，而不是无限自旋。
:::

回到 `AcqRel`：获取锁只需要接收，释放锁只需要发布，两侧各自的单向内存序恰好够用。只有当同一次读改写既要接收先前的发布、又要发布自己的写入时，才轮到 `AcqRel`——它是按需拼装的结果，不是比 `Relaxed` 更安全的默认值。

## SeqCst 与顺序一致性

### 先写后读与 (0, 0) 结果

发布协议证明了具体结果被排除，但它不回答另一个问题：整个程序能不能按一个全局交错来理解？先看**顺序一致性**（sequential consistency，SC）的含义：把所有线程的操作交错排成一个全局顺序，保留每个线程自身的程序顺序，并让每次读取取得该顺序中同一位置最近一次写入的值——各变量的初始写入也算在内。

下面两个线程先写自己的变量，再读对方的变量：

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

static X: AtomicUsize = AtomicUsize::new(0);
static Y: AtomicUsize = AtomicUsize::new(0);

fn main() {
    let first = thread::spawn(|| {
        X.store(1, Ordering::Relaxed);
        Y.load(Ordering::Relaxed)
    });
    let second = thread::spawn(|| {
        Y.store(1, Ordering::Relaxed);
        X.load(Ordering::Relaxed)
    });

    let result = (first.join().unwrap(), second.join().unwrap());
    // Relaxed permits (0, 0); a particular run need not produce it.
    println!("{result:?}");
}
```

这类测试通常叫 **store buffering**（得名于写操作先落入的存储缓冲）。名字取自一类真实硬件上可观察的经验现象，下面的论证只依赖内存模型本身，不依赖该硬件图景。`Relaxed` 允许结果为 `(0, 0)`，但运行一次或多次都不保证能观察到它。所有共享访问都是原子的，没有数据竞争。

如果按顺序一致的交错理解，`(0, 0)` 却不可能：第一个线程读到 0，按读取规则，它读 `Y` 在第二个线程写 `Y` 之前；第二个线程读到 0，又要求它读 `X` 在第一个线程写 `X` 之前。接上各自的“先写后读”，就形成了不可能排入全序的环。

### SeqCst：共同全序

要排除 `(0, 0)`，需要给访问加上一个共同全序。对应 SC 的内存序是 `SeqCst`：它对读取提供 `Acquire` 效果，对写入提供 `Release` 效果，对读改写提供两者，并额外要求所有 SeqCst 操作存在一个共同的全序[^5][^6]。将四处访问全部改为 SeqCst 后，`(0, 0)` 被排除[^5]。

这个全序的范围是 SeqCst 操作；把某一处换成 SeqCst，不会自动把其他弱内存序操作也纳入其中。它也不会把多次独立操作合成一个事务。性能成本取决于目标架构、操作与竞争情况，不能脱离场景断言“最强就一定最慢”。

成对同步替代不了共同全序。甚至把两次写改为 `Release`、两次读改为 `Acquire`，`(0, 0)` 仍然允许：两次读取若都读到初始值，就没有接收到对方的发布，自然也没有建立那两条同步边。

### 五种内存序的回查表

至此，五种内存序的保证都已经出现，可以放在一起对照：

| 内存序    | 可用于的原子操作 | 保证                                                        | 需要证明的问题                             |
| --------- | ---------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `Relaxed` | 读、写、读改写   | 原子性与该对象的修改顺序                                    | 是否只维护单个原子值本身？                 |
| `Acquire` | 读、读改写       | 读到对应发布值后，约束后续访问                              | 要接收哪一次发布？                         |
| `Release` | 写、读改写       | 为此前访问建立发布的一端                                    | 要发布哪些此前的访问？                     |
| `AcqRel`  | 读改写           | 读的一半 `Acquire`，写的一半 `Release`                      | 读改写的两端各需要什么？                   |
| `SeqCst`  | 读、写、读改写   | 对应的 `Acquire`/`Release` 效果，加上所有 SeqCst 操作的全序 | 是否依赖跨对象的共同顺序才能排除某个结果？ |

但注意：没有数据竞争、甚至用上了同步边，也不等于整个程序满足顺序一致性。

### DRF-SC 的适用边界

**无数据竞争则顺序一致**（data-race-free implies sequential consistency，DRF-SC）是一项有适用条件的保证。Go 的内存模型明确提供 DRF-SC，而且 `sync/atomic` 的所有原子操作都表现为处在同一个顺序一致的总序中；它没有让用户选择 `Relaxed` 的接口[^8]。

Rust/C++ 则允许程序显式使用弱内存序。一个便于使用的充分条件是：程序没有数据竞争，而且原子访问全部使用 SeqCst，此时可以按顺序一致的交错理解。引入弱内存序后，仍可能通过具体协议证明足够的顺序——本文的发布协议就是这样证明的——但不能只凭“没有数据竞争”就跳过内存模型[^5][^9]。

| 对照点                    | Rust / C++                  | Go                                             |
| ------------------------- | --------------------------- | ---------------------------------------------- |
| 原子访问的内存序          | 可显式选择弱内存序或 SeqCst | `sync/atomic` 提供顺序一致语义                 |
| 无数据竞争能否直接推出 SC | 对包含弱内存序的程序不成立  | 内存模型提供 DRF-SC 保证                       |
| 数据竞争的后果            | 未定义行为                  | 实现可以检测并终止；继续执行也受模型规定的限制 |

这些语言可以借用相近的术语来学习，但不能把它们当成只有措辞不同的同一份契约。

## 把同步协议交给库与类型系统

### OnceLock：把认领与完成封装在一起

回看前面的 `try_claim`：把标志设为 `true`，并不代表后续初始化已经完成。实际需求若是“只初始化一次，并让调用者拿到完成后的值”，可以直接使用 `OnceLock`：

```rust
use std::sync::OnceLock;

static CONFIG: OnceLock<String> = OnceLock::new();

fn config() -> &'static str {
    CONFIG.get_or_init(|| String::from("production"))
}
```

多个线程可以同时调用 `config()`；正常初始化成功后，它们拿到同一个值。若另一线程正在初始化，`get_or_init` 会等待，返回时值已可用，不需要调用者手工管理“认领中 / 已完成”的状态与内存序。初始化闭包若 panic，单元仍未初始化，之后可以重试；初始化过程也应避免递归初始化同一个单元[^10]。

这正是库接口的价值：把数据和正确的访问协议封装在一起，而不是要求每个调用者重新证明一次。

### Send / Sync：跨线程传递与共享

还有一个问题内存序回答不了：为什么静态的 `CONFIG` 可以被多个线程安全使用？第二篇的共享状态要用 `Arc<Mutex<T>>` 包起来，而 `Rc<Mutex<T>>` 不行。内存序之外，Rust 的类型系统进一步约束哪些值能进入跨线程协议：

- `Send`：值的所有权可以安全地转移到另一线程。
- `Sync`：可以安全地跨线程共享引用；精确定义是 `T: Sync` 当且仅当 `&T: Send`[^11]。

`Rc<T>` 的引用计数不支持并发更新，不能因为内部装了 Mutex 就跨线程传递；`Arc<T>` 使用原子引用计数，但它只解决共享所有权，内部的 `T` 仍需满足相应约束。`Mutex<T>` 在 `T: Send` 时实现 `Sync`，不要求 `T` 自身也实现 `Sync`，因为内部访问由锁串行化[^12]。

把本篇与系列已经用到的工具放在一起，各自的分工是：

| 工具               | 解决的问题                           |
| ------------------ | ------------------------------------ |
| 原子操作与内存序   | 保证单次操作不可分割，并约束访问顺序 |
| `OnceLock`         | 封装一次性初始化协议                 |
| `Arc`              | 跨线程共享所有权                     |
| `Mutex` / `RwLock` | 约束共享状态的并发访问               |

`Send` 和 `Sync` 都是没有方法的自动 trait，编译器通常根据组成字段推导它们；手工承诺实现需要 `unsafe impl`，实现者必须承担安全性证明[^11]。类型满足 Send/Sync、访问协议里的内存序也选对了，仍不能保证协议逻辑正确——它们不保证没有死锁、没有其他竞态条件，也不会替你证明 `Relaxed` 协议真的成立。

## 总结

使用原子操作之前，值得把下面几个问题当成证明清单逐一回答：

- 原子性需要覆盖的完整操作是什么？单次访问或读改写可以交给原子类型；多字段不变量通常适合用锁保护，参见第二篇的[临界区范围与锁的粒度](/posts/concurrency/locks-condvars-shared-memory-sync/#临界区范围与锁的粒度)。
- Acquire 读到的是哪一次写入？只有读到对应的发布值，同步边才成立。
- 同步链如何抵达最终的数据访问？从发布到消费，每一步的边都要接得上；最终读取即使使用 `Relaxed`，也受前面的链保护。
- 是否依赖跨对象的共同顺序？使用弱内存序时，仅凭没有数据竞争，不能把程序直接当成顺序一致的全局交错。
- 发布会发生几次？初始化是否可能重入或重置？OnceLock 这类库接口把一次性初始化的状态与同步封装起来；手工协议必须自己处理轮次与完成状态。

下一篇[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/)继续讨论：即使访问已经同步，程序为什么仍可能无法推进，以及如何分析这些错误。

## 延伸阅读

- Hans-J. Boehm & Sarita V. Adve, [Foundations of the C++ Concurrency Memory Model](https://doi.org/10.1145/1375581.1375591), PLDI 2008——理解数据竞争、顺序一致性与弱原子操作之间的设计取舍；Go 内存模型也说明其形式化定义参考了这篇论文
- Ulrich Drepper, [What Every Programmer Should Know About Memory](https://www.akkadia.org/drepper/cpumemory.pdf)——缓存行与 false sharing 的硬件背景：不同线程频繁写入落在同一缓存行上的不同变量，会让彼此无关的数据访问互相拖慢
- 不想在本机配置环境的话，Rust 代码可以放到 [Rust Playground](https://play.rust-lang.org) 运行

[^1]: [Rust `std::sync::atomic`](https://doc.rust-lang.org/std/sync/atomic/)——原子访问与内存模型、目标平台支持，以及 lock-free 不等于 wait-free 的保证

[^2]: [Rust `JoinHandle::join`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html#method.join)——线程完成与 `join` 返回之间的同步关系

[^3]: [Rust `AtomicBool`](https://doc.rust-lang.org/std/sync/atomic/type.AtomicBool.html)与[原子操作接口](https://doc.rust-lang.org/std/sync/atomic/struct.Atomic.html#method.compare_exchange)——`compare_exchange` 的返回值、内存序约束、虚假失败与无效参数的 panic；示例使用稳定的具体原子类型，接口页面同时收录实验性的泛型 API

[^4]: [C++ 标准草案：Data races](https://eel.is/c++draft/intro.races)与[Rust Reference：未定义行为](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)——数据竞争、happens-before、逐对象修改顺序及 Rust 对数据竞争的禁止

[^5]: [C++ 标准草案：Order and consistency](https://eel.is/c++draft/atomics.order)——Release/Acquire 与 release sequence、SeqCst 全序，以及包含弱内存序时顺序一致性保证的限制

[^6]: [Rust `Ordering`](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html)——五种内存序的效果、适用操作与 C++20 语义参照

[^7]: [Rust `std::hint::spin_loop`](https://doc.rust-lang.org/std/hint/fn.spin_loop.html)——忙等提示的作用及其与阻塞等待的区别

[^8]: [The Go Memory Model](https://go.dev/ref/mem)与[Go `sync/atomic`](https://pkg.go.dev/sync/atomic)——Go 的 DRF-SC 保证、数据竞争程序的实现限制与原子操作的顺序一致语义

[^9]: [The Rustonomicon：Atomics](https://doc.rust-lang.org/nomicon/atomics.html)——Rust 的 C++20 原子内存模型基础，以及使用弱内存序后不能直接按 SC 交错理解的边界

[^10]: [Rust `OnceLock::get_or_init`](https://doc.rust-lang.org/std/sync/struct.OnceLock.html#method.get_or_init)——并发初始化、等待已完成的值、panic 后重试与重入限制

[^11]: [Rust `Send`](https://doc.rust-lang.org/std/marker/trait.Send.html)与[`Sync`](https://doc.rust-lang.org/std/marker/trait.Sync.html)——跨线程所有权与引用的安全条件、自动实现与手工实现的责任

[^12]: [Rust `Arc`：Thread Safety](https://doc.rust-lang.org/std/sync/struct.Arc.html#thread-safety)与[`Mutex` trait 实现](https://doc.rust-lang.org/std/sync/struct.Mutex.html#trait-implementations)——原子引用计数不保证任意内部数据线程安全，以及 `Mutex<T>` 的 Send/Sync 条件

[^13]: [Rust Reference：求值顺序](https://doc.rust-lang.org/reference/expressions.html#evaluation-order-of-operands)与[赋值表达式](https://doc.rust-lang.org/reference/expressions/operator-expr.html#assignment-expressions)——多数运算符的运算对象从左到右求值，赋值先求被赋予的值；`sequenced-before` 是 C++ 内存模型的术语，这里沿用其语义

[^14]: [C++ 标准草案：volatile](https://eel.is/c++draft/dcl.type.cv)与[Data races](https://eel.is/c++draft/intro.races)——volatile 访问的可观察语义，以及其不替代原子操作或线程间同步的边界

[^15]: [Java Language Specification §17.4.5](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4.5)与[C# 规范：Volatile fields](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/classes#1554-volatile-fields)——Java volatile 的 happens-before 保证与 C# volatile 读写的 acquire/release 语义

[^16]: [Rust `read_volatile`](https://doc.rust-lang.org/std/ptr/fn.read_volatile.html)与[`write_volatile`](https://doc.rust-lang.org/std/ptr/fn.write_volatile.html)——volatile 读写不提供原子性，也不能用于线程间同步

[^17]: [Rust Reference：Memory model](https://doc.rust-lang.org/reference/memory-model.html)与[原子访问的内存模型](https://doc.rust-lang.org/std/sync/atomic/index.html#memory-model-for-atomic-accesses)——Rust 尚无完整定义的内存模型；原子访问采用 C++20 规则，存在访问模型调整且不含 consume

[^19]: [Rust `Condvar::wait`](https://doc.rust-lang.org/std/sync/struct.Condvar.html#method.wait)——原子解锁并阻塞、返回前重新加锁，以及虚假唤醒与谓词复查

[^20]: [Rust `thread::scope`](https://doc.rust-lang.org/std/thread/fn.scope.html)——自动 join、借用生命周期与线程局部变量析构的等待边界

[^21]: [Rust `Once::call_once`](https://doc.rust-lang.org/std/sync/struct.Once.html#method.call_once)——初始化闭包的写入与正常返回后的代码之间明确的 happens-before 保证

[^23]: [Rust `thread::park`：Memory Ordering](https://doc.rust-lang.org/std/thread/fn.park.html#memory-ordering)及其等待协议与示例——token 消费的同步、Release/Acquire、释放序列、虚假返回，以及 token 被其他代码消费的风险

[^24]: [C++ 标准草案：Mutex requirements](https://eel.is/c++draft/thread.mutex.requirements)与[Go 内存模型：Locks](https://go.dev/ref/mem#locks)——同一锁上解锁与后续成功加锁的同步；共享锁的获取模式需分别核对

[^25]: [C++ 标准草案：thread members](https://eel.is/c++draft/thread.thread.member)——被等待线程完成与对应成功 join 返回之间的同步

[^26]: [Go 内存模型：Synchronization](https://go.dev/ref/mem#sync)——goroutine 退出本身不提供同步、通道发送到对应接收完成的同步，以及 Once 初始化完成到调用返回的顺序

[^27]: [C++ 标准草案：barrier](https://eel.is/c++draft/thread.barrier.class)——阶段完成步骤的结束 strongly happens-before 由该步骤解除阻塞的调用返回；此保证不排列阶段内部访问
