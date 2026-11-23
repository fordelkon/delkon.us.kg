---
title: "螺旋矩阵：四边界收缩与单行单列检查"
publishDate: "2026-12-26T12:00:00+08:00"
description: "LeetCode 54 螺旋矩阵：用 top、bottom、left、right 四个闭区间边界模拟顺时针剥洋葱遍历，说明每条边收缩后立即检查边界交叉的防重原理。"
tags: ["algorithm", "matrix", "python", "cpp"]
---

[LeetCode 54. 螺旋矩阵](https://leetcode.cn/problems/spiral-matrix/)（Hot 100）给定一个 $m \times n$ 的整数矩阵 `matrix`，要求按**顺时针螺旋顺序**返回矩阵中的所有元素。题目保证 $1 \le m, n \le 10$（算法本身对任意正尺寸矩形同样成立）。下列实现均只读输入矩阵，不修改 `matrix`。

## 四边界收缩：为什么不需要 `visited` 矩阵

若采用方向数组模拟“前进碰壁右转”，需要额外的 $m \times n$ 布尔访问矩阵（或原地破坏输入）才能判断内圈边界。直接维护尚未访问子矩形的四条闭区间边界 `top`、`bottom`、`left`、`right`，即可把额外空间压至 $O(1)$：

- **循环不变式**：每轮外层循环开始前，子矩形 $[top, bottom] \times [left, right]$ 恰好是全部尚未输出的元素集合，且其外侧所有层均已按顺时针顺序写入 `result`。

每一轮按“顶行左到右 $\to$ 右列上到下 $\to$ 底行右到左 $\to$ 左列下到上”剥离最外层一圈，每走完一条边立即将对应边界向内收缩 1：

以 3×3 矩阵为例，把每个格子的访问次序写回原来的位置。数字从 1 开始计数：

<div class="algorithm-table">

| 行 | 左列 | 中列 | 右列 |
| --- | ---: | ---: | ---: |
| 顶行 | 1 | 2 | 3 |
| 中行 | 8 | **9** | 4 |
| 底行 | 7 | 6 | 5 |

</div>

第一圈按顶行、右列、底行、左列读完 1 至 8，四条边界一起收缩到中心。下一圈只读第 9 格；读完这一个格后，行边界已交叉，守卫会跳过底边以免重复。

**易错反例（非方阵的半圈重复读取）**：

- 对单行矩阵 `[[1, 2, 3]]`（$m = 1, n = 3$）：走完顶行后 `top` 从 `0` 变为 `1`，已经满足 `top > bottom`。右列循环 `range(1, 1)` 为空，但若底行缺少 `if top <= bottom` 守卫，就会把第 `0` 行再倒序读取一遍，错误输出 `[1, 2, 3, 2, 1]`。
- 对单列矩阵 `[[1], [2], [3]]`（$m = 3, n = 1$）：走完顶行与右列后 `right` 从 `0` 变为 `-1`，已经满足 `left > right`。若左列缺少 `if left <= right` 守卫，就会把第 `0` 列再从下到上重复读一遍。

因此**底行前守卫 `top <= bottom`、左列前守卫 `left <= right`** 是维持“每个单元格恰好访问一次”不变式的充要条件。

## Python & C++：四边界顺时针遍历

```python
class Solution:
    def spiralOrder(self, matrix: list[list[int]]) -> list[int]:
        top, bottom = 0, len(matrix) - 1
        left, right = 0, len(matrix[0]) - 1
        result: list[int] = []

        # Invariant: [top..bottom] x [left..right] is the exact unvisited submatrix.
        while top <= bottom and left <= right:
            for c in range(left, right + 1):
                result.append(matrix[top][c])
            top += 1

            for r in range(top, bottom + 1):
                result.append(matrix[r][right])
            right -= 1

            # Guard against re-reading a single remaining row in reverse.
            if top <= bottom:
                for c in range(right, left - 1, -1):
                    result.append(matrix[bottom][c])
                bottom -= 1

            # Guard against re-reading a single remaining column upward.
            if left <= right:
                for r in range(bottom, top - 1, -1):
                    result.append(matrix[r][left])
                left += 1

        return result
```

C++ 版本预先调用 `result.reserve(rows * cols)`，一次性分配输出容器容量以消除 `push_back` 期间的多次扩容拷贝[^cpp-reserve]：

```cpp
#include <cstddef>
#include <vector>

class Solution {
public:
    std::vector<int> spiralOrder(const std::vector<std::vector<int>>& matrix) const {
        const int rows = static_cast<int>(matrix.size());
        const int cols = static_cast<int>(matrix[0].size());
        std::vector<int> result;
        result.reserve(static_cast<std::size_t>(rows) * static_cast<std::size_t>(cols));

        int top = 0;
        int bottom = rows - 1;
        int left = 0;
        int right = cols - 1;

        // Invariant: remaining unvisited cells form the closed box [top..bottom] x [left..right].
        while (top <= bottom && left <= right) {
            for (int c = left; c <= right; ++c) {
                result.push_back(matrix[top][c]);
            }
            ++top;

            for (int r = top; r <= bottom; ++r) {
                result.push_back(matrix[r][right]);
            }
            --right;

            // Only traverse the bottom edge if at least one row still remains.
            if (top <= bottom) {
                for (int c = right; c >= left; --c) {
                    result.push_back(matrix[bottom][c]);
                }
                --bottom;
            }

            // Only traverse the left edge if at least one column still remains.
            if (left <= right) {
                for (int r = bottom; r >= top; --r) {
                    result.push_back(matrix[r][left]);
                }
                ++left;
            }
        }

        return result;
    }
};
```

## 复杂度分析与关联阅读

- **时间复杂度**：每个单元格恰好入列一次，Python `list.append` 与 C++ 预分配后的 `push_back` 均为均摊/常数 $O(1)$[^py-list-complexity]，总时间复杂度为 $O(m \cdot n)$。
- **空间复杂度**：输出序列占用 $O(m \cdot n)$ 空间；不计输出时仅维护四个整型边界，辅助空间为 $O(1)$。

在矩阵专题内，本题用边界收缩保持只读遍历的 $O(1)$ 额外空间，可与同样在二维网格上操作坐标边界的[《轮转数组与旋转图像：分段反转与矩阵转置》](/posts/algorithm/rotate-array-and-matrix/)及[《搜索二维矩阵 II：从右上角排除整行或整列》](/posts/algorithm/search-a-2d-matrix-ii/)对照阅读。

[^cpp-reserve]: [cppreference：`std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve.html)——在已知最终元素总数时提前预留连续内存容量，避免插入过程中的重复扩容搬移。

[^py-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——列表尾部 `append()` 的均摊时间复杂度为 $O(1)$。
