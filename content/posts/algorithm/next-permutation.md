---
title: "下一个排列：找拐点、交换与反转后缀"
publishDate: "2026-12-19T12:00:00+08:00"
description: "LeetCode 31 下一个排列：推导如何从后向前定位首个升序拐点、在单调递减后缀中寻找最小更大值交换，并通过原地反转后缀恢复最小字典序。"
tags: ["algorithm", "tricks", "python", "cpp"]
---

[LeetCode 31. 下一个排列](https://leetcode.cn/problems/next-permutation/)（Hot 100）要求将整数数组 `nums` **原地**重新排列成字典序中**下一个更大的排列**；如果已经是最大排列（即整体非递增），则重排为最小排列（升序排列）。例如 `[1, 2, 3]` 变为 `[1, 3, 2]`，`[3, 2, 1]` 变为 `[1, 2, 3]`，`[1, 1, 5]` 变为 `[1, 5, 1]`。题目保证 $1 \le n \le 100$，允许重复元素。**副作用说明**：按题目契约直接原地修改输入数组 `nums`。

## 如何精确找出“刚好大一点”的排列

在[《全排列：访问标记数组与原地交换分区》](/posts/algorithm/permutations/)中，我们一次性枚举所有排列；本题则是在常数额外空间下求某个给定排列的**直接字典序后继**（即 Knuth *TAOCP* Vol. 4A 中记载的 Algorithm L 单步推进[^knuth-alg-l]）。

要让排列刚好变大，先尽量保留左侧前缀，再把改动位置之后的后缀排到最小。例如 `[1, 3, 5, 4, 2]` 的后缀已经降序，只能改动 3。用后缀中比它大的最小值 4 替换，再反转剩下的 `[5, 3, 2]`，得到 `[1, 4, 2, 3, 5]`。

1. **找枢轴 `i`**：从右向左找到第一个相邻升序对 `nums[i] < nums[i + 1]`。此时 `nums[i + 1 .. n - 1]` 必然是**单调不增**（非严格降序）的，说明右侧后缀自身已经达到最大字典序，无法仅靠调整后缀内部变得更大，必须变动 `nums[i]`。
2. **找最小更大值 `j` 并交换**：既然 `nums[i + 1 .. n - 1]` 单调不增，从最右端 `n - 1` 向左扫描遇到的**第一个**满足 `nums[j] > nums[i]` 的元素恰好就是后缀中严格大于 `nums[i]` 的**最小值**。**反例（重复元素）**：对 `[1, 5, 1]`，枢轴 `i = 0`（值 `1`）；若误写成 `nums[j] >= nums[i]`，会选中末尾的 `1` 与开头互换，数组原地踏步。因此第一步跳过 `>=`、第二步跳过 `<=` 均须严格区分等号。
3. **反转后缀恢复最小序**：交换之后，`nums[i + 1 .. n - 1]` **依然保持单调不增**——因为换入位置 `j` 的原 `nums[i]` 严格小于左侧的 `nums[j - 1]` 且不小于右侧的 `nums[j + 1]`。因此无需 $O(n \log n)$ 排序，直接复用[《轮转数组与旋转图像：分段反转与矩阵转置》](/posts/algorithm/rotate-array-and-matrix/)中的双指针原地反转原语，即可把后缀变为最小升序。若第一步没找到 `i`（`i = -1`），跳过第二步直接反转整个数组 `[0, n - 1]`，刚好回绕到最小排列。

## Python & C++：三步原地实现

C++ 标准库 `<algorithm>` 中内置的 `std::next_permutation` 正是基于这完全相同的三步实现[^cpp-next-perm]；下面手写完整逻辑并借助 `std::reverse` 完成后缀翻转[^cpp-reverse]：

```python
class Solution:
    def nextPermutation(self, nums: list[int]) -> None:
        n = len(nums)
        # Step 1: find the rightmost pivot `i` with nums[i] < nums[i + 1].
        # Use `>=` so equal adjacent values stay inside the non-increasing suffix.
        i = n - 2
        while i >= 0 and nums[i] >= nums[i + 1]:
            i -= 1

        if i >= 0:
            # Step 2: suffix nums[i + 1:] is non-increasing, so the rightmost
            # element strictly greater than nums[i] is the smallest possible increment.
            j = n - 1
            while nums[j] <= nums[i]:
                j -= 1
            nums[i], nums[j] = nums[j], nums[i]

        # Step 3: swapping preserves non-increasing order on nums[i + 1:],
        # so an in-place reversal yields the lexicographically smallest suffix.
        left, right = i + 1, n - 1
        while left < right:
            nums[left], nums[right] = nums[right], nums[left]
            left += 1
            right -= 1
```

```cpp
#include <algorithm>
#include <utility>
#include <vector>

class Solution {
public:
    void nextPermutation(std::vector<int>& nums) const {
        const int n = static_cast<int>(nums.size());
        // Step 1: locate rightmost ascent; nums[i + 1 .. n - 1] is non-increasing.
        int i = n - 2;
        while (i >= 0 && nums[i] >= nums[i + 1]) {
            --i;
        }

        if (i >= 0) {
            // Step 2: find rightmost element strictly > nums[i] (minimal successor).
            int j = n - 1;
            while (nums[j] <= nums[i]) {
                --j;
            }
            std::swap(nums[i], nums[j]);
        }

        // Step 3: reverse the still non-increasing suffix (or full array when i == -1).
        std::reverse(nums.begin() + i + 1, nums.end());
    }
};
```

## 复杂度分析

- **时间复杂度**：三步各自至多线性扫描一遍数组，总时间复杂度为 $O(n)$。
- **辅助空间复杂度**：全程原地操作，仅维护常数个整型下标，辅助空间为 $O(1)$。

[^knuth-alg-l]: [OEIS A056542（引用 Knuth _TAOCP_ Vol. 4A, Section 7.2.1.2, Algorithm L）](https://oeis.org/A056542)——记录字典序排列生成算法 Algorithm L 的步骤与步数分析。

[^cpp-next-perm]: [cppreference：`std::next_permutation`](https://en.cppreference.com/w/cpp/algorithm/next_permutation.html)——按字典序原地生成下一排列，至多执行 $\lfloor n / 2 \rfloor$ 次交换，时间复杂度为线性 $O(n)$。

[^cpp-reverse]: [cppreference：`std::reverse`](https://en.cppreference.com/w/cpp/algorithm/reverse.html)——原地反转指定迭代器区间，用于常数空间恢复升序后缀。
