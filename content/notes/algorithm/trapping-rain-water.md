---
title: "接雨水：按列结算与单调栈分层"
publishDate: "2026-10-24T12:00:00+08:00"
description: "LeetCode 42 的接雨水：用 Python 前后缀最大值直观计算水深，再用 C++ 双指针将额外空间降至常数，并拓展到单调栈的水层切分。"
---

[LeetCode 42. 接雨水](https://leetcode.cn/problems/trapping-rain-water/)给定非负整数数组 `height`，其中每根柱子宽度为 1 且本身占据空间，要求计算下雨后所有凹陷处能接多少单位的雨水；例如 `[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]` 总共能接 6 个单位的雨水。[《盛最多水的容器：短板内移与候选排除》](/notes/algorithm/container-with-most-water/)只选两条无厚度的外壁最大化单个矩形容量；本题则要把各处凹陷容纳的水量全部相加，既可以按竖直列求水深，也可以按水平水层累加。

## Python：用前后缀最大值直接计算水深

设数组长度为 $n$，第 $i$ 列高度为 $h[i]$，对应代码中的 `height[i]`。定义包含当前列的前缀最大值 $L_i = \max_{0 \le j \le i} h[j]$，以及后缀最大值 $R_i = \max_{i \le j < n} h[j]$。该列的积水量为：

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

        # Each column's water level is bounded by the shorter of its two outer maxima.
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

例如 `[2, 0, 3]` 首轮更新后 `left_max = 2 < right_max = 3`，第 0 列结算 `2 - 2 = 0` 并右移 `left`；次轮 `left = 1`，`left_max` 保持 2，立即确定中间列水深为 `2 - 0 = 2`；而 `[1, 2, 3]` 进入中间列时会将 `left_max` 更新为 2，结算 `2 - 2 = 0`，不会把旧极值误当成新列的水位。由于每步都移动极值较小的一侧，两指针最终会在全局最高柱处相遇；最高柱自身无法积水（贡献为 0），循环在 `left == right` 时自然终止。

当 $n \ge 1$ 时，两个指针合计移动 $n - 1$ 次，时间复杂度为 $O(n)$，额外空间为 $O(1)$。这里比较的是两侧已扫描部分的最高柱，而非仅比较当前两根柱子。[《盛最多水的容器：短板内移与候选排除》](/notes/algorithm/container-with-most-water/)每步排除一组不可能改善答案的数对；本题每步确定一列的最终水深，再将其累加。

## 思路拓展：用单调栈结算水平水层

双指针需要事先知道数组两端的边界；若只从左向右顺序扫描，也可以按**水平水层**切分。例如 `[3, 0, 1, 3]`：读到高度 1 时，先填平下标 1 上方的一层，水量为 1；读到最后的高度 3 时，再在两壁之间增加高度为 2、宽度为 2 的水层，水量为 4，总量为 5。

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

两种方法的结算单位不同：双指针确定一列的完整水深，单调栈确定一层新增水量。从状态管理视角看，单调栈在顺序扫描中显式维护了“尚未遇到更高右壁的凹槽序列”：每次右侧出现更高柱子，就通过弹栈逐层结算水层，再由新栈顶恢复左壁约束。这种用显式数据栈保存未决状态、并在条件满足时逐层出栈回溯结算的机制，同[《从调用栈理解递归》](/posts/understanding-recursion/#从递归改写为迭代)中用显式栈接管调用栈帧现场、驱动迭代状态机的模式有着深刻的内在一致性——二者都通过显式后进先出结构消除隐式系统开销，并精确控制历史状态的存活周期。

迁移到 [LeetCode 84. 柱状图中最大的矩形](https://leetcode.cn/problems/largest-rectangle-in-histogram/) 时，仍可在栈中保存尚未确定右边界的下标，但弹栈条件改为遇到更矮的柱子。接雨水用两壁较矮者减去槽底高度，计算新增水层；最大矩形用弹出柱自身的高度乘以可延伸宽度，计算候选面积。等高柱子的保留或合并方式要与各自的边界定义配套，不能直接照搬。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明返回两个值中的较大者，二者相等时返回第一个参数。

[^python-list-stack]: [Python 文档：将列表当作栈使用](https://docs.python.org/3/tutorial/datastructures.html#using-lists-as-stacks)——说明在列表末尾执行 `append()` 与 `pop()` 无需移动其余元素，适合作为后进先出栈实现平摊常数时间的入栈与出栈。
