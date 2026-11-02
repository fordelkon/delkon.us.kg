---
title: "盛最多水的容器：短板内移与候选排除"
publishDate: "2026-10-23T12:00:00+08:00"
description: "LeetCode 11 的盛最多水的容器：证明保留短板的剩余数对无法产生更优解，用相向双指针排除候选，再跳过不高于旧短板的位置。"
---

[LeetCode 11. 盛最多水的容器](https://leetcode.cn/problems/container-with-most-water/)给定非负整数数组 `height`，要求选出两条垂线与横轴构成容量最大的容器；例如 `[1, 8, 6, 2, 5, 4, 8, 3, 7]` 中选取下标 1 和 8（高度分别为 8 和 7），最大水量为 $\min(8, 7) \times (8 - 1) = 49$。[《移动零：读写双指针与稳定前缀》](/notes/algorithm/move-zeroes/)用同向双指针在单趟扫描中划分前缀，而本题要在 $\binom{n}{2}$ 个下标对中找最大值；同时，两条垂线的水平距离直接参与面积计算，因此不能像[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)那样先排序——排序会改写原始下标。

## Python：记录当前面积，再排除短板

设数组长度为 $n$，第 $i$ 条线的非负高度为 $h[i]$，对应代码中的 `height[i]`。选取下标 $i < j$ 时，容量由较矮的一侧（短板）与水平跨度共同决定：

$$
\mathrm{Area}(i, j) = \min(h[i], h[j]) \times (j - i)
$$

左右指针从两端最宽处开始。每次用较矮一侧的高度乘以当前宽度更新答案，再移动短板一侧；等高时任选一侧移动。

```python
class Solution:
    def maxArea(self, height: list[int]) -> int:
        left, right = 0, len(height) - 1
        max_water = 0

        while left < right:
            width = right - left
            if height[left] <= height[right]:
                max_water = max(max_water, height[left] * width)
                # Any inner pair (left, k) with k < right has smaller width and height <= height[left].
                left += 1
            else:
                max_water = max(max_water, height[right] * width)
                # Symmetrically, any inner pair (k, right) with k > left cannot exceed height[right] * width.
                right -= 1

        return max_water
```

为什么记录 $\mathrm{Area}(i, j)$ 后可以直接放弃较短的一侧？假设 $h[i] \le h[j]$。若保留左端 $i$，将右端移到任意内部位置 $k$（$i < k < j$），则宽度严格缩小，而有效高度仍不超过 $h[i]$：

$$
\begin{aligned}
\mathrm{Area}(i, k)
&= \min(h[i], h[k]) \times (k - i) \\
&\le h[i] \times (k - i) \\
&\le h[i] \times (j - i) = \mathrm{Area}(i, j)
\end{aligned}
$$

当前面积已经计入 `max_water`，因此所有保留左端 $i$、右端落在 $(i, j)$ 内的剩余数对都不可能改善答案，可以一起排除。右端较短时同理；两端等高时，保留任一端都受同一高度上限约束，先移走哪一侧都不会丢失更优解。这里第二个不等号必须使用“不大于”：短板高度为零时，收缩宽度后的面积仍等于零。

这与[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)共享“一次排除一组候选”的证明结构，但排除依据不同。三数之和在固定第一个数后，利用排序后的数值单调性：当前和偏小时，保留左端、继续左移右端只会让和更小或不变，因此可以排除当前左端。本题的高度没有单调性，依据则是**宽度随内移递减，而保留短板时的有效高度存在上界**。

循环维护的保证是：**全局最大值要么已经被记录，要么仍由当前闭区间 $[\mathrm{left}, \mathrm{right}]$ 内的两个位置构成。** 证明并不要求每步算出的面积单调增大。两个指针合计移动 $n - 1$ 次，时间复杂度为 $O(n)$，额外空间为 $O(1)$。

## C++：跳过不高于旧短板的位置

若当前短板高度为 $b = \min(h[\mathrm{left}], h[\mathrm{right}])$，向内移动后遇到的新柱子高度仍不超过 $b$，那么以这根新柱子为端点、在缩窄后的窗口内任选另一端，高度上限没有提高，宽度却已经缩小，面积必然不会超过刚记录的面积。这些端点可以连续跳过，无须重算面积：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int maxArea(const std::vector<int>& height) {
        int left = 0;
        int right = static_cast<int>(height.size()) - 1;
        int max_water = 0;

        while (left < right) {
            const int bottleneck = std::min(height[left], height[right]);
            max_water = std::max(max_water, bottleneck * (right - left));

            // Inner lines no taller than bottleneck have narrower width and no greater height cap.
            while (left < right && height[left] <= bottleneck) {
                ++left;
            }
            while (left < right && height[right] <= bottleneck) {
                --right;
            }
        }
        return max_water;
    }
};
```

由于 `bottleneck` 由 `std::min` 取自两端较小值，并由 `std::max` 更新最大容量[^cpp-minmax]，较矮的一侧必然进入对应的内层 `while` 推进；当两侧等高时，两个内层循环会在同一轮将两侧不高于 `bottleneck` 的位置一并跳过。连续跳过能减少部分输入上的乘法与比较次数，但两指针合计仍最多移动 $n - 1$ 次，最坏时间复杂度仍为 $O(n)$，额外空间为 $O(1)$；额外分支是否带来实际提速，仍需结合数据分布测试。

改变题目条件时，要重新检查这份排除证明：若对本题排序，就会破坏横坐标距离，连目标函数也随之改变；若把“任选两条无厚度垂线的最大容量”改成“每根柱子都有实体宽度 1，求所有凹陷处的积水总和”，中间柱子就会占据空间并切分水池——这正是[《接雨水：按列结算与单调栈分层》](/notes/algorithm/trapping-rain-water/)。相向双指针同样适用于那道题，但指针的作用不再是排除候选数对，而是凭已知外侧极值确定单列水深。

[^cpp-minmax]: [cppreference：`std::min` 与 `std::max`](https://en.cppreference.com/w/cpp/algorithm/min.html)——说明按默认小于比较在常数时间内返回两个值中的较小者或较大者。
