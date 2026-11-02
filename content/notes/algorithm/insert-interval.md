---
title: "插入区间：三段式线性划分"
publishDate: "2026-10-21T12:00:00+08:00"
description: "LeetCode 57 插入区间：利用输入按左端点升序且互不重叠的前提，Python 与 C++ 一次线性扫描完成左侧保留、重叠融合、右侧保留的三段式划分。"
---

[LeetCode 57. 插入区间](https://leetcode.cn/problems/insert-interval/)给出一组按左端点升序排列且互不重叠的闭区间列表 `intervals`，要求插入新区间 `new_interval`（记为 $[L, R]$），合并所有重叠部分后返回依然有序且不相交的区间列表。

在[《将数据流变为多个不相交区间：在线区间的增量熔接》](/notes/algorithm/data-stream-as-disjoint-intervals/)中，每次插入的是单个整数 $x$，至多连接左右两个紧邻区间；而本题插入的 $[L, R]$ 具有任意跨度，可能一次穿透多个既有区间。但“输入已按左端点有序且互不重叠”这一前提保证了：**所有与 $[L, R]$ 重叠的区间必然在原数组中构成一段连续切片**，切片左侧的区间全部严格在 $L$ 之前结束，切片右侧的区间全部严格在 $R$ 之后开始。

## 从不交条件推导三段式扫描

任取原列表中的一个区间 $[l_i, r_i]$，它与新区间 $[L, R]$ 不重叠只有两种互斥情况：

- **严格在左**：$r_i < L$，此时 $[l_i, r_i]$ 原样保留在 $[L, R]$ 之前；
- **严格在右**：$l_i > R$，此时 $[l_i, r_i]$ 原样保留在 $[L, R]$ 之后。

其余满足 $r_i \ge L$ 且 $l_i \le R$ 的区间均与 $[L, R]$ 重叠，并入后外扩为 $[\min(L, l_i), \max(R, r_i)]$：

```text
[ 原始区间 ... ]     [ 重叠区间 1 ]  [ 重叠区间 2 ]     [ 原始区间 ... ]
       |                     \          /                     |
   1. 左侧保留              2. 融合为单个新区间             3. 右侧保留
    r_i < L               r_i >= L 且 l_i <= R             l_i > R
```

按顺序推进下标 `i` 时，第一段循环先跳过所有满足 $r_i < L$ 的左侧区间；**一旦第一段循环停止，剩余未处理的区间就全部自动满足 $r_i \ge L$**。因此第二段循环只需单侧检查 $l_i \le R$（即 `intervals[i][0] <= right`），就能不重不漏地吸收所有重叠区间：

```python
class Solution:
    def insert(
        self, intervals: list[list[int]], new_interval: list[int]
    ) -> list[list[int]]:
        merged: list[list[int]] = []
        left, right = new_interval
        i = 0
        n = len(intervals)

        while i < n and intervals[i][1] < left:
            merged.append(intervals[i])
            i += 1

        # Remaining intervals satisfy r_i >= left, so l_i <= right is necessary and sufficient for overlap.
        while i < n and intervals[i][0] <= right:
            left = min(left, intervals[i][0])
            right = max(right, intervals[i][1])
            i += 1
        merged.append([left, right])

        merged.extend(intervals[i:])

        return merged
```

以 `intervals = [[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]]`、`new_interval = [4, 8]` 为例：

1. 第一段把满足 $r_i < 4$ 的 `[1, 2]` 直接放入 `merged`，在 `[3, 5]` 处因 $5 \ge 4$ 停下；
2. 第二段依次检查左端点是否 $\le R$：`[3, 5]`（$3 \le 8$）将 `[left, right]` 扩为 `[3, 8]`，`[6, 7]`（$6 \le 8$）保持 `[3, 8]`，`[8, 10]`（$8 \le 8$）再将右界扩为 `[3, 10]`；到 `[12, 16]` 时 $12 > 10$，循环结束并追加新建的 `[3, 10]`；
3. 第三段把剩余的 `[12, 16]` 原样追加。

第二段中 `left` 只可能被第一个进入该循环的区间缩小（后续重叠区间的左端点递增，不会比第一个更小），而 `right` 会随每个重叠区间单调递增，直到最后一个重叠区间确定最终右界。将 `new_interval` 解包为局部标量 `left, right` 并以新列表 `[left, right]` 追加，配合 `extend` 批量浅拷贝尾部切片引用，既省去了循环内的列表下标读写，也保证执行期间不会原地改写调用方传入的 `new_interval` 或 `intervals` 中的内层列表[^python-mutable-seq]。

两个 `while` 循环共享单向递增的游标 `i`，再由 `extend` 追加剩余区间，整体时间复杂度为 $O(n)$。`intervals[i:]` 会先创建一个临时列表；当新区间位于所有已有区间左侧时，切片包含全部 $n$ 个区间的引用，因此即使不计返回结果，最坏辅助空间仍为 $O(n)$。若改为逐项追加尾部区间，就可以将辅助空间降为 $O(1)$。

与[《将数据流变为多个不相交区间：在线区间的增量熔接》](/notes/algorithm/data-stream-as-disjoint-intervals/)中平衡树单次更新的 $O(\log(m + 1))$ 不同，本题一次插入可能吞并 $O(n)$ 个既有区间；在没有重叠等需要保留线性数量区间的情况下，构造返回数组本身也需要 $\Omega(n)$ 时间。

## C++：预留容量与尾部区间批量追加

C++ 版本保持同样的三段式游标推进，用局部变量 `left`、`right` 维护融合边界而不修改入参 `new_interval`；`reserve(intervals.size() + 1)` 一次性分配输出缓冲[^vector-reserve]，到第三段时直接用 `vector::insert` 的迭代器范围重载批量追加尾部切片[^vector-insert]。

```cpp
#include <algorithm>
#include <cstddef>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> insert(
        const std::vector<std::vector<int>>& intervals,
        const std::vector<int>& new_interval) {
        std::vector<std::vector<int>> merged;
        merged.reserve(intervals.size() + 1);
        const std::size_t n = intervals.size();
        int left = new_interval[0];
        int right = new_interval[1];

        std::size_t i = 0;
        while (i < n && intervals[i][1] < left) {
            merged.push_back(intervals[i]);
            ++i;
        }

        // Past the first loop, intervals[i][1] >= left; any interval with start <= right overlaps.
        while (i < n && intervals[i][0] <= right) {
            left = std::min(left, intervals[i][0]);
            right = std::max(right, intervals[i][1]);
            ++i;
        }
        merged.push_back({left, right});

        merged.insert(merged.end(), intervals.begin() + i, intervals.end());

        return merged;
    }
};
```

当 `intervals` 为空，或 `new_interval` 落在所有区间最左侧（$R < l_0$）与最右侧（$L > r_{n-1}$）时，三段处理各有对应的空区间，无需额外特判。时间复杂度为 $O(n)$，除返回值外额外空间为 $O(1)$。

三段式划分之所以能用单游标一次扫完，依赖输入列表“按左端点有序且互不重叠”的先验性质。一旦输入变成杂乱无章的区间集合，重叠对象不再聚集于单个局部切片，就必须先把无序集合转化为有序序列——这正是[《合并区间：排序后维护右边界》](/notes/algorithm/merge-intervals/)的核心步骤。

[^python-mutable-seq]: [Python 文档：可变序列操作](https://docs.python.org/3/library/stdtypes.html#mutable-sequence-types)——说明 `append` 与 `extend(s[i:])` 将原序列元素的引用追加到新列表中，不会原地修改原内层列表的值。

[^vector-reserve]: [cppreference：`std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve.html)——说明预留至少指定数量的存储容量，避免后续插入触发重新分配。

[^vector-insert]: [cppreference：`std::vector::insert`](https://en.cppreference.com/w/cpp/container/vector/insert.html)——说明范围重载可将 `[first, last)` 内的元素按序插入到指定位置。
