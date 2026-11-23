---
title: "买卖股票的最佳时机：先算卖出利润，再更新最低价"
publishDate: "2026-12-11T12:00:00+08:00"
description: "LeetCode 121 买卖股票的最佳时机：把一次买卖的最大利润转化为维护前缀历史最低价与当前价差的最大值，并对比最大子数组和（Kadane 算法）的等价差分视角。"
tags: ["algorithm", "greedy", "python", "cpp"]
---

[LeetCode 121. 买卖股票的最佳时机](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock/)（Hot 100）给定数组 `prices`，其中 `prices[i]` 表示第 `i` 天股票的价格。你只能选择**某一天**买入并选择**未来的某一天**卖出，要求计算能获取的最大利润；如果无法获利则返回 `0`。题目保证 $1 \le n \le 10^5$，$0 \le \text{prices}[i] \le 10^4$。下列实现均只读输入数组，不修改 `prices`。

## 固定卖出日：前缀历史最低价不变式

暴力枚举所有 `(buy, sell)` 日期对需要 $O(n^2)$ 时间。**易错反例**：不能简单地求全局最大值减全局最小值——例如 `prices = [7, 6, 4, 3, 1]` 严格递减，最大利润为 `0`；而 `prices = [7, 2, 5, 1, 3]` 中全局最小值 `1` 出现在最高值 `7` 甚至 `5` 之后，最佳交易是第 1 天 `2` 买、第 2 天 `5` 卖（利润 `3`），而非 `7 - 1` 或 `5 - 1`。

若**固定第 `i` 天卖出**，为了最大化利润 `prices[i] - prices[buy]`（其中 $0 \le \text{buy} < i$），第 `i` 天之前唯一需要记住的信息就是**前 `i` 天的最低买入价** `min_price`：

```mermaid title="每日股价与前缀最低买入价对比" description="柱状为每日股价 prices = [7, 1, 5, 3, 6, 4]，折线为同步维护的前缀最低买入价 [7, 1, 1, 1, 1, 1]，下标 4 处垂直落差 6 - 1 = 5 即最大利润。"
xychart-beta
    title "每日股价（柱）与前缀最低价（线）"
    x-axis [0, 1, 2, 3, 4, 5]
    y-axis "价格" 0 --> 8
    bar [7, 1, 5, 3, 6, 4]
    line [7, 1, 1, 1, 1, 1]
```

以价格 `[7, 1, 5, 3, 6]` 为例，固定卖出日以后，只要在同一列用当天价格减去此前最低价：

<div class="algorithm-table">

| 第几天 | 1 | 2 | 3 | 4 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 当天价格 | 7 | 1 | 5 | 3 | **6** |
| 此前最低 | — | 7 | 1 | 1 | **1** |
| 卖出利润 | — | −6 | 4 | 2 | **5** |

</div>

最高利润出现在第 5 天；对应的买入价来自第 2 天。

循环不变式清晰且自洽：处理完第 `i` 天后，`min_price` 恒等于 $\min_{0 \le k \le i} \text{prices}[k]$，`max_profit` 恒等于所有满足 $0 \le l \le r \le i$ 的交易对中能取得的最大非负利润（`l == r` 对应不交易、利润为 0）。这一不变式天然保证买入日绝不晚于卖出日，既不需要回溯历史价格，也无需动态规划数组。

## Python & C++：单趟贪心扫描

```python
class Solution:
    def maxProfit(self, prices: list[int]) -> int:
        # Invariant: before each step, min_price holds the lowest price seen so far,
        # enforcing that any buy happens strictly on or before the current sell day.
        min_price = prices[0]
        max_profit = 0

        for price in prices:
            if price < min_price:
                min_price = price
            else:
                profit = price - min_price
                if profit > max_profit:
                    max_profit = profit

        return max_profit
```

在 C++ 中用 `std::min` 与 `std::max` 表达相同不变式[^cpp-max]，按 `const` 引用只读遍历 `prices`：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int maxProfit(const std::vector<int>& prices) const {
        // Updating min_price first is safe: if price < min_price, price - min_price == 0
        // and cannot exceed a non-negative max_profit.
        int min_price = prices[0];
        int max_profit = 0;

        for (int price : prices) {
            min_price = std::min(min_price, price);
            max_profit = std::max(max_profit, price - min_price);
        }

        return max_profit;
    }
};
```

## 复杂度分析与差分等价视角

- **时间复杂度**：单趟线性扫描 $n$ 天价格，时间复杂度为 $O(n)$。
- **辅助空间复杂度**：仅维护 `min_price` 与 `max_profit` 两个标量变量，额外空间为 $O(1)$。

从代数上把相邻两天的价格差记为 $d_k = \text{prices}[k] - \text{prices}[k - 1]$（$k \ge 1$），那么第 $l$ 天买入、第 $r$ 天卖出的利润恰好等于差分数组上的连续区间和：

$$
\text{prices}[r] - \text{prices}[l] = \sum_{k = l + 1}^{r} d_k.
$$

因此本题在数学上严格等价于在差分数组上求[《最大子数组和：Kadane 递推与分治合并》](/posts/algorithm/maximum-subarray/)（允许空子数组对应不交易的 0 利润）[^clrs-max-subarray][^bentley-kadane]；而与[《零钱兑换：完全背包自底向上与不可达哨兵》](/posts/algorithm/coin-change/)中贪心失效的反例相比，本题之所以允许单趟贪心，正是因为“历史最小买入价”对未来任意卖出日都具有支配优势。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——返回两个值中的较大者，用于常数时间更新前缀最低价与最大利润。

[^clrs-max-subarray]: [_Introduction to Algorithms_ (3rd ed., Section 4.1: The maximum-subarray problem)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 3 版第 4.1 节明确给出股票买卖价格差分与最大子数组问题的等价转化（第 4 版已移出该节）。

[^bentley-kadane]: [Jon Bentley (1984): _Programming Pearls: Algorithm Design Techniques_](https://pages.di.unipi.it/ferragina/Teach/InformationRetrieval/Bentley.pdf)（*Communications of the ACM*, 27(9), pp. 865–871）——介绍在线线性扫描求解最大子数组和的 Kadane 算法。
