---
title: "并发编程（二）：锁、条件变量与共享内存同步"
description: "从保护共享状态与协调线程推进两个问题出发，介绍 Mutex、RwLock、条件变量和 Barrier，结合完整示例讨论锁粒度、等待协议、monitor 与不可变性。"
publishDate: "13 Sep 2026"
tags: ["concurrency", "synchronization", "rust", "cpp"]
---

上一篇[《并发编程（一）：并发、并行与执行单元》](/posts/concurrency-parallelism-execution-units/)厘清了并发与并行的区别，梳理了进程、线程、协程三类执行单元，以及抢占式与协作式两种调度模型。本篇接着回答：多个线程共享同一份数据时，如何保护状态，又如何在条件不满足时等待。示例仍以 Rust 为主，条件变量部分用 C++ 展示锁与等待的配合。

## 共享内存：保护状态与协调推进

**共享内存**（shared memory）允许多个线程访问同一个对象，例如配置、队列或计数器。它不要求每次通信都复制数据，但共享也意味着线程必须对访问方式达成一致：哪些数据可以同时读，哪些操作必须整体完成，什么时候才能继续执行。

上一篇已经说明，[数据竞争](/posts/concurrency-parallelism-execution-units/#数据竞争一个可以精确定义的问题)必须通过正确的访问协议排除。本篇进一步关心：分别加锁的“检查”和“修改”怎样保持为一个完整操作，消费者在队列为空时又该如何等待。

因此，本篇从两个问题组织同步工具：

- **保护共享状态**：哪些访问需要互斥，怎样维护一个操作涉及的数据不变量？Mutex、RwLock 是常用答案。
- **协调线程推进**：什么时候可以继续，什么时候应当等待？条件变量用于等待状态满足条件，屏障用于阶段会合。

这是按主要用途划分的讲解视角，并不是互不重叠的分类。锁除了互斥，还建立线程之间的同步顺序：一个线程在持锁期间做出的修改，对之后获得同一把锁的线程可见——这一保证的机制属于内存模型，第三篇用[happens-before](/posts/atomics-memory-model/#跨线程同步与-happens-before)展开。协调机制则经常与锁组合，才能构成完整协议。

| 工具     | 核心机制                           | 本篇中的用途           |
| -------- | ---------------------------------- | ---------------------- |
| Mutex    | 同一把锁一次只允许一个持有者       | 独占访问共享状态       |
| RwLock   | 多个读者或一个写者                 | 允许只读访问并发进行   |
| 条件变量 | 释放锁并等待通知，返回前重新获取锁 | 等待队列非空或生产结束 |
| Barrier  | 等待约定数量的参与者到达           | 在阶段之间会合         |

原子操作与一次性初始化留到[《并发编程（三）：原子操作与内存模型》](/posts/atomics-memory-model/)；管理资源许可的**信号量**（Semaphore）留到[《并发编程（五）：消息传递、任务池与背压》](/posts/message-passing-workers-backpressure/#信号量与资源并发数)。信号量既可用于限制并发数量，也可用于互斥或事件排序，并不只属于“协调”一侧[^1]。

## 保护共享状态

### Mutex：独占访问

**互斥锁**（Mutex）让遵守同一加锁协议的线程独占访问共享状态。Rust 里常配合 `Arc` 使用：`Arc` 提供共享所有权，`Mutex` 控制内部数据的访问；单独使用 `Arc` 不会让任意内部数据自动具备线程安全性[^2]。

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
                // The guard releases the lock at the end of this iteration.
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

关键不只是“写入时加锁”，而是把读取旧值、计算新值、写回这整个操作放进同一个**临界区**（critical section）。`lock()` 返回 `MutexGuard`，guard 离开作用域时自动解锁；只要持有它，其他线程就不能同时获得这把锁，无论它们想读还是想写[^3]。

这也限定了锁的保证：C++ 中一把独立的 `std::mutex` 不会自动拦住绕过它的读写，所有相关访问都必须遵守同一协议。Rust 的 `Mutex<T>` 则把数据和锁放在一起，通过 guard 暴露访问入口。示例用 `unwrap()` 简化错误处理；实际程序还需决定如何处理线程 panic 后的锁中毒。

还要注意，这两类锁都**不可重入**：C++ 中同一线程对已持有的 `std::mutex` 再次 `lock()` 是未定义行为，需要可重入语义时应使用 `std::recursive_mutex`；Rust 的 `Mutex` 在同一线程重复加锁则会死锁或 panic，标准库未指定具体行为。后文的 Java monitor 相反，允许持有者重复进入。重入并不是免费的便利：它会让“保护哪些访问”的协议更难看清；同线程重复加锁的等待依赖，见第四篇的[死锁与加锁顺序](/posts/deadlock-livelock-correctness/#死锁与加锁顺序)。

### RwLock：并发读与独占写

如果多个线程经常只读，可以考虑**读写锁**（RwLock）：多个读锁可以同时持有，写锁则与所有读锁、其他写锁互斥[^4]。

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

RwLock 背后是经典的**读者-写者问题**（readers/writers）：读与读可以并发，写必须独占。Courtois、Heymans 和 Parnas 在 1971 年的论文中讨论了这一问题，并给出分别偏向读者、偏向写者的解法[^5]。优先策略影响等待行为：如果新读者不断进入，等待中的写者就可能饥饿。Rust 标准库不保证固定的读写优先策略，具体行为取决于底层实现[^4]。

读多写少只是考虑 RwLock 的理由，并不是性能结论。OSTEP 提醒，读写锁本身的管理开销可能抵消并发读取的收益，即使读操作很多，也未必比 Mutex 更快[^1]。选择仍应根据实际负载测量；饥饿与公平性留到[《并发编程（四）：死锁、活锁与并发程序的正确性》](/posts/deadlock-livelock-correctness/)展开。

### 临界区范围与锁的粒度

理解两种锁以后，再看如何控制它们的成本，可以分成时间和空间两个维度。

**时间维度：缩短持锁时间，但保留完整操作。** OSTEP 把锁保护下的临界区描述为近似一条原子指令的执行：对于遵守同一加锁协议的线程，它们不会看到这段操作执行到一半的状态[^6]。与不变量无关的工作，例如日志、网络 I/O、耗时计算，应尽量移到锁外。但不能把必须整体完成的检查和更新拆成两个临界区，否则即使每次访问都加了锁，组合起来仍可能出错。

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

**空间维度：选择合适的锁粒度。** 一把大锁保护多份状态是粗粒度锁（coarse-grained locking），协议简单，但无关操作也会互相等待；按数据划分多把锁是细粒度锁（fine-grained locking），允许更多操作并行，却增加了维护跨数据不变量的难度[^6]。一个操作需要多把锁时，一致的获取顺序是避免循环等待的常用办法。

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

这个版本也必须输出 `Alice = 600, Bob = 900`。`Arc<Bank>` 共享银行对象，两个账户各自由内部的 Mutex 保护。这里有两把锁，但扣款和入账发生在两个持锁区间重叠的部分，不能按“每个账户各加一次锁”就把转账拆开。读取两账户总额也必须先锁 Alice、再锁 Bob，同时持有两把锁后读取；分别加锁读取再相加，可能拼出来自转账前后两个时刻的余额，得不到一致快照。反向转账同样应先锁 Alice、再锁 Bob，而不是跟着转账方向改变顺序，否则可能形成循环等待；第四篇的[固定加锁顺序](/posts/deadlock-livelock-correctness/#固定加锁顺序)会给出完整示例。

如果只有这两个账户，而且每次操作都要同时访问它们，两把锁没有增加这类操作的并发机会，反而多了一次加解锁。细化的收益要看是否存在互不冲突的访问：例如银行再有 Charlie 和 David，Alice 向 Bob 转账时，Charlie 向 David 转账只需另外两把账户锁，两笔操作便不必因同一把银行锁而互相等待。推广到多个账户时，可以按稳定且唯一的账户 ID 从小到大获取所需的锁，并单独处理付款与收款为同一账户的情况，避免重复锁住同一个 Mutex。

实践中可以先用简单的锁协议保证正确，再根据测量定位争用、逐步细化。锁的成本不仅来自等待，也包括加解锁、缓存一致性等开销；没有必要为了缩短几行临界区就引入更复杂的协议。

## 协调线程推进

### 条件变量：等待状态满足条件

拿到锁，只说明当前可以独占访问队列，并不意味着队列里已经有任务。如果消费者持锁等待队列非空，生产者反而无法入队。需要的是：条件不满足时释放锁并等待，状态变化后重新拿锁检查。

**条件变量**（condition variable）用于实现这套等待协议。它配合互斥锁使用：锁保护状态，`wait` **原子地释放锁并进入等待**，返回前重新获取锁。Rust 的类型名是 `Condvar`；C++ 的 `std::condition_variable` 则通过 `std::unique_lock` 管理等待前后的锁所有权[^7]。

这里用 C++ 展示完整的生产与退出流程，示例参考 Modern C++ 的条件变量一节[^8]：

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

两位生产者分别提交 0–4 和 100–104，总共十个任务；输出中的消费者编号和处理顺序可以不同，每个任务应恰好出现一次。每条日志使用一次 `printf` 完成：POSIX 保证单次 stdio 调用是线程安全的，而连续多个 `<<` 拼接对应多次调用，输出可能交错，掩盖队列行为。

读懂这段代码，关键是三个约束：

1. **条件存在于状态里。** `tasks` 和 `done` 都在同一把锁下检查、修改。通知不会累积为可供以后领取的事件；如果通知发生在等待之前，消费者仍能通过状态判断自己无需等待。避免丢失唤醒依赖两个前提配合：谓词在持有互斥锁时检查；修改谓词所依赖状态的线程（这里是生产者）也必须先拿同一把锁。假如状态不受这把锁保护，一次通知就可能落在“检查完条件”与“进入等待”之间，被永远错过；`wait` 原子地解锁并进入等待，正是在锁的保护下封住了这段窗口。
2. **唤醒后必须重新检查。** 线程可能虚假唤醒，也可能在重新获得锁之前被其他消费者取走任务。`while` 检查的是能否继续的谓词：队列非空，或者生产已经结束。C++ 的 `condition.wait(lock, predicate)` 在谓词为假时等待，本例的谓词是 `!tasks.empty() || done`。Rust 的 `Condvar::wait_while(guard, predicate)` 则在谓词为真时继续等待：若状态含有相同的 `tasks` 和 `done` 字段，闭包应检查 `state.tasks.is_empty() && !state.done`。两者表达同一等待协议时，谓词方向相反[^7]。
3. **结束不等于立即退出。** 主线程先等待全部生产者结束，再设置 `done` 并唤醒所有消费者。消费者只有在生产结束且队列已空时退出，才能处理完剩余任务，并让没有任务可取的线程也结束等待。

生产者先在锁下更新状态，再解锁通知，在这个协议中是合法的。通知让等待者有机会继续，不保证它立即运行，也不保证它获得锁时条件仍然成立。OSTEP 的条件变量章节用生产者-消费者问题详细分析了这些边界[^9]。

这里使用无界队列，生产者不会因为队列已满而等待；[容量限制与背压](/posts/message-passing-workers-backpressure/#背压与队列容量)是第五篇的主题。

:::note[Monitor：封装状态、互斥与条件等待]
上面的互斥锁与条件变量，是构造**管程**（monitor）的基础。monitor 把受保护的状态、操作入口和条件等待封装起来，让调用者通过约定的接口访问状态；上面的全局队列示例展示了组成机制，还没有做这层封装。Java 的 `synchronized` 方法或代码块获取对应对象的 monitor，`wait` 释放它并等待，返回前重新获取；只有遵守同一 monitor 协议的访问才受其保护，并非对象所有方法天然互斥[^10]。
:::

### Barrier：阶段之间的会合

条件变量等待的是“状态满足某个谓词”，**屏障**（Barrier）等待的是“约定数量的参与者都已到达”。它适合阶段同步：各线程完成本阶段的工作后会合，人数到齐，才允许通过同步点进入下一阶段[^11]。C++20 提供对应的 `std::barrier`，以及只需一次会合的 `std::latch`。

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
            barrier.wait();

            println!("worker {worker_id} starts phase 2");
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

这里应观察的不是固定输出顺序，而是：**三条 `finished phase 1` 全部出现以后，才会出现任何一条 `starts phase 2`。** 屏障不要求线程按编号到达，也不保证通过后同时获得 CPU。Rust 的 Barrier 可以重复使用，每轮仍需凑齐约定的到达次数；如果有参与者提前退出，其余线程就可能一直等下去[^11]。

屏障提供阶段会合，不提供逐次数据访问的互斥。是否还需要 Mutex、RwLock 或原子操作，取决于各阶段怎样划分数据、访问是否冲突，以及语言的线程安全与借用规则。不能认为“有屏障就能任意读写”，也不必推导成“跨阶段共享数据就一定要再加锁”。

## 减少共享可变状态

前面讨论怎样保护和协调共享状态。在选择工具之前，还可以先问：哪些数据根本不需要被多方修改？构造完成后不再变化的数据，在正确发布给其他线程后（什么叫“正确发布”，第三篇用[happens-before](/posts/atomics-memory-model/#跨线程同步与-happens-before)展开），可以让多个读者共享，而不必为内容的读取反复加锁。Java 官方教程把不可变对象作为简化并发程序的一种策略[^12]。

不可变性要覆盖对象可观察到的状态，而不只是字段名或引用本身。Java 的简单构造策略包括限制修改入口、使用 `private final` 字段、防止子类改变行为，以及对可变成员做防御性复制；仅仅给一个指向可变列表的字段加上 `final`，并不会让列表内容不可变[^12]。

Rust 的所有权与借用规则提供了另一种约束：普通共享引用限制修改，可变借用要求独占。`Cell<T>`、`RefCell<T>`、`Mutex<T>` 与原子类型都能提供内部可变性，允许通过共享引用修改内部状态。但内部可变性不等于跨线程共享安全：`Cell<T>`、`RefCell<T>` 不实现 `Sync`，而锁与原子类型为跨线程访问提供相应的同步协议。`Send`、`Sync` 约束值或引用能否安全地跨线程传递；这组约束的职责，第三篇的[Send / Sync](/posts/atomics-memory-model/#send--sync跨线程传递与共享)展开[^13]。

计数器、缓存、连接池仍需要变化。对这些状态，可以集中所有权，让其他任务通过消息请求更新，而不是共同修改；也可以让线程处理互不重叠的数据，最后汇总结果。[《并发编程（五）：消息传递、任务池与背压》](/posts/message-passing-workers-backpressure/)会沿着这个方向继续。

## 总结

- 保护状态与协调推进，是理解同步协议的两个角度。Mutex、RwLock、条件变量和屏障经常需要组合使用。
- Mutex 提供独占访问，RwLock 允许读与读并发、写必须独占。读多写少不保证读写锁更快，公平策略也取决于实现。
- 临界区应当短，但必须覆盖完整的不变量；拆散检查与更新，可能在没有数据竞争时仍然出错。
- 条件变量围绕受锁保护的状态工作：原子地释放锁并等待，返回前重新获取锁，再检查谓词。退出条件也是协议的一部分。
- Barrier 约束阶段推进，不替代各阶段的数据访问规则。减少共享可变状态，则能从设计上减少同步需求。

下一篇[《并发编程（三）：原子操作与内存模型》](/posts/atomics-memory-model/)讨论另一种访问机制：原子操作怎样保证单次操作不可分割，又怎样通过 Relaxed、Acquire/Release、SeqCst 约束可观察的顺序。本篇的等待协议也依赖锁建立的可见顺序：裸标志位为什么不够、锁为什么足够，下一篇用 happens-before 关系给出答案。原子操作不自动让多个步骤组成的协议正确，这与本篇“锁必须覆盖完整操作”的要求一脉相承。

## 延伸阅读

- [Berkeley CS162：Semaphores, Monitors, and Readers/Writers](https://cs162.org/static/lectures/9-1up.pdf)——用操作系统课程中的经典问题继续理解这些机制如何组合
- 不想在本机配置环境的话，Rust 代码可以放到 [Rust Playground](https://play.rust-lang.org) 运行，C++ 代码可以放到 [C++ Playground](https://programiz.pro/ide/cpp) 运行
- 本文没有覆盖定时等待：C++ 提供 `condition_variable::wait_for`/`wait_until` 与 `timed_mutex::try_lock_for`，Rust 提供 `Condvar::wait_timeout`。另一个不同的接口是 Rust 的 `Mutex::try_lock`：它立即返回加锁结果，不阻塞等待，也不接收超时参数；用法见各标准库文档

[^1]: [OSTEP ch31: Semaphores](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-sema.pdf)——§31.2–31.3 展示互斥与事件排序，§31.5 讨论读写锁、饥饿与额外开销

[^2]: [《Rust 程序设计语言》：共享状态并发](https://kaisery.github.io/trpl-zh-cn/ch16-03-shared-state.html)与[`Arc` 官方文档](https://doc.rust-lang.org/std/sync/struct.Arc.html)——计数器示例参考前者改写；后者说明共享所有权与内部数据线程安全的区别

[^3]: [Rust `std::sync::Mutex`](https://doc.rust-lang.org/std/sync/struct.Mutex.html)——guard 管理的独占访问、作用域结束时解锁与锁中毒

[^4]: [Rust `std::sync::RwLock`](https://doc.rust-lang.org/std/sync/struct.RwLock.html)——多读者或单写者语义，以及不保证固定优先策略的限制

[^5]: P. J. Courtois, F. Heymans, D. L. Parnas, [Concurrent Control with 'Readers' and 'Writers'](https://doi.org/10.1145/362759.362813), Communications of the ACM 14(10): 667–668, 1971——读者-写者问题及两类优先策略

[^6]: [OSTEP ch28: Locks](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks.pdf)——临界区的互斥执行，以及粗粒度与细粒度锁策略

[^7]: [C++ 标准草案：`condition_variable`](https://eel.is/c++draft/thread.condition.condvar)与[Rust `Condvar`](https://doc.rust-lang.org/std/sync/struct.Condvar.html)——原子解锁与等待、返回前重新加锁、虚假唤醒与谓词循环

[^8]: [Modern C++：7.4 条件变量](https://changkun.de/modern-cpp/zh-cn/07-thread/#7-4-条件变量)——C++ 生产者-消费者示例的参考资料

[^9]: [OSTEP ch30: Condition Variables](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-cv.pdf)——状态变量、错过通知的风险，以及生产者-消费者协议中重新检查条件的必要性

[^10]: [Java Language Specification §17.1–17.2](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)——monitor、同步方法与代码块，以及 wait 释放并重新获取 monitor 的语义

[^11]: [Rust `std::sync::Barrier`](https://doc.rust-lang.org/std/sync/struct.Barrier.html)——约定数量参与者的会合、重复使用及阶段同步示例

[^12]: [Java Tutorial: Immutable Objects](https://docs.oracle.com/javase/tutorial/essential/concurrency/immutable.html)与[构造不可变对象的策略](https://docs.oracle.com/javase/tutorial/essential/concurrency/imstrat.html)——不可变性的并发收益与一种简单构造策略

[^13]: [Rust `std::cell`](https://doc.rust-lang.org/std/cell/)与[`Sync`](https://doc.rust-lang.org/std/marker/trait.Sync.html)——内部可变性，以及跨线程共享引用的类型约束
