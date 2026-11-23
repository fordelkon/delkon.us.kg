---
title: "跳跃游戏 I 与 II：最远可达边界与按跳分层"
publishDate: "2026-12-12T12:00:00+08:00"
description: "合并解析 LeetCode 55 跳跃游戏与 LeetCode 45 跳跃游戏 II：以线性维护最远可达下标为核心不变式，推导可达性提前终止判定，以及按当前跳边界分层的最少跳跃次数。"
tags: ["algorithm", "greedy", "python", "cpp"]
---

Hot 100 中两道跳跃游戏共用同一套数组模型——给定非负整数数组 `nums`（$1 \le n \le 10^4$），站在下标 `0`，在位置 `i` 最多可以向右跳跃 `nums[i]` 步：

- [LeetCode 55. 跳跃游戏](https://leetcode.cn/problems/jump-game/)：判断能否到达最后一个下标 $n - 1$；
- [LeetCode 45. 跳跃游戏 II](https://leetcode.cn/problems/jump-game-ii/)：题目保证一定能到达 $n - 1$，要求返回到达 $n - 1$ 的**最小跳跃次数**（当 $n = 1$ 时已在终点，返回 `0`）。

下列实现均只读输入数组，不修改 `nums`。如果把每个下标看作图节点、从 `i` 向 `[i + 1, i + nums[i]]` 连边，两题分别对应“图可达性”和“无权图最短路径”（BFS）。但因为边覆盖的是**连续区间**，只需维护区间右端点，就能把图遍历压缩成 $O(n)$ 时间、$O(1)$ 空间的贪心扫描。

## 从可达边界到按跳分层

以 `[2, 3, 1, 1, 4]` 为例。每一层是用当前跳数首次抵达的一批下标：

<div class="algorithm-table">

| 已跳次数 | 本层新增下标 | 覆盖右界 |
| --- | --- | ---: |
| 0 | 0 | 0 |
| 1 | 1、2 | 2 |
| 2 | 3、4 | 4 |

</div>

在第 1 层，下标 1 可再向右跳 3 格，下标 2 只能再跳 1 格。两者给出的右界分别为 4 和 3，下一层取最远的 4。

- **跳跃游戏**（LC 55）：从左到右维护当前能到达的最远下标 `farthest`。访问位置 `i` 之前，先检查 `if i > farthest: return False`（说明此前所有位置都跨不过 `i`，后面的位置更不可能到达）；否则用 `i + nums[i]` 刷新 `farthest`，一旦 `farthest >= n - 1` 立即提前返回 `True`。
- **跳跃游戏 II**（LC 45）：把隐式 BFS 的“一层”对应成“第 $k$ 跳能覆盖的区间”。`current_end` 是当前跳的最远右边界，在到达 `current_end` 之前的所有位置都在同一跳数内，只需贪心记录它们能撑开的最大下一跳边界 `farthest`。一旦遍历到 `i == current_end`，就必须增加一次跳跃并令 `current_end = farthest`[^clrs-greedy]。
  - **易错反例 1**（贪心选单步最大跳幅）：对 `[2, 3, 1, 1, 4]`，若从下标 `0` 贪心直接跳满 2 步到下标 `2`（值 `1`），总计需要 3 跳；而按“最远可达边界 `i + nums[i]`”选择，下标 `1` 能到达 `1 + 3 = 4`，只需 2 跳。
  - **易错反例 2**（循环扫到 `n - 1`）：对 `[2, 0, 0]`，在 `i = 0` 时 `current_end` 已跳到 `2 == n - 1`，若循环继续访问 `i = 2 == current_end`，会多计一次无效跳跃。循环上界严格设为 `n - 2` 即可保证到达终点时不额外起跳。

## Python & C++：统一边界扫描实现

```python
class Solution:
    def canJump(self, nums: list[int]) -> bool:
        farthest = 0
        last = len(nums) - 1
        for i, step in enumerate(nums):
            # If index i lies beyond the reachable prefix [0..farthest], no later index is reachable.
            if i > farthest:
                return False
            if i + step > farthest:
                farthest = i + step
            if farthest >= last:
                return True
        return True

    def jump(self, nums: list[int]) -> int:
        jumps = 0
        current_end = 0
        farthest = 0
        # Stop at len(nums) - 2: standing on the last index requires no extra jump.
        for i in range(len(nums) - 1):
            if i + nums[i] > farthest:
                farthest = i + nums[i]
            # Exhausted all start positions within the current jump layer; advance to the next layer.
            if i == current_end:
                jumps += 1
                current_end = farthest
                if current_end >= len(nums) - 1:
                    break
        return jumps
```

C++ 版本通过 `std::max` 更新可达右边界[^cpp-max]：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    // LeetCode 55: reachability via prefix maximum reachable index.
    bool canJump(const std::vector<int>& nums) const {
        int farthest = 0;
        const int last = static_cast<int>(nums.size()) - 1;
        for (int i = 0; i <= last; ++i) {
            // Invariant: [0..farthest] is the exact reachable prefix from positions < i.
            if (i > farthest) {
                return false;
            }
            farthest = std::max(farthest, i + nums[i]);
            if (farthest >= last) {
                return true;
            }
        }
        return true;
    }

    // LeetCode 45: minimum jumps by treating each jump's reachable span as one BFS layer.
    int jump(const std::vector<int>& nums) const {
        const int n = static_cast<int>(nums.size());
        int jumps = 0;
        int current_end = 0;
        int farthest = 0;

        // Exclude index n - 1 so arriving at the last slot never triggers an extra jump.
        for (int i = 0; i < n - 1; ++i) {
            farthest = std::max(farthest, i + nums[i]);
            if (i == current_end) {
                ++jumps;
                current_end = farthest;
                if (current_end >= n - 1) {
                    break;
                }
            }
        }
        return jumps;
    }
};
```

## 复杂度分析与区间覆盖视角

- **时间复杂度**：两题均只执行一次线性扫描，时间复杂度为 $O(n)$。
- **辅助空间复杂度**：只读输入数组并维护常数个边界变量，辅助空间为 $O(1)$。

从本质上看，LC 45 等价于用最少的闭区间 `[i, i + nums[i]]` 覆盖 `[0, n - 1]`，与[《合并区间：排序后维护右边界》](/posts/algorithm/merge-intervals/)和[《划分字母区间：在最远末次下标切分》](/posts/algorithm/partition-labels/)共享“追踪活跃区间右边界”的扫描线思维；而按跳分层推进的几何意义，则是[《腐烂的橘子：多源 BFS 与按层计时》](/posts/algorithm/rotting-oranges/)这类无权图按层 BFS 在一维连续区间上的退化特例。

[^clrs-greedy]: [_Introduction to Algorithms_ (4th ed., Chapter 15: Greedy Algorithms)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 15 章讨论贪心选择性质与交换论证：每步选择能将覆盖右边界推得最远的局部区间，可归纳证明得到全局最少步数。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——常数时间维护当前层及下一层的最远可达右边界。
