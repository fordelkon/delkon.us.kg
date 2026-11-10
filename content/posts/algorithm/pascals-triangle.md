---
title: "杨辉三角：组合数递推与行内就地更新"
publishDate: "2026-11-04T12:00:00+08:00"
description: "LeetCode 118 杨辉三角：按行生成相邻两数之和，解释单行逆序更新为什么保留旧值，并区分完整输出所需空间与 C++ 预留容量、移动行对象的作用。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 118. 杨辉三角](https://leetcode.cn/problems/pascals-triangle/)要求返回前 $n=\text{numRows}$ 行，题目保证 $1\le n\le30$。例如前四行是 `[[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]`：每行首尾为 1，内部元素等于上一行相邻两数之和。

[《不同路径：网格 DAG 递推与组合数直接计算》](/posts/algorithm/unique-paths/)只计算一个目标位置的组合数，本题则需要输出各行的所有值。递推本身很简单，需要区分的是完整结果的存储与仅求一行时的状态复用。

## 每一行由上一行确定

行索引为 $r$（$0\le r<n$），列索引为 $c$（$0\le c\le r$）。记位置 $(r,c)$ 的值为 $T(r,c)$，它对应二项式系数 $\binom{r}{c}$[^binomial]：

$$
T(r,0)=T(r,r)=1.
$$

内部元素满足帕斯卡恒等式：

$$
T(r,c)=T(r-1,c-1)+T(r-1,c), \qquad 0<c<r.
$$

从 $r$ 个元素中选 $c$ 个，可以按是否包含某个指定元素分为两类：包含它时从其余元素中选 $c-1$ 个，不包含时选 $c$ 个。两类互不重叠，数量相加便得到上述递推。

## 只保留一行时，为什么要逆序更新

如果只求第 $r$ 行，可以先把已有的第 $r-1$ 行扩展一个末尾的 1，再从右向左更新内部位置：

$$
row[c]\leftarrow row[c]+row[c-1], \qquad c=r-1,r-2,\dots,1.
$$

更新时，两个槽位都仍是上一行的旧值。若从左向右更新，`row[c - 1]` 可能已经变成当前行的新值。例如从 `[1, 2, 1]` 扩展到 `[1, 2, 1, 1]`，正序更新会得到 `[1, 3, 4, 1]`，而正确结果是 `[1, 3, 3, 1]`。

这与[《分割等和子集：0-1 背包可行性与一维倒序压缩》](/posts/algorithm/partition-equal-subset-sum/)的倒序更新有相同目的：转移需要上一轮较小下标的状态，必须在覆盖之前读取它。单行缓冲区仍占 $O(r)$ 空间，不能因为更新只用常数个临时变量就把总空间写成 $O(1)$。

## Python：逐行创建独立列表

本题要求返回全部行，直接保留每一行更清楚。下面每轮都创建新列表，各行互不别名，修改结果中的一行不会改动其他行：

```python
class Solution:
    def generate(self, numRows: int) -> list[list[int]]:
        triangle: list[list[int]] = []

        for r in range(numRows):
            row = [1] * (r + 1)
            for c in range(1, r):
                row[c] = triangle[r - 1][c - 1] + triangle[r - 1][c]
            triangle.append(row)

        return triangle
```

每行先填入边界值 1，再从上一行求内部值。第一行没有内部位置，不会读取 `triangle[-1]`。处理完第 $r$ 行后，结果包含前 $r+1$ 行，因而循环结束时恰好返回所需的 $n$ 行。

全部元素数量为：

$$
\sum_{r=0}^{n-1}(r+1)=\frac{n(n+1)}2.
$$

每个元素的初始化与计算都是常数成本，时间为 $O(n^2)$。返回结果占 $O(n^2)$ 空间；新建的行最终也是结果的一部分，除此之外只有循环变量，辅助空间为 $O(1)$。

## C++：预留外层容量，移动已生成的行

外层 `vector` 保存内层 `vector<int>` 对象。调用 `reserve(numRows)` 为这些行对象预留容量，避免追加时外层重新分配[^vector-reserve]。每行指定长度后填值，再用 `std::move` 让 `push_back` 移动行对象，避免复制行内整数[^cpp-move]：

```cpp
#include <utility>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> generate(int numRows) {
        std::vector<std::vector<int>> triangle;
        triangle.reserve(numRows);

        for (int r = 0; r < numRows; ++r) {
            std::vector<int> row(r + 1, 1);
            for (int c = 1; c < r; ++c) {
                row[c] = triangle[r - 1][c - 1] + triangle[r - 1][c];
            }
            // Moving the vector transfers its buffer instead of copying the integers.
            triangle.push_back(std::move(row));
        }

        return triangle;
    }
};
```

`std::move` 本身只是类型转换；这里的资源转移由向量的移动构造完成。即使不预留外层容量，使用默认分配器时，外层扩容也可以移动行对象，不能把每次扩容都算成复制全部整数。`reserve` 省去的是外层重新分配和行对象搬迁，不改变 $O(n^2)$ 的时间与输出空间。

当 $n\le30$ 时，最大值为第 30 行中间的 $\binom{29}{14}=77\,558\,760$，32 位 `int` 足够。若只返回第 $k$ 行（如杨辉三角 II），可以使用前面的逆序单缓冲区，存储为 $O(k)$；本题需要完整二维结果，这部分输出空间不能省去。

[^vector-reserve]: [cppreference：`std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve.html)——预留至少指定容量，后续插入在不超过容量时不会因容量增长而重新分配。

[^cpp-move]: [C++ 工作草案：`move`](https://eel.is/c++draft/forward)与[容器要求](https://eel.is/c++draft/container.reqmts)——前者返回右值引用，后者规定此处容器移动构造的常数复杂度；不能由一次 `std::move` 调用推断任意类型都会转移资源。

[^binomial]: [NIST DLMF §26.3: Lattice Paths: Binomial Coefficients](https://dlmf.nist.gov/26.3)——给出二项式系数的定义、递推和路径解释。
