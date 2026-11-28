---
title: "并发编程（四）：死锁、活锁与并发程序的正确性"
description: "从不变量与线性化点分析原子性违规与完整操作正确性，讨论顺序违规、死锁、活锁、饥饿与优先级反转，并用模型断言检查并发协议。"
publishDate: "30 Sep 2026"
tags: ["concurrency", "synchronization", "rust"]
---

上一篇[《并发编程（三）：原子操作与内存模型》](/posts/concurrency/atomics-memory-model/)解释了原子性与跨线程同步。访问遵守内存模型，仍不代表程序的结果符合要求，也不代表任务最终能够完成。本篇从这两个问题出发，讨论竞态条件、死锁与其他无法推进的情形。

## 结果正确与任务推进

并发程序的正确性可以从两个角度检查：**安全性**（safety）要求不发生不允许的事情，例如余额被重复扣减；**活性**（liveness）要求期望发生的事情终将发生，例如等待锁的任务最终获得锁、提交的任务最终完成。程序可能没有数据竞争，却算错结果；也可能始终保持数据完整，却因死锁无法结束。用扣款服务来区分：余额非负是应用的状态不变量，扣款的调用及返回能否按顺序规格解释也是安全性问题；两种检查都不能代替“等待中的请求最终会不会完成”的活性检查[^1]。

第一篇已经[区分过数据竞争与竞态条件](/posts/concurrency/parallelism-execution-units/#数据竞争一个可以精确定义的问题)：

| 概念     | 关注的问题                           | 例子                                 |
| -------- | ------------------------------------ | ------------------------------------ |
| 竞态条件 | 不受约束的执行先后是否破坏程序要求   | 两个请求都通过余额检查，随后重复扣款 |
| 数据竞争 | 冲突的内存访问是否缺少规定的同步顺序 | 不同线程无同步地读写同一个普通变量   |

结果随调度不同而变化，不一定就是错误；多个消费者按不同顺序领取任务，可以完全符合要求。竞态条件关注的是其中是否存在违反要求的执行。本篇讨论的正是其中排除数据竞争的部分：所有访问都遵守同步协议，结果仍可能不合要求。

对于本文讨论的普通线程读写，如果两次**潜在并发**（缺乏 happens-before 顺序）的访问指向同一内存位置，且至少一方写入、至少一方非原子，就构成数据竞争。C++ 与 Rust 都将数据竞争视为未定义行为，不能把后果限定为读到旧值或少加几次[^2]。Go 同样要求排除数据竞争，但对竞争程序的行为另有约束，不能直接套用 C++ 的结论[^3]。

Rust 的安全接口通过所有权、借用与 [`Send` / `Sync` 等约束](/posts/concurrency/locks-condvars-shared-memory-sync/#send--sync跨线程传递与共享)排除数据竞争，前提是依赖的 `unsafe` 实现遵守安全契约。这些约束不会自动排除其他竞态条件和死锁。

## 原子性违规与顺序违规

Lu 等人分析了 MySQL、Apache、Mozilla 与 OpenOffice 的 105 个并发缺陷，其中 74 个不是死锁；在这些非死锁缺陷中，约 97% 属于原子性违规或顺序违规。这是特定项目与样本的研究结果，不能直接推广为所有并发程序的缺陷比例[^4]。

### 原子性违规：检查与更新被拆开

**原子性违规**（atomicity violation）指本应整体完成的一组访问被其他操作插入，破坏了预期的不变量——系统要求始终成立的状态性质，例如“余额不允许透支”。即使每次访问都单独加锁，也可能出现：

| 步骤 | 请求 A                            | 请求 B                            |
| ---- | --------------------------------- | --------------------------------- |
| 1    | 加锁检查余额 100，足够扣 80；解锁 |                                   |
| 2    |                                   | 加锁检查余额 100，足够扣 80；解锁 |
| 3    | 加锁扣除 80，余额变为 20；解锁    |                                   |
| 4    |                                   | 加锁扣除 80，余额变为 -60；解锁   |

这张表描述的是逻辑交错：所有余额访问都受同一把锁保护，没有数据竞争，但“不允许透支”的要求仍被破坏。修复需要让检查与扣款处于同一个临界区，而不是分别保证它们安全。第二篇强调的[“锁覆盖完整操作”](/posts/concurrency/locks-condvars-shared-memory-sync/#临界区范围与锁的粒度)，正是为了维护这类不变量。

### 线性化点：完整操作何时生效

**线性化**（linearizability）检查的是对象的**操作历史**（history）：按观察到的顺序记录每次调用（invocation）和对应的返回（response），包括参数与结果。要从中找出一个符合对象顺序规格的串行解释，并保留不重叠调用的实际先后：如果 A 已返回，B 才调用，解释中就必须是 A 在 B 之前。调用区间重叠时，调用顺序和返回顺序都不单独决定谁先生效；所选顺序仍要能解释实际返回值。操作在其调用与返回之间看起来生效的瞬间，称为**线性化点**（linearization point）[^1]。

仍从余额 100 出发，A、B 各调用一次 `withdraw(80)`。它的顺序规格是：余额足够就扣 80 并返回成功；否则不改余额并返回失败。下图区间的 `[` 表示调用，`]` 表示返回，`*` 表示选定的线性化点；从左到右只看事件先后，不比较间隔长短。

```text
A  [-------*-----------] ok
B      [-------*---] fail
```

两个调用重叠，B 先返回，但可以把 A 的线性化点放在 B 的前面：A 先扣到 20 并成功，B 随后因余额不足而失败。下面两个例子也各自从余额 100 开始，却都没有合法的顺序解释：

| 调用区间 | 观察到的事件（从左到右） | 为什么不能线性化？ |
| -------- | ------------------------ | ------------------ |
| 不重叠 | B 调用 → B 返回失败 → A 调用 → A 返回成功 | 返回值和上图相同，但 B 已返回才有 A 的调用，只能按 B、A 排；B 面对余额 100 必须成功。 |
| 重叠 | A 调用 → B 调用 → A 返回成功 → B 返回成功 | 两种排列都只有第一次能成功。分别加锁的检查与扣款可能产生这种历史。 |

例中每次调用都有返回；若历史截取时还有未返回的调用，可以在历史末尾为其中一些补上返回，再检查顺序是否合法，仍未完成的调用可从检查中略去。这不等于承诺它们最终会返回[^1]。

不同实现可以在不同位置建立这种解释：

| 实现 | 操作生效的依据 |
| ---- | -------------- |
| 原子计数器加一 | 单次 `fetch_add` 的读改写 |
| 锁保护的余额扣减 | 检查与修改处于同一临界区；成功调用可选取余额写入作为生效点，余额不足的调用可选取检查位置 |
| CAS 循环扣减 | 成功 CAS 才提交新余额；CAS 失败后必须用重新观察到的状态再判断和计算 |
| 两账户转账 | 所有读写方遵守两账户的锁协议，操作完成更新前不能暴露中间余额；不能把单独一次原子减法当成整笔转账的提交 |

用上一节的例子可以运行下面的单余额 CAS 版本。此处只有一个原子值，且余额不会增加；失败后用新观察值再次检查，两个各扣 80 的调用至多有一个成功。多账户转账还需共同维护两个余额，这段代码只覆盖单账户扣款。

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;

fn withdraw(balance: &AtomicU64, amount: u64) -> bool {
    // Relaxed suffices: this CAS retries from the latest observed balance and publishes no external state.
    let mut current = balance.load(Ordering::Relaxed);
    loop {
        let Some(next) = current.checked_sub(amount) else {
            return false;
        };
        match balance.compare_exchange_weak(current, next, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return true,
            Err(observed) => current = observed,
        }
    }
}

fn main() {
    let balance = AtomicU64::new(100);
    thread::scope(|scope| {
        let first = scope.spawn(|| withdraw(&balance, 80));
        let second = scope.spawn(|| withdraw(&balance, 80));
        // Exactly one of the two concurrent 80 withdrawals can succeed from balance 100.
        assert_ne!(first.join().unwrap(), second.join().unwrap());
    });
    assert_eq!(balance.load(Ordering::Relaxed), 20);
}
```

这里的线性化点用于说明外部可观察的业务语义，不要求整个函数由一条机器指令完成。容易混淆的还有另外两种一致性模型[^1]：

| 模型 | 作用范围 | 与墙上实时先后（不重叠调用）的关系 |
| ---- | -------- | ---------------------------------- |
| **线性化**（Linearizability） | 单个并发对象（可局部组合） | 必须保留不重叠调用的实际实时先后 |
| [顺序一致性](/posts/concurrency/atomics-memory-model/#seqcst-与顺序一致性)（Sequential Consistency） | 多对象全局历史 | 只要求保留同一线程内顺序，跨线程不重叠调用不必尊重实时先后 |
| **可串行化**（Serializability） | 跨多对象的事务集合 | 允许按任意等价串行顺序重排；叠加实时顺序约束才成为严格可串行化 |

`SeqCst` 约束原子访问的共同顺序，既不会自动为多个字段的组合操作建立线性化或事务边界，也不保证进展：一把锁保护的对象可以有清楚的操作语义，却仍因调用方的加锁顺序发生死锁。分析时应分别检查“完成的操作是否符合规格”和“操作能否完成”[^1]。

### 顺序违规：依赖尚未建立

**顺序违规**（order violation）指程序依赖“先完成 A，再执行 B”，却没有建立这个顺序。例如，创建工作线程的调用尚未返回，新线程就可能开始运行；如果线程入口去读取调用方稍后才赋值的句柄或配置，就可能早于初始化[^5]。

修复应围绕依赖本身：能提前构造的数据，在启动线程前准备好并传入；必须稍后完成的准备工作，可以用受锁保护的状态与[条件变量](/posts/concurrency/locks-condvars-shared-memory-sync/#条件变量等待状态满足条件)、[一次性初始化接口](/posts/concurrency/atomics-memory-model/#oncelock把认领与完成封装在一起)或消息通知。这些方案都需要建立第三篇所说的[同步边](/posts/concurrency/atomics-memory-model/#同步边不只来自原子操作)；通知只是协议的一环，等待方还必须正确检查完成状态。未同步的普通读写也可能同时构成数据竞争，不能只把它理解成合法交错下“偶尔读早了”。

## 死锁与加锁顺序

**死锁**（deadlock）指一组执行单元互相等待对方才能释放或提供的资源，因而无法继续推进。它可以只影响系统中的一部分线程，其他线程仍然运行[^5]。

第二篇提到的[同线程重复加锁](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)，也应从等待依赖理解：线程已经持有一把不可重入锁，又等待再次获得它，而释放第一次持锁的代码必须等第二次加锁返回后才能执行。如果接口在这里阻塞，就形成了对自身的等待。Rust 标准库不规定重复 `lock()` 的具体结果，只保证第二次调用不会正常返回，可能死锁或 panic；C++ `std::mutex` 的重复加锁则是未定义行为，不能把它当成可移植的死锁实验[^6]。

### 两把锁的循环等待

下面保留一份完整的错误示例。[屏障](/posts/concurrency/locks-condvars-shared-memory-sync/#barrier阶段之间的会合)让两个线程都拿到第一把锁后，再尝试第二把锁，从而稳定构造循环等待；运行后需要手动终止：

```rust
use std::sync::{Barrier, Mutex};
use std::thread;

fn main() {
    let a = Mutex::new(());
    let b = Mutex::new(());
    let gate = Barrier::new(2);

    thread::scope(|scope| {
        for (first, second) in [(&a, &b), (&b, &a)] {
            let gate = &gate;
            scope.spawn(move || {
                let _first = first.lock().unwrap();
                gate.wait(); // Both threads now hold their first lock.
                let _second = second.lock().unwrap();
            });
        }
    });
}
```

两个线程分别持有 A、B，又等待对方持有的锁。`thread::scope` 会等待作用域内的线程结束，因此也无法返回。这里用屏障固定执行关系；仅靠 `sleep` 扩大竞争窗口，不能保证每次复现。

下图是**资源分配图**（resource-allocation graph，RAG）：线程和资源是两类节点。请求边从线程指向它正在等的锁，分配边从锁指向当前持有者[^7]。

```mermaid mobile-direction="TB" title="两把独占锁的资源分配图" description="圆角节点是各只有一个实例的独占锁，矩形是线程。线程 1 请求锁 B，锁 B 分配给线程 2；线程 2 请求锁 A，锁 A 分配给线程 1。请求是虚线，分配是实线；没有外部解锁或取消路径，两个线程都在环中阻塞。"
flowchart LR
 first["线程 1"]
 second["线程 2"]
 a(["锁 A"])
 b(["锁 B"])
 first -.->|请求| b
 b -->|分配| second
 second -.->|请求| a
 a -->|分配| first
 class first,second actor
 class a,b resource
```

对这两把单实例锁，也可以只保留线程节点：把“线程 1 → 锁 B → 线程 2”缩成“线程 1 → 线程 2”，表示线程 1 必须等线程 2 释放锁 B。另一条路径同理，于是得到“线程 1 → 线程 2 → 线程 1”。这个只画“谁在等待谁”的图是**等待图**（wait-for graph，WFG）；边从等待者指向当前持有者，方向没有反转[^7]。

### 四个必要条件

对于这里的资源等待型死锁，Coffman 等人列出四个必须同时成立的条件[^7]：

1. **互斥**（mutual exclusion）：一个独占资源实例一次只能由一个执行单元持有。
2. **持有并等待**（hold-and-wait）：持有资源时继续等待其他资源。
3. **非抢占**（no preemption）：资源不能被外部强制收回，只能由持有者释放。
4. **循环等待**（circular wait）：存在一条等待环，每个参与者都在等待下一个参与者持有的资源。

**破坏任一必要条件，可以排除这类死锁；单独满足任何一条都不能确诊**。协议允许这些条件同时出现，也不等于当前已经死锁。对于上图，环足以确认死锁：每把锁只有一个实例，两个线程都在阻塞，必须先等到对方持有的锁才能继续并释放自己的锁，且不存在外部解锁或取消路径[^7]。

若一类资源有多个可互换实例，分配边从已分配的实例指向持有者，而请求针对资源类别。环外任务释放能满足请求的实例，就有可能解除等待，不能照搬单实例的压缩规则，也不能只凭资源分配图有环就确诊。要结合当前可用实例、尚未满足的请求，以及哪些任务可以完成并归还资源来判断[^7]。

### 固定加锁顺序

为锁规定一致的获取顺序，可以打破循环等待。如果两把锁总在相同位置静态可见，按约定先后获取即可；更常见的情况是对象作为参数由调用方动态传入，此时必须先做**同一对象短路检查**，再按唯一编号或指针地址确定全局顺序：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn transfer(from: &Arc<Mutex<i32>>, to: &Arc<Mutex<i32>>, amount: i32) {
    // Short-circuit self-transfers so we never try to acquire the same Mutex twice.
    if Arc::ptr_eq(from, to) {
        return;
    }

    // Order acquisition by stable object identity (pointer address), not transfer direction.
    if Arc::as_ptr(from).addr() < Arc::as_ptr(to).addr() {
        let mut src = from.lock().unwrap();
        let mut dst = to.lock().unwrap();
        *src -= amount;
        *dst += amount;
    } else {
        let mut dst = to.lock().unwrap();
        let mut src = from.lock().unwrap();
        *src -= amount;
        *dst += amount;
    }
}

fn main() {
    let a = Arc::new(Mutex::new(100));
    let b = Arc::new(Mutex::new(100));

    thread::scope(|scope| {
        scope.spawn(|| transfer(&a, &b, 30));
        scope.spawn(|| transfer(&b, &a, 50));
    });

    let balances = (*a.lock().unwrap(), *b.lock().unwrap());
    assert_eq!(balances, (120, 80));
    println!("{balances:?}");
}
```

这里按对象内存地址排序并只演示加锁顺序；如果对象存在稳定的业务主键，按唯一 ID 排序通常更易于跨日志排查，实际转账还需处理余额不足与溢出，锁中毒也按示例惯例用 `unwrap()` 简化。尤其不要漏掉 `Arc::ptr_eq(from, to)` 判等：一旦调用方传入同一个账户的两份引用，排序逻辑仍然会把两把锁排成同一个对象，导致同线程重复加锁死锁（或 panic）。

锁很多时，可以维护无环的获取偏序，不必让所有无关锁都参与同一个全序。关键是每条访问路径都遵守约定，而不是只有某个函数内部顺序一致[^5]。

### 其他预防与恢复策略

| 策略                     | 如何避免等待环                                     | 需要付出的代价                       |
| ------------------------ | -------------------------------------------------- | ------------------------------------ |
| 成组获取资源             | 由统一协议管理全部获取过程，避免持有部分资源再等待 | 需要提前知道资源集合，可能降低并发度 |
| 尝试获取，失败则释放重试 | 第二把锁不可用时释放第一把，不带着它阻塞等待       | 需要处理重试、活锁与饥饿             |
| 减少独占资源             | 划分所有权或采用经过证明的无锁算法                 | 需要重新证明状态与进展保证           |

在 C++17 中，标准库提供 `std::scoped_lock(m1, m2)`（底层沿用 `std::lock` 的死锁避免算法），在同一组动态锁上通过尝试加锁与回退释放避免循环等待；不过标准依然要求同一组参数不得重复传入同一个非递归互斥锁，否则仍属未定义行为[^8]。`try_lock` 本身不会修复死锁，关键是失败后释放已持有的锁再重试。在 Rust 中还要区分 `TryLockError::WouldBlock` 与 `Poisoned`：前者表示争用，后者需要错误处理，不能一概当成“稍后重试”[^9]。退避可以减少互相干扰，但固定延迟或随机延迟都不是每个线程最终成功的证明[^5]。

成组申请也必须是所有相关路径遵守的协议。只在部分调用方外面加一把“预防锁”，不能约束绕过它获取资源的线程。使用原子操作同样[不意味着整个算法无锁或无等待](/posts/concurrency/atomics-memory-model/#单次操作与组合操作)。

预防之外，还可以做**死锁避免**（deadlock avoidance）：根据当前分配与声明的最大资源需求，只批准保持安全状态的请求；银行家算法是这类方法的例子。也可以采用**检测与恢复**（detection and recovery），按资源模型确认死锁后，选择事务回滚或终止等恢复动作。它们都要求掌握相应资源信息，不能把任意线程杀掉再释放锁当成通用恢复办法[^5]。

## 活锁、饥饿与优先级反转

### 活锁与饥饿

**活锁**（livelock）中，参与者不断响应彼此、释放并重试，却没有完成有效工作。两个线程反复同时退让、同时重试，就可能出现这种情形。**指数退避加随机抖动**（exponential backoff with randomized jitter）通过拉长间隔与打破对称性降低碰撞概率，但仍不保证不再碰撞，也不保证每个线程最终成功[^5][^10]。

**饥饿**（starvation）中，某个任务长期得不到所需资源或执行机会，其他任务却仍有进展。例如 [读写锁](/posts/concurrency/locks-condvars-shared-memory-sync/#rwlock并发读与独占写)若一直允许新读者越过等待中的写者，读操作可以不断完成，写者却始终拿不到锁[^10][^11]。

在同类锁竞争中，先看参与者执行了哪些动作，再分别数任务的完成量：

| 情形 | 可观察的动作 | 谁没有进展？ |
| ---- | ------------ | ------------ |
| 死锁 | 两个线程各持一把锁，阻塞等对方解锁；双方都不能走到释放步骤。 | 环内的两个操作都无法完成。 |
| 活锁 | 双方不断 `try_lock`、释放、重试；持锁状态在变。 | 两个操作仍都不能完成。 |
| 饥饿 | 新读者不断拿到锁并完成读取；同一个写者始终等不到锁。 | 写者不推进，读者仍在推进。 |

整进程的 CPU 利用率不能区分三者：死锁的线程可能阻塞，也可能忙等；活锁带退避时未必占用很多 CPU；饥饿甚至可能与很高的总吞吐量同时出现。排查时，应观察同一批任务的等待关系、重试次数和完成数；一小段时间的停滞还不能证明不会恢复。

把前一篇的[非阻塞进展分级](/posts/concurrency/atomics-memory-model/#原子操作的进展保证)对应到这里：只有 **wait-free** 才能同时保证不会发生个体饥饿；**lock-free** 保证系统整体始终推进（排除全局死锁与全局活锁），但个别线程在 CAS 重试中仍可能长期**饥饿**；至于仅满足 **obstruction-free** 的算法，一旦多个线程持续互相干扰，连系统整体也可能陷入**活锁**。

公平排队可以避免某些反复插队，缩短临界区和限制竞争也可以减少等待，但 CPU 调度公平不等于锁获取公平，随机退避也不等于等待时间有上界。Rust 标准库的 `RwLock` 不承诺固定的优先策略；等待中的写者会不会阻止新读者，取决于底层实现[^11]。

### 优先级反转与优先级继承

**优先级反转**（priority inversion）发生在高优先级任务因资源依赖而等待低优先级任务时。例如，低优先级任务持锁，高优先级任务等锁；若无关的中优先级任务持续抢占持锁者，高优先级任务的等待还可能被无界地延长。这是**无界优先级反转**（unbounded priority inversion）的典型情形[^12]。1997 年火星探路者（Mars Pathfinder）着陆器的周期性系统复位事故，正是气象任务持有总线共享互斥锁时被中等优先级通信任务反复抢占，导致高优先级总线调度任务超时触发看门狗；工程团队最终远程开启底层实时操作系统的优先级继承开关才解决了该故障[^13]。

为缓解这种问题，**优先级继承协议**（Priority Inheritance Protocol, PIP）让持锁者临时获得等待者的较高优先级，以便尽快释放资源。Linux 内核提供了 `FUTEX_LOCK_PI` 与实时互斥锁（支持多级依赖的优先级传播），但在通用场景下维护等待链与调整调度优先级会带来额外系统调用与内核开销，因此普通的 `pthread_mutex_t`（默认未开启 `PTHREAD_PRIO_INHERIT`）与标准互斥锁接口通常不默认提供优先级继承[^12]。更严格的**优先级天花板协议**（Priority Ceiling Protocol, PCP）则会把资源关联到会使用它的最高优先级；需要注意的是，优先级继承只能缩短单锁等待时间，既不能完全消除多锁嵌套下的链式阻塞，也不能防止加锁成环导致的死锁[^12][^13]。

## 等待不只发生在锁上

等待的对象不限于锁，还可能是条件变量保护的状态、`join` 等待的任务完成，或通道对端的操作：两个任务若都先向对方接收的无缓冲通道阻塞发送，再执行接收，就会互相等待；两个线程若在完成前互相 `join` 对方的 `JoinHandle`，同样会卡死；如果固定容量的[任务池](/posts/concurrency/message-passing-workers-backpressure/#任务池复用执行单元)把所有工作线程都占满用来等待自己重新投递到同一个池中的子任务，即使队列无界，也会因为没有空闲执行单元消费子任务而发生**线程池自死锁**。分析这类协议仍应追踪等待依赖；只有把消息、容量或执行机会建模为资源并明确分配规则后，才能对应检查四个条件，不能直接把所有事件等待都当成锁的占有。

后续两篇会用到这个视角。第五篇的[背压](/posts/concurrency/message-passing-workers-backpressure/#背压与队列容量)限制积压，却也可能引入发送等待；退出与断连协议为等待提供终止路径，设计时应检查能否解除持有并等待或循环依赖，不能把容量有界当成等待时间有界。第六篇的[持锁跨 `.await` 的等待依赖](/posts/concurrency/async-concurrency-task-lifecycle/#持锁跨-await-的等待依赖)区分两种情况：持锁任务等待的操作又需要同一把锁，形成循环依赖；同步锁阻塞执行器线程，让负责解除等待的任务无法运行。仍需分别检查依赖与调度条件。

## 并发缺陷的排查

### 工具的检测边界与盲区

不同工具检查不同边界：

- **ThreadSanitizer**（TSan）在插桩程序的实际执行中检测数据竞争。它能发现已运行路径中的数据竞争，但测试通过不能证明所有未触发调度都安全；而且它对已经通过锁或 `SeqCst` 原子消除了数据竞争的**原子性违规**（例如下面拆成两次 `SeqCst` 访问的计数丢失）视而不见，也不能代替通道、条件变量与 `join` 等待环的通用死锁检测[^14]。
- **Miri** 是 Rust 的未定义行为解释器，能够在模型调度下检查数据竞争、悬垂指针、违反 **Stacked Borrows / Tree Borrows** 别名规则以及部分弱内存序重排。但它只能覆盖单次随机或限定调度，而且通常无法直接运行未内置模拟层的任意系统调用与外部 FFI 代码[^15]。
- **loom** 通过状态空间探索与**动态偏序缩减**（DPOR，可叠加 `preemption_bound` 限定抢占次数）遍历小型 Rust 并发模型的线程交错，配合断言检查结果与状态不变量。它会忽略 `std::sync` 原语与真实 I/O（仅探索改用 `loom::sync` 等替代类型编写的模型），且状态数仍会随线程数、步数和部分弱内存序组合指数增长，同样不能覆盖全部执行路径[^16]。
- **线程栈与等待关系**适合分析卡住的程序：先记录谁在等待哪种资源、资源现在由谁持有。符合[单实例锁的模型](#两把锁的循环等待)时，可以缩成只含线程的等待图并检查环；条件、消息或可互换资源则要保留各自解除等待的条件。只有“没有输出”还不足以区分死锁、慢操作与外部依赖不可用。

### 用 loom 断言检查操作交错

竞态条件同样可以通过模型断言暴露，前提是把业务要求写进检查。下面是一份使用 loom 替代类型的完整测试：两个线程各加一次，要求最终计数为 2；错误版本把读取与写回拆成两次原子操作[^16]。

这段代码是测试而非 `main` 程序。本地运行时，在 Cargo 项目的 `[dev-dependencies]` 中加入 `loom = "=0.7.2"`，保存为 `tests/counter.rs`，执行 `cargo test --test counter` 即可；直接使用 loom 类型不需要额外的 cfg 开关。错误版本预期在断言处失败，显示实际值 1、期望值 2，表示模型探索发现了丢失更新的执行。

```rust title="tests/counter.rs"
use loom::sync::atomic::{AtomicUsize, Ordering::SeqCst};
use loom::sync::Arc;
use loom::thread;

#[test]
fn two_increments_preserve_both_updates() {
    loom::model(|| {
        let count = Arc::new(AtomicUsize::new(0));
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let count = Arc::clone(&count);
                thread::spawn(move || {
                    // BUG: reading and writing in two separate atomic operations leaves an
                    // interleaving window where both threads observe 0 and overwrite to 1.
                    let value = count.load(SeqCst);
                    count.store(value + 1, SeqCst);
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }
        assert_eq!(count.load(SeqCst), 2);
    });
}
```

loom 可以探索到这样的交错：A 读到 0，B 也读到 0，A 写入 1，B 再写入 1；两个线程都结束后，断言看到的是 1。所有访问都使用 `SeqCst`，没有数据竞争，但两次访问之间仍能插入另一线程的操作。修复是把加一变成一次不可拆分的读—改—写：

```diff lang="rust"
                     // Keep the entire increment in one atomic operation.
-                    let value = count.load(SeqCst);
-                    count.store(value + 1, SeqCst);
+                    count.fetch_add(1, SeqCst);
```

将原测试中的两行替换为 `count.fetch_add(1, SeqCst);`，再运行同一条测试命令，预期通过。差异块展示替换关系，复制时只保留上下文与新增代码。

修复后，同一测试检查两个更新都被保留；`SeqCst` 无需改变，错误来自操作拆分。余额不能为负、任务不能重复领取、退出后不能继续提交，也都需要写成相应检查。工具无法替开发者决定哪些交错结果才算正确。

### 从模型断言到完整协议

上面的模型只验证两个更新不丢失。换成第五篇的[有界任务池](/posts/concurrency/message-passing-workers-backpressure/#任务池复用执行单元)和第六篇的[任务收束](/posts/concurrency/async-concurrency-task-lifecycle/#综合示例失败或超时后收束任务)，需要把结果要求与终止条件一起写进场景：

| 场景 | 要观察的性质 |
| ---- | ------------ |
| 正常处理 | 已接受任务各产生约定结果；不因完成顺序不同而误判失败 |
| 输入超过队列容量 | 等待或拒绝发生在约定入口；队列之外没有无限增长的提交任务 |
| 下游停止接收 | 发送方能观察断连或取消，负责等待它的任务也能结束 |
| worker 失败 | 错误传给所有者，剩余工作按约定继续、取消或退回，不依赖那个 worker 才能退出 |
| 请求超时 | 区分停止等待、请求取消与任务结束；外部副作用仍按业务协议确认 |
| 关停与提交交错 | 接纳边界清楚，已接受工作有归属，最终等待执行单元结束 |

下面用 loom 建模一个只有一个槽、只提交一次的邮箱。关停与入队并发，已接纳的值在关闭后仍可领取。保存为 `tests/mailbox.rs`，在同一 Cargo 项目运行 `cargo test --test mailbox`。状态和槽位由一把锁共同保护；测试分别检查关闭前接纳、关闭后拒绝两种顺序的约束，以及值只被领取一次[^16]。

```rust title="tests/mailbox.rs"
use loom::sync::{Arc, Mutex};
use loom::thread;

#[derive(Default)]
struct Mailbox {
    closed: bool,
    slot: Option<u8>,
}

fn submit(mailbox: &Mutex<Mailbox>, value: u8) -> bool {
    let mut state = mailbox.lock().unwrap();
    if state.closed || state.slot.is_some() {
        return false;
    }
    state.slot = Some(value);
    true
}

#[test]
fn close_preserves_accepted_work() {
    loom::model(|| {
        let mailbox = Arc::new(Mutex::new(Mailbox::default()));
        let input = Arc::clone(&mailbox);
        let sender = thread::spawn(move || submit(&input, 7));

        let mut state = mailbox.lock().unwrap();
        state.closed = true;
        let claimed = state.slot.take();
        // Release the lock before joining sender; otherwise join blocks while sender
        // may still be waiting to lock Mailbox.
        drop(state);

        assert_eq!(claimed, sender.join().unwrap().then_some(7));
        assert!(!submit(&mailbox, 8));
        assert!(mailbox.lock().unwrap().slot.take().is_none());
    });
}
```

这个模型让关停者在关闭时取走剩余值，省去了独立 worker 和通知。实际队列还需验证关闭与领取交错时，所有等待者都能被唤醒、已领取的任务也有明确归属。构造这些场景时，应控制关键事件，而不只重复运行正常程序。例如用屏障让两个线程都取得第一把锁，用通道确认 worker 已开始处理，再制造失败或下游断连；检查的是指定交错下的结果和退出路径。仅让测试进程等到超时，可以发现“未及时返回”，但不能单凭超时定位死锁，也不能把测试超时当作被测任务已经回收。

还要区分终态断言与过程不变量：最终结果数量正确，不足以证明没有重复执行、暂时超额接纳或遗留后台任务。对有容量与生命周期要求的组件，还需在入队、领取、完成、取消和退出等状态转换处检查相应约束。loom 适合探索经过建模的小协议；包含真实 I/O 的组件仍需针对真实接口做故障和退出验证，不能从一个模型测试推广为全部运行路径的证明[^16]。

## 总结

- 排除数据竞争只是基础，还需证明组合操作维护不变量、必要顺序已经建立；线性化点连接单次原子操作与完整操作的语义。
- 固定加锁顺序可以排除循环等待；try-lock 必须配合释放与重试，且仍需考虑活锁和饥饿。
- 死锁影响等待环中的参与者，不要求整个进程停止；活锁与饥饿也不能只根据 CPU 是否忙碌判断。
- 公平性与优先级继承取决于具体实现；检测工具与模型测试也都有各自的覆盖边界。

下一篇[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/)转向消息协作：减少直接共享以后，仍然需要管理任务积压、有限资源与退出协议。等待与进展并不会因为换用通道而消失——消息协作会以不同的方式面对同样的死锁、活锁与饥饿问题。

## 延伸阅读

- Paul E. McKenney, [Is Parallel Programming Hard, And, If So, What Can You Do About It?](https://mirrors.edge.kernel.org/pub/linux/kernel/people/paulmck/perfbook/perfbook.html)——进一步讨论并发数据结构设计、可扩展锁替代策略与形式化验证工具在工程中的权衡
- 标准库 Rust 示例可以放到 [Rust Playground](https://play.rust-lang.org) 运行；死锁示例会等待不返回，需要手动终止。loom 的本地测试入口见[并发缺陷的排查](#并发缺陷的排查)

[^1]: Maurice P. Herlihy & Jeannette M. Wing, [Linearizability: A Correctness Condition for Concurrent Objects](https://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf), ACM TOPLAS 12(3), 1990——调用和返回事件、未完成调用的处理、合法顺序历史与非重叠调用的先后约束，以及线性化、顺序一致性与可串行化的区别。

[^2]: [C++ 标准草案：Data races](https://eel.is/c++draft/intro.races)与[Rust Reference：未定义行为](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)——数据竞争的判定与未定义行为边界。

[^3]: [The Go Memory Model](https://go.dev/ref/mem)——Go 对数据竞争与竞争程序行为的规定。

[^4]: Shan Lu et al., [Learning from Mistakes: A Comprehensive Study on Real World Concurrency Bug Characteristics](https://www.cs.columbia.edu/~junfeng/10fa-e6998/papers/concurrency-bugs.pdf), ASPLOS 2008——四个开源项目中 105 个并发缺陷的样本、分类与比例。

[^5]: [OSTEP ch32: Common Concurrency Problems](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-bugs.pdf)——顺序违规示例、死锁四条件、加锁顺序、预防、避免与恢复。

[^6]: [Rust `Mutex::lock`](https://doc.rust-lang.org/std/sync/struct.Mutex.html#method.lock)与[C++ 标准草案：`mutex`](https://eel.is/c++draft/thread.mutex.class)——同线程重复加锁在 Rust 中不会正常返回，以及 C++ 非递归 mutex 的调用前提。

[^7]: E. G. Coffman Jr., M. J. Elphick, A. Shoshani, [System Deadlocks](https://uobdv.github.io/Design-Verification/Supplementary/System_Deadlocks-Four_necessary_and_sufficient_conditions_for_deadlock.pdf), ACM Computing Surveys 3(2), 1971——资源等待型死锁的必要条件；另见 [UIC 操作系统讲义 §§7.2.2、7.6.1–7.6.2](https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/7_Deadlocks.html)中的资源分配图、单实例等待图，以及多实例的检测规则。

[^8]: [C++ 标准草案 `[thread.lock.algorithm]`](https://eel.is/c++draft/thread.lock.algorithm)——`std::scoped_lock` 与 `std::lock` 的死锁避免获取语义及不得重复传入同一个非递归互斥锁的前提。

[^9]: [Rust `Mutex::try_lock`](https://doc.rust-lang.org/std/sync/struct.Mutex.html#method.try_lock)——非阻塞获取，以及争用与锁中毒两类错误。

[^10]: [Oracle Java Tutorial: Starvation and Livelock](https://docs.oracle.com/javase/tutorial/essential/concurrency/starvelive.html)——饥饿与活锁的定义及其区别。

[^11]: [Rust `std::sync::RwLock`](https://doc.rust-lang.org/std/sync/struct.RwLock.html)——读写优先策略由底层实现决定，接口不承诺等待中的写者是否阻止新读者。

[^12]: [Linux kernel: RT-mutex implementation design](https://docs.kernel.org/locking/rt-mutex-design.html#unbounded-priority-inversion)、[RT-mutex subsystem with PI support](https://docs.kernel.org/locking/rt-mutex.html)与 [`futex(2)`](https://man7.org/linux/man-pages/man2/futex.2.html)——无界优先级反转、优先级继承（`FUTEX_LOCK_PI`）、等待链传播与普通互斥锁不会免费附带的限制。

[^13]: Glenn E. Reeves, [What Really Happened on Mars?](https://www.cs.unc.edu/~anderson/teach/comp790/papers/mars_pathfinder_long_version.html)——1997 年火星探路者（Mars Pathfinder）因共享总线互斥锁优先级反转触发系统复位并远程启用优先级继承的故障复盘。

[^14]: [Clang: ThreadSanitizer](https://clang.llvm.org/docs/ThreadSanitizer.html)——插桩方式、数据竞争检测与工具限制。

[^15]: [Rust Miri](https://github.com/rust-lang/miri)——基于 MIR 解释器的未定义行为、借用栈模型与数据竞争检测及其 FFI/覆盖边界。

[^16]: [loom 0.7.2 文档](https://docs.rs/loom/0.7.2/loom/)——并发模型探索、DPOR 状态缩减与 `preemption_bound`，以及仅限 loom 同步原语和 Relaxed 内存序的覆盖限制。
