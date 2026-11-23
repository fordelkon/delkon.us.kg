---
title: "矩阵置零：用首行首列记录清零标记"
publishDate: "2026-12-25T12:00:00+08:00"
description: "LeetCode 73 矩阵置零：借用矩阵自身的首行与首列存放整行/整列清零标记，并用单独布尔变量消除左上角 matrix[0][0] 同时代表第 0 行与第 0 列的语义冲突。"
tags: ["algorithm", "matrix", "python", "cpp"]
---

[LeetCode 73. 矩阵置零](https://leetcode.cn/problems/set-matrix-zeroes/)（Hot 100）给定一个 $m \times n$ 的整数矩阵 `matrix`，如果一个元素为 `0`，则将其所在行和列的所有元素都设为 `0`，要求**原地**完成且尽量把额外空间压至常数 $O(1)$。题目保证 $1 \le m, n \le 200$。

## 借用首行首列：解决 `matrix[0][0]` 的所有权冲突

如果允许 $O(m + n)$ 空间，只需用两个布尔数组 `row_zero[m]` 与 `col_zero[n]` 记录哪些行和列出现过 `0`，然后第二趟统一清零。为了达到 $O(1)$ 空间，我们可以直接把**第 0 列**当作 `row_zero`，把**第 0 行**当作 `col_zero`：

下面的矩阵只有中心格为 0。每列对应一个阶段，每行保留原来的元素位置。扫描内区时，只有第一行第二格和第二行第一格用于存标记：

<div class="algorithm-table">

| 行 | 原矩阵 | 写标记后 | 清零后 |
| --- | --- | --- | --- |
| 0 | `1  2  3` | `1  0  3` | `1  0  3` |
| 1 | `4  0  6` | `0  0  6` | `0  0  0` |
| 2 | `7  8  9` | `7  8  9` | `7  0  9` |

</div>

原首行和首列都没有零，所以最后无需整行或整列清零，只保留刚才写入的标记。

这样复用时有一个经典陷阱：**左上角单元格 `matrix[0][0]` 同时属于第 0 行和第 0 列**。如果既用它代表“第 0 行是否置零”，又用它代表“第 0 列是否置零”，就会互相污染（比如第 0 列下面出现 `0` 把 `matrix[0][0]` 改成了 `0`，结果误把第 0 行也全清零了）。

解决办法非常干净：

1. 扫描前先用两个独立的布尔变量 `first_row_zero` 与 `first_col_zero`（或只用一个 `col0_zero` 搭配 `matrix[0][0]` 代表首行）单独记下第 0 行、第 0 列**原本**是否包含 `0`；
2. 内部区域 `[1..m-1][1..n-1]` 遇到 `matrix[r][c] == 0` 时，只修改 `matrix[r][0] = 0` 与 `matrix[0][c] = 0`；
3. **回填顺序必须先内区、后首行首列**：如果先清零第 0 行或第 0 列，会把内区依赖的标记信息全部抹成 `0`。

## Python & C++：原地 $O(1)$ 空间实现

```python
class Solution:
    def setZeroes(self, matrix: list[list[int]]) -> None:
        # Time complexity: O(m * n)
        # Space complexity: O(1) auxiliary space
        rows, cols = len(matrix), len(matrix[0])
        first_row_zero = any(matrix[0][c] == 0 for c in range(cols))
        first_col_zero = any(matrix[r][0] == 0 for r in range(rows))

        # Project interior zeroes onto the first row and first column.
        for r in range(1, rows):
            for c in range(1, cols):
                if matrix[r][c] == 0:
                    matrix[r][0] = 0
                    matrix[0][c] = 0

        # Zero interior cells before touching the marker row/column.
        for r in range(1, rows):
            for c in range(1, cols):
                if matrix[r][0] == 0 or matrix[0][c] == 0:
                    matrix[r][c] = 0

        if first_row_zero:
            for c in range(cols):
                matrix[0][c] = 0
        if first_col_zero:
            for r in range(rows):
                matrix[r][0] = 0
```

```cpp
#include <vector>

class Solution {
public:
    void setZeroes(std::vector<std::vector<int>>& matrix) const {
        // Time complexity: O(m * n)
        // Space complexity: O(1) auxiliary space
        const int rows = static_cast<int>(matrix.size());
        const int cols = static_cast<int>(matrix[0].size());

        bool first_row_zero = false;
        for (int c = 0; c < cols; ++c) {
            if (matrix[0][c] == 0) {
                first_row_zero = true;
                break;
            }
        }

        bool first_col_zero = false;
        for (int r = 0; r < rows; ++r) {
            if (matrix[r][0] == 0) {
                first_col_zero = true;
                break;
            }
        }

        for (int r = 1; r < rows; ++r) {
            for (int c = 1; c < cols; ++c) {
                if (matrix[r][c] == 0) {
                    matrix[r][0] = 0;
                    matrix[0][c] = 0;
                }
            }
        }

        for (int r = 1; r < rows; ++r) {
            for (int c = 1; c < cols; ++c) {
                if (matrix[r][0] == 0 || matrix[0][c] == 0) {
                    matrix[r][c] = 0;
                }
            }
        }

        if (first_row_zero) {
            for (int c = 0; c < cols; ++c) {
                matrix[0][c] = 0;
            }
        }
        if (first_col_zero) {
            for (int r = 0; r < rows; ++r) {
                matrix[r][0] = 0;
            }
        }
    }
};
```

## 复杂度分析与原地编码关联

- **时间复杂度**：首行首列检查耗时 $O(m + n)$，内区投影与内区回填各遍历一次矩阵耗时 $O(m \cdot n)$，总时间复杂度为 $O(m \cdot n)$。
- **辅助空间复杂度**：仅使用两个布尔标志与循环索引，额外空间为 $O(1)$。

这种“复用输入容器自身空间存放元数据、再通过严格读写顺序防污染”的思路，与[《缺失的第一个正数：把正数放回对应下标》](/posts/algorithm/first-missing-positive/)及[《轮转数组与旋转图像：分段反转与矩阵转置》](/posts/algorithm/rotate-array-and-matrix/)共同构成了常数空间原地矩阵/数组处理的三大代表手法。

[^cpp-fill]: [cppreference：`std::fill`](https://tcs.rwth-aachen.de/docs/cpp/reference/en.cppreference.com/w/cpp/algorithm/fill.html)——以线性时间将指定迭代器区间内的所有元素赋为给定值。
