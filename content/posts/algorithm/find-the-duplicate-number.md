---
title: "寻找重复数：下标映射与环入口"
publishDate: "2026-12-20T12:00:00+08:00"
description: "LeetCode 287 寻找重复数：将长度为 n + 1、值域 [1, n] 的数组视为 i -> nums[i] 的有向函数图，直接复用环形链表 II 的 Floyd 快慢指针求环入口。"
tags: ["algorithm", "tricks", "python", "cpp"]
---

[LeetCode 287. 寻找重复数](https://leetcode.cn/problems/find-the-duplicate-number/)（Hot 100）给定一个包含 $n + 1$ 个整数的数组 `nums`，其数字都在 $[1, n]$ 范围内（包括 `1` 和 `n`）。题目保证数组中**只有一个重复的整数**（但可能重复出现多次，例如 `[2, 2, 2, 2, 2]`），要求在**不修改数组 `nums`**且仅使用常数级 $O(1)$ 额外空间的前提下找出这个重复数。题目保证 $1 \le n \le 10^5$。下列实现均只读输入数组。

## 从数组值域到隐式有向函数图

如果不允许修改原数组（排除了[《缺失的第一个正数：把正数放回对应下标》](/posts/algorithm/first-missing-positive/)的原地置换），也不允许使用 $O(n)$ 哈希集合，怎么在不排序的情况下用 $O(1)$ 空间定位重复值？

把下标 `i` 看作链表节点，把 `nums[i]` 看作它的 `next` 指针，定义一步转移函数 $f(i) = \text{nums}[i]$：

- 由于值域是 $[1, n]$，下标 `0` **永远不可能成为任何元素的指针目标**（没有节点的 `next` 指向 `0`），因此 `0` 一定是位于环外、入度为 0 的起点；
- 由于共有 $n + 1$ 个下标却只有 $n$ 个有效目标值，根据**鸽巢原理**（pigeonhole principle）[^pigeonhole]，从 `0` 出发不断迭代 $i \mapsto \text{nums}[i]$ 必然进入一个有向环；而环入口节点 `d` 至少同时被环外前驱与环内尾节点两条不同边指向，意味着存在两个不同下标 `a != b` 满足 `nums[a] == nums[b] == d`——`d` 正是唯一重复的数字。

于是问题与[《环形链表 II：快慢指针相遇后为什么能找到入口》](/posts/algorithm/linked-list-cycle-ii/)完全同构，可直接复用 Floyd 龟兔判圈算法[^knuth-floyd]：

1. **第一阶段（快慢追及）**：`slow = nums[0]`，`fast = nums[nums[0]]`（注意必须先各走一步再进入 `while slow != fast`，否则两者同在 `0` 会立刻结束循环），此后每次 `slow = nums[slow]`、`fast = nums[nums[fast]]`，直到在环内相遇；
2. **第二阶段（同速定位入口）**：将 `slow` 重置回起点 `0`，两指针每次各走 1 步（`slow = nums[slow]`、`fast = nums[fast]`），再次相遇的位置就是环入口——即唯一重复的数字 `d`。

## Python & C++：Floyd 判环入口复用

```python
class Solution:
    def findDuplicate(self, nums: list[int]) -> int:
        # Advance once before comparing because both pointers start at index 0.
        slow = nums[0]
        fast = nums[nums[0]]

        # Phase 1: tortoise (1 step) and hare (2 steps) meet inside the cycle.
        while slow != fast:
            slow = nums[slow]
            fast = nums[nums[fast]]

        # Phase 2: index 0 and the meeting point are equidistant (mod cycle length)
        # from the cycle entry, so equal-speed walks collide at the duplicate value.
        slow = 0
        while slow != fast:
            slow = nums[slow]
            fast = nums[fast]

        return slow
```

```cpp
#include <vector>

class Solution {
public:
    int findDuplicate(const std::vector<int>& nums) const {
        // Start after the first step from index 0 (which has in-degree 0 since values are in [1, n]).
        int slow = nums[0];
        int fast = nums[nums[0]];

        // Phase 1: detect cycle intersection inside the implicit functional graph.
        while (slow != fast) {
            slow = nums[slow];
            fast = nums[nums[fast]];
        }

        // Phase 2: reset slow to 0 and walk at speed 1 to meet at the cycle entry.
        slow = 0;
        while (slow != fast) {
            slow = nums[slow];
            fast = nums[fast];
        }

        return slow;
    }
};
```

## 复杂度分析与值域二分对照

- **时间复杂度**：快慢指针在环入口前直线段与环内所走步数均不超过 $O(n)$，总时间复杂度为 $O(n)$。
- **辅助空间复杂度**：只读输入数组并仅维护 `slow`、`fast` 两个整型索引，辅助空间为 $O(1)$。

本题还存在另一条满足“不改数组 + $O(1)$ 空间”的思路——**按值域 $[1, n]$ 二分查找**（统计数组中 $\le \text{mid}$ 的元素个数，若数量 $> \text{mid}$ 则重复数必在 $[1, \text{mid}]$ 内），时间复杂度为 $O(n \log n)$；而 Floyd 判环利用函数图同构直接把时间压到了严格线性 $O(n)$。

[^pigeonhole]: [Wikipedia：Pigeonhole principle](https://en.wikipedia.org/wiki/Pigeonhole_principle)——鸽巢原理：$n + 1$ 个下标映射到 $[1, n]$ 必存在重复目标值，从而在有限状态函数图中必然形成有向环。

[^knuth-floyd]: [arXiv:1901.01926（引用 Knuth _TAOCP_ Vol. 2, Section 3.1, Exercise 6）](https://arxiv.org/pdf/1901.01926)——记载 Robert W. Floyd 的龟兔快慢指针判圈算法及其环入口定位证明。
