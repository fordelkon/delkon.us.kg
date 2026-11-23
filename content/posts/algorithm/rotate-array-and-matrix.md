---
title: "轮转数组与旋转图像：分段反转与矩阵转置"
publishDate: "2026-12-24T12:00:00+08:00"
description: "合并解析 LeetCode 189 轮转数组与 LeetCode 48 旋转图像：揭示两道原地旋转题的几何同构性——一维循环右移通过三次反转实现，二维顺时针 90 度通过主对角线转置加每行反转实现。"
tags: ["algorithm", "matrix", "python", "cpp"]
---

Hot 100 中有两道要求**原地**完成且仅用 $O(1)$ 额外空间的旋转题：

- [LeetCode 189. 轮转数组](https://leetcode.cn/problems/rotate-array/)：将长度为 $n$ 的一维数组 `nums` 向右轮转 $k$ 个位置（$1 \le n \le 10^5$，$0 \le k \le 10^5$）；
- [LeetCode 48. 旋转图像](https://leetcode.cn/problems/rotate-image/)：将 $n \times n$ 方阵 `matrix` 原地顺时针旋转 90 度（$1 \le n \le 20$）。

**副作用说明**：两题均按题目要求直接原地修改输入容器，不返回新数组。两道题的共同核心在于**用两次或三次对合反射（反转/转置）复合出旋转**，彻底省去环状搬运中最大公约数分环与索引追踪的复杂度。

先看一维例子，把 `[1, 2, 3, 4, 5]` 向右轮转两格。加粗的两格原本在末尾，整体反转后到了最前面：

<div class="algorithm-table">

| 状态 | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 原数组 | 1 | 2 | 3 | **4** | **5** |
| 整体反转 | **5** | **4** | 3 | 2 | 1 |
| 分两段反转 | **4** | **5** | 1 | 2 | 3 |

</div>

二维例子跟踪元素 2。坐标从 0 开始，转置交换行列，逐行反转再把它移到同一行的另一端：

<div class="algorithm-table">

| 位置 | 原矩阵 | 转置后 | 逐行反转后 |
| --- | --- | --- | --- |
| 左上 | 1 | 1 | 3 |
| 右上 | **2** | 3 | 1 |
| 左下 | 3 | **2** | 4 |
| 右下 | 4 | 4 | **2** |

</div>

## 原理一：三次反转完成一维轮转（LC 189）

向右轮转 $k$ 步时，由于轮转 $n$ 步回到原位，必须先取模 $k \leftarrow k \bmod n$（若 $n \le 1$ 或 $k = 0$ 则直接返回；**易错点**：若忘记取模，当 $k > n$ 时反转边界会越界）。令前缀长度为 $n - k$ 的片段为 $A$、后缀长度为 $k$ 的片段为 $B$，目标是将 $AB$ 变为 $BA$。利用反转算子的代数性质 $(AB)^R = B^R A^R$[^bentley-rotate]：

1. 整体反转：$(AB)^R = B^R A^R$；
2. 反转前 $k$ 个元素与后 $n - k$ 个元素：$(B^R)^R (A^R)^R = BA$。

这一双指针原地反转原语同样出现在[《下一个排列：找拐点、交换与反转后缀》](/posts/algorithm/next-permutation/)中，用于把降序后缀原地翻转为最小升序后缀。

## 原理二：转置 + 水平反转完成顺时针 90 度（LC 48）

顺时针旋转 90 度时，原坐标 $(i, j)$ 的元素会移动到 $(j, n - 1 - i)$。在二维正交变换中，一次旋转可以分解为两次反射的复合：

1. **沿主对角线转置**：$(i, j) \mapsto (j, i)$。**易错反例**：若内层循环从 `j = 0` 遍历到 `n - 1`，每对对称元素 `(i, j)` 与 `(j, i)` 会被交换两次，矩阵纹丝不动；必须只遍历严格上三角 `j > i`。
2. **每行左右反转**：$(j, i) \mapsto (j, n - 1 - i)$。

两步复合恰好得到 $(i, j) \mapsto (j, n - 1 - i)$；若改为逆时针旋转 90 度，只需把第二步换成“上下翻转行序”即可。

## Python & C++：双题统一原地翻转实现

```python
class Solution:
    def rotate(self, nums: list[int], k: int) -> None:
        n = len(nums)
        if n <= 1:
            return
        # Modulo prevents out-of-bounds reversal when k >= n.
        k %= n
        if k == 0:
            return

        def reverse_range(left: int, right: int) -> None:
            # Invariant: elements outside [left, right] are already in reversed positions.
            while left < right:
                nums[left], nums[right] = nums[right], nums[left]
                left += 1
                right -= 1

        # (A B)^R = B^R A^R -> reverse each part to restore B A.
        reverse_range(0, n - 1)
        reverse_range(0, k - 1)
        reverse_range(k, n - 1)

    def rotateMatrix(self, matrix: list[list[int]]) -> None:
        # Note: LeetCode 48 names this method `rotate`.
        n = len(matrix)
        # Transpose strictly above the main diagonal so each pair is swapped once.
        for i in range(n):
            for j in range(i + 1, n):
                matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
        # Horizontal reflection maps (j, i) -> (j, n - 1 - i), completing 90-deg CW rotation.
        for row in matrix:
            row.reverse()
```

C++ 版本直接复用标准库 `std::reverse` 与 `std::swap`[^cpp-reverse]：

```cpp
#include <algorithm>
#include <utility>
#include <vector>

class Solution {
public:
    // LeetCode 189: right-rotate `nums` in place by `k` steps.
    void rotate(std::vector<int>& nums, int k) const {
        const int n = static_cast<int>(nums.size());
        if (n <= 1) {
            return;
        }
        k %= n;
        if (k == 0) {
            return;
        }
        // Three reversals compute (A B)^R = B^R A^R -> B A in place.
        std::reverse(nums.begin(), nums.end());
        std::reverse(nums.begin(), nums.begin() + k);
        std::reverse(nums.begin() + k, nums.end());
    }

    // LeetCode 48 (method name on LeetCode is `rotate`): 90-deg clockwise in-place rotation.
    void rotateMatrix(std::vector<std::vector<int>>& matrix) const {
        const int n = static_cast<int>(matrix.size());
        // Restrict to j > i so symmetric entries are exchanged exactly once.
        for (int i = 0; i < n; ++i) {
            for (int j = i + 1; j < n; ++j) {
                std::swap(matrix[i][j], matrix[j][i]);
            }
        }
        for (auto& row : matrix) {
            std::reverse(row.begin(), row.end());
        }
    }
};
```

## 复杂度分析与关联阅读

- **轮转数组**（LC 189）：整体反转与两段局部反转合计访问每个元素两次，时间复杂度为 $O(n)$，辅助空间为 $O(1)$。
- **旋转图像**（LC 48）：上三角转置执行 $\frac{n(n - 1)}{2}$ 次交换，各行反转共执行 $n \lfloor n / 2 \rfloor$ 次交换，时间复杂度为 $O(n^2)$，辅助空间为 $O(1)$。

两题均属于原地矩阵/数组变换家族，可与同样强调原地空间压缩的[《矩阵置零：用首行首列记录清零标记》](/posts/algorithm/set-matrix-zeroes/)及[《螺旋矩阵：四边界收缩与单行单列检查》](/posts/algorithm/spiral-matrix/)对照阅读。

[^bentley-rotate]: [Jon Bentley: _Programming Pearls_ (2nd ed., Column 2, Section 2.3: Vector Rotation)](https://archive.org/stream/ProgrammingPearls2ndEditionJonBentley/Programming%20Pearls%20%282nd%20Edition%29%20-%20Jon%20Bentley_djvu.txt)——经典的三次反转向量轮转推导（`AB -> B^R A^R -> BA`）。

[^cpp-reverse]: [cppreference：`std::reverse`](https://en.cppreference.com/w/cpp/algorithm/reverse.html)——原地反转指定迭代器区间，精确执行 $\lfloor (\text{last} - \text{first}) / 2 \rfloor$ 次交换。
