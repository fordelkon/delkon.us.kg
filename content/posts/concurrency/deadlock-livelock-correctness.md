---
title: "并发编程（四）：死锁、活锁与并发程序的正确性"
description: "区分数据竞争与其他竞态条件，用原子性违规、顺序违规和死锁示例说明同步协议的边界，再讨论活锁、饥饿、优先级反转与排查工具。"
publishDate: "30 Sep 2026"
tags: ["concurrency", "synchronization", "rust"]
---

上一篇[《并发编程（三）：原子操作与内存模型》](/posts/concurrency/atomics-memory-model/)解释了原子性与跨线程同步。访问遵守内存模型，仍不代表程序的结果符合要求，也不代表任务最终能够完成。本篇从这两个问题出发，讨论竞态条件、死锁与其他无法推进的情形。

## 结果正确与任务推进

并发程序的正确性可以从两个角度检查：**安全性**（safety）要求不发生不允许的事情，例如余额被重复扣减；**活性**（liveness）要求期望发生的事情终将发生，例如等待锁的任务最终获得锁、提交的任务最终完成。程序可能没有数据竞争，却算错结果；也可能始终保持数据完整，却因死锁无法结束。本篇讨论的正确性就限定在这两个层面：数据竞争之外的安全性与任务的进展。

第一篇已经[区分过数据竞争与竞态条件](/posts/concurrency/parallelism-execution-units/#数据竞争一个可以精确定义的问题)：

| 概念     | 关注的问题                           | 例子                                 |
| -------- | ------------------------------------ | ------------------------------------ |
| 竞态条件 | 不受约束的执行先后是否破坏程序要求   | 两个请求都通过余额检查，随后重复扣款 |
| 数据竞争 | 冲突的内存访问是否缺少规定的同步顺序 | 不同线程无同步地读写同一个普通变量   |

结果随调度不同而变化，不一定就是错误；多个消费者按不同顺序领取任务，可以完全符合要求。竞态条件关注的是其中是否存在违反要求的执行。本篇讨论的正是其中排除数据竞争的部分：所有访问都遵守同步协议，结果仍可能不合要求。

对于这里讨论的普通线程读写，C++ 的数据竞争条件是：访问同一内存位置，至少一方写入、至少一方非原子，且彼此没有 happens-before 顺序。C++ 与 Rust 都将数据竞争视为未定义行为，不能把后果限定为读到旧值或少加几次[^1]。Go 同样要求排除数据竞争，但对竞争程序的行为另有约束，不能直接套用 C++ 的结论[^2]。

Rust 的安全接口通过所有权、借用与 [`Send` / `Sync` 等约束](/posts/concurrency/atomics-memory-model/#send--sync跨线程传递与共享)排除数据竞争，前提是依赖的 `unsafe` 实现遵守安全契约。这些约束不会自动排除其他竞态条件和死锁。

## 原子性违规与顺序违规

Lu 等人分析了 MySQL、Apache、Mozilla 与 OpenOffice 的 105 个并发缺陷，其中 74 个不是死锁；在这些非死锁缺陷中，约 97% 属于原子性违规或顺序违规。这是特定项目与样本的研究结果，不能直接推广为所有并发程序的缺陷比例[^3]。

### 原子性违规：检查与更新被拆开

**原子性违规**（atomicity violation）指本应整体完成的一组访问被其他操作插入，破坏了预期的不变量——系统要求始终成立的状态性质，例如“余额不允许透支”。即使每次访问都单独加锁，也可能出现：

| 步骤 | 请求 A                            | 请求 B                            |
| ---- | --------------------------------- | --------------------------------- |
| 1    | 加锁检查余额 100，足够扣 80；解锁 |                                   |
| 2    |                                   | 加锁检查余额 100，足够扣 80；解锁 |
| 3    | 加锁扣除 80，余额变为 20；解锁    |                                   |
| 4    |                                   | 加锁扣除 80，余额变为 -60；解锁   |

这张表描述的是逻辑交错：所有余额访问都受同一把锁保护，没有数据竞争，但“不允许透支”的要求仍被破坏。修复需要让检查与扣款处于同一个临界区，而不是分别保证它们安全。第二篇强调的[“锁覆盖完整操作”](/posts/concurrency/locks-condvars-shared-memory-sync/#临界区范围与锁的粒度)，正是为了维护这类不变量。

### 顺序违规：依赖尚未建立

**顺序违规**（order violation）指程序依赖“先完成 A，再执行 B”，却没有建立这个顺序。例如，创建工作线程的调用尚未返回，新线程就可能开始运行；如果线程入口去读取调用方稍后才赋值的句柄或配置，就可能早于初始化[^4]。

修复应围绕依赖本身：能提前构造的数据，在启动线程前准备好并传入；必须稍后完成的准备工作，可以用受锁保护的状态和条件变量、一次性初始化接口或消息通知。这些方案都需要建立第三篇所说的[同步边](/posts/concurrency/atomics-memory-model/#同步边不只来自原子操作)；通知只是协议的一环，等待方还必须正确检查完成状态。未同步的普通读写也可能同时构成数据竞争，不能只把它理解成合法交错下“偶尔读早了”。

## 死锁与加锁顺序

**死锁**（deadlock）指一组执行单元互相等待对方才能释放或提供的资源，因而无法继续推进。它可以只影响系统中的一部分线程，其他线程仍然运行[^4]。

第二篇提到的[同线程重复加锁](/posts/concurrency/locks-condvars-shared-memory-sync/#mutex独占访问)，也应从等待依赖理解：线程已经持有一把不可重入锁，又等待再次获得它，而释放第一次持锁的代码必须等第二次加锁返回后才能执行。如果接口在这里阻塞，就形成了对自身的等待。Rust 标准库不规定重复 `lock()` 的具体结果，只保证第二次调用不会正常返回，可能死锁或 panic；C++ `std::mutex` 的重复加锁则是未定义行为，不能把它当成可移植的死锁实验[^10]。

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

### 四个必要条件

对于这里的资源等待型死锁，通常检查四个必要条件[^4]：

1. **互斥**（mutual exclusion）：某些资源一次只能由一个执行单元占有。
2. **持有并等待**（hold-and-wait）：持有资源时继续等待其他资源。
3. **非抢占**（no preemption）：资源不能被外部强制收回，只能由持有者释放。
4. **循环等待**（circular wait）：存在一条等待环，每个参与者都在等待下一个参与者持有的资源。

**破坏任一必要条件，可以排除这类死锁。** 但不能把四条清单当成适用于任意资源模型的充分判据，也不能从存在等待环推出资源不可抢占。对于本篇两把独占锁的模型，每把锁只有一个实例，持有者不会被强制解锁；两个线程都已阻塞等待对方的锁，就能由等待环确认死锁。若一类资源有多个可互换实例，环外任务释放实例后可能解除等待，存在环本身还不足以证明死锁，需要结合可用实例、剩余需求与可完成序列判断[^11]。

### 固定加锁顺序

为锁规定一致的获取顺序，可以打破循环等待。下面两个转账方向相反，但始终先锁账户 A，再锁账户 B：

```rust
use std::sync::Mutex;
use std::thread;

fn main() {
    let a = Mutex::new(100_i32);
    let b = Mutex::new(100_i32);

    thread::scope(|scope| {
        for delta in [-30, 50] {
            let (a, b) = (&a, &b);
            scope.spawn(move || {
                // Lock order follows account identity, not transfer direction.
                let mut a = a.lock().unwrap();
                let mut b = b.lock().unwrap();
                *a += delta;
                *b -= delta;
            });
        }
    });

    let balances = (*a.lock().unwrap(), *b.lock().unwrap());
    assert_eq!(balances, (120, 80));
    println!("{balances:?}");
}
```

这里固定了两个账户和转账金额，只演示加锁顺序；实际转账还需处理余额不足、溢出与同一账户转给自身等业务约束。锁中毒处理也按示例惯例用 `unwrap()` 简化。

锁很多时，可以维护无环的获取偏序，不必让所有无关锁都参与同一个全序。关键是每条访问路径都遵守约定，而不是只有某个函数内部顺序一致[^4]。

### 其他预防与恢复策略

| 策略                     | 如何避免等待环                                     | 需要付出的代价                       |
| ------------------------ | -------------------------------------------------- | ------------------------------------ |
| 成组获取资源             | 由统一协议管理全部获取过程，避免持有部分资源再等待 | 需要提前知道资源集合，可能降低并发度 |
| 尝试获取，失败则释放重试 | 第二把锁不可用时释放第一把，不带着它阻塞等待       | 需要处理重试、活锁与饥饿             |
| 减少独占资源             | 划分所有权或采用经过证明的无锁算法                 | 需要重新证明状态与进展保证           |

`try_lock` 本身不会修复死锁，关键是失败后释放已持有的锁再重试。在 Rust 中还要区分 `TryLockError::WouldBlock` 与 `Poisoned`：前者表示争用，后者需要错误处理，不能一概当成“稍后重试”[^5]。退避可以减少互相干扰，但固定延迟或随机延迟都不是每个线程最终成功的证明[^4]。

成组申请也必须是所有相关路径遵守的协议。只在部分调用方外面加一把“预防锁”，不能约束绕过它获取资源的线程。使用原子操作同样[不意味着整个算法无锁或无等待](/posts/concurrency/atomics-memory-model/#单次操作与组合操作)。

预防之外，还可以做**死锁避免**（deadlock avoidance）：根据当前分配与声明的最大资源需求，只批准保持安全状态的请求；银行家算法是这类方法的例子。也可以采用**检测与恢复**（detection and recovery），发现等待环后选择事务回滚或终止等恢复动作。它们都要求掌握相应资源信息，不能把任意线程杀掉再释放锁当成通用恢复办法[^4]。

## 活锁、饥饿与优先级反转

### 活锁与饥饿

**活锁**（livelock）中，参与者不断响应彼此、释放并重试，却没有完成有效工作。两个线程反复同时退让、同时重试，就可能出现这种情形。随机退避通过打破对称性降低碰撞概率，但不保证不再碰撞，也不保证每个线程最终成功[^4][^6]。

**饥饿**（starvation）中，某个任务长期得不到所需资源或执行机会，其他任务却仍有进展。第二篇讨论的[持续进入的读者让写者无法获得锁](/posts/concurrency/locks-condvars-shared-memory-sync/#rwlock并发读与独占写)，就是典型的饥饿情形[^6]。

三种情形可以用同一组问题区分：参与者在等什么、CPU 是否忙碌、谁还有进展。

| 情形 | 相关参与者的状态                 | CPU 表现                           | 进展判据                         |
| ---- | -------------------------------- | ---------------------------------- | -------------------------------- |
| 死锁 | 等待环中的依赖无法解除           | 阻塞等待时通常很低；忙等也可能很高 | 环中参与者无法继续完成所等操作   |
| 活锁 | 持续响应、退让或重试             | 可能很高；带退避时也可能很低       | 相关参与者持续活动却没有实质进展 |
| 饥饿 | 某个任务持续得不到资源或调度机会 | 不能据此判断                       | 其他任务有进展，该任务却无法推进 |

公平排队、缩短临界区和限制竞争可以帮助改善等待，但公平性必须看具体接口的保证。CPU 调度公平不等于锁获取公平，随机选择也不等于等待时间有上界；Rust 标准库的 RwLock 就不承诺固定优先策略。

### 优先级反转与优先级继承

**优先级反转**（priority inversion）发生在高优先级任务因资源依赖而等待低优先级任务时。例如，低优先级任务持锁，高优先级任务等锁；若无关的中优先级任务持续抢占持锁者，高优先级任务的等待还可能被无界地延长。这是无界优先级反转的典型情形[^7]。

为缓解这种问题，**优先级继承**（priority inheritance）让持锁者临时获得等待者的较高优先级，以便尽快释放资源。Linux 的实时互斥锁文档还说明了多级依赖中的优先级传播；这类机制需要调度器与锁实现共同支持，普通互斥锁接口不能一概视为提供它[^7]。

## 等待不只发生在锁上

等待的对象不限于锁，还可能是条件变量保护的状态、`join` 等待的任务完成，或通道对端的操作。两个任务若都先向对方接收的无缓冲通道阻塞发送，再执行接收，就会互相等待，谁也无法走到接收步骤。分析这类协议仍应追踪等待依赖；只有把消息、容量或执行机会建模为资源并明确分配规则后，才能对应检查四个条件，不能直接把所有事件等待都当成锁的占有。

后续两篇会用到这个视角。第五篇的[背压](/posts/concurrency/message-passing-workers-backpressure/#背压与队列容量)限制积压，却也可能引入发送等待；退出与断连协议为等待提供终止路径，设计时应检查能否解除持有并等待或循环依赖，不能把容量有界当成等待时间有界。第六篇的[持锁跨 `.await` 的等待依赖](/posts/concurrency/async-concurrency-task-lifecycle/#持锁跨-await-的等待依赖)区分两种情况：持锁任务等待的操作又需要同一把锁，形成循环依赖；同步锁阻塞执行器线程，让负责解除等待的任务无法运行。仍需分别检查依赖与调度条件。

## 并发缺陷的排查

不同工具检查不同边界：

- **ThreadSanitizer** 在插桩程序的实际执行中检测数据竞争。它能发现已运行路径中的问题，测试通过不能证明所有路径安全，也不能把它当成通用死锁证明器[^8]。
- **loom** 用替代的同步类型探索小型 Rust 并发模型的执行，配合断言检查结果与状态不变量。它受模型规模、探索配置和支持的内存序行为限制，尤其不能声称覆盖所有 Relaxed 行为[^9]。
- **线程栈与等待关系**适合分析卡住的程序：把“谁持有什么、正在等谁”画成**等待图**（wait-for graph），就能检查是否形成环。只有“没有输出”还不足以区分死锁、慢操作与外部依赖不可用。

竞态条件同样可以通过模型断言暴露，前提是把业务要求写进检查：余额不能为负、任务不能重复领取、退出后不能继续提交。工具无法替开发者决定哪些交错结果才算正确。

## 总结

- 排除数据竞争只是基础，还需证明组合操作维护不变量、必要顺序已经建立。
- 固定加锁顺序可以排除循环等待；try-lock 必须配合释放与重试，且仍需考虑活锁和饥饿。
- 死锁影响等待环中的参与者，不要求整个进程停止；活锁与饥饿也不能只根据 CPU 是否忙碌判断。
- 公平性与优先级继承取决于具体实现；检测工具与模型测试也都有各自的覆盖边界。

下一篇[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/)转向消息协作：减少直接共享以后，仍然需要管理任务积压、有限资源与退出协议。等待与进展并不会因为换用通道而消失——消息协作会以不同的方式面对同样的死锁、活锁与饥饿问题。

## 延伸阅读

- [OSTEP: Concurrency Bugs](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-bugs.pdf)——结合原始案例继续理解并发缺陷的分类与预防
- 不想在本机配置环境的话，Rust 代码可以放到 [Rust Playground](https://play.rust-lang.org) 运行；死锁示例会等待不返回，需要手动终止

[^1]: [C++ 标准草案：Data races](https://eel.is/c++draft/intro.races)与[Rust Reference：未定义行为](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)——数据竞争的判定与未定义行为边界

[^2]: [The Go Memory Model](https://go.dev/ref/mem)——Go 对数据竞争与竞争程序行为的规定

[^3]: Shan Lu et al., [Learning from Mistakes: A Comprehensive Study on Real World Concurrency Bug Characteristics](https://www.cs.columbia.edu/~junfeng/10fa-e6998/papers/concurrency-bugs.pdf), ASPLOS 2008——四个开源项目中 105 个并发缺陷的样本、分类与比例

[^4]: [OSTEP ch32: Common Concurrency Problems](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-bugs.pdf)——顺序违规示例、死锁四条件、加锁顺序、预防、避免与恢复

[^5]: [Rust `Mutex::try_lock`](https://doc.rust-lang.org/std/sync/struct.Mutex.html#method.try_lock)——非阻塞获取，以及争用与锁中毒两类错误

[^6]: [Oracle Java Tutorial: Starvation and Livelock](https://docs.oracle.com/javase/tutorial/essential/concurrency/starvelive.html)——饥饿与活锁的定义及其区别

[^7]: [Linux kernel: RT-mutex implementation design](https://docs.kernel.org/locking/rt-mutex-design.html#unbounded-priority-inversion)与[RT-mutex subsystem with PI support](https://docs.kernel.org/locking/rt-mutex.html)——优先级反转与无界反转的区别，以及优先级继承、等待链传播与实时互斥锁支持

[^8]: [Clang: ThreadSanitizer](https://clang.llvm.org/docs/ThreadSanitizer.html)——插桩方式、数据竞争检测与工具限制

[^9]: [loom 文档](https://docs.rs/loom/latest/loom/)——并发模型探索、同步类型替换，以及规模与 Relaxed 内存序的覆盖限制

[^10]: [Rust `Mutex::lock`](https://doc.rust-lang.org/std/sync/struct.Mutex.html#method.lock)与[C++ 标准草案：`mutex`](https://eel.is/c++draft/thread.mutex.class)——同线程重复加锁在 Rust 中不会正常返回，以及 C++ 非递归 mutex 的调用前提

[^11]: E. G. Coffman Jr., M. J. Elphick, A. Shoshani, [System Deadlocks](https://uobdv.github.io/Design-Verification/Supplementary/System_Deadlocks-Four_necessary_and_sufficient_conditions_for_deadlock.pdf), ACM Computing Surveys 3(2), 1971——死锁必要条件，以及单实例与多实例资源模型中环判据的不同边界
