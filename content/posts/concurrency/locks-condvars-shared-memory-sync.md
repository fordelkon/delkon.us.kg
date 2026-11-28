---
title: "并发编程（二）：锁、条件变量与共享内存同步"
description: "从保护共享状态与协调线程推进两个问题出发，介绍 Send/Sync、Mutex、RwLock、条件变量、Barrier 与 Semaphore，结合完整示例讨论锁粒度、等待协议与不可变性。"
publishDate: "13 Sep 2026"
tags: ["concurrency", "synchronization", "rust", "cpp"]
---

上一篇[《并发编程（一）：并发、并行与执行单元》](/posts/concurrency/parallelism-execution-units/)区分了并发和并行，也区分了进程、线程、协程等执行抽象与抢占式、协作式等调度策略。本篇接着回答：多个线程共享同一份数据时，如何保护状态，又如何在条件不满足时等待。示例仍以 Rust 为主，条件变量部分用 C++ 展示锁与等待的配合。

## 共享内存：保护状态与协调推进

**共享内存**（shared memory）允许多个线程访问同一个对象，例如配置、队列或计数器。它不要求每次通信都复制数据，但共享也意味着线程必须对访问方式达成一致：哪些数据可以同时读，哪些操作必须整体完成，什么时候才能继续执行。

上一篇已经说明，[数据竞争](/posts/concurrency/parallelism-execution-units/#数据竞争一个可以精确定义的问题)必须通过正确的访问协议排除。本篇进一步关心：分别加锁的“检查”和“修改”怎样保持为一个完整操作，消费者在队列为空时又该如何等待。

因此，本篇从两个问题组织同步工具：

- **保护共享状态**：哪些访问需要互斥，怎样维护一个操作涉及的数据不变量？Mutex、RwLock 是常用答案。
- **协调线程推进**：什么时候可以继续，什么时候应当等待？条件变量用于等待状态满足条件，屏障用于阶段会合。

这是按主要用途划分的讲解视角，并不是互不重叠的分类。锁除了互斥，还建立线程之间的同步顺序：一个线程在持锁期间做出的修改，对之后获得同一把锁的线程可见——这一保证的机制属于内存模型，第三篇用[happens-before](/posts/concurrency/atomics-memory-model/#跨线程同步与-happens-before)展开。协调机制则经常与锁组合，才能构成完整协议。

| 工具 | 什么时候可以继续 | 用途举例 |
| ---- | ---------------- | -------- |
| Mutex | 取得锁，独占访问 | 独占更新共享结果 |
| RwLock | 取得读锁或写锁；读锁可共享，写锁独占 | 并发读取配置 |
| 条件变量 | 重新拿锁后确认谓词为真 | 等队列非空或生产结束 |
| Barrier | 本轮到达次数达到约定值 | 等所有 worker 完成本阶段再汇总 |
| Semaphore | 领取到可用许可 | 限制同时使用数据库连接的 worker 数 |

原子操作与一次性初始化留到[《并发编程（三）：原子操作与内存模型》](/posts/concurrency/atomics-memory-model/)，许可怎样限制资源用量则由第五篇的[信号量与资源并发数](/posts/concurrency/message-passing-workers-backpressure/#信号量与资源并发数)展开。

## Send / Sync：跨线程传递与共享

Rust 用两项类型约束区分“能转移给另一线程”与“能被多个线程共享”：

- `Send`：值的所有权可以安全地转移到另一线程。
- `Sync`：可以安全地跨线程共享引用；精确定义是 `T: Sync` 当且仅当 `&T: Send`[^1]。

`Rc<T>` 的引用计数不支持并发更新，不能因为内部装了 Mutex 就跨线程传递；`Arc<T>` 使用原子引用计数，但只解决共享所有权，内部数据仍需满足相应约束。`Mutex<T>` 在 `T: Send` 时实现 `Sync`，不要求 `T` 自身也实现 `Sync`，因为锁把内部访问串行化[^2]。

`Send`、`Sync` 是没有方法的自动 trait，编译器通常根据组成字段推导它们；手工实现需要 `unsafe impl` 并承担安全性证明。它们不保证没有死锁，也不替调用方证明业务协议正确。类型允许跨线程使用，具体访问仍需遵守锁或原子操作的同步协议。

## 保护共享状态

### Mutex：独占访问

**互斥锁**（mutex）让遵守同一加锁协议的线程独占访问共享状态。Rust 里常配合 `Arc` 使用：`Arc` 提供共享所有权，`Mutex` 控制内部数据的访问；单独使用 `Arc` 不会让任意内部数据自动具备线程安全性[^3]。

先看常规互斥锁的等待机制：当锁已被持有时，阻塞式 `Mutex` 通常通过内核等待队列（例如 Linux futex）让出 CPU 并休眠，等锁释放后再唤醒；这不同于在用户态循环空转等待的**自旋锁**（spinlock）。如果持有自旋锁的线程被操作系统抢占，其余自旋线程会白白耗尽 CPU 时间片；若高优先级线程持续自旋等待被抢占的低优先级持锁者，还会引发严重的**优先级反转**（priority inversion）。自旋锁的内存序细节见第三篇的[自旋锁实现](/posts/concurrency/atomics-memory-model/#自旋锁cas-为什么需要内存序)，优先级反转则留到第四篇的[优先级反转与优先级继承](/posts/concurrency/deadlock-livelock-correctness/#优先级反转与优先级继承)。

先把上一篇的计数器改成正确的同步版本。四个线程各加 1000 次，最后必须得到 4000：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = Vec::new();

    for _ in 0..4 {
        let counter = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1000 {
                // Keep the entire read-modify-write operation under one lock.
                let mut value = counter.lock().unwrap();
                *value += 1;
                // Scope the guard inside each iteration so threads interleave per increment
                // rather than holding the mutex across all 1000 iterations.
            }
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let result = *counter.lock().unwrap();
    assert_eq!(result, 4000);
    println!("{result}");
}
```

关键不只是“写入时加锁”，而是把读取旧值、计算新值、写回这整个操作放进同一个**临界区**（critical section）。`lock()` 返回 `MutexGuard`，guard 离开作用域时自动解锁；只要持有它，其他线程就不能同时获得这把锁，无论它们想读还是想写[^4]。

这也限定了锁的保证：C++ 中一把独立的 `std::mutex` 不会自动拦住绕过它的读写，所有相关访问都必须遵守同一协议。Rust 的 `Mutex<T>` 则把数据和锁放在一起，通过 guard 暴露访问入口。如果线程在持有 `MutexGuard` 时发生 panic，Rust 默认会将这把锁标记为“中毒”（poisoned），后续 `lock()` 会返回 `Err(PoisonError)`，避免其他线程在不知情的情况下读到只改到一半的状态；调用方仍可通过 `PoisonError::into_inner()` 取出内部状态检查并修复，再调用 `Mutex::clear_poison()` 恢复正常使用（若不希望引入中毒语义，部分工程会选用 `parking_lot` 等非中毒互斥锁）[^4]。C++ `std::mutex` 在栈展开析构锁包装器时不会记录中毒状态；而 POSIX 标准额外提供**健壮互斥锁**（`PTHREAD_MUTEX_ROBUST`）：当持锁线程异常终止后，下一个加锁者会收到 `EOWNERDEAD` 提示，须先修复共享状态并调用 `pthread_mutex_consistent()` 确认一致，否则解锁后该锁会永久进入不可恢复的 `ENOTRECOVERABLE` 状态[^5]。

还要注意，这两类锁都**不可重入**（non-reentrant）：C++ 中同一线程对已持有的 `std::mutex` 再次 `lock()` 是未定义行为，需要可重入（reentrant / recursive）语义时应使用 `std::recursive_mutex`；Rust 的 `Mutex` 在同一线程重复加锁则会死锁或 panic（且就借用模型而言，同一线程若能两次获取 `MutexGuard` 就会制造两个并发存在的 `&mut T` 别名，直接破坏 Rust 的独占可变引用约束）[^4]。可重入锁也并非没有代价：若外层函数在临时打破不变量时调用了重新加锁的回调，内层进入时会看到尚未修复的中间状态，还会让锁协议更难推理；同线程重复加锁的等待依赖见第四篇的[死锁与加锁顺序](/posts/concurrency/deadlock-livelock-correctness/#死锁与加锁顺序)。

### RwLock：并发读与独占写

如果多个线程经常只读，可以考虑**读写锁**（reader-writer lock, RwLock）：多个读锁可以同时持有，写锁则与所有读锁、其他写锁互斥[^6]。由于多个读者会同时拿到 `&T`，Rust 的 `RwLock<T>` 只有在 `T: Send + Sync` 时才实现 `Sync`[^6][^2]；同样地，`RwLock` 在写锁期间 panic 会导致锁中毒（可配合 `clear_poison()` 清理），读锁期间 panic 则不会中毒。

下面让三个读者读取配置，一个写者更新配置。先启动所有线程，再统一等待结束，让读写有机会发生竞争；读者只在复制所需值时持锁，输出放到锁外：

```rust
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::thread;

fn main() {
    let config = Arc::new(RwLock::new(HashMap::from([("timeout", 30_u64)])));
    let mut handles = Vec::new();

    for _ in 0..3 {
        let config = Arc::clone(&config);
        handles.push(thread::spawn(move || {
            let timeout = {
                let guard = config.read().unwrap();
                guard["timeout"]
            }; // Release the read lock before printing.
            println!("timeout = {timeout}");
        }));
    }

    let writer_config = Arc::clone(&config);
    handles.push(thread::spawn(move || {
        // A writer excludes both readers and other writers.
        let mut guard = writer_config.write().unwrap();
        guard.insert("timeout", 60);
    }));

    for handle in handles {
        handle.join().unwrap();
    }
    assert_eq!(config.read().unwrap()["timeout"], 60);
}
```

读者可能打印 30，也可能打印 60，取决于何时获取读锁；最终配置必须是 60。这段程序展示访问协议，不保证某次运行一定出现读写争用，也不能用输出顺序证明几个读者同时持锁。

RwLock 背后是经典的**读者-写者问题**（readers/writers）：读与读可以并发，写必须独占。Courtois、Heymans 和 Parnas 在 1971 年的论文中讨论了这一问题，并给出分别偏向读者、偏向写者的解法[^7]。优先策略会影响两类安全边界：若偏向读者且新读者源源不断进入，等待中的写者就可能长期饥饿；反过来，若底层采用写者优先或公平队列实现，当线程 A 已持有 `read()` 锁时，如果中途又有写者 B 排队等待，此时线程 A 若在释放前同一线程再次调用 `read()`，就会排在写者 B 后面形成自死锁（同样地，试图把已有读锁直接原位升级为写锁也极易与另一名读者互相卡死）。Rust 标准库与 C++ 的共享互斥锁要求都不固定特定读写优先策略，因此不应假设读锁可以安全重入[^6][^8]。

读多写少只是考虑 RwLock 的理由，并不是性能结论。OSTEP 提醒，读写锁本身维护读者计数与等待队列的原子开销可能抵消并发读取的收益，即使读操作很多，也未必比 Mutex 更快[^9]。选择仍应根据实际负载测量；饥饿与公平性留到[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/concurrency/deadlock-livelock-correctness/#活锁与饥饿)展开。

### 临界区范围与锁的粒度

先写出锁要保护的**不变量**（invariant）：一次完整操作前后都应成立的约束，例如转账前后两账户总额不变。持锁线程可以暂时打破它，但遵守同一协议的其他线程不能看到中间状态。这个约束同时决定要持锁多久，以及哪些数据必须一起保护。

**时间维度：缩短持锁时间，但保留完整操作**。OSTEP 把锁保护下的临界区描述为近似一条原子指令的执行：对于遵守同一加锁协议的线程，它们不会看到这段操作执行到一半的状态[^10]。与不变量无关的工作，例如日志、网络 I/O、耗时计算，应尽量移到锁外。但不能把必须整体完成的检查和更新拆成两个临界区，否则即使每次访问都加了锁，组合起来仍可能出错。

例如，银行里 Alice 有 1000 分，Bob 有 500 分，要从 Alice 向 Bob 转账。这里用整数表示分，只讨论内存中的余额更新：成功时不能透支，两个账户的总额保持不变；失败时两边都不修改。先用一把锁保护整个银行状态，启动两个线程，各向 Bob 转账 200 分。与前面的计数器一样，`Arc` 负责在线程间共享所有权，`Mutex` 负责互斥访问：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Bank {
    alice: u64,
    bob: u64,
}

fn transfer(bank: &Mutex<Bank>, amount: u64) -> bool {
    let mut state = bank.lock().unwrap();
    if amount == 0 || state.alice < amount {
        return false;
    }
    let Some(bob_after) = state.bob.checked_add(amount) else {
        return false;
    };

    // Validate both balances before changing either one.
    state.alice -= amount;
    state.bob = bob_after;
    true
}

fn main() {
    let bank = Arc::new(Mutex::new(Bank {
        alice: 1000,
        bob: 500,
    }));
    let mut handles = Vec::new();

    for _ in 0..2 {
        let bank = Arc::clone(&bank);
        handles.push(thread::spawn(move || {
            assert!(transfer(&bank, 200));
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let state = bank.lock().unwrap();
    assert_eq!((state.alice, state.bob), (600, 900));
    assert_eq!(state.alice + state.bob, 1500);
    println!("Alice = {}, Bob = {}", state.alice, state.bob);
}
```

两个线程都结束后，程序必须输出 `Alice = 600, Bob = 900`，总额仍为 1500 分；不要求哪个线程先完成，也不保证某次运行一定发生锁争用。余额检查、扣款和入账都在同一个 guard 的生命周期内；`checked_add` 也在修改前排除收款余额溢出。读取这两个余额的线程只要同样持有银行锁，就只能看到转账前或转账后的状态。这里的原子性是相对于遵守锁协议的访问而言，锁并不提供持久化或故障回滚。

如果先加锁检查余额，解锁后再加锁扣款，其他转账就可能在间隙里花掉已经检查过的钱；如果扣款后解锁，再加锁入账，读取者又可能看到“钱已扣、尚未到账”的中间状态。两种拆法都可能没有数据竞争，却破坏完整操作的要求。日志可以放到函数返回以后，决定转账能否成功的检查则必须留在临界区里。

**空间维度：选择合适的锁粒度**。一把大锁保护多份状态是**粗粒度锁**（coarse-grained locking），协议简单，但无关操作也会互相等待；按数据划分多把锁是**细粒度锁**（fine-grained locking），允许更多操作并行，却增加了维护跨数据不变量的难度[^10]。一个操作需要多把锁时，一致的获取顺序是避免循环等待的常用办法。

把银行改成每个账户一把锁，转账仍然需要同时保护付款和收款账户。下面保留相同的初始余额和两个转账线程，给出可单独运行的完整版本，固定先锁 Alice，再锁 Bob：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Bank {
    alice: Mutex<u64>,
    bob: Mutex<u64>,
}

fn transfer(bank: &Bank, amount: u64) -> bool {
    let mut alice = bank.alice.lock().unwrap();
    let mut bob = bank.bob.lock().unwrap();
    if amount == 0 || *alice < amount {
        return false;
    }
    let Some(bob_after) = bob.checked_add(amount) else {
        return false;
    };

    // Hold both guards until both balances have been updated.
    *alice -= amount;
    *bob = bob_after;
    true
}

fn main() {
    let bank = Arc::new(Bank {
        alice: Mutex::new(1000),
        bob: Mutex::new(500),
    });
    let mut handles = Vec::new();

    for _ in 0..2 {
        let bank = Arc::clone(&bank);
        handles.push(thread::spawn(move || {
            assert!(transfer(&bank, 200));
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    // Use the same lock order when reading a consistent snapshot.
    let alice = bank.alice.lock().unwrap();
    let bob = bank.bob.lock().unwrap();
    assert_eq!((*alice, *bob), (600, 900));
    assert_eq!(*alice + *bob, 1500);
    println!("Alice = {}, Bob = {}", *alice, *bob);
}
```

这个版本也必须输出 `Alice = 600, Bob = 900`。`Arc<Bank>` 共享银行对象，两个账户各自由内部的 Mutex 保护。这里有两把锁，但扣款和入账发生在两个持锁区间重叠的部分，不能按“每个账户各加一次锁”就把转账拆开。读取两账户总额也必须先锁 Alice、再锁 Bob，同时持有两把锁后读取；分别加锁读取再相加，可能拼出来自转账前后两个时刻的余额，得不到一致快照。反向转账同样应先锁 Alice、再锁 Bob，而不是跟着转账方向改变顺序，否则可能形成循环等待；第四篇的[固定加锁顺序](/posts/concurrency/deadlock-livelock-correctness/#固定加锁顺序)会给出完整示例。

如果只有这两个账户，而且每次操作都要同时访问它们，两把锁没有增加这类操作的并发机会，反而多了一次加解锁。细化的收益要看是否存在互不冲突的访问：例如银行再有 Charlie 和 David，Alice 向 Bob 转账时，Charlie 向 David 转账只需另外两把账户锁，两笔操作便不必因同一把银行锁而互相等待。推广到多个账户时，可以按稳定且唯一的账户 ID 从小到大获取所需的锁，并单独处理付款与收款为同一账户的情况，避免重复锁住同一个 Mutex。同时要注意内存排布成本：若把多个 `Mutex<u64>` 紧密排列在同一结构体或相邻数组槽位中，即使各线程只访问彼此无关的锁，底层原子锁字仍可能落在同一条 CPU 缓存行上造成**伪共享**（false sharing），第三篇的[缓存一致性与伪共享](/posts/concurrency/atomics-memory-model/#缓存一致性与伪共享)会继续讨论这一开销。

实践中可以先用简单的锁协议保证正确，再根据测量定位争用、逐步细化。锁的成本不仅来自等待，也包括加解锁与缓存一致性往返；没有必要为了缩短几行临界区就引入更复杂的协议。

## 协调线程推进

### 条件变量：等待状态满足条件

拿到锁，只说明当前可以独占访问队列，并不意味着队列里已经有任务。如果消费者持锁等待队列非空，生产者反而无法入队。需要的是：条件不满足时释放锁并等待，状态变化后重新拿锁检查。

**条件变量**（condition variable）用于实现这套等待协议。它配合互斥锁使用：锁保护状态，`wait` **原子地释放锁并进入等待**，返回前重新获取锁。Rust 的类型名是 `Condvar`；C++ 的 `std::condition_variable` 则通过 `std::unique_lock` 管理等待前后的锁所有权[^11]。

先看一个生产者、一个消费者的**丢失唤醒**（lost wakeup）。即使所有队列读写都持有同一把锁，消费者若在持锁检查为空之后、进入 `wait` 之前先解锁，生产者就可能在这段空窗内持锁入队并调用 `notify_one()`；由于 C++ 的 `notify_one()` 不会为之后才开始等待的线程保留通知，消费者随后重新加锁并不复查谓词就直接 `wait` 时，即使队列已有任务也可能一直等下去[^11][^12]。

正确时序不在检查与调用 `wait` 之间解锁。若生产者先入队，消费者持锁检查时会看到任务，根本不用等；若消费者先看到空队列，生产者只能在消费者原子地解锁并进入等待后拿到同一把锁。`wait` 返回时已重新持锁，但唤醒可能是虚假的，任务也可能已被另一个消费者领走，因此仍要复查谓词[^11]。

```mermaid title="条件变量的等待、通知与复查" description="消费者持锁发现空队列。wait 原子地解锁并进入等待；生产者持同一把锁入队，解锁后通知。消费者醒来后重新竞争并取得锁，wait 才返回。复查谓词成立后才领取任务并解锁。"
sequenceDiagram
 participant C as 消费者
 participant M as Mutex
 participant V as 条件变量
 participant P as 生产者
 C->>M: 获得锁
 C->>C: 检查谓词为假
 C->>V: wait：原子解锁并等待
 P->>M: 获得同一把锁
 P->>P: 入队
 P->>M: 解锁
 P->>V: notify_one
 V-->>C: 唤醒
 C->>M: 重新竞争并取得锁
 C->>C: 复查并取任务
 C->>M: 解锁
```

这里用 C++ 展示完整的生产与退出流程，示例参考 Modern C++ 的条件变量一节[^13]：

```cpp
#include <condition_variable>
#include <cstdio>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

std::mutex mutex;
std::condition_variable condition;
// Both the queue and the shutdown flag are protected by mutex.
std::queue<int> tasks;
bool done = false;

void producer(int id) {
    for (int i = 0; i < 5; ++i) {
        {
            std::lock_guard<std::mutex> lock(mutex);
            tasks.push(id * 100 + i);
        }
        condition.notify_one();
    }
}

void consumer(int id) {
    while (true) {
        std::unique_lock<std::mutex> lock(mutex);

        // Proceed when work is available or all producers have finished.
        while (tasks.empty() && !done) {
            // Atomically unlock and wait; return with the lock held again.
            condition.wait(lock);
        }

        // Finish only after production has ended and the queue is drained.
        if (tasks.empty() && done) {
            break;
        }

        int task = tasks.front();
        tasks.pop();
        lock.unlock();

        // Handle the task without holding the queue mutex.
        std::printf("consumer %d handles %d\n", id, task);
    }
}

int main() {
    std::vector<std::thread> producers;
    std::vector<std::thread> consumers;
    for (int i = 0; i < 2; ++i) {
        producers.emplace_back(producer, i);
        consumers.emplace_back(consumer, i);
    }

    for (auto& thread : producers) {
        thread.join();
    }

    {
        std::lock_guard<std::mutex> lock(mutex);
        // No producer can enqueue more work after this point.
        done = true;
    }
    condition.notify_all();

    for (auto& thread : consumers) {
        thread.join();
    }
}
```

两位生产者分别提交 0–4 和 100–104，总共十个任务；输出中的消费者编号和处理顺序可以不同，每个任务应恰好出现一次。每条日志使用一次 `printf` 完成：POSIX 保证单次 stdio 调用内部加锁，而连续多个 `<<` 拼接对应多次调用，输出可能交错；若偏好 C++ iostream 写法，C++20 的 `std::osyncstream` 可将一整条缓冲流原子刷新到 `std::cout`[^14]。

读懂这段代码，关键是三个约束：

1. **条件存在于状态里**。消费者持锁检查 `tasks` 和 `done`，生产者入队、主线程设置退出标记也必须持有同一把锁；哪怕把 `done` 改成原子布尔并在锁外修改，只要在“消费者检查后、尚未进入 `wait` 前”修改并通知，图中的丢失唤醒窗口就会重新打开。消费者从检查到调用 `wait` 之间也不能自行解锁。
2. **唤醒后必须重新检查**。线程可能虚假唤醒，也可能在重新获得锁之前被其他消费者取走任务。`while` 检查的是能否继续的谓词：队列非空，或者生产已经结束。C++ 的 `condition.wait(lock, predicate)` 在谓词为假时等待，本例的谓词是 `!tasks.empty() || done`。Rust 的 `Condvar::wait_while(guard, predicate)` 则在谓词为真时继续等待：若状态含有相同的 `tasks` 和 `done` 字段，闭包应检查 `state.tasks.is_empty() && !state.done`。两者表达同一等待协议时，谓词方向相反[^11]。还要注意，如果同一把条件变量上挂着等待**不同谓词**的多类线程，使用 `notify_one()` 可能唤醒条件尚未满足的那一类，导致本可推进的一方一直错过唤醒；这类场景应拆分条件变量或改用 `notify_all()`。
3. **结束不等于立即退出**。主线程先等待全部生产者结束，再设置 `done` 并唤醒所有消费者。消费者只有在生产结束且队列已空时退出。设想两位消费者都因队列为空而等待：主线程持锁设置 `done = true` 并解锁，`notify_all()` 让两位等待者都能重新竞争锁。两者分别在持锁时检查到队列已空且生产结束，随后退出，主线程才能依次 join。若只通知一位，另一位可能一直等下去。

这里还要区分唤醒与数据发布：队列写入在生产者解锁之前，消费者的队列读取在重新获得同一把锁之后，数据可见性由这条锁同步链保证；`notify_one()` 只通知等待者，不允许绕过锁访问队列。`wait` 还可能虚假返回，因此不能把任意一次通知与任意一次返回直接当成配对的数据发布。第三篇集中说明[同步边的来源与条件](/posts/concurrency/atomics-memory-model/#同步边不只来自原子操作)[^11]。

示例中生产者与主线程先解锁再通知：如果改为持锁通知，刚醒来的消费者可能立刻撞上尚未释放的锁而再次休眠（除非实现具备 wait morphing 优化）。但解锁后通知也有生命周期边界：一旦释放锁，醒来的消费者就已经能看到条件变化并继续运行；如果消费者随后就负责销毁 `condition`，则必须把通知放在持锁期间，或者确保通知线程结束后才销毁条件变量[^11][^12]。实际工程也常配合超时或非阻塞尝试避免无限期挂起（如 C++ 的 `wait_for`/`wait_until`、Rust 的 `Condvar::wait_timeout` 与 `Mutex::try_lock`）。

:::note[Monitor：封装状态、互斥与条件等待]
上面的互斥锁与条件变量，是构造**管程**（monitor）的基础。monitor 把受保护的状态、操作入口和条件等待封装起来，让调用者通过约定的接口访问状态。Java 的内置 monitor 可重入，`Object.wait()` 释放接收对象的 monitor（包括当前线程对它的重入层数），返回前恢复持有，线程持有的其他锁则保持不变[^15]。

Java 的显式 `ReentrantLock` 可通过 `newCondition()` 创建不同的条件等待集合，`await` 只释放关联的锁[^16]。Rust 的 `Mutex` 由 guard 表示持有关系，同线程重复加锁不会正常返回；Rust 的 `Condvar::wait` 接收 guard 并在重新取得同一把锁后返回它[^4][^11]。C++ 则需留意 `std::condition_variable` 只接受 `std::unique_lock<std::mutex>`（不能配合 `std::recursive_mutex`），而通用的 `std::condition_variable_any` 若与递归锁配合也只会解锁一层，若此前重入多层仍会死锁[^17]。无论哪一种条件变量接口，等待操作在被唤醒后都必须重新获取对应的锁再返回[^11][^15]。
:::

### Barrier：阶段之间的会合

条件变量等待的是“状态满足某个谓词”，**屏障**（barrier）等待的是“约定数量的参与者都已到达”。它适合阶段同步：各线程完成本阶段的工作后会合，人数到齐，才允许通过同步点进入下一阶段[^18]。C++20 在标准库中也提供了专门的阶段同步工具：可重复使用的 `std::barrier`，以及只需一次计数的轻量 `std::latch`[^19]。

```rust
use std::sync::{Arc, Barrier};
use std::thread;

fn main() {
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = Vec::new();

    for worker_id in 0..3 {
        let barrier = Arc::clone(&barrier);
        handles.push(thread::spawn(move || {
            println!("worker {worker_id} finished phase 1");

            // No worker passes until all three have arrived.
            let wait_result = barrier.wait();
            if wait_result.is_leader() {
                println!("worker {worker_id} leads phase 2 transition");
            }

            println!("worker {worker_id} starts phase 2");
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

这里应观察的不是固定输出顺序，而是：**三条 `finished phase 1` 全部出现以后，才会出现任何一条 `starts phase 2`**。屏障不要求线程按编号到达，也不保证通过后同时获得 CPU。`Barrier::wait()` 返回的 `BarrierWaitResult::is_leader()` 会确保每轮会合中恰有且仅有一名参与者返回 `true`，适合由单个线程承担阶段切换汇总或日志；不同于 `Mutex`/`RwLock`，Rust 的 `Barrier` 本身不会因某线程 panic 而中毒，但如果有参与者未到达 `wait()` 就提前退出，其余线程可能一直等下去[^18][^20]。

屏障提供阶段会合，不提供逐次数据访问的互斥。是否还需要 Mutex、RwLock 或原子操作，取决于各阶段怎样划分数据、访问是否冲突，以及语言的线程安全与借用规则。不能认为“有屏障就能任意读写”，也不必推导成“跨阶段共享数据就一定要再加锁”。

### Semaphore：许可决定能否进入

**信号量**（semaphore）记录可用许可：获取消耗许可，没有足够许可就等待；释放增加许可，即使当时没有等待者，之后也可以领取；信号量也不要求像 Barrier 那样等一批参与者到齐[^9]。一个初值为 1 的二值信号量看似也能限流成单人进入，但它与 `Mutex` 有本质的所有权差别：`Mutex` 有明确的所有者（例如 POSIX 要求由加锁线程自己解锁、Rust 的 `MutexGuard` 实现 `!Send` 禁止跨线程移交、且操作系统能基于所有者实现优先级继承）；信号量则**没有所有权约束**——任何线程或任务都能调用释放接口增加许可，甚至像 Tokio 的 `OwnedSemaphorePermit`（由 `acquire_owned()` 返回）还会故意跨任务、跨线程转移并在被丢弃时归还许可。若把二值信号量当锁使用，误多释放一次许可就会悄然破坏互斥。

以 Tokio 为例，`acquire().await` 返回的许可在被丢弃时归还；需要转给新任务时可使用 `acquire_owned()`。Tokio 按请求顺序分配许可，多许可请求在队首时可能让后面的小请求一起等[^21]。同时要区分阻塞锁与异步等待边界：在异步任务中跨 `.await` 持有阻塞型的 `std::sync::MutexGuard`，会占住执行器线程并引发调度停顿或死锁，详见[《并发编程（六）：异步并发与任务的生命周期》](/posts/concurrency/async-concurrency-task-lifecycle/#持锁跨-await-的等待依赖)；关于如何用许可限制资源并发数，见第五篇的[信号量与资源并发数](/posts/concurrency/message-passing-workers-backpressure/#信号量与资源并发数)。

## 减少共享可变状态

前面讨论怎样保护和协调共享状态。在选择工具之前，还可以先问：哪些数据根本不需要被多方修改？构造完成后不再变化的数据，在正确发布给其他线程后（什么叫“正确发布”，第三篇用[happens-before](/posts/concurrency/atomics-memory-model/#跨线程同步与-happens-before)展开），可以让多个读者共享，而不必为内容的读取反复加锁。Java 官方教程把不可变对象作为简化并发程序的一种策略[^22]。

不可变性要覆盖对象可观察到的状态，而不只是字段名或引用本身。Java 的简单构造策略包括限制修改入口、使用 `private final` 字段、防止子类改变行为，以及对可变成员做防御性复制；仅仅给一个指向可变列表的字段加上 `final`，并不会让列表内容不可变[^22]。

Rust 的所有权与借用规则提供了另一种约束：默认情况下，共享引用（`&T`）禁止修改，可变借用（`&mut T`）要求独占。`Cell<T>`、`RefCell<T>`、`Mutex<T>` 与原子类型都能提供**内部可变性**（interior mutability），允许通过共享引用修改内部状态。但内部可变性不等于跨线程共享安全：`Cell<T>`、`RefCell<T>` 不实现 `Sync`，而锁与原子类型为跨线程访问提供相应的同步协议。`Send`、`Sync` 约束值或引用能否安全地跨线程传递；这组约束的职责，见前面的 [Send / Sync](#send--sync跨线程传递与共享)[^23]。

计数器、缓存、连接池仍需要变化。对这些状态，可以集中所有权，让其他任务通过消息请求更新，而不是共同修改；也可以让线程处理互不重叠的数据，最后汇总结果。[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/#消息传递与状态所有权)会沿着这个方向继续。

## 总结

- 保护状态与协调推进，是理解同步协议的两个角度。Mutex、RwLock、条件变量、Barrier 与 Semaphore 各有不同的所有权与等待契约。
- 阻塞 Mutex 依赖调度器休眠与唤醒，不同于用户态自旋锁；RwLock 允许并发读，但读多写少不保证更快，且不承诺写者优先或可重入。
- 临界区应当短，但必须覆盖完整的不变量，拆散检查与更新即使没有数据竞争仍会出错；拆分多锁时还需注意跨锁顺序与伪共享。
- 条件变量围绕受锁保护的状态工作：原子地释放锁并等待，返回前重新获取锁并复查谓词。结束标记与唤醒时机也必须服从锁生命周期。
- Barrier 约束阶段推进，Semaphore 表达无所有权的资源许可；减少共享可变状态与明确所有权划分，则能从设计上减少同步需求。

下一篇[《并发编程（三）：原子操作与内存模型》](/posts/concurrency/atomics-memory-model/)讨论另一种访问机制：原子操作怎样保证单次操作不可分割，又怎样通过 Relaxed、Acquire/Release、SeqCst 约束可观察的顺序。本篇的等待协议也依赖锁建立的可见顺序：裸标志位为什么不够、锁为什么足够，下一篇用 happens-before 关系给出答案。原子操作不自动让多个步骤组成的协议正确，这与本篇“锁必须覆盖完整操作”的要求一脉相承。

## 延伸阅读

- [Berkeley CS162：Semaphores, Monitors, and Readers/Writers](https://cs162.org/static/lectures/9-1up.pdf)——用操作系统课程中的经典问题继续理解这些机制如何组合
- [Is Parallel Programming Hard, And, If So, What Can You Do About It?](https://mirrors.edge.kernel.org/pub/linux/kernel/people/paulmck/perfbook/perfbook.html)——从缓存一致性、锁竞争到无锁同步的系统工程读本
- 不想在本机配置环境的话，Rust 代码可以放到 [Rust Playground](https://play.rust-lang.org) 运行，C++ 代码可以放到 [C++ Playground](https://programiz.pro/ide/cpp) 运行

[^1]: [Rust `Send`](https://doc.rust-lang.org/std/marker/trait.Send.html)与[`Sync`](https://doc.rust-lang.org/std/marker/trait.Sync.html)——跨线程所有权与引用的安全条件、自动实现与手工实现的责任。

[^2]: [Rust `Arc`：Thread Safety](https://doc.rust-lang.org/std/sync/struct.Arc.html#thread-safety)、[`Mutex` trait 实现](https://doc.rust-lang.org/std/sync/struct.Mutex.html#trait-implementations)与[`RwLock` trait 实现](https://doc.rust-lang.org/std/sync/struct.RwLock.html#trait-implementations)——共享所有权与数据同步的区别，`Mutex<T>: Sync` 仅需 `T: Send` 而 `RwLock<T>: Sync` 须同时满足 `T: Send + Sync`。

[^3]: [《Rust 程序设计语言》：共享状态并发](https://kaisery.github.io/trpl-zh-cn/ch16-03-shared-state.html)与[`Arc` 官方文档](https://doc.rust-lang.org/std/sync/struct.Arc.html)——计数器示例参考前者改写；后者说明共享所有权与内部数据线程安全的区别。

[^4]: [Rust `std::sync::Mutex`](https://doc.rust-lang.org/std/sync/struct.Mutex.html)与[C++ 标准草案：`thread.mutex.class`](https://eel.is/c++draft/thread.mutex.class)——guard 管理的独占访问、作用域结束时解锁、不可重入约束，以及中毒检查、[`into_inner`](https://doc.rust-lang.org/std/sync/struct.PoisonError.html#method.into_inner) 和 `clear_poison`。

[^5]: [POSIX: `pthread_mutex_consistent` 与 `PTHREAD_MUTEX_ROBUST`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/pthread_mutex_consistent.html)——健壮互斥锁持有者异常退出后的 `EOWNERDEAD`、`pthread_mutex_consistent` 恢复与 `ENOTRECOVERABLE` 边界。

[^6]: [Rust `std::sync::RwLock`](https://doc.rust-lang.org/std/sync/struct.RwLock.html)——多读者或单写者语义、读锁不可假设可重入、写锁期间 panic 中毒，以及不保证固定优先策略的限制。

[^7]: P. J. Courtois, F. Heymans, D. L. Parnas, [Concurrent Control with 'Readers' and 'Writers'](https://doi.org/10.1145/362759.362813), Communications of the ACM 14(10): 667–668, 1971——读者-写者问题及两类优先策略。

[^8]: [C++ 标准草案：`thread.sharedmutex.requirements`](https://eel.is/c++draft/thread.sharedmutex.requirements)——C++ 共享互斥锁对独占与共享所有权及重入的前提约束。

[^9]: [OSTEP ch31: Semaphores](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-sema.pdf)——§31.2–31.3 展示互斥与事件排序，§31.5 讨论读写锁、饥饿与额外开销；亦对比互斥锁与信号量的等待机制差别。

[^10]: [OSTEP ch28: Locks](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks.pdf)——临界区的互斥执行，以及粗粒度与细粒度锁策略。

[^11]: [C++ 标准草案：`condition_variable`](https://eel.is/c++draft/thread.condition.condvar)、[条件变量的一般规则](https://eel.is/c++draft/thread.condition.general)与[Rust `Condvar`](https://doc.rust-lang.org/std/sync/struct.Condvar.html)——原子解锁并等待、返回前重新加锁、虚假唤醒、谓词循环与析构生命周期边界；C++ 的通知只针对当时已在等待的线程。

[^12]: [OSTEP ch30: Condition Variables](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-cv.pdf)——状态变量、错过通知的风险，以及生产者-消费者协议中重新检查条件的必要性。

[^13]: [Modern C++：7.4 条件变量](https://changkun.de/modern-cpp/zh-cn/07-thread/#7-4-条件变量)——C++ 生产者-消费者示例的参考资料。

[^14]: [C++ 标准草案：`syncstream.osyncstream`](https://eel.is/c++draft/syncstream.osyncstream)——在多输出拼接场景下将缓冲内容原子刷新到底层流，避免交错。

[^15]: [Java Language Specification §17.1–17.2](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)——monitor、同步方法与代码块，以及 wait 释放并重新获取 monitor 的语义。

[^16]: [Java `ReentrantLock::newCondition`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html#newCondition())——与显式锁关联的条件等待集合、释放及恢复重入计数。

[^17]: [C++ 标准草案：`condition_variable_any`](https://eel.is/c++draft/thread.condition.condvarany)——通用锁适配条件变量对单个锁对象的单次 `unlock()`/`lock()` 契约。

[^18]: [Rust `std::sync::Barrier`](https://doc.rust-lang.org/std/sync/struct.Barrier.html)——约定数量参与者的会合、重复使用、无锁中毒状态及阶段同步示例。

[^19]: [C++ 标准草案：`thread.latch`](https://eel.is/c++draft/thread.latch)与[`thread.barrier`](https://eel.is/c++draft/thread.barrier)——一次性的线程门闩与可重复使用的阶段屏障。

[^20]: [Rust `BarrierWaitResult::is_leader`](https://doc.rust-lang.org/std/sync/struct.BarrierWaitResult.html#method.is_leader)——每轮会合保证恰好一个线程返回 `true` 作为阶段领导者。

[^21]: [Tokio 1.53.3 `Semaphore`](https://docs.rs/tokio/1.53.3/tokio/sync/struct.Semaphore.html)——许可获取、归还、跨任务移交所有权与公平分配的语义。

[^22]: [Java Tutorial: Immutable Objects](https://docs.oracle.com/javase/tutorial/essential/concurrency/immutable.html)与[构造不可变对象的策略](https://docs.oracle.com/javase/tutorial/essential/concurrency/imstrat.html)——不可变性的并发收益与一种简单构造策略。

[^23]: [Rust `std::cell`](https://doc.rust-lang.org/std/cell/)与[`Sync`](https://doc.rust-lang.org/std/marker/trait.Sync.html)——内部可变性，以及跨线程共享引用的类型约束。
