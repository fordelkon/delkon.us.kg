---
title: "相交链表：把状态判定收进循环条件"
publishDate: "2026-10-22T10:00:00+08:00"
description: "LeetCode Hot 100 的相交链表，推导双指针换头的相遇条件，并修正循环中漏检 None 的终止时序。"
---

[LeetCode 160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/)（Hot 100）。给定两条无环单链表，返回它们的第一个公共节点；没有交点则返回 `None`。这里的“公共”指同一个节点对象，节点值相等并不算相交。

双指针解法的规则很短：`p` 从 A 出发，`q` 从 B 出发；每轮各走一步，遇到 `None` 就换到对方的头节点。**先检查两者是否为同一个对象，再推进指针**，相遇时返回该节点，也可能返回 `None`。

我初版的问题正出在检查时机：先换头、再判等，漏掉了两者同时为 `None` 的终止状态，最后只能靠计数兜底。

## 换头如何抵消长度差

设 A、B 在交点前分别有 `a`、`b` 个节点，公共尾部有 `c` 个节点。换头让两个指针都补走对方的独立部分：

```text
A: a nodes -> shared tail (c nodes) -> None
B: b nodes -> shared tail (c nodes) -> None
```

如果 `a = b`，两个指针不必换头，走 `a` 步就会在交点相遇。若 `a != b`，它们换头后到达交点所需的步数分别为：

- `p`：`a + c + 1 + b`；
- `q`：`b + c + 1 + a`。

两式相等。这里一步指执行一次指针赋值：从尾节点走到 `None` 已计入第一条链表的遍历，从 `None` 换到另一条链表的头还需额外一步，所以有 `+1`。长度差被抵消后，两者会在公共尾部的起点相遇。

若不相交，设两条链表长度分别为 `m`、`n`。两个指针各走完 A、B 并换头一次，都会在 `m + n + 1` 步后到达 `None`，也可能更早同时到达 `None`（例如两条链表等长）。因此，不需要单独给“无交点”设置计数上限。整体时间复杂度为 O(m + n)，额外空间为 O(1)。

## 漏掉 None 的原因是检查顺序

初版把换头放在判等之前。以两条互不相交、都只有一个节点的链表为例，一轮末尾两个指针同时变成 `None`；下一轮却先把它们换成不同的头节点，判等再也看不到刚才的 `None` 状态。

下面是从初版到修正版的改动。`ListNode` 和 `Optional` 沿用题目提供的定义：

```diff lang="python" title="相交链表：先判断，再推进"
  class Solution:
      def getIntersectionNode(self, headA: ListNode, headB: ListNode) -> Optional[ListNode]:
-         count = 0
-         lenA, lenB = 0, 0
-         incrementA, incrementB = 1, 1
-         ptrA, ptrB = headA, headB
-         while True:
-             if ptrA is None:
-                 ptrA = headB
-                 incrementA = 0
-             if ptrB is None:
-                 ptrB = headA
-                 incrementB = 0
-
-             if ptrA == ptrB:
-                 return ptrA
-
-             if count > lenA + lenB:
-                 return
-             ptrA = ptrA.next
-             ptrB = ptrB.next
-             lenA += incrementA
-             lenB += incrementB
-             count += 1
+         p, q = headA, headB
+         # Observe both positions before either pointer advances.
+         while p is not q:
+             p = headB if p is None else p.next
+             q = headA if q is None else q.next
+         return p
```

`is` 比较对象身份，直接表达“是否为同一个节点”，不依赖节点类如何定义 `==`[^identity]。相遇条件也覆盖 `None is None`，所以正常交点和无交点可以共用一个出口。

[^identity]: [Python 文档：比较运算](https://docs.python.org/3/library/stdtypes.html#comparisons)——区分对象身份比较 `is` 与可由类自定义的相等比较 `==`。

## 四个 if，各自承担什么职责

这次改动不只是把分支写短，而是重新分配了职责：

| 初版判断              | 职责              | 修正版的位置                 |
| --------------------- | ----------------- | ---------------------------- |
| `ptrA == ptrB`        | 判断是否结束      | 循环条件 `p is not q`        |
| `ptrA is None`        | 决定 p 下一步去哪 | p 的条件表达式               |
| `ptrB is None`        | 决定 q 下一步去哪 | q 的条件表达式               |
| `count > lenA + lenB` | 为无交点兜底终止  | 由同时到达 `None` 覆盖，删除 |

判空分支仍然存在，只是与“走向下一个节点”合并为一次赋值。每一轮只做一次转移，不会在换头后又立即向前走一步。判等则统一发生在下一轮开始前，看到的是两个指针都完成转移后的状态。

这也是重构时需要保留的语义：不能把原本“修复状态后再前进一步”的两个连续动作，直接替换成二选一的条件表达式。先确认每轮到底要推进几步，再决定如何改写控制流。

这道题适合提炼出的经验是：**把终止条件放在不会漏掉合法结束状态的位置**。这里用循环条件最直接；如果仍在 `while True` 的开头先判等、再推进，也能正确表达同一时序。可靠性来自检查顺序，而不是某一种语法本身。
