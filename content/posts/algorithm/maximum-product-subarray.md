---
title: "乘积最大子数组：正负极值双状态追踪与滚动更新"
publishDate: "2026-11-04T16:00:00+08:00"
description: "LeetCode 152 乘积最大子数组：负数会交换乘积的大小关系，因此同时保存结尾最大值与最小值，说明旧状态的读取顺序和零值处理。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 152. 乘积最大子数组](https://leetcode.cn/problems/maximum-product-subarray/)要求在非空整数数组 `nums`（$1 \le \text{nums.length} \le 2 \times 10^4$，$-10 \le \text{nums}[i] \le 10$）中找出乘积最大的**连续非空子数组**，并返回该乘积。例如对于 `[2, 3, -2, 4]`，最大乘积子数组为 `[2, 3]`（乘积为 6）；对于 `[-2, 0, -1]`，最大乘积为 0。题目保证任意子数组的乘积均可容纳于 32 位有符号整数范围内。

## 单调性破坏与极值双状态模型

**最大子数组和**（Kadane's algorithm）只需保留结尾最大和，因为加上同一个数不会改变大小关系：若 $A\ge B$，则 $A+x\ge B+x$。乘法遇到负数时，大小关系却会反过来。

乘法需要分别考虑符号与零：

1. **符号反转与负负得正**（sign inversion）：若当前元素 $\text{nums}[i] < 0$，不等式方向发生颠倒。若此前以 $i - 1$ 结尾的乘积是一个绝对值极大的负数（即极小值），与当前的负数相乘后，负负得正反而跃升为极大的正数；相反，此前的极大正值乘上负数后会跌落为极小负值。如果只追踪最大值，就可能错过由最小负值延伸出的最大乘积；
2. **零点截断**（zero annihilation）：若遇到 $0$，任何延续自前序的乘积均被置零。子数组要么直接以当前元素单开起点，要么终结之前的连续段。

与[《和为 K 的子数组：先查前缀，再记录频次》](/posts/algorithm/subarray-sum-equals-k/)相比，连续子数组的加法前缀具有代数可逆性：区间和可以写成前缀差 $P_j-P_i=k$，因此存在负数时，仍可按前缀和频次查找起点。乘积遇到零时不能直接通过前缀相除还原区间；负数本身并不破坏非零数的可逆性。更关键的是，本题求最大乘积而非计数一个固定目标，不能直接照搬前缀差的频次查询。下面通过结尾极值状态处理这一目标。

## 双状态转移方程与交换技巧

以位置 $i$ 结尾的子数组，需要同时记录最大、最小乘积。这是动态规划的状态设计[^clrs-dp]；两个值分别保留正数和负数转移所需的候选：

- $dp_{\max}[i]$：以 $\text{nums}[i]$ 结尾的连续子数组的最大乘积；
- $dp_{\min}[i]$：以 $\text{nums}[i]$ 结尾的连续子数组的最小乘积。

到达位置 $i$ 时，子数组可以从当前元素开始，也可以延长此前任意一个结尾子数组。对于固定乘数，乘法保序、反序或把所有值变成零，因此求极值只需考虑以下三个候选：

1. 从当前元素 $\text{nums}[i]$ 重新作为连续子数组的起点；
2. 将当前元素拼接到以 $i - 1$ 结尾的最大乘积后，即 $dp_{\max}[i - 1] \times \text{nums}[i]$；
3. 将当前元素拼接到以 $i - 1$ 结尾的最小乘积后，即 $dp_{\min}[i - 1] \times \text{nums}[i]$。

转移方程为：

$$
\begin{aligned}
dp_{\max}[i] &= \max\Big(\text{nums}[i],\; dp_{\max}[i - 1] \times \text{nums}[i],\; dp_{\min}[i - 1] \times \text{nums}[i]\Big), \\
dp_{\min}[i] &= \min\Big(\text{nums}[i],\; dp_{\max}[i - 1] \times \text{nums}[i],\; dp_{\min}[i - 1] \times \text{nums}[i]\Big).
\end{aligned}
$$

**符号翻转与极值交换**（sign swap）：当 $\text{nums}[i] < 0$ 时，由于乘法负号会直接翻转两者的相对大小：

$$
dp_{\max}[i - 1] \times \text{nums}[i] \le dp_{\min}[i - 1] \times \text{nums}[i].
$$

实现时先把上一位置的最大、最小乘积分别放入临时变量 $a$、$b$；当当前值为负时交换 $a$、$b$，否则保持不变。更新可统一写成：

$$
\begin{aligned}
dp_{\max}[i] &= \max(\text{nums}[i],\; a \times \text{nums}[i]), \\
dp_{\min}[i] &= \min(\text{nums}[i],\; b \times \text{nums}[i]).
\end{aligned}
$$

全局答案是所有位置结尾最大值中的最大值：$ans = \max_{0 \le i < n} dp_{\max}[i]$。

## Python：三元组候选值直观实现

Python 实现先保存基于旧状态计算的三个候选值，再更新最大值和最小值，避免后一次更新读到新状态。用下标遍历避免 `nums[1:]` 产生线性大小的列表副本；实现不修改输入：

```python
class Solution:
    def maxProduct(self, nums: list[int]) -> int:
        # Base case: first element initializes the running extrema and global result.
        max_prod = nums[0]
        min_prod = nums[0]
        result = nums[0]

        for i in range(1, len(nums)):
            val = nums[i]
            # Loop invariant: max_prod and min_prod represent the maximum and minimum
            # products among all non-empty contiguous subarrays ending at index i - 1.
            candidates = (val, max_prod * val, min_prod * val)
            max_prod = max(candidates)
            min_prod = min(candidates)
            result = max(result, max_prod)

        return result
```

### 复杂度分析

- **时间复杂度**：设数组长度为 $n$。算法对输入进行一次单趟线性扫描，每一步执行常数次乘法与极值选取，时间复杂度为 $O(n)$。
- **空间复杂度**：仅使用 `max_prod`、`min_prod` 与 `result` 三个局部变量追踪极值，辅助空间为 $O(1)$。

## C++：局部三变量滚动与就地交换

在 C++ 中，利用标准库的交换与极值函数完成状态更新[^cpp-swap][^cpp-max][^cpp-min]，不分配辅助数组。所有乘法项对应某个真实子数组，题目对任意子数组乘积的范围保证使 32 位 `int` 运算安全：

```cpp
#include <algorithm>
#include <cstddef>
#include <utility>
#include <vector>

class Solution {
public:
    int maxProduct(const std::vector<int>& nums) {
        // Guaranteed non-empty by problem constraints (1 <= nums.size() <= 20000).
        int max_prod = nums[0];
        int min_prod = nums[0];
        int result = nums[0];

        for (std::size_t i = 1; i < nums.size(); ++i) {
            int val = nums[i];

            // Multiplying by a negative number inverts the order of extremes:
            // the old minimum becomes the candidate for maximum, and vice versa.
            // On entry, the extrema describe subarrays ending at i - 1.
            if (val < 0) {
                std::swap(max_prod, min_prod);
            }

            // Problem guarantees all subarray products fit within a 32-bit signed int.
            max_prod = std::max(val, max_prod * val);
            min_prod = std::min(val, min_prod * val);
            // Both extrema now describe subarrays ending at i.
            result = std::max(result, max_prod);
        }

        return result;
    }
};
```

遇到负数时，`std::swap` 让旧最小乘积成为新最大值的候选，旧最大乘积成为新最小值的候选。两次更新分别读取交换后的旧值，不会互相覆盖所需状态。遇到 `val == 0` 时，两个结尾乘积都变成 0；下一轮仍可选择从当前非零元素重新开始。

将 Kadane 算法与乘积最大子数组进行对照，能清晰看出状态维度与运算代数性质之间的映射关系：

| 维度对比         | 最大子数组和（Kadane 算法）                               | 乘积最大子数组                                                    |
| :--------------- | :-------------------------------------------------------- | :---------------------------------------------------------------- |
| **基础代数运算** | 加法（满足单调保序性 $A \ge B \implies A + x \ge B + x$） | 乘法（负数反转偏序、零点截断吸收）                                |
| **单步状态维度** | 单状态 $dp[i]$（仅需追踪历史最大和）                      | 双状态对 $(dp_{\max}[i], dp_{\min}[i])$（兼顾正向放大与负负得正） |
| **状态转移机制** | 延续历史或单开起点：$\max(x, dp + x)$                     | 延续最大、延续最小或单开起点；负数时互换极值角色                  |
| **复杂度开销**   | 时间 $O(n)$，空间 $O(1)$                                  | 时间 $O(n)$，空间 $O(1)$                                          |

[^clrs-dp]: [CLRS 4th ed. Chapter 14: Dynamic Programming](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——说明动态规划的最优子结构、状态不变量的设计方法与重叠子问题。

[^cpp-swap]: [cppreference：`std::swap`](https://en.cppreference.com/w/cpp/algorithm/swap.html)——说明交换两个对象的内容。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明返回两个参数中的较大值。

[^cpp-min]: [cppreference：`std::min`](https://en.cppreference.com/w/cpp/algorithm/min.html)——说明返回两个参数中的较小值。
