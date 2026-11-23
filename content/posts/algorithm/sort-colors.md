---
title: "颜色分类：荷兰国旗三路划分"
publishDate: "2026-12-18T12:00:00+08:00"
description: "LeetCode 75 颜色分类：维护三个指针将数组在单趟扫描中原地划分为 0、1、2 三段，解释换入 0 后同步推进与换入 2 后游标不推进的不对称原因。"
tags: ["algorithm", "tricks", "python", "cpp"]
---

[LeetCode 75. 颜色分类](https://leetcode.cn/problems/sort-colors/)（Hot 100）给定一个只包含 `0`、`1`、`2` 三种整数的数组 `nums`，要求**原地**对其进行排序，使相同颜色相邻并按 `0`、`1`、`2` 顺序排列，且**仅使用常数额外空间、单趟扫描完成**。题目保证 $1 \le n \le 300$。**副作用说明**：按题目契约原地重排输入数组 `nums`。

## 荷兰国旗三路划分不变式

在[《移动零：读写双指针与稳定前缀》](/posts/algorithm/move-zeroes/)中，我们用两个指针把数组分成“非零”与“零”两段；本题有三种值，对应 Edsger W. Dijkstra 提出的**荷兰国旗**（Dutch National Flag）三路划分问题[^dijkstra-dnf]，将数组维护成四段互斥区间：

例如扫描过程中，数组可以处在下面这个中间状态。两个待查格夹在 `curr` 与 `p2` 之间：

<div class="algorithm-table">

| 下标 | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 值 | 0 | 1 | **2** | **0** | 2 |
| 指针 | — | p0 | curr | p2 | — |

</div>

此时 `curr` 的 2 与 `p2` 的 0 交换。右侧的 2 已归位，所以 `p2` 左移；新换回来的 0 仍需检查，`curr` 留在下标 2。

循环条件为 **`curr <= p2`**（闭区间边界 `p2` 指向的元素本身尚未检查；若误写成 `curr < p2`，在 `[2, 0, 1]` 末尾会漏检停在 `p2` 的 `0`）。每轮检查 `nums[curr]` 时有三种动作：

1. **`nums[curr] == 0`**：与 `nums[p0]` 交换，然后 **`p0 += 1` 且 `curr += 1`**。因为 `[p0, curr)` 内只可能存放 `1`（或当 `p0 == curr` 时是自身），换回 `curr` 的值必然是 `1` 或 `0`，无需二次检查。
2. **`nums[curr] == 1`**：属于中间段，直接 **`curr += 1`**。
3. **`nums[curr] == 2`**：与 `nums[p2]` 交换，然后 **`p2 -= 1`，但 `curr` 保持不变**。**反例**：对 `[2, 0, 1]`，第一步把下标 `0` 的 `2` 与下标 `2` 的 `1` 交换得到 `[1, 0, 2]`；若对 `[2, 0, 0]` 交换后误递增 `curr`，换回下标 `0` 的 `0` 会被跳过留在 `1` 区，破坏不变式。

这也是[《第 K 大元素与前 K 个高频元素：小顶堆、快速选择与频次桶》](/posts/algorithm/top-k-elements/)中用于免疫大量重复元素的**三路快速选择分区**的直接原型。

## Python & C++：单趟原地三指针

```python
class Solution:
    def sortColors(self, nums: list[int]) -> None:
        # Invariant: nums[0..p0-1] == 0, nums[p0..curr-1] == 1,
        # nums[curr..p2] is unexplored, and nums[p2+1..n-1] == 2.
        p0 = 0
        curr = 0
        p2 = len(nums) - 1

        while curr <= p2:
            if nums[curr] == 0:
                nums[p0], nums[curr] = nums[curr], nums[p0]
                # Swapped-in element came from [p0, curr), so it is 1 (or 0 when p0 == curr).
                p0 += 1
                curr += 1
            elif nums[curr] == 2:
                nums[curr], nums[p2] = nums[p2], nums[curr]
                # Swapped-in element from p2 is unexamined; keep `curr` stationary.
                p2 -= 1
            else:
                curr += 1
```

C++ 实现通过 `std::swap` 完成原地交换[^cpp-swap]：

```cpp
#include <utility>
#include <vector>

class Solution {
public:
    void sortColors(std::vector<int>& nums) const {
        // Invariant: [0, p0) -> 0, [p0, curr) -> 1, [curr, p2] -> unknown, (p2, n) -> 2.
        int p0 = 0;
        int curr = 0;
        int p2 = static_cast<int>(nums.size()) - 1;

        while (curr <= p2) {
            if (nums[curr] == 0) {
                std::swap(nums[p0++], nums[curr++]);
            } else if (nums[curr] == 2) {
                // Do not advance `curr`: the value swapped from `p2` has not been inspected yet.
                std::swap(nums[curr], nums[p2--]);
            } else {
                ++curr;
            }
        }
    }
};
```

## 复杂度分析

- **时间复杂度**：每轮循环要么令 `curr` 加 1，要么令 `p2` 减 1，待探索区间长度 `p2 - curr + 1` 严格递减 1，总迭代次数不超过 $n$，时间复杂度为单趟 $O(n)$。
- **辅助空间复杂度**：仅维护三个整型下标，原地排序辅助空间为 $O(1)$。

[^dijkstra-dnf]: [NIST DADS: Dutch national flag](https://xlinux.nist.gov/dads/HTML/DutchNationalFlag.html)——记录 E. W. Dijkstra 在 *A Discipline of Programming*（Prentice-Hall, 1976, Chapter 14）中提出的荷兰国旗三路划分问题与三指针不变式。

[^cpp-swap]: [cppreference：`std::swap`](https://en.cppreference.com/w/cpp/algorithm/swap.html)——常数时间原地交换两个整数元素。
