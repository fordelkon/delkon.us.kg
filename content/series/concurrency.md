---
tags: [concurrency]
order:
  - post/concurrency/parallelism-execution-units
  - post/concurrency/locks-condvars-shared-memory-sync
  - post/concurrency/atomics-memory-model
  - post/concurrency/deadlock-livelock-correctness
  - post/concurrency/message-passing-workers-backpressure
  - post/concurrency/async-concurrency-task-lifecycle
title: "并发编程系列"
description: "从执行与调度、共享状态与同步，到消息协作与任务生命周期，理解单机并发程序的正确性与资源边界。"
---

并发程序既要维护正确的状态，也要让任务能够推进并最终结束。本系列围绕这两个要求，从执行单元与调度出发，逐步讨论共享内存同步、内存模型、并发缺陷、消息协作与异步任务管理。

## 阅读路线

| 阶段 | 篇章 | 核心问题 |
| ---- | ---- | -------- |
| 执行与调度 | [① 并发、并行与执行单元](/posts/concurrency/parallelism-execution-units/) | 任务由谁推进？并发何时能转化为并行，调度与任务划分有什么代价？ |
| 共享状态 | [② 锁与条件变量](/posts/concurrency/locks-condvars-shared-memory-sync/) | 哪些步骤必须置于同一临界区？等待者怎样复查状态？ |
| 内存模型 | [③ 原子操作与内存模型](/posts/concurrency/atomics-memory-model/) | 单次操作何时不可分割？跨线程的可见顺序从哪里来？ |
| 正确性与进展 | [④ 并发程序的正确性](/posts/concurrency/deadlock-livelock-correctness/) | 对象的操作历史是否符合规格？调用能否最终完成？ |
| 通信与容量 | [⑤ 消息传递、任务池与背压](/posts/concurrency/message-passing-workers-backpressure/) | 任务何时被接纳、领取、完成？输入和结果分别在哪里积压？ |
| 异步生命周期 | [⑥ 异步并发与任务的生命周期](/posts/concurrency/async-concurrency-task-lifecycle/) | 谁负责轮询、唤醒和取消？由谁确认任务已退出？ |

阅读路线给出推荐顺序，下图则说明各篇会用到哪些概念。箭头从先介绍的概念指向使用它的篇章，不表示执行顺序，也不是必读门槛。

```mermaid mobile-direction="TB" title="并发编程系列的知识依赖" description="① 的执行模型是 ② 共享状态和 ⑤ 消息协作的共同起点。③ 解释 ② 的同步顺序，④ 用 ② 的访问协议分析操作历史和等待关系。⑥ 用到 ① 的调度模型与 ⑤ 的工作交付约定。消息协作不以原子内存序为先修。"
flowchart LR
 execution["① 执行与调度"] --> locks["② 共享状态"]
 locks --> memory["③ 内存模型"]
 locks --> correctness["④ 正确性"]
 execution --> messages["⑤ 消息协作"]
 execution --> lifecycle["⑥ 任务收束"]
 messages --> lifecycle
```

如果手头的问题是队列积压，可以从第一篇跳到第五篇，不必先掌握原子内存序。第三篇的[进阶补充](/posts/concurrency/atomics-memory-model/#进阶补充同步接口与规范边界)供规范回查，首次阅读可以先跳过。第六篇分为异步计算的运行机制与任务生命周期两部分，可分别阅读。

读图时先看图注：时序图通常只展示一次可能的交错；因果图里的箭头表示顺序约束，不代表经过了多久；等待图里的箭头则指向推进所依赖的资源或任务。篇首的动态概览也可以展开「查看全部静态图与步骤」，逐步对照正文。

示例以 Rust 为主，需要了解所有权、借用和闭包；C++ 与 Go 用于对照具体同步和取消语义。标准库示例可独立编译，局部片段与结构示意需结合上下文阅读。[Tokio 示例的依赖配置](/posts/concurrency/async-concurrency-task-lifecycle/#综合示例失败或超时后收束任务)和 [loom 模型的运行方式](/posts/concurrency/deadlock-livelock-correctness/#并发缺陷的排查)见对应章节。

本系列以单机并发为范围，重点建立访问协议、等待依赖、容量限制与任务收束的分析方法。并行性能的系统测量，以及无锁容器中的 ABA、线性化证明和内存回收，属于进一步展开的主题。
