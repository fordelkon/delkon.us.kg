---
title: "搜索插入位置与元素范围：二分查找左右边界"
publishDate: "2026-11-30T12:00:00+08:00"
description: "合并解析 LeetCode 35 搜索插入位置与 LeetCode 34 在排序数组中查找元素的第一个和最后一个位置：用左闭右开区间的 lower_bound 不变式统一两题，避免死循环与越界。"
tags: ["algorithm", "binary-search", "python", "cpp"]
---

[LeetCode 35. 搜索插入位置](https://leetcode.cn/problems/search-insert-position/)（Hot 100）给定一个升序无重复数组 `nums` 和目标值 `target`，若 `target` 存在则返回其下标，否则返回它按顺序应插入的位置；[LeetCode 34. 在排序数组中查找元素的第一个和最后一个位置](https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/)（Hot 100）进一步允许数组包含重复元素（非递减有序），要求在 $O(\log n)$ 时间内返回 `target` 出现的起止下标 `[first, last]`，不存在则返回 `[-1, -1]`。

这两道题表面上是两道独立题目，本质上由同一个核心原语驱动：**寻找第一个大于等于 `target` 的元素下标**（即 C++ 标准库中的 `lower_bound` 与 Python 的 `bisect_left`）。掌握这一原语的区间不变式，就能同时解决两题并彻底消除二分写法中常见的 `+1 / -1` 混淆。

## 左闭右开区间与 `lower_bound` 不变式

设非递减数组 `nums` 的长度为 $n$，定义函数 `lower_bound(nums, target)` 返回满足 `nums[i] >= target` 的最小下标 $i \in [0, n]$（若所有元素都小于 `target`，则返回 $n$）。

使用**左闭右开区间** $[lo, hi)$，初始令 $lo = 0$、$hi = n$，循环条件为 `lo < hi`，始终维护两条不变式：

1. 区间 $[0, lo)$ 内的所有元素都**严格小于** `target`；
2. 区间 $[hi, n)$ 内的所有元素都**大于等于** `target`。

每轮取中点 `mid = lo + (hi - lo) // 2`（在 C++ 中写 `lo + (hi - lo) / 2` 可避免 `lo + hi` 在大下标下有符号溢出）：

- 若 `nums[mid] < target`，则 `[lo, mid]` 全部小于 `target`，令 `lo = mid + 1`；
- 若 `nums[mid] >= target`，则 `[mid, hi)` 全部大于等于 `target`，令 `hi = mid`。

由于 `lo < hi` 保证 $lo \le \text{mid} < hi$，无论走哪条分支，区间长度 $hi - lo$ 每轮至少严格减半，必然在 $\lceil \log_2(n + 1) \rceil$ 步内收敛到 `lo == hi`。退出循环时，`[0, lo)` 全小于 `target` 且 `[lo, n)` 全大于等于 `target`，因此 `lo` 恰好是所求边界。

### 一套原语同时求解两题

- **LeetCode 35**（搜索插入位置）：数组无重复，若 `target` 存在，第一个 $\ge \text{target}$ 的位置就是它的下标；若不存在，第一个 $> \text{target}$ 的位置恰好是应插入的下标。因此 `lower_bound(nums, target)` **直接就是最终答案**。
- **LeetCode 34**（首尾位置）：
  - 起点 `first = lower_bound(nums, target)`。如果 `first == n` 或 `nums[first] != target`，说明 `target` 不在数组中，直接返回 `[-1, -1]`。
  - 终点 `last` 等于**第一个严格大于 `target` 的位置减 1**。对于整数数组，这既可以复用同一个函数调用 `lower_bound(nums, target + 1) - 1`，也可以用条件改为 `nums[mid] <= target` 的 `upper_bound(nums, target) - 1`（后者不需要构造 `target + 1`，不存在 `target == INT_MAX` 时的整数溢出风险）。

## Python：手写 `lower_bound` 与标准库对照

Python 标准库 `bisect` 模块的 `bisect_left` 与 `bisect_right` 正是上述 `lower_bound` 与 `upper_bound` 的 C 实现[^py-bisect]。下面显式写出核心逻辑，展示两题如何共享同一段 10 行原语：

```python
class Solution:
    @staticmethod
    def _lower_bound(nums: list[int], target: int) -> int:
        # Invariant: nums[:lo] < target and nums[hi:] >= target.
        lo, hi = 0, len(nums)
        while lo < hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid
        return lo

    def searchInsert(self, nums: list[int], target: int) -> int:
        # LeetCode 35 — Time: O(log n), Auxiliary space: O(1)
        return self._lower_bound(nums, target)

    def searchRange(self, nums: list[int], target: int) -> list[int]:
        # LeetCode 34 — Time: O(log n), Auxiliary space: O(1)
        first = self._lower_bound(nums, target)
        if first == len(nums) or nums[first] != target:
            return [-1, -1]
        # Safe in Python because ints have arbitrary precision; avoids a second helper.
        last = self._lower_bound(nums, target + 1) - 1
        return [first, last]
```

## C++：区分 `lower_bound` 与 `upper_bound` 防溢出

题目中 `target` 的范围为 $[-10^9, 10^9]$，虽未触及 32 位 `int` 上限，但若将工具函数复用到通用整型范围，`target + 1` 在 `target == std::numeric_limits<int>::max()` 时会产生有符号整数溢出。因此 C++ 版本同时提供 `lowerBound` 与 `upperBound`（对应标准库 `<algorithm>` 中的 `std::lower_bound` 与 `std::upper_bound`[^cpp-lower-bound]）：

```cpp
#include <cstddef>
#include <vector>

class Solution {
    static std::size_t lowerBound(const std::vector<int>& nums, int target) {
        std::size_t lo = 0;
        std::size_t hi = nums.size();
        while (lo < hi) {
            const std::size_t mid = lo + (hi - lo) / 2;
            if (nums[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    static std::size_t upperBound(const std::vector<int>& nums, int target) {
        std::size_t lo = 0;
        std::size_t hi = nums.size();
        while (lo < hi) {
            const std::size_t mid = lo + (hi - lo) / 2;
            if (nums[mid] <= target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

public:
    // LeetCode 35
    int searchInsert(const std::vector<int>& nums, int target) const {
        return static_cast<int>(lowerBound(nums, target));
    }

    // LeetCode 34
    std::vector<int> searchRange(const std::vector<int>& nums, int target) const {
        const std::size_t first = lowerBound(nums, target);
        if (first == nums.size() || nums[first] != target) {
            return {-1, -1};
        }
        const std::size_t last = upperBound(nums, target) - 1;
        return {static_cast<int>(first), static_cast<int>(last)};
    }
};
```

注意在求 `last` 之前已经通过 `first == nums.size() || nums[first] != target` 排除了目标不存在的情况，因此必然存在至少一个等于 `target` 的元素，`upperBound(nums, target) >= first + 1 >= 1`，减 1 绝不会发生无符号下溢。

## 复杂度分析与拓展关联

两题的每次二分调用都把候选区间减半，时间复杂度为 $O(\log n)$；函数仅维护常数个下标变量且只读输入数组，辅助空间复杂度为 $O(1)$。

在[《最长递增子序列：末尾最小值单调数组与二分替换》](/posts/algorithm/longest-increasing-subsequence/)中，将耐心排序的贪心过程从 $O(n^2)$ 压到 $O(n \log n)$ 所依赖的正是这里的 `lower_bound`；而当有序序列被折叠进二维行主序网格或沿某个旋转点切分为两段有序区间时，这一单调判定框架将分别演进为[《搜索二维矩阵：行主序映射与一维二分》](/posts/algorithm/search-a-2d-matrix/)与[《搜索旋转排序数组：先判断哪一半有序》](/posts/algorithm/search-in-rotated-sorted-array/)。

[^py-bisect]: [Python 文档：`bisect` — Array bisection algorithm](https://docs.python.org/3/library/bisect.html)——`bisect_left` 与 `bisect_right` 分别对应左闭右开语义下的 `lower_bound` 与 `upper_bound`。

[^cpp-lower-bound]: [cppreference：`std::lower_bound`](https://en.cppreference.com/w/cpp/algorithm/lower_bound.html)——返回有序区间中首个不小于给定值的迭代器，随机访问迭代器下最多执行 $\lfloor \log_2(\text{last} - \text{first}) \rfloor + 1$ 次比较。
