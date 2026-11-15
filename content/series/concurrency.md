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
| 共享状态与正确性 | [② 锁与条件变量](/posts/concurrency/locks-condvars-shared-memory-sync/)、[③ 原子操作与内存模型](/posts/concurrency/atomics-memory-model/)、[④ 并发程序的正确性](/posts/concurrency/deadlock-livelock-correctness/) | 怎样维护完整操作的不变量、建立可见顺序，并分析死锁与其他进展问题？ |
| 协作与生命周期 | [⑤ 消息传递、任务池与背压](/posts/concurrency/message-passing-workers-backpressure/)、[⑥ 异步并发与任务的生命周期](/posts/concurrency/async-concurrency-task-lifecycle/) | 怎样交付工作、限制积压，并在失败、取消或关停时明确结果和任务的归属？ |

六篇按上述依赖连续展开。第三篇的[进阶补充](/posts/concurrency/atomics-memory-model/#进阶补充同步接口与规范边界)供规范回查，首次阅读可以先跳过。第六篇分为异步计算的运行机制与任务生命周期两部分，可分别阅读。

示例以 Rust 为主，需要了解所有权、借用和闭包；C++ 与 Go 用于对照具体同步和取消语义。完整示例可在各语言的 Playground 中尝试，局部片段与结构示意需结合上下文阅读，loom 模型的运行方式在第四篇说明。

本系列以单机并发为范围，重点建立访问协议、等待依赖、容量限制与任务收束的分析方法。并行性能的系统测量，以及无锁容器中的 ABA、线性化证明和内存回收，属于进一步展开的主题。
