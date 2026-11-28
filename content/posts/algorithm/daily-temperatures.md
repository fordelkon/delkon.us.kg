---
title: "每日温度：用单调栈找下一次升温"
publishDate: "2026-12-07T12:00:00+08:00"
description: "LeetCode 739 每日温度：用单调不增栈维护尚未等到更高温度的日期下标，在单趟线性扫描中按均摊 O(1) 结算等待天数，建立单调栈基础范式。"
tags: ["algorithm", "stack", "python", "cpp"]
---

[LeetCode 739. 每日温度](https://leetcode.cn/problems/daily-temperatures/)（Hot 100）给定整数数组 `temperatures` 表示每天的气温，要求返回一个等长数组 `answer`，其中 `answer[i]` 是第 `i` 天之后**第一个气温严格高于当天**的等待天数；如果之后气温都不会升高，则 `answer[i] = 0`。例如 `[73, 74, 75, 71, 69, 72, 76, 73]` 对应 `[1, 1, 4, 2, 1, 1, 0, 0]`。题目保证 $1 \le n \le 10^5$，$30 \le \text{temperatures}[i] \le 100$。

## 下一个更大元素与单调栈不变式

如果对每一天 `i` 向右暴力寻找第一个 `temperatures[j] > temperatures[i]`，在递减序列上时间复杂度会退化为 $O(n^2)$，无法通过 $n = 10^5$ 的规模。

换一个视角：从左向右只扫描一遍，把**尚未找到更高温度的日期下标**暂存进一个栈里。假设栈顶下标为 `prev`，当新的一天 `i` 到达时：

- 如果 `temperatures[i] > temperatures[prev]`，那么第 `i` 天就是第 `prev` 天苦等的**第一个**更高温度日！直接结算 `answer[prev] = i - prev` 并将 `prev` 弹出；随后继续与新的栈顶比较，直到栈空或栈顶温度大于等于 `temperatures[i]`。
- 最后将当前下标 `i` 压栈，等待未来更暖和的日子来结算它。

由此自然维持一条**单调栈不变式**：在任意时刻，栈中从栈底到栈顶保存的下标对应的温度**单调不增**（允许相等温度共存，因为相等不算“严格更高”，它们需要一起等待后续更高的温度）。

遍历结束后仍留在栈里的下标，说明直到最后一天都没有遇到更高温度，而 `answer` 初始化为全 `0`，无需任何额外收尾循环。

## Python：单调不增下标栈

```python
class Solution:
    def dailyTemperatures(self, temperatures: list[int]) -> list[int]:
        # Time complexity: O(n)
        # Space complexity: O(n) auxiliary space for monotonic stack
        n = len(temperatures)
        answer = [0] * n
        # Invariant: temperatures[stack[k]] is non-increasing from bottom to top.
        stack: list[int] = []

        for i, temp in enumerate(temperatures):
            while stack and temp > temperatures[stack[-1]]:
                prev = stack.pop()
                answer[prev] = i - prev
            stack.append(i)

        return answer
```

## C++：`std::vector<int>` 充当紧凑单调栈

```cpp
#include <vector>

class Solution {
public:
    std::vector<int> dailyTemperatures(const std::vector<int>& temperatures) const {
        // Time complexity: O(n)
        // Space complexity: O(n) auxiliary space for monotonic stack
        const int n = static_cast<int>(temperatures.size());
        std::vector<int> answer(static_cast<std::size_t>(n), 0);
        std::vector<int> stack;
        stack.reserve(static_cast<std::size_t>(n));

        for (int i = 0; i < n; ++i) {
            // Equal temperatures leave the earlier day unresolved.
            while (!stack.empty() && temperatures[i] > temperatures[stack.back()]) {
                const int prev = stack.back();
                stack.pop_back();
                answer[prev] = i - prev;
            }
            stack.push_back(i);
        }

        return answer;
    }
};
```

## 均摊复杂度证明与单调栈家族对照

虽然代码里有一层 `for` 嵌套一层 `while`，但每个下标 `i` 在整个运行过程中**恰好入栈一次、至多出栈一次**[^clrs-amortized]。因此 `while` 循环体内所有弹栈操作的总执行次数严格不超过 $n$，结合列表或 `std::vector` 尾部的均摊 $O(1)$ 操作[^python-list-complexity][^cpp-vector]，总体时间复杂度为 $O(n)$。当温度单调不增时，所有下标都会留在栈中，最坏辅助空间（不含输出数组 `answer`）为 $O(n)$。

本题是单调栈最纯粹的“寻找右侧第一个严格更大元素”模板。把“找一侧边界”升级为“弹出时同时确定左右两侧边界”，就能直接衔接到本系列中两道经典的困难题：

| 题目 | 栈内单调性（底 $\to$ 顶） | 触发弹栈条件 | 弹栈时结算的几何量 |
| :--- | :------------------------ | :----------- | :----------------- |
| 每日温度（本题，LC 739） | 单调不增 | 遇到严格更高元素 | 右侧首个更高日距离 `i - prev` |
| [接雨水](/posts/algorithm/trapping-rain-water/)（LC 42） | 单调不增 | 遇到严格更高右壁 | 以 `bottom` 为槽底的新增水平水层面积 |
| [柱状图中最大的矩形](/posts/algorithm/largest-rectangle-in-histogram/)（LC 84） | 单调不减 | 遇到严格更矮柱子 | 以弹出柱为高度的最大延伸矩形面积 |

[^clrs-amortized]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 16.1 节用聚合分析（aggregate analysis）证明了每个元素至多入栈与出栈各一次时，带多次弹栈的序列操作总耗时为线性 $O(n)$。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——列表末尾 `append()` 与 `pop()` 均摊为 $O(1)$。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——连续数组支持尾部常数时间弹栈与均摊常数时间压栈。
