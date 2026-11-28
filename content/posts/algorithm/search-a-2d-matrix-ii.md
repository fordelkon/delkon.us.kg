---
title: "搜索二维矩阵 II：从右上角排除整行或整列"
publishDate: "2026-12-27T12:00:00+08:00"
description: "LeetCode 240 搜索二维矩阵 II：解释为何虚拟一维二分在局部有序矩阵上失效，改用右上角出发的 Z 字形阶梯排除，每步确定性地淘汰一整行或一整列。"
tags: ["algorithm", "matrix", "binary-search", "python", "cpp"]
---

[LeetCode 240. 搜索二维矩阵 II](https://leetcode.cn/problems/search-a-2d-matrix-ii/)（Hot 100）给定一个 $m \times n$ 的整数矩阵 `matrix` 和目标值 `target`，判断 `target` 是否出现在矩阵中。矩阵满足每行从左到右升序、每列从上到下升序，但**不保证**下一行首元素大于上一行尾元素。题目保证 $1 \le m, n \le 300$，元素与 `target` 均在 $[-10^9, 10^9]$ 范围内。下列实现均只读输入矩阵，不修改 `matrix`。

## 为什么必须从右上角（或左下角）出发

在[《搜索二维矩阵：行主序映射与一维二分》](/posts/algorithm/search-a-2d-matrix/)中，全局全序性允许把矩阵展平做 $O(\log(m \cdot n))$ 二分。而本题只给出行、列各自的局部单调性（二维偏序关系），按行拼接不再单调——例如 `[[1, 4], [2, 5]]` 展平为 `[1, 4, 2, 5]` 存在逆序 `4 > 2`，直接一维二分会漏检目标。

剩余子矩形的**右上角**既是本行最大值，也是本列最小值。它比 `target` 大时，整列都太大，向左移一格。它比 `target` 小时，整行都太小，向下移一格。这样，每次未命中的比较都排除一整行或一整列，这就是**鞍点搜索**（saddleback search）[^bird-saddleback]。

**循环不变式与反例**：

- **不变式**：若 `target` 存在于矩阵中，则它必然位于剩余左下子矩形 $[r, m - 1] \times [0, c]$ 内。
- **为什么不能从左上角出发**：在左上角 `(0, 0)`，向右与向下元素同时增大，当 `val < target` 时无法确定目标在右方还是下方，搜索会分叉退化。只有**右上角**和**左下角**能让一次比较确定性地排除剩余区域的一整行或一整列。

## Python & C++：Z 字形阶梯搜索

```python
class Solution:
    def searchMatrix(self, matrix: list[list[int]], target: int) -> bool:
        rows, cols = len(matrix), len(matrix[0])
        r, c = 0, cols - 1

        # Invariant: if target exists, it lies inside [r..rows-1] x [0..c].
        while r < rows and c >= 0:
            val = matrix[r][c]
            if val == target:
                return True
            if val > target:
                # Column c is sorted ascending downward, so every remaining cell
                # below (r, c) is strictly larger than target; drop column c.
                c -= 1
            else:
                # Row r is sorted ascending rightward, so every remaining cell
                # left of (r, c) is strictly smaller than target; drop row r.
                r += 1

        return False
```

C++ 版本以 `const` 引用只读访问二维 `std::vector`[^cpp-vector]：

```cpp
#include <vector>

class Solution {
public:
    bool searchMatrix(const std::vector<std::vector<int>>& matrix, int target) const {
        const int rows = static_cast<int>(matrix.size());
        const int cols = static_cast<int>(matrix[0].size());
        int r = 0;
        int c = cols - 1;

        // Invariant: any match must remain within the lower-left box [r..rows-1] x [0..c].
        while (r < rows && c >= 0) {
            const int val = matrix[r][c];
            if (val == target) {
                return true;
            }
            if (val > target) {
                // Eliminate column c: all entries below val are >= val > target.
                --c;
            } else {
                // Eliminate row r: all entries left of val are <= val < target.
                ++r;
            }
        }

        return false;
    }
};
```

## 复杂度分析与算法对比

- **时间复杂度**：每次比较要么令 `r` 加 1（至多 $m$ 次），要么令 `c` 减 1（至多 $n$ 次），总步数严格不超过 $m + n$，时间复杂度为 $O(m + n)$。当矩阵极为扁平（如 $m \ll n$）时，也可逐行调用二分查找达到 $O(m \log n)$；但对一般方阵而言，阶梯搜索的 $O(m + n)$ 渐近优于 $O(m \log n)$，且已是仅利用行列偏序时的最优比较下界之一[^bird-saddleback]。
- **辅助空间复杂度**：仅使用行、列两个整型指针，额外空间为 $O(1)$。

每步利用单调边界成批排除不可能候选的思维，与[《盛最多水的容器：短板内移与候选排除》](/posts/algorithm/container-with-most-water/)完全一致；若矩阵进一步满足全局行主序升序，则应回到[《搜索二维矩阵：行主序映射与一维二分》](/posts/algorithm/search-a-2d-matrix/)获取对数级 $O(\log(m \cdot n))$ 查找。

[^bird-saddleback]: [Richard Bird (2006): _Improving Saddleback Search: A Lesson in Algorithm Design_](https://www.cs.ox.ac.uk/publications/publication2391-abstract.html)（*Mathematics of Program Construction*, LNCS 4014）——系统分析行列有序矩阵上的鞍点搜索（saddleback search）不变式与 $O(m + n)$ 复杂度界。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——连续存储容器，通过 `operator[]` 提供常数时间随机访问。
