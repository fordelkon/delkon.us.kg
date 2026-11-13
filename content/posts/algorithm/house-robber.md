---
title: "打家劫舍：互斥状态机与双变量滚动轮转"
publishDate: "2026-11-04T14:00:00+08:00"
description: "LeetCode 198 打家劫舍：按选或不选当前房屋推导最大收益，用两个变量保存前驱状态，并解释空前缀如何统一边界。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 198. 打家劫舍](https://leetcode.cn/problems/house-robber/)给定一个非负整数数组 `nums`（$1 \le \text{nums.length} \le 100$，$0 \le \text{nums}[i] \le 400$），其中每个元素表示每间房屋中存放的现金金额。相邻房屋装有联动防盗系统，若在同一晚上闯入两间相邻房屋，系统将触发警报。问题契约要求在不惊动警察的前提下，计算今晚能够盗窃到的最高总金额；例如 `[2, 7, 9, 3, 1]` 中，最优方案是选择第 0、2、4 间房屋，获得最大收益 $2 + 9 + 1 = 12$。

与[《爬楼梯：状态转移矩阵与一维滚动变量》](/posts/algorithm/climbing-stairs/)对历史方案无权计数不同，本题按非负收益作“选或不选”的互斥决策，需要维护前驱状态的最大权值。

## 互斥约束与状态机推导

设房屋下标为 $0 \le i < n$。相邻房屋不能同时被选中的规则构成了硬性互斥约束。针对第 $i$ 间房屋，存在两种互斥决策：

1. **不抢劫第 $i$ 间房屋**：下标区间 $[0,i]$ 的最优收益，直接继承区间 $[0,i-1]$ 的最优收益；
2. **抢劫第 $i$ 间房屋**：受相邻互斥限制，第 $i - 1$ 间房屋绝不可被选中，因而收益上限等于下标区间 $[0,i-2]$ 的最优收益加上当前房屋的现金 $\text{nums}[i]$。

用两个状态记录当前房屋的取舍：令 $dp[i][0]$ 与 $dp[i][1]$ 分别表示处理完区间 $[0,i]$、且不选或选第 $i$ 间时的最大收益。初始化为 $dp[0][0]=0$、$dp[0][1]=\text{nums}[0]$，对 $i \ge 1$ 有：

$$
\begin{aligned}
dp[i][0] &= \max(dp[i - 1][0],\; dp[i - 1][1]), \\
dp[i][1] &= dp[i - 1][0] + \text{nums}[i].
\end{aligned}
$$

令一维状态 $dp[i]$ 表示区间 $[0,i]$ 的最大收益。因为不选当前房屋可取得 $dp[i-1]$，选当前房屋则可取得 $dp[i-2]+\text{nums}[i]$，由这两类互斥决策得到以下方程。它应用了**最优子结构**（optimal substructure）这一一般思想[^clrs-dp]：

$$
dp[i] = \max(dp[i - 1],\; dp[i - 2] + \text{nums}[i]), \qquad i \ge 2.
$$

该问题具有清晰的**无后效性**（no aftereffect）：在评估第 $i$ 间房屋的取舍时，我们仅需知晓下标区间 $[0,i-1]$ 与 $[0,i-2]$ 的最大收益，而无须回溯具体抢劫了哪些房屋。

与[《爬楼梯：状态转移矩阵与一维滚动变量》](/posts/algorithm/climbing-stairs/)相比，两者都只依赖前两个位置 $i-1$ 与 $i-2$ 的状态；但爬楼梯属于方案计数（加法原理：$dp[i] = dp[i-1] + dp[i-2]$），而打家劫舍属于带权最优化选择（极值原理：$dp[i] = \max(\dots)$）。

## 边界虚拟化与双变量滚动压缩

计算 $dp[i]$ 只需 $dp[i-1]$ 与 $dp[i-2]$，更早的历史值不再参与后续转移，可以只保留两个变量。

若显式开辟数组，需要分别初始化边界：$dp[0] = \text{nums}[0]$，$dp[1] = \max(\text{nums}[0], \text{nums}[1])$。但若引入虚拟前缀，令初始状态：

- `prev2 = 0`：对应尚未开始遍历时 $i - 2$ 处的收益基准（空区间收益约定为 0）；
- `prev1 = 0`：对应尚未开始遍历时 $i - 1$ 处的收益基准（空区间收益约定为 0）。

对于每个遍历到的值 $\text{val}$，新的最优值 $\text{curr} = \max(\text{prev1}, \text{prev2} + \text{val})$，随后执行双变量滚动：$\text{prev2} \leftarrow \text{prev1}, \text{prev1} \leftarrow \text{curr}$。这让 $n=1$ 和 $n=2$ 无需单独分支。处理下标 $i$ 前，两个变量分别代表区间 $[0,i-2]$ 与 $[0,i-1]$ 的最优收益，空区间收益约定为 0。

## Python：统一边界的滚动实现

Python 版本先计算右侧表达式，再更新两个变量，确保转移使用旧状态。实现只读取 `nums`：

```python
class Solution:
    def rob(self, nums: list[int]) -> int:
        prev2 = 0  # Max loot for prefix ending at i - 2 (dp[i-2], initially empty)
        prev1 = 0  # Max loot for prefix ending at i - 1 (dp[i-1], initially empty)

        for val in nums:
            # Loop invariant: before processing house with value val,
            # prev2 represents dp[i - 2] and prev1 represents dp[i - 1].
            prev2, prev1 = prev1, max(prev1, prev2 + val)

        return prev1
```

### 复杂度分析

- **时间复杂度**：设输入数组长度为 $n$。仅需一次单向线性遍历，循环体内仅包含单次加法与比较操作，时间复杂度严格为 $O(n)$。
- **空间复杂度**：仅使用两个标量整型变量 `prev2` 与 `prev1`，无需任何数组或哈希表分配，辅助空间严格为 $O(1)$。

## C++：双变量滚动实现

在 C++ 中，利用 `std::max` 驱动状态迭代[^cpp-max]。在题目约束 $n \le 100$ 且 $\text{nums}[i] \le 400$ 下，最大总金额不会超过 $100 \times 400 = 40\,000$，处于 32 位有符号整型安全范围内，无需额外的 64 位整型提升。

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int rob(const std::vector<int>& nums) {
        // Max loot for prefixes ending at i - 2 and i - 1 (virtualized base cases = 0).
        int prev2 = 0;
        int prev1 = 0;

        for (int val : nums) {
            // Loop invariant: prev2 == dp[i - 2] and prev1 == dp[i - 1].
            // Under constraints (n <= 100, nums[i] <= 400), max loot <= 40,000 (fits in int).
            int curr = std::max(prev1, prev2 + val);
            prev2 = prev1;
            prev1 = curr;
        }

        return prev1;
    }
};
```

该实现只读输入，时间为 $O(n)$，辅助空间为 $O(1)$。

若房屋首尾相连成环（打家劫舍 II），首尾不能同时选。除单间房屋需单独处理外，可以分别求“不选首间”的 $[1,n-1]$ 与“不选尾间”的 $[0,n-2]$，取两者最大值。若房屋组织为树（打家劫舍 III），则需按后序遍历，为每个节点分别求选与不选时的最大收益；此时状态不再只依赖线性序列的前两个位置。

[^clrs-dp]: [CLRS 4th ed. Chapter 14: Dynamic Programming](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——说明动态规划的最优子结构、状态转移方程的构建原则与空间优化方法。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明返回两个参数中的较大值，在等价情况下返回第一个参数的引用。
