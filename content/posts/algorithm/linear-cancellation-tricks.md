---
title: "只出现一次的数字与多数元素：异或抵消与摩尔投票"
publishDate: "2026-12-17T12:00:00+08:00"
description: "合并解析 LeetCode 136 只出现一次的数字与 LeetCode 169 多数元素：对比异或自反律消去成对元素与 Boyer-Moore 摩尔投票对消不同元素，实现 O(n) 时间与 O(1) 空间。"
tags: ["algorithm", "tricks", "python", "cpp"]
---

Hot 100 中有两道要求 $O(n)$ 时间与 $O(1)$ 额外空间的经典技巧题：

- [LeetCode 136. 只出现一次的数字](https://leetcode.cn/problems/single-number/)：非空整数数组中除某个元素只出现一次外，其余每个元素均出现**两次**，找出那个只出现一次的元素（$1 \le n \le 3 \times 10^4$）；
- [LeetCode 169. 多数元素](https://leetcode.cn/problems/majority-element/)：给定大小为 $n$ 的数组，找出出现次数**严格大于 $\lfloor n / 2 \rfloor$** 的多数元素（题目保证多数元素总是存在，$1 \le n \le 5 \times 10^4$）。

下列实现均只读输入数组，不修改 `nums`。两题不用哈希表也能做到线性时间与常数空间，背后的共同核心是**代数对消**（cancellation）：让非目标元素两两配对抵消，最终留下的唯一幸存者就是答案。

| 方法 | 示例输入 | 配对 | 剩余 |
| --- | --- | --- | --- |
| 异或 | `4, 2, 4` | 两个 4 | 2 |
| 投票 | `2, 1, 2` | 2 和 1 | 2 |

异或里的两个值相同才能归零；投票用相异的一对抵消，多数值仍会留下。

## 原理一：异或交换律与自反律（LC 136）

按位异或（XOR，记作 $\oplus$）在整数按位运算上构成阿贝尔群，满足三条基本性质：

1. **归零律**：$a \oplus a = 0$；
2. **恒等律**：$a \oplus 0 = a$；
3. **交换律与结合律**：$a \oplus b \oplus a = (a \oplus a) \oplus b = 0 \oplus b = b$。

把数组里所有元素全部异或在一起，所有成对出现的元素无论位置是否相邻都会两两抵消为 $0$，唯一落单的元素与 $0$ 异或后保持不变。注意：一旦某元素出现**奇数次**（如 3 次）或有**两个**不同元素各出现一次，单次全局异或就不再足以直接分离答案（后者需借助异或结果的最低非零位将数组分成两组再分别异或）。

## 原理二：Boyer-Moore 摩尔投票算法（LC 169）

把多数元素看作“人数超过总人数一半的阵营”，其余所有非多数元素统称为“其他阵营”。维护当前擂主 `candidate` 与净胜票数 `count`，其**循环不变式**为：已扫描前缀可以被划分为若干组“互不相同的二元配对”（已完全抵消）加上 `count` 个值为 `candidate` 的剩余元素[^boyer-moore][^inria-mjrty]。

- 遇到与 `candidate` 相同的元素，`count += 1`；遇到不同元素，相当于与一个 `candidate` 配对抵消，`count -= 1`；
- 当 `count == 0` 时，前序所有元素均已两两配对消尽，下一个到达的元素成为新的 `candidate`；
- 由于多数元素的总数量 $M > n / 2$，即使每次配对都消耗掉 1 个多数元素，全部 $n - M$ 个非多数元素耗尽后，多数元素仍然至少剩 $2M - n \ge 1$ 个，因此**最终幸存的 `candidate` 必然是多数元素**。

**易错反例**（不保证存在多数元素时）：在 `[1, 2, 3]` 上，一趟投票结束后 `candidate = 3, count = 1`，但 `3` 并不是多数元素。因此只要题目不保证多数元素必存在，就必须在算法结束后增加第二趟线性扫描验证 `candidate` 的真实频次是否严格大于 $\lfloor n / 2 \rfloor$；本题契约保证必存在，故可省略验证趟。

## Python & C++：双题精简实现

```python
class Solution:
    def singleNumber(self, nums: list[int]) -> int:
        # XOR is associative and self-inverse (x ^ x == 0), cancelling all pairs.
        acc = 0
        for num in nums:
            acc ^= num
        return acc

    def majorityElement(self, nums: list[int]) -> int:
        # Invariant: prefix splits into cancelled unequal pairs plus `count` copies of `candidate`.
        candidate = 0
        count = 0
        for num in nums:
            if count == 0:
                candidate = num
            count += 1 if num == candidate else -1
        return candidate
```

```cpp
#include <vector>

class Solution {
public:
    // LeetCode 136: bitwise XOR cancellation over paired elements.
    int singleNumber(const std::vector<int>& nums) const {
        int acc = 0;
        for (int num : nums) {
            acc ^= num;
        }
        return acc;
    }

    // LeetCode 169: Boyer-Moore majority vote (assumes a strict majority exists).
    int majorityElement(const std::vector<int>& nums) const {
        int candidate = 0;
        int count = 0;
        for (int num : nums) {
            if (count == 0) {
                candidate = num;
            }
            count += (num == candidate) ? 1 : -1;
        }
        return candidate;
    }
};
```

## 复杂度、推广边界与关联阅读

- **时间复杂度**：两题均只做单趟线性扫描，时间复杂度为 $O(n)$。
- **辅助空间复杂度**：仅维护常数个标量变量，额外空间为 $O(1)$。

若推广到“其余元素出现 3 次”（LeetCode 137），可改为按 32 位逐位统计 `1` 出现次数并对 3 取模；若推广到“出现次数 $> \lfloor n / 3 \rfloor$ 的所有元素”（LeetCode 229），则把摩尔投票的擂主槽位扩充为 2 个，每次三个互不相同的元素一起抵消，并在末尾增加验证趟。

相比借助哈希表换取线性时间的[《两数之和：先查补数，再记下标》](/posts/algorithm/two-sum/)，以及借助下标值域映射把空间压到 $O(1)$ 的[《缺失的第一个正数：把正数放回对应下标》](/posts/algorithm/first-missing-positive/)与[《寻找重复数：下标映射与环入口》](/posts/algorithm/find-the-duplicate-number/)，本题展示了无需改写数组、纯粹依靠代数不变式实现 $O(1)$ 空间的另一条路径。

[^boyer-moore]: [R. S. Boyer & J. S. Moore (1991): _MJRTY — A Fast Majority Vote Algorithm_](https://www.cs.utexas.edu/~moore/best-ideas/mjrty/)——提出线性时间、常数空间的多数元素投票算法及正确性证明。

[^inria-mjrty]: [Inria Toccata Gallery: _Boyer-Moore Majority Vote Algorithm (MJRTY)_](https://toccata.gitlabpages.inria.fr/toccata/gallery/mjrty.en.html)——给出摩尔投票循环不变式与配对抵消性质的形式化验证。
