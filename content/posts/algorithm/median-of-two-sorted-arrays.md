---
title: "寻找两个正序数组的中位数：在短数组上二分切分点"
publishDate: "2026-12-03T12:00:00+08:00"
description: "LeetCode 4 寻找两个正序数组的中位数：将双数组合并中位数转化为较短数组上的切分点二分，推导交叉有序不变式与正负无穷哨兵处理，实现 O(log min(m, n)) 时间与常数空间。"
tags: ["algorithm", "binary-search", "python", "cpp"]
---

[LeetCode 4. 寻找两个正序数组的中位数](https://leetcode.cn/problems/median-of-two-sorted-arrays/)（Hot 100，困难）给定两个大小分别为 $m$ 和 $n$ 的正序（非递减）数组 `nums1` 和 `nums2`，要求在 $O(\log(m + n))$ 时间复杂度内找出这两个正序数组合并后的中位数。题目保证 $0 \le m, n \le 1000$，$1 \le m + n \le 2000$，元素范围在 $[-10^6, 10^6]$ 之间。

如果像归并排序那样用双指针逐个合并两个数组（参见[《合并 K 个升序链表：小顶堆与两两归并》](/posts/algorithm/merge-k-sorted-lists/)的归并思路），找到第 $\lfloor (m + n) / 2 \rfloor$ 个元素需要 $O(m + n)$ 时间。要达到对数级复杂度，不能逐个推进指针，而必须把“找中位数”重新表述为**在较短数组上二分一个切分位置**。

## 中位数的切分等价定义

设两数组为 $A$（长度 $m$）和 $B$（长度 $n$），并预先确保 $m \le n$（否则交换两者引用）。我们要把 $A$ 切成左半 $A[0..i-1]$ 与右半 $A[i..m-1]$，把 $B$ 切成左半 $B[0..j-1]$ 与右半 $B[j..n-1]$，使两侧元素数量满足：

$$
i + j = \left\lfloor \frac{m + n + 1}{2} \right\rfloor \equiv \text{half}.
$$

这样约定后，无论总长度 $m + n$ 是奇数还是偶数，左半部分总比右半部分多 1 个或恰好相等；且因为 $m \le n$，对任意 $i \in [0, m]$，对应的 $j = \text{half} - i$ 自动满足 $0 \le j \le n$，**绝不会越界**。这就是必须先保证 $m \le n$ 的根本原因——否则对较长数组取 $i = 0$ 或 $i = m$ 时，$j$ 可能变成负数或大于 $n$。

由于 $A$ 和 $B$ 各自有序，天然满足 $A[i - 1] \le A[i]$ 与 $B[j - 1] \le B[j]$。只要切分点 $(i, j)$ 额外满足**交叉有序条件**：

$$
A[i - 1] \le B[j] \quad \text{且} \quad B[j - 1] \le A[i],
$$

则左半部分的所有元素都不大于右半部分的任何元素，切分恰好落在中位数处：

- 若 $m + n$ 为奇数，中位数即左半最大值 $\max(A[i - 1], B[j - 1])$；
- 若 $m + n$ 为偶数，中位数即 $\dfrac{\max(A[i - 1], B[j - 1]) + \min(A[i], B[j])}{2}$。

### 单调性与正负无穷哨兵

当 $i$ 增大时，$A[i - 1]$ 单调不减，同时 $j = \text{half} - i$ 减小使 $B[j]$ 单调不增，因此条件 $A[i - 1] \le B[j]$ 关于 $i$ 具有严格单调性，可以用二分查找定位唯一合法切分点：

- 若 $A[i - 1] > B[j]$，说明 $i$ 切得太靠右，缩小右边界 `hi = i - 1`；
- 若 $B[j - 1] > A[i]$，说明 $i$ 切得太靠左，增大左边界 `lo = i + 1`；
- 否则两侧交叉条件同时成立，立即计算并返回中位数。

当 $i = 0$、$i = m$、$j = 0$ 或 $j = n$ 时，某侧切分边界为空。引入哨兵约定：左侧越界取 $-\infty$，右侧越界取 $+\infty$，所有边界情况就自动融入同一套不等式，无需写大量特判分支。

## Python：短数组切分二分与浮点哨兵

Python 的 `float("-inf")` 与 `float("inf")` 可直接与整数安全比较，使四边界哨兵写法非常直观：

```python
class Solution:
    def findMedianSortedArrays(self, nums1: list[int], nums2: list[int]) -> float:
        # Time complexity: O(log min(m, n))
        # Space complexity: O(1) auxiliary space
        if len(nums1) > len(nums2):
            nums1, nums2 = nums2, nums1

        m, n = len(nums1), len(nums2)
        half = (m + n + 1) // 2
        lo, hi = 0, m

        while lo <= hi:
            i = lo + (hi - lo) // 2
            j = half - i

            a_left = nums1[i - 1] if i > 0 else float("-inf")
            a_right = nums1[i] if i < m else float("inf")
            b_left = nums2[j - 1] if j > 0 else float("-inf")
            b_right = nums2[j] if j < n else float("inf")

            if a_left <= b_right and b_left <= a_right:
                if (m + n) % 2 == 1:
                    return float(max(a_left, b_left))
                return (max(a_left, b_left) + min(a_right, b_right)) / 2.0

            if a_left > b_right:
                # Partition `i` is too far right in nums1.
                hi = i - 1
            else:
                # Partition `i` is too far left in nums1.
                lo = i + 1

        return 0.0
```

## C++：整型极值哨兵与零拷贝切换

C++ 版本通过指针或递归参数交换保证 `a.size() <= b.size()`（不拷贝输入数组），使用 `<limits>` 中的 `std::numeric_limits<int>::min()` 与 `max()` 作为哨兵[^cpp-limits]；求和取平均时转换为 `double` 防止两 `int` 相加在更大值域下溢出：

```cpp
#include <algorithm>
#include <limits>
#include <vector>

class Solution {
public:
    double findMedianSortedArrays(const std::vector<int>& nums1,
                                  const std::vector<int>& nums2) const {
        // Time complexity: O(log min(m, n))
        // Space complexity: O(1) auxiliary space
        if (nums1.size() > nums2.size()) {
            return findMedianSortedArrays(nums2, nums1);
        }

        const int m = static_cast<int>(nums1.size());
        const int n = static_cast<int>(nums2.size());
        const int half = (m + n + 1) / 2;
        constexpr int kNegInf = std::numeric_limits<int>::min();
        constexpr int kPosInf = std::numeric_limits<int>::max();

        int lo = 0;
        int hi = m;
        while (lo <= hi) {
            const int i = lo + (hi - lo) / 2;
            const int j = half - i;

            const int a_left = (i > 0) ? nums1[i - 1] : kNegInf;
            const int a_right = (i < m) ? nums1[i] : kPosInf;
            const int b_left = (j > 0) ? nums2[j - 1] : kNegInf;
            const int b_right = (j < n) ? nums2[j] : kPosInf;

            if (a_left <= b_right && b_left <= a_right) {
                const int left_max = std::max(a_left, b_left);
                if ((m + n) % 2 == 1) {
                    return static_cast<double>(left_max);
                }
                const int right_min = std::min(a_right, b_right);
                return (static_cast<double>(left_max) + static_cast<double>(right_min)) / 2.0;
            }

            if (a_left > b_right) {
                hi = i - 1;
            } else {
                lo = i + 1;
            }
        }

        return 0.0;
    }
};
```

注意若通用输入中数组元素可能恰好等于 `INT_MIN` 或 `INT_MAX`，应将哨兵条件改写为带下标保护的布尔判断（如 `i > 0 && nums1[i - 1] > nums2[j]`），避免真实极值与哨兵冲突；在本题 $[-10^6, 10^6]$ 的值域下，`INT_MIN`/`INT_MAX` 严格位于所有真实元素之外。

## 复杂度分析与方案对比

切分点 `i` 的搜索区间长度为 $\min(m, n) + 1$，每轮将区间减半，因此时间复杂度为 $O(\log \min(m, n))$——严格优于题目要求的 $O(\log(m + n))$。算法全程只读输入数组并维护常数个整型变量，辅助空间复杂度为 $O(1)$。

| 方案 | 时间复杂度 | 辅助空间 | 核心思路 |
| :--- | :--------- | :------- | :------- |
| 双指针归并扫描 | $O(m + n)$ | $O(1)$ | 推进双指针直到第 $(m + n) / 2$ 步 |
| 第 $k$ 小元素倍增排除 | $O(\log(m + n))$ | $O(1)$ | 每次比较两数组第 $k / 2$ 项，排除较小前段 |
| 短数组切分点二分（本文） | $O(\log \min(m, n))$ | $O(1)$ | 在较短数组上二分切分点，满足交叉有序不变式 |

[^cpp-limits]: [cppreference：`std::numeric_limits`](https://en.cppreference.com/w/cpp/types/numeric_limits.html)——提供 `min()` 与 `max()` 常量表达式，用于构造位于 $[-10^6, 10^6]$ 值域之外的切分边界哨兵。
