---
title: "最大子数组和：Kadane 递推与分治合并"
publishDate: "2026-12-21T12:00:00+08:00"
description: "LeetCode 53 最大子数组和：推导以位置结尾的 Kadane 线性递推与全负数组边界，并拓展到分治线段树式四元组状态合并，同时串联乘积最大子数组与股票买卖。"
tags: ["algorithm", "matrix", "dynamic-programming", "python", "cpp"]
---

[LeetCode 53. 最大子数组和](https://leetcode.cn/problems/maximum-subarray/)（Hot 100）给定整数数组 `nums`，要求找出一个具有最大和的**非空连续子数组**，返回其最大和。题目保证 $1 \le n \le 10^5$，元素范围在 $[-10^4, 10^4]$ 之间；所有中间和的绝对值不超过 $10^9$，不会超出 32 位有符号整数表示范围。下列实现均只读输入数组，不修改原数据。

## Kadane 算法：前缀拖累就舍弃

暴力枚举所有起止区间需要 $O(n^2)$ 时间。定义状态 `curr` 表示**以当前下标 `i` 结尾**的非空连续子数组最大和。推进到 `nums[i]` 时，前驱状态只有两种合法延续：要么接在前一段之后（`curr + nums[i]`），要么舍弃前面所有元素、从 `nums[i]` 独自重开一段（`nums[i]`）：

$$
\text{curr}_i = \max(\text{nums}[i],\ \text{curr}_{i - 1} + \text{nums}[i]).
$$

这一线性扫描由 Jay Kadane 提出、经 Jon Bentley 在 *Programming Pearls* 中推广[^bentley-kadane]：

```mermaid title="原数组元素与 Kadane 局部最大和走势" description="柱状为原数组 nums = [-2, 3, -1, 2, -5]，折线为以 i 结尾的最大子数组和 curr = [-2, 3, 2, 4, -1]，下标 1 从 3 重新开始，下标 3 达到峰值 4；最后一格的结尾和降到 -1，全局最大和仍为 4。"
xychart-beta
    title "原数组（柱）与 Kadane 局部最大和（线）"
    x-axis [0, 1, 2, 3, 4]
    y-axis "数值 / 最大和" -5 --> 5
    bar [-2, 3, -1, 2, -5]
    line [-2, 3, 2, 4, -1]
```

下面按位置对齐输入、以该位置结尾的最大和，以及扫描到该位置时的全局最大和：

<div class="algorithm-table">

| 位置 | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 输入 | −2 | 3 | −1 | 2 | −5 |
| 结尾最大和 | −2 | 3 | 2 | **4** | −1 |
| 全局最大和 | −2 | 3 | 3 | 4 | **4** |

</div>

到下标 1 时，前一段和为负，直接从 3 开始。下标 4 的结尾和降到 −1，但结果仍是下标 1 至 3 的和 4。

**易错反例（全负数组与零初始化）**：题目要求子数组**非空**。若把 `curr` 或 `best` 初始化为 `0`，在全负数组 `[-3, -2, -5]` 上会错误返回 `0`（对应空子数组），而正确答案是最大的单个元素 `-2`。将两者都初始化为 `nums[0]` 并从下标 `1` 开始迭代，即可同时维护“非空”契约与循环不变式：`curr` 始终等于以 `i` 结尾的最大非空子数组和，`best` 始终等于 `nums[0..i]` 内的全局最大非空子数组和。

本题正是[《乘积最大子数组：正负极值双状态追踪与滚动更新》](/posts/algorithm/maximum-product-subarray/)的加法简化版——加法满足单调保序性，不需要像乘法那样同时追踪最小值以防负负得正；若将相邻元素差记为 $d_k = \text{prices}[k] - \text{prices}[k - 1]$，本题又与[《买卖股票的最佳时机：先算卖出利润，再更新最低价》](/posts/algorithm/best-time-to-buy-and-sell-stock/)在允许空区间（不交易利润为 0）时严格等价[^clrs-max-subarray]。

## Python & C++：单趟线性滚动

```python
class Solution:
    def maxSubArray(self, nums: list[int]) -> int:
        # Initialize with nums[0] to uphold the non-empty subarray contract
        # even when every element in nums is negative.
        curr = nums[0]
        best = nums[0]

        for i in range(1, len(nums)):
            # Invariant: curr is the max sum of a non-empty subarray ending at i - 1;
            # discard it whenever it contributes non-positive gain.
            num = nums[i]
            curr = curr + num if curr > 0 else num
            if curr > best:
                best = curr

        return best
```

在 C++ 中以 `const` 引用只读遍历，并使用 `std::max` 表达状态转移[^cpp-max]：

```cpp
#include <algorithm>
#include <cstddef>
#include <vector>

class Solution {
public:
    int maxSubArray(const std::vector<int>& nums) const {
        // Both accumulators start at nums[0] so all-negative inputs return the
        // largest single element rather than 0.
        int curr = nums[0];
        int best = nums[0];

        for (std::size_t i = 1; i < nums.size(); ++i) {
            // Extend the previous subarray only when it adds positive value.
            curr = std::max(nums[i], curr + nums[i]);
            best = std::max(best, curr);
        }

        return best;
    }
};
```

### 复杂度分析

- **时间复杂度**：单趟线性扫描 $n$ 个元素，时间复杂度为 $O(n)$。
- **辅助空间复杂度**：仅维护 `curr` 与 `best` 两个标量变量，额外空间为 $O(1)$。

## 拓展思考：分治四元组与动态区间查询

如果只需要对静态数组求一次全局答案，Kadane 算法已达到时间 $O(n)$ 与空间 $O(1)$ 的下界；若题目要求分治求解或需要支持**单点修改 + 任意区间最大子数组和查询**，则可以把区间 `[l, r]` 拆为左右两半 `L` 与 `R`，为每个区间维护四个量实现 $O(1)$ 合并[^daescu-dc]：

1. `iSum`：区间总和（`L.iSum + R.iSum`）；
2. `lSum`：以左端点为起点的最大非空前缀和（`max(L.lSum, L.iSum + R.lSum)`）；
3. `rSum`：以右端点为终点的最大非空后缀和（`max(R.rSum, R.iSum + L.rSum)`）；
4. `mSum`：区间内的最大非空连续子数组和（`max(L.mSum, R.mSum, L.rSum + R.lSum)`）。

由于每次合并为 $O(1)$，递归式满足 $T(n) = 2T(n/2) + O(1)$，分治单次求解耗时仍为 $O(n)$（优于朴素扫描跨中点区间的 $O(n \log n)$），递归调用栈深度为 $O(\log n)$；配合线段树持久化各节点四元组后，单次任意区间查询可降至 $O(\log n)$。与[《和为 K 的子数组：先查前缀，再记录频次》](/posts/algorithm/subarray-sum-equals-k/)对比，前者靠前缀和哈希把“定值区间计数”降到线性，本题则靠后缀最优子结构把“极值区间求解”降到线性。

[^bentley-kadane]: [Jon Bentley (1984): _Programming Pearls: Algorithm Design Techniques_](https://pages.di.unipi.it/ferragina/Teach/InformationRetrieval/Bentley.pdf)（*Communications of the ACM*, 27(9), pp. 865–871）——整理最大子数组问题的四档算法演进并介绍 Kadane 的线性扫描算法。

[^clrs-max-subarray]: [_Introduction to Algorithms_ (3rd ed., Section 4.1: The maximum-subarray problem)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 3 版第 4.1 节讨论最大子数组问题与股票买卖价格差分的等价转化（第 4 版已将该节移出正文）。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——返回两个值中的较大者，用于常数时间更新局部与全局极值。

[^daescu-dc]: [Ovidiu Daescu & Ka Yaw Teo: _Divide & Conquer strikes back: maximum-subarray in linear time_](https://personal.utdallas.edu/~daescu/maxsa.pdf)——证明在分治节点中维护总和、最大前缀和、最大后缀和与最大子数组和四元组即可将分治时间降至 $O(n)$。
