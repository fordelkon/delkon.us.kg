---
title: "搜索二维矩阵：行主序映射与一维二分"
publishDate: "2026-12-01T12:00:00+08:00"
description: "LeetCode 74 搜索二维矩阵：利用行首严格大于上一行尾的全局有序性质，通过整除与取模把二维矩阵虚拟映射为一维有序数组做单次二分，并与 LeetCode 240 阶梯搜索对比。"
tags: ["algorithm", "binary-search", "python", "cpp"]
---

[LeetCode 74. 搜索二维矩阵](https://leetcode.cn/problems/search-a-2d-matrix/)（Hot 100）给定一个 $m \times n$ 的整数矩阵 `matrix` 和目标整数 `target`，要求判断 `target` 是否存在于矩阵中，且时间复杂度必须为 $O(\log(m \cdot n))$。矩阵满足两条严格有序性质：

1. 每行中的整数从左到右按非严格递增顺序排列；
2. 每行的第一个整数严格大于前一行的最后一个整数。

题目保证 $1 \le m, n \le 100$，元素与目标值范围在 $[-10^4, 10^4]$ 之间。

## 行主序虚拟一维映射

两条有序性质合起来等价于一个更简洁的事实：**如果把 `matrix` 按行依次拼接成一条长度为 $m \cdot n$ 的一维序列，整条序列全局非递减有序**。

我们当然不需要真的分配 $O(m \cdot n)$ 内存去拷贝展平数组。借助**行主序坐标映射**（row-major indexing），逻辑一维下标 $k \in [0, m \cdot n - 1]$ 与二维坐标 $(r, c)$ 之间存在常数时间的双射关系：

$$
r = \lfloor k / n \rfloor, \qquad c = k \bmod n.
$$

只要在[《搜索插入位置与元素范围：二分查找左右边界》](/posts/algorithm/find-first-and-last-position-of-element-in-sorted-array/)的标准一维二分模板中，把访问 `nums[mid]` 替换为 `matrix[mid // n][mid % n]`，就能在零拷贝、常数额外空间下完成全局二分。

## Python：单次虚拟一维二分

```python
class Solution:
    def searchMatrix(self, matrix: list[list[int]], target: int) -> bool:
        # Time complexity: O(log(m * n))
        # Space complexity: O(1) auxiliary space
        rows, cols = len(matrix), len(matrix[0])
        lo, hi = 0, rows * cols

        while lo < hi:
            mid = lo + (hi - lo) // 2
            val = matrix[mid // cols][mid % cols]
            if val == target:
                return True
            if val < target:
                lo = mid + 1
            else:
                hi = mid

        return False
```

这里采用左闭右开区间 `[lo, hi)`，与[《搜索插入位置与元素范围：二分查找左右边界》](/posts/algorithm/find-first-and-last-position-of-element-in-sorted-array/)保持完全一致的收敛不变式；遇到相等时直接提前返回 `True`。

## C++：防溢出下标与列宽映射

在 C++ 中，当矩阵规模扩大时 `rows * cols` 与 `lo + hi` 都应注意整型范围。使用 `std::size_t` 计算 `total = rows * cols` 和 `mid = lo + (hi - lo) / 2` 可以避免有符号溢出[^cpp-size-t]：

```cpp
#include <cstddef>
#include <vector>

class Solution {
public:
    bool searchMatrix(const std::vector<std::vector<int>>& matrix, int target) const {
        // Time complexity: O(log(m * n))
        // Space complexity: O(1) auxiliary space
        const std::size_t rows = matrix.size();
        const std::size_t cols = matrix[0].size();
        std::size_t lo = 0;
        std::size_t hi = rows * cols;

        while (lo < hi) {
            const std::size_t mid = lo + (hi - lo) / 2;
            const int val = matrix[mid / cols][mid % cols];
            if (val == target) {
                return true;
            }
            if (val < target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        return false;
    }
};
```

另一种思路是**两次二分**：先对首列 `matrix[r][0]` 做二分定位目标可能所在的唯一一行，再在该行内做一次列二分。两次二分的时间复杂度同样是 $O(\log m + \log n) = O(\log(m \cdot n))$，且在极大矩阵下不会计算 `rows * cols` 乘积；而单次虚拟一维映射胜在代码更紧凑、仅需一次循环。

## 与 LeetCode 240 的有序前提对比

本题常与 [LeetCode 240. 搜索二维矩阵 II](https://leetcode.cn/problems/search-a-2d-matrix-ii/) 混淆。后者的条件更弱——只保证“每行递增、每列递增”，**不保证**下一行首元素大于上一行尾元素（例如 `[[1, 4], [2, 5]]`）。此时按行拼接不再全局有序，虚拟一维二分彻底失效，必须改用从右上角出发的**阶梯排除法**（每步排除一整行或一整列，时间 $O(m + n)$）。

| 题目 | 有序约束 | 最优策略 | 时间复杂度 | 辅助空间 |
| :--- | :------- | :------- | :--------- | :------- |
| 搜索二维矩阵（本题，LC 74） | 行内有序且下行行首 > 上行尾（全局有序） | 行主序虚拟一维二分 / 两次二分 | $O(\log(m \cdot n))$ | $O(1)$ |
| 搜索二维矩阵 II（LC 240） | 仅每行递增、每列递增（局部偏序） | 右上角（或左下角）阶梯排除 | $O(m + n)$ | $O(1)$ |

这种区分再次印证了二分的根本前提：能否每次折半排除一半候选空间，取决于搜索空间上是否存在全局单调的布尔谓词[^clrs-binary-search]。

[^cpp-size-t]: [cppreference：`std::size_t`](https://en.cppreference.com/w/cpp/types/size_t.html)——无符号尺寸类型，与 `std::vector::size()` 返回类型匹配，适合表示容器下标与虚拟展平偏移。

[^clrs-binary-search]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——Exercise 2.3-6 讨论有序序列上的二分查找及其对数级时间界。
