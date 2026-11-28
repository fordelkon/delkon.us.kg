---
title: "搜索旋转排序数组：先判断哪一半有序"
publishDate: "2026-12-02T12:00:00+08:00"
description: "合并解析 LeetCode 153 寻找旋转排序数组中的最小值与 LeetCode 33 搜索旋转排序数组：剖析旋转后的双段单调结构，推导右端参照判别式与单趟二分搜索。"
tags: ["algorithm", "binary-search", "python", "cpp"]
---

把一个严格升序数组在某个未知下标处旋转（例如 `[0, 1, 2, 4, 5, 6, 7]` 变为 `[4, 5, 6, 7, 0, 1, 2]`），会衍生出 Hot 100 中两道紧密耦合的二分题：

- [LeetCode 153. 寻找旋转排序数组中的最小值](https://leetcode.cn/problems/find-minimum-in-rotated-sorted-array/)：给定旋转后的无重复数组 `nums`，在 $O(\log n)$ 时间内找出最小元素；
- [LeetCode 33. 搜索旋转排序数组](https://leetcode.cn/problems/search-in-rotated-sorted-array/)：在同样的旋转数组中查找目标值 `target`，存在则返回下标，否则返回 `-1`。

两题都保证数组元素互不相同，长度 $n \in [1, 5000]$。理解旋转数组的**双段单调几何结构**后，两题可以在同一框架下自然推导出来。

## 旋转数组的双段单调结构

数组旋转后被最小元素所在位置（称为**枢轴** $p$）分成两段各自严格递增的区间：

- 左段 `nums[0..p-1]`：所有元素都**严格大于**数组末元素 `nums[n - 1]`；
- 右段 `nums[p..n-1]`：所有元素都**小于等于**数组末元素 `nums[n - 1]`（当数组未旋转即 $p = 0$ 时，左段为空，整个数组都属于右段）。

例如，有序数组 `[0, 1, 2, 3, 4, 5, 6]` 旋转成下面一行。加粗的 0 是两个升序段的交界：

<div class="algorithm-table">

| 下标 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 元素 | 4 | 5 | 6 | **0** | 1 | 2 | 3 |
| 比末值 | > | > | > | ≤ | ≤ | ≤ |

</div>

比较结果从「大于」变成「小于等于」的第一格就是枢轴。

这一划分立刻给出了 **LeetCode 153**（找最小值） 的单调布尔谓词：在当前闭区间 $[lo, hi]$ 内，比较中点 `nums[mid]` 与右端点 `nums[hi]`：

- 若 `nums[mid] > nums[hi]`，说明 `mid` 落在左段，最小值一定在 `mid` 严格右侧，令 `lo = mid + 1`；
- 若 `nums[mid] <= nums[hi]`，说明 `mid` 落在右段，最小值可能是 `mid` 本身或在其左侧，令 `hi = mid`。

为什么拿 `nums[hi]`（右端点）而不是 `nums[lo]`（左端点）做参照？看一个反例：未旋转数组 `[1, 2, 3, 4, 5]` 中 `nums[mid] = 3 > nums[lo] = 1`，此时最小值在左侧；而旋转数组 `[4, 5, 6, 1, 2]` 中 `nums[mid] = 6 > nums[lo] = 4`，最小值却在右侧——仅靠 `nums[mid] > nums[lo]` 无法区分这两种情况。而拿 `nums[hi]` 比较时，无论数组是否旋转，“`nums[mid] > nums[hi]` 当且仅当 `mid` 在左段”始终成立。

## 从找枢轴到单趟搜索目标值（LeetCode 33）

找到最小值下标 `pivot` 后，自然可以把 **LeetCode 33** 拆成两步：先用 LeetCode 153 找到 `pivot`，再根据 `target` 与 `nums[n - 1]` 的大小决定在 `[0, pivot)` 还是 `[pivot, n)` 上执行[《搜索插入位置与元素范围：二分查找左右边界》](/posts/algorithm/find-first-and-last-position-of-element-in-sorted-array/)的标准二分。

更紧凑的做法是**单趟二分**。在当前闭区间 $[lo, hi]$ 取中点 `mid` 时，由于旋转断点最多只有一个，**左半区 `[lo, mid]` 与右半区 `[mid, hi]` 至少有一半是完全有序的**：

1. 若 `nums[lo] <= nums[mid]`，则左半区 `[lo, mid]` 严格有序（注意等号覆盖 `lo == mid` 的双元素区间）。此时只需判断 `target` 是否落在 `[nums[lo], nums[mid])` 之内：若是，则锁定左半区 `hi = mid - 1`；否则排除左半区 `lo = mid + 1`。
2. 否则，右半区 `[mid, hi]` 必然严格有序。同理判断 `target` 是否落在 `(nums[mid], nums[hi]]` 之内：若是，则锁定右半区 `lo = mid + 1`；否则排除右半区 `hi = mid - 1`。

每轮都能确定性地排除至少一半区间，单趟即可在 $O(\log n)$ 内收敛。

## Python：枢轴查找与单趟搜索实现

```python
class Solution:
    def findMin(self, nums: list[int]) -> int:
        # LeetCode 153 — Time: O(log n), Auxiliary space: O(1)
        lo, hi = 0, len(nums) - 1
        while lo < hi:
            mid = lo + (hi - lo) // 2
            # Compare against nums[hi] so unrotated arrays follow the same invariant.
            if nums[mid] > nums[hi]:
                lo = mid + 1
            else:
                hi = mid
        return nums[lo]

    def search(self, nums: list[int], target: int) -> int:
        # LeetCode 33 — Time: O(log n), Auxiliary space: O(1)
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            mid = lo + (hi - lo) // 2
            if nums[mid] == target:
                return mid

            if nums[lo] <= nums[mid]:
                # Left half [lo, mid] is sorted.
                if nums[lo] <= target < nums[mid]:
                    hi = mid - 1
                else:
                    lo = mid + 1
            else:
                # Right half [mid, hi] is sorted.
                if nums[mid] < target <= nums[hi]:
                    lo = mid + 1
                else:
                    hi = mid - 1

        return -1
```

## C++：无重复假设下的闭区间实现

```cpp
#include <vector>

class Solution {
public:
    // LeetCode 153
    int findMin(const std::vector<int>& nums) const {
        // Time complexity: O(log n), Space complexity: O(1)
        int lo = 0;
        int hi = static_cast<int>(nums.size()) - 1;
        while (lo < hi) {
            const int mid = lo + (hi - lo) / 2;
            if (nums[mid] > nums[hi]) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return nums[lo];
    }

    // LeetCode 33
    int search(const std::vector<int>& nums, int target) const {
        // Time complexity: O(log n), Space complexity: O(1)
        int lo = 0;
        int hi = static_cast<int>(nums.size()) - 1;
        while (lo <= hi) {
            const int mid = lo + (hi - lo) / 2;
            if (nums[mid] == target) {
                return mid;
            }

            if (nums[lo] <= nums[mid]) {
                if (nums[lo] <= target && target < nums[mid]) {
                    hi = mid - 1;
                } else {
                    lo = mid + 1;
                }
            } else {
                if (nums[mid] < target && target <= nums[hi]) {
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
        }
        return -1;
    }
};
```

## 复杂度分析与含重复元素的边界退化

两题每次迭代都将搜索区间减半，时间复杂度均为 $O(\log n)$，仅使用常数个整型下标且只读输入数组，辅助空间复杂度为 $O(1)$。

需要特别指出的是，上述 $O(\log n)$ 结论高度依赖题目**元素互不相同**的契约。如果允许重复元素（对应 LeetCode 81 与 LeetCode 154），当出现 `nums[lo] == nums[mid] == nums[hi]`（例如 `[1, 0, 1, 1, 1]`）时，单凭端点值无法判断哪一侧有序，只能收缩端点（如 `++lo` 或 `--hi`），最坏时间复杂度会退化为 $O(n)$[^clrs-binary-search]。

| 策略 | 适用题目 | 比较次数 | 代码结构 |
| :--- | :------- | :------- | :------- |
| 右端点参照二分 | LC 153 找最小值 | $\approx \log_2 n$ | 单一单调谓词 `nums[mid] > nums[hi]` |
| 先找枢轴 + 标准二分 | LC 33 搜索目标 | $\approx 2 \log_2 n$ | 复用 LC 153 与 LC 34/35 的 `lower_bound` |
| 单趟双段有序判定 | LC 33 搜索目标 | $\approx \log_2 n$ | 识别有序半区后判断目标是否落入其中 |

[^clrs-binary-search]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 2 章分治与二分查找分析说明，每次迭代必须能以常数时间排除恒定比例的候选区间才能保证 $O(\log n)$ 界。
