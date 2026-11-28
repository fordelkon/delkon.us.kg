---
title: "接雨水：按列结算与单调栈分层"
publishDate: "2026-10-24T12:00:00+08:00"
description: "LeetCode 42 的接雨水：用 Python 前后缀最大值直观计算水深，再用 C++ 双指针将额外空间降至常数，并拓展到单调栈的水层切分。"
tags: ["algorithm", "two-pointer", "python", "cpp"]
---

[LeetCode 42. 接雨水](https://leetcode.cn/problems/trapping-rain-water/)给定一排宽度为 1 的柱子，要求根据非负柱高数组 `height` 计算凹陷处的总水量。在 `[4, 0, 1, 3]` 中，右壁把水位限制在高度 3，水面再升高，水就会越过右壁流走。中间两列分别能存 3 格和 2 格水。[《盛最多水的容器》](/posts/algorithm/container-with-most-water/)计算两面外壁之间的矩形容量，这里还要扣除柱子本身占去的空间。

## Python：用前后缀最大值直接计算水深

下面各版都只读取 `height` 并返回水量数值，不修改输入。C++ 使用 `int` 累加，题目范围内 $n \le 20\,000$、高度至多 $100\,000$，总水量不超过 $2\,000\,000\,000$；推广到更大输入时需要检查累计值和中间乘积的类型。设数组长度为 $n$，第 $i$ 列高度为 $h[i]$，对应代码中的 `height[i]`。定义包含当前列的前缀最大值 $L_i = \max_{0 \le j \le i} h[j]$，以及后缀最大值 $R_i = \max_{i \le j < n} h[j]$。该列的积水量为：

$$
w_i = \min(L_i, R_i) - h[i]
$$

由于两个极值都包含当前列下标 $i$，必有 $L_i \ge h[i]$ 且 $R_i \ge h[i]$，差值不会为负。Python 版直接预处理前后缀最大值，代码与水深公式逐项对应：

```python
class Solution:
    def trap(self, height: list[int]) -> int:
        if not height:
            return 0

        n = len(height)
        left_max = [0] * n
        right_max = [0] * n
        left_max[0] = height[0]
        right_max[-1] = height[-1]

        for i in range(1, n):
            left_max[i] = max(left_max[i - 1], height[i])
        for i in range(n - 2, -1, -1):
            right_max[i] = max(right_max[i + 1], height[i])

        # Both maxima include this column, so the resulting water depth is nonnegative.
        return sum(
            min(left_max[i], right_max[i]) - height[i]
            for i in range(n)
        )
```

前向扫描得到每列左侧的最高点，反向扫描得到右侧的最高点，最后按公式求和。三次线性遍历的总时间为 $O(n)$，两个辅助数组占用 $O(n)$ 额外空间。

## C++：用双指针省去极值数组

计算 $\min(L_i, R_i) - h[i]$ 时，并不需要同时知道 $L_i$ 与 $R_i$ 的精确值，只要能判断**哪一侧是两者中的较小值**即可。C++ 版从两端维护尚未结算的闭区间 $[l, r]$，将额外空间降到 $O(1)$：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int trap(const std::vector<int>& height) {
        int left = 0;
        int right = static_cast<int>(height.size()) - 1;
        int left_max = 0;
        int right_max = 0;
        int total_water = 0;

        while (left < right) {
            left_max = std::max(left_max, height[left]);
            right_max = std::max(right_max, height[right]);

            if (left_max < right_max) {
                // Since right_max <= R_left, left_max is guaranteed to be min(L_left, R_left).
                total_water += left_max - height[left];
                ++left;
            } else {
                // Symmetrically, right_max <= left_max <= L_right fixes min(L_right, R_right).
                total_water += right_max - height[right];
                --right;
            }
        }
        return total_water;
    }
};
```

每轮通过 `std::max` 更新两侧极值后[^cpp-max]，`left_max` 就是精确的前缀极值 $L_l = \max_{0 \le j \le l} h[j]$，`right_max` 就是精确的后缀极值 $R_r = \max_{r \le j < n} h[j]$。因为 $l < r$，第 $l$ 列的完整后缀区间 $[l, n - 1]$ 包含 $[r, n - 1]$，故必有 $R_l \ge R_r = \mathrm{right\_max}$；同理 $L_r \ge L_l = \mathrm{left\_max}$。

- **当 `left_max < right_max` 时**：结合包含关系有 $L_l = \mathrm{left\_max} < \mathrm{right\_max} \le R_l$，因此 $\min(L_l, R_l) = \mathrm{left\_max}$ 已经完全确定，无须知道开区间 $(l, r)$ 之间是否还有更高的柱子。直接结算 `left_max - height[left]` 并右移 `left`。
- **当 `right_max <= left_max` 时**：对称地有 $R_r = \mathrm{right\_max} \le \mathrm{left\_max} \le L_r$，因此 $\min(L_r, R_r) = \mathrm{right\_max}$，直接结算右侧并左移 `right`。

以 `[4, 0, 1, 3]` 为例，左端已经有高度 4 的柱子。右指针从高度 3 的右壁向左走，每遇到一根更矮的柱子，就能用右壁高度算出这一列的水深。最终两指针停在高度 4 的左壁上。

一般地，考虑最靠左的全局最高柱。如果左指针先到这里，`left_max` 已经达到全局最大值，此后只会移动右指针。如果右指针先到，左侧迄今的最高值仍较小，接下来只会移动左指针。两者最终在这根柱子相遇，它的积水为 0。

当 $n \ge 1$ 时，两个指针合计移动 $n - 1$ 次，时间复杂度为 $O(n)$，额外空间为 $O(1)$。这里比较的是两侧已扫描部分的最高柱，而非仅比较当前两根柱子。[《盛最多水的容器：短板内移与候选排除》](/posts/algorithm/container-with-most-water/)每步排除一组不可能改善答案的数对；本题每步确定一列的最终水深，再将其累加。

## 思路拓展：用单调栈结算水平水层

对同一个 `[4, 0, 1, 3]` 从左往右扫描，也可以按**水平水层**累计。读到高度 1 时，下标 1 上方能填 1 格。读到右壁 3 时，中间两列又可以一起升高 2 层，增加 4 格。这样也得到 5 格水。

栈中保存尚未遇到更高右壁的柱子下标，从栈底到栈顶对应高度单调不增（允许等高柱子并存）。当新柱子 `height[i]` 高于栈顶时，弹出的栈顶就是凹槽底部 `bottom`，而弹出后的新栈顶 `left` 与当前柱子 `i` 分别是它的左右挡水壁：

```python
class Solution:
    def trap(self, height: list[int]) -> int:
        stack: list[int] = []
        total_water = 0

        for i, h in enumerate(height):
            # A taller right bar seals horizontal water layers above shorter valley bottoms.
            while stack and h > height[stack[-1]]:
                bottom = stack.pop()
                if not stack:
                    # No left wall remains to bound the water.
                    break
                left = stack[-1]
                width = i - left - 1
                bounded_height = min(height[left], h) - height[bottom]
                total_water += width * bounded_height
            stack.append(i)

        return total_water
```

若弹出 `bottom` 后栈已空，说明左侧没有更高的柱子挡水，无法形成有界水层；否则，新增水层高度 $\Delta h$ 为两壁较矮者与底部的高度差，宽度为开区间 $(l, i)$ 的列数，新增水量 $\Delta w$ 为两者的乘积（其中 $l$ 为弹栈后的新栈顶下标）：

$$
\begin{aligned}
\Delta h &= \min(h[l], h[i]) - h[\mathrm{bottom}] \\
\Delta w &= (i - l - 1) \times \Delta h
\end{aligned}
$$

这个乘积只计算 `height[bottom]` 以上的新增水层，更低的凹陷已在先前弹栈时填平；同一列可以出现在多个水层的宽度中，但这些水层的高度区间互不重叠。栈内允许等高柱子，靠右的同高柱子先弹出时会得到 $\Delta h = 0$ 的水层，随后靠左的同高柱子再与真正的左壁算出完整水层，不影响结果。每个下标只入栈一次、最多出栈一次，配合列表尾部追加与弹出的平摊 $O(1)$ 开销，总时间复杂度为 $O(n)$；单调不增的输入会使所有下标留在栈中，最坏额外空间为 $O(n)$[^python-list-stack]。

双指针一次结算一列的完整水深；单调栈一次结算两壁之间新增的一层水，两种分法覆盖相同的积水面积。

[《柱状图中最大的矩形：弹栈确定左右边界》](/posts/algorithm/largest-rectangle-in-histogram/)同样用栈保存待定下标。接雨水遇到更高的右壁时结算新增水层，最大矩形遇到更矮的柱子时确定候选矩形的宽度。

[^cpp-max]: [C++ 工作草案：Minimum and maximum](https://eel.is/c++draft/alg.min.max)——说明返回两个值中的较大者，二者相等时返回第一个参数。

[^python-list-stack]: [Python 文档：将列表当作栈使用](https://docs.python.org/3/tutorial/datastructures.html#using-lists-as-stacks)——说明通过列表末尾的 `append()` 与 `pop()` 实现后进先出栈。
