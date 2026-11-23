---
title: "柱状图中最大的矩形：弹栈确定左右边界"
publishDate: "2026-12-08T12:00:00+08:00"
description: "LeetCode 84 柱状图中最大的矩形：用单调不减栈在弹栈瞬间同步确定每根柱子的左右首个更矮边界，通过首尾零高度哨兵统一边界计算与收尾清空，并对照接雨水。"
tags: ["algorithm", "stack", "python", "cpp"]
---

[LeetCode 84. 柱状图中最大的矩形](https://leetcode.cn/problems/largest-rectangle-in-histogram/)（Hot 100，困难）给定非负整数数组 `heights` 表示柱状图中各根柱子的高度，每根柱子宽度为 1 且紧密排列，要求找出柱状图中能勾勒出的最大矩形面积。例如 `[2, 1, 5, 6, 2, 3]` 的最大矩形由下标 2 和 3（高度 5、6）组成，面积为 $5 \times 2 = 10$。题目保证 $1 \le n \le 10^5$，$0 \le \text{heights}[i] \le 10^4$。

## 固定高度求最大宽度：两侧首个更矮边界

```mermaid title="补入左右零哨兵后的柱高" description="输入 heights = [2, 1, 5, 6, 2, 3] 前后补 0 哨兵得到 [0, 2, 1, 5, 6, 2, 3, 0]，原数组下标 2 与 3 处高度 5、6 并列撑起宽 2、高 5 的最大矩形面积 10。"
xychart-beta
    title "柱状图高度分布（含左右零哨兵）"
    x-axis [L, 0, 1, 2, 3, 4, 5, R]
    y-axis "柱高" 0 --> 7
    bar [0, 2, 1, 5, 6, 2, 3, 0]
```

最大矩形的顶边必然与某根柱子的顶部齐平（否则还可以继续向上拔高以增大面积）。因此，枚举每根柱子 `mid` 作为矩形的**决定高度** $h = \text{heights}[\text{mid}]$：

- 向左最多延伸到左侧第一个高度**严格小于** $h$ 的柱子下标 `left`（不含 `left`）；
- 向右最多延伸到右侧第一个高度**严格小于** $h$ 的柱子下标 `right`（不含 `right`）。

以柱子 `mid` 为高度的最大矩形宽度就是开区间 `(left, right)` 包含的柱子数：

$$
\text{width} = \text{right} - \text{left} - 1, \qquad \text{area} = h \times \text{width}.
$$

这正是[《每日温度：用单调栈找下一次升温》](/posts/algorithm/daily-temperatures/)的对偶问题：这里要找的是**左右两侧第一个严格更矮元素**，只需把单调栈方向反过来——维护一个从栈底到栈顶高度**单调不减**的下标栈：

- 当新柱子 `i` 满足 `heights[i] < heights[stack[-1]]` 时，栈顶柱子 `mid` 遇到了它的右侧首个更矮边界 `right = i`；
- 将 `mid` 弹出后，此时的新栈顶 `left = stack[-1]` 恰好是 `mid` 左侧最近的矮于或等于它的柱子（若存在等高柱子，最右侧那根先弹出时会算小宽度，但最左侧那根等高柱子随后弹出时，新栈顶一定是严格更矮的真实左边界，从而完整覆盖整段等高区间，不漏掉全局最大值）。

### 首尾零哨兵：消除空栈判断与末尾清理

如果直接扫描原数组，需要处理两个麻烦边界：弹出 `mid` 后栈空（说明左侧没有更矮柱子，`left = -1`），以及扫描结束后栈里仍残留递增柱子需要再写一遍清栈循环（它们的 `right = n`）。

在代码逻辑上把数组视为**左侧下标 `-1` 处有一根高度为 `0` 的哨兵柱、右侧下标 `n` 处也有一根高度为 `0` 的哨兵柱**（无需修改原数组）：

1. 初始先把哨兵下标 `-1` 压入栈底（或扩展数组首尾各补一个 `0`），由于所有真实柱高均 $\ge 0$，哨兵 `-1` 永远不会被弹出，弹栈后栈必然非空，直接取 `left = stack[-1]`；
2. 扫描到 `i == n` 时将当前高度视为 `0`，强制把栈中所有高度 $> 0$ 的残留柱子全部弹出并结算完毕。

这与[《最长有效括号：前驱配对回溯、显式栈与双向扫描》](/posts/algorithm/longest-valid-parentheses/)中预先压入 `-1` 统一跨度公式的设计异曲同工。

## Python：哨兵索引单趟单调栈

下面代码不复制也不修改原数组 `heights`，通过 `i == n` 时的虚拟高度 `0` 和栈底哨兵 `-1` 在单趟循环内完成全部结算：

```python
class Solution:
    def largestRectangleArea(self, heights: list[int]) -> int:
        # Time complexity: O(n)
        # Space complexity: O(n) auxiliary space for monotonic stack
        n = len(heights)
        # Sentinel index -1 acts as a virtual zero-height bar on the far left.
        stack: list[int] = [-1]
        max_area = 0

        for i in range(n + 1):
            # Virtual zero-height sentinel at i == n flushes all remaining bars.
            curr_h = 0 if i == n else heights[i]
            while stack[-1] != -1 and curr_h < heights[stack[-1]]:
                h = heights[stack.pop()]
                width = i - stack[-1] - 1
                area = h * width
                if area > max_area:
                    max_area = area
            stack.append(i)

        return max_area
```

## C++：无拷贝哨兵单调栈

题目中 $n \le 10^5$、$h \le 10^4$，最大面积不超过 $10^9$，在 32 位有符号整数 `int` 范围内（若扩大输入规模需改为 `long long`）。C++ 实现同样不拷贝 `heights`[^cpp-vector]：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int largestRectangleArea(const std::vector<int>& heights) const {
        // Time complexity: O(n)
        // Space complexity: O(n) auxiliary space for monotonic stack
        const int n = static_cast<int>(heights.size());
        std::vector<int> stack;
        stack.reserve(static_cast<std::size_t>(n) + 2);
        stack.push_back(-1);

        int max_area = 0;
        for (int i = 0; i <= n; ++i) {
            const int curr_h = (i == n) ? 0 : heights[i];
            // Keep equal heights on the stack so the leftmost one can claim the full width.
            while (stack.back() != -1 && curr_h < heights[stack.back()]) {
                const int h = heights[stack.back()];
                stack.pop_back();
                const int width = i - stack.back() - 1;
                max_area = std::max(max_area, h * width);
            }
            stack.push_back(i);
        }

        return max_area;
    }
};
```

## 复杂度分析与接雨水的几何对偶

每个下标 `0..n-1` 恰好入栈一次、至多出栈一次，结合聚合分析[^clrs-amortized]，时间复杂度为 $O(n)$；当输入严格递增时栈最多容纳 $n + 1$ 个下标，最坏辅助空间为 $O(n)$。

回应[《接雨水：按列结算与单调栈分层》](/posts/algorithm/trapping-rain-water/)文末留下的迁移问题，把两道柱状图困难题的单调栈结算公式并排对照，就能看清两者的几何对偶关系：

| 维度 | [接雨水（LC 42）](/posts/algorithm/trapping-rain-water/) | 柱状图中最大的矩形（本题，LC 84） |
| :--- | :------------------------------------------------------- | :-------------------------------- |
| 栈内高度趋势 | 单调不增（找凹槽） | 单调不减（找可延伸高台） |
| 触发弹栈条件 | 新柱**更高**：`h[i] > h[top]` | 新柱**更矮**：`h[i] < h[top]` |
| 宽度公式 | `i - left - 1`（开区间） | `i - left - 1`（开区间） |
| 高度公式 | `min(h[left], h[i]) - h[bottom]`（新增水层高） | `h[mid]`（弹出柱自身高度） |
| 聚合方式 | 累加所有水层面积 `+=` | 取全局最大矩形面积 `max` |

[^clrs-amortized]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 16.1 节聚合分析说明单调栈全部入栈与弹栈操作总计为 $O(n)$。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——预先 `reserve(n + 2)` 消除栈增长期间的扩容重分配。
