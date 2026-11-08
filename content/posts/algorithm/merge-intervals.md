---
title: "合并区间：排序后维护右边界"
publishDate: "2026-10-20T12:00:00+08:00"
description: "LeetCode 56 合并区间：按左端点排序后，只需比较新区间左端点与当前右边界；用 Python 说明合并步骤，用 C++ 展示原地排序与容量预留。"
tags: ["algorithm", "interval", "python", "cpp"]
---

[LeetCode 56. 合并区间](https://leetcode.cn/problems/merge-intervals/)给定一个乱序、可能互相重叠的闭区间集合 `intervals`，要求合并所有重叠区间，返回互不重叠的区间列表。[《插入区间：三段式线性划分》](/posts/algorithm/insert-interval/)可以直接线性扫描，是因为输入已经按左端点排好序；本题去掉了这一前提，可以先排序，再沿用从左向右的合并思路。

## 为什么先排序

在[《最长连续序列：哈希起点、并查集与边界缝合》](/posts/algorithm/longest-consecutive-sequence/)中，处理对象是离散整数，连续关系的步长固定为 $1$：任意整数 $x$ 只需在哈希表里查找 $x - 1$ 和 $x + 1$ 两个固定键，就能在平均 $O(1)$ 时间内确定两个直接邻居是否存在。

本题的处理对象则是跨度不一的闭区间 $[l, r]$，每个输入区间恰有两个端点且满足 $l \le r$。共享端点的 `[1, 2]` 与 `[2, 3]` 会合并，但 `[1, 2]` 与 `[3, 4]` 没有交集，不能合并；这与最长连续序列中相邻整数可以缝合成连续段的规则不同。两个区间 $[a, b]$ 与 $[c, d]$ 重叠的充要条件是：

$$
\max(a, c) \le \min(b, d)
$$

在未排序的数组中，一个区间可能与任意位置上跨度不同的若干区间相交。由于交集判定是**范围查询**而非定步长相等查询，仅按端点建立哈希表，不能像整数题那样只查两个固定键就找到所有重叠区间。

将所有区间按左端点升序排序后，序列满足 $l_0 \le l_1 \le \dots \le l_{n-1}$，重叠判定就能简化。设结果列表末尾当前正在维护的合并区间为 $[L, R]$，由于它已经吸收了此前所有与它连通的区间，$R$ 是当前合并段已见到的最大右端点；当扫描到下一个区间 $[l_i, r_i]$ 时，排序保证了 $L \le l_i$，因而 $\max(L, l_i) = l_i$ 恒成立，重叠条件简化为：

$$
l_i \le R
$$

- **若 $l_i \le R$**：当前区间与 $[L, R]$ 重叠，将其并入并更新右边界 $R \leftarrow \max(R, r_i)$；
- **若 $l_i > R$**：当前区间在 $[L, R]$ 右侧严格分离；又因后续所有区间 $j > i$ 都满足 $l_j \ge l_i > R$，后面不可能再有任何区间与 $[L, R]$ 相交，$[L, R]$ 已经确定，直接以 $[l_i, r_i]$ 开启新段。

## Python：排序后逐个合并

实现不修改输入，并为每个输出区间新建内层列表，返回结果与输入区间没有列表别名。先用 `sorted(intervals)` 得到按端点升序排列的区间序列[^python-sorted]，再顺序扫描并与结果列表末尾段 `merged[-1]` 比对：重叠则扩张末尾段的右边界，否则追加新段。

```python
class Solution:
    def merge(self, intervals: list[list[int]]) -> list[list[int]]:
        merged: list[list[int]] = []
        for start, end in sorted(intervals):
            if merged and start <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], end)
            else:
                merged.append([start, end])
        return merged
```

以 `[[1, 3], [2, 6], [8, 10], [15, 18]]` 为例：`[1, 3]` 先作为首段入表；读到 `[2, 6]` 时因 $2 \le 3$ 将末尾段更新为 `[1, 6]`；随后 `[8, 10]` 的左端点 $8 > 6$，前一段封口并压入 `[8, 10]`；同理 `[15, 18]` 作为独立段追加，最终返回 `[[1, 6], [8, 10], [15, 18]]`。

设输入含 $n$ 个区间。排序耗时 $O(n \log n)$，单趟合并扫描耗时 $O(n)$，整体时间复杂度为 $O(n \log n)$；`sorted` 返回新的有序列表，除结果外额外占用 $O(n)$ 空间。若输出有 $k$ 段，输出列表及新建的端点列表占 $O(k)$ 空间；`sorted` 中对输入内层列表的引用只用于读取，不会泄漏为输出区间的别名。

## C++：原地排序并预留结果容量

C++ 版本通过 `std::sort` 直接在输入 `intervals` 上原地排序，省去一份 $O(n)$ 的排序副本；`reserve` 预留外层结果数组容量，减少追加期间的重新分配[^vector-reserve]。合并阶段只在 `merged.back()` 上原地更新右边界。

```cpp
#include <algorithm>
#include <cstddef>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> merge(
        std::vector<std::vector<int>>& intervals) {
        if (intervals.empty()) return {};

        // Sort by start coordinate only; tie-breaking on end does not affect merging.
        std::sort(intervals.begin(), intervals.end(),
                  [](const std::vector<int>& a, const std::vector<int>& b) {
                      return a[0] < b[0];
                  });

        std::vector<std::vector<int>> merged;
        merged.reserve(intervals.size());
        merged.push_back(intervals[0]);

        for (std::size_t i = 1; i < intervals.size(); ++i) {
            auto& last = merged.back();
            // Since intervals are sorted by start, overlap reduces to start_i <= last_end.
            if (intervals[i][0] <= last[1]) {
                last[1] = std::max(last[1], intervals[i][1]);
            } else {
                merged.push_back(intervals[i]);
            }
        }

        return merged;
    }
};
```

Python 的 `sorted(intervals)` 默认按列表字典序比较，左端点相等时还会继续比较右端点；C++ 的比较器 `a[0] < b[0]` 则只比较左端点，在左端点相等时视为等价，满足 `std::sort` 对**严格弱序**（Strict Weak Ordering）的要求[^python-lexicographical][^cpp-sort]。不规定相同左端点的次序并不影响正确性——首个同左端点区间处理后，当前右边界已满足 $R \ge r_{\text{first}} \ge l_i$，其余同左端点区间无论按什么相对顺序进入循环都会被当前段吸收，而求右端点最大值的 $\max$ 运算满足交换律与结合律。

`std::sort` 保证最坏 $O(n \log n)$ 次比较[^cpp-sort]，后续线性扫描耗时 $O(n)$，总时间复杂度为 $O(n \log n)$；原地排序会改写 `intervals`，排序栈的辅助空间取决于实现（通常为 $O(\log n)$）。若实际输出 $R$ 个区间，内层端点存储为 $O(R)$，但 `merged.reserve(intervals.size())` 仍预留 $O(n)$ 个外层槽位，因此返回容器的分配空间为 $O(n)$，不能只按 $R$ 计算。

这四题的区别在于输入前提和需要返回的结果。表中的 $n$ 是当前题目的输入元素数，$m$ 是数据流已经形成的区间数：

| 题目                                                                                                      | 输入形态与前提                  | 维护的状态与判定条件                                        | 时间复杂度                             |
| :-------------------------------------------------------------------------------------------------------- | :------------------------------ | :---------------------------------------------------------- | :------------------------------------- |
| [《最长连续序列：哈希起点、并查集与边界缝合》](/posts/algorithm/longest-consecutive-sequence/)            | 静态无序整数，步长固定为 $1$    | `x - 1` 判唯一起点，或 `boundary_len` 仅更新外侧端点        | 平均 $O(n)$                            |
| [《将数据流变为多个不相交区间：在线区间的增量熔接》](/posts/algorithm/data-stream-as-disjoint-intervals/) | 在线整数流，维护有序不相交区间  | 二分定位前驱与后继，按 $x - 1$、$x + 1$ 四种情形局部缝合    | 单次插入平摊 $O(\log(m + 1))$（`map`） |
| [《插入区间：三段式线性划分》](/posts/algorithm/insert-interval/)                                         | 已有序且不相交区间 + 单个新区间 | 第一段排除 $r_i < L$，第二段凭 $l_i \le R$ 吸收连续重叠切片 | $O(n)$                                 |
| 合并区间（本题）                                                                                          | 静态乱序区间集合                | 按左端点排序固定 $L \le l_i$，凭 $l_i \le R$ 更新最大右边界 | $O(n \log n)$                          |

[^python-sorted]: [Python 文档：`sorted`](https://docs.python.org/3/library/functions.html#sorted)——说明从可迭代对象构造并返回一个新的有序列表。

[^vector-reserve]: [C++ 工作草案：vector 容量](https://eel.is/c++draft/vector.capacity)——说明预留至少指定数量的存储容量，避免后续追加元素时重复扩容。

[^python-lexicographical]: [Python 文档：值比较](https://docs.python.org/3/reference/expressions.html#value-comparisons)——说明序列（如 `list`）默认按字典序逐项比较，首项相等时继续比较下一项。

[^cpp-sort]: [cppreference：`std::sort`](https://en.cppreference.com/w/cpp/algorithm/sort.html)——说明比较器须满足严格弱序，比较次数最坏为 $O(n \log n)$。
