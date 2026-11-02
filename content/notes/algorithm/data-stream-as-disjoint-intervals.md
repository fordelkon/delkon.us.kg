---
title: "将数据流变为多个不相交区间：在线区间的增量熔接"
publishDate: "2026-10-21T20:00:00+08:00"
description: "LeetCode 352 将数据流变为多个不相交区间：数字逐个到达时的四种边界合并情形，Python 用 bisect 切片替换，C++ 用 std::map 对数级维护端点，并与并查集对比。"
---

[LeetCode 352. 将数据流变为多个不相交区间](https://leetcode.cn/problems/data-stream-as-disjoint-intervals/)要求实现 `SummaryRanges` 类：`addNum(value)` 逐个接收数据流中的整数，`getIntervals()` 返回当前所有已接收整数构成的、按左端点升序排列的不相交闭区间列表 $[l_i, r_i]$。

在[《最长连续序列：哈希起点、并查集与边界缝合》](/notes/algorithm/longest-consecutive-sequence/)中，数组全部元素一次性给定，无论是集合定起点还是 `boundary_len` 边界哈希，都只面向“遍历结束后输出单个最大长度”：若在每次 `getIntervals()` 时重跑集合扫描，单次查询需 $O(n)$；若直接沿用无序的 `boundary_len`，内部端点残留着过期记录，且每次查询还需额外排序。进入在线场景后，既然 `getIntervals()` 要求按序输出全部不相交区间，直接把**按左端点升序排列的不相交区间集合**作为维护状态，能让更新与查询各司其职。

## 四种边界合并情形

设当前已维护的 $m$ 个不相交闭区间满足 $l_0 \le r_0 < l_1 \le r_1 < \dots < l_{m-1} \le r_{m-1}$。新到达的整数 $x$（对应参数 `value`）若已落在某个既有区间 $[l_k, r_k]$ 内部（$l_k \le x \le r_k$），区间集合保持不变；否则 $x$ 严格位于两个相邻区间之间，只可能通过 $x - 1$ 与 $x + 1$ 触碰左右邻居的端点，触发四种局部变化：

1. **孤立成段**：前驱右端点 $< x - 1$ 且后继左端点 $> x + 1$，新增独立区间 $[x, x]$；
2. **左侧延伸**：前驱恰好为 $[L, x - 1]$，后继左端点 $> x + 1$，前驱右界扩充为 $[L, x]$；
3. **右侧延伸**：前驱右端点 $< x - 1$，后继恰好为 $[x + 1, R]$，后继左界扩充为 $[x, R]$；
4. **左右桥接**：同时存在前驱 $[L, x - 1]$ 与后继 $[x + 1, R]$，$x$ 将两段缝合为一个区间 $[L, R]$，区间总数减一。

由于区间互不重叠且按左端点严格递增，定位到第一个左端点严格大于 $x$ 的区间后，唯一可能包含 $x$ 或与 $x$ 左侧相连的就只有它的直接前驱，唯一可能与 $x$ 右侧相连的就只有它本身。

## Python：有序列表上的 bisect 切片替换

Python 标准库没有内置平衡搜索树，可以用有序 `list` 保存区间，配合 `bisect_left` 二分定位[^bisect]。查找第一个左端点 $\ge x + 1$ 的下标 `i` 后，用切片范围 `[start:end]` 记录本次被新区间 `merged` 吞并的旧区间：

```python
from bisect import bisect_left


class SummaryRanges:
    def __init__(self) -> None:
        self.intervals: list[list[int]] = []

    def addNum(self, value: int) -> None:
        # First interval whose start is strictly greater than value (i.e., >= value + 1).
        i = bisect_left(self.intervals, value + 1, key=lambda interval: interval[0])
        merged = [value, value]
        start, end = i, i

        if i > 0:
            prev = self.intervals[i - 1]
            # Disjoint ordering makes prev the only interval that can already contain value.
            if prev[1] >= value:
                return
            if prev[1] == value - 1:
                merged[0] = prev[0]
                start = i - 1

        if i < len(self.intervals) and self.intervals[i][0] == value + 1:
            merged[1] = self.intervals[i][1]
            end = i + 1

        # Replace absorbed neighbors in place; when start == end == i, this inserts at i.
        self.intervals[start:end] = [merged]

    def getIntervals(self) -> list[list[int]]:
        return self.intervals
```

下标 `< i` 的区间左端点都 $\le x$，又因区间互不相交，`self.intervals[i - 1]` 拥有其中最大的左端点和最大的右端点；因此只需检查 `prev[1] >= value` 就能判断 $x$ 是否已被覆盖。随后的四种合并情形统一收敛到 `self.intervals[start:end] = [merged]`[^python-slice-assign]：

- **孤立成段**：`start == i` 且 `end == i`，对空切片 `self.intervals[i:i]` 赋值等价于在下标 `i` 处插入 `[value, value]`；
- **左侧或右侧延伸**：`[i - 1 : i]` 或 `[i : i + 1]` 长度为 $1$，原地替换单个邻居；
- **左右桥接**：`[i - 1 : i + 1]` 长度为 $2$，把前后两个邻居合并替换为单个 `[prev[0], self.intervals[i][1]]`。

设当前共有 $m$ 个不相交区间。`bisect_left` 需要 $O(\log(m + 1))$ 次比较，但 Python `list` 是连续数组，插入新段或桥接删段在最坏情况下需要搬移 $O(m)$ 个元素[^python-list-complexity]。`getIntervals()` 直接返回内部列表引用（若调用方可能修改返回值，则应返回浅拷贝 `[interval[:] for interval in self.intervals]`，耗时 $O(m)$）。这种取舍适合读多写少或区间总数 $m$ 较小的负载；当写入频繁且 $m$ 很大时，列表中间的线性搬移会成为瓶颈，需要换用平衡搜索树将更新也控制在 $O(\log(m + 1))$。

## C++：std::map 的对数级端点维护

在 C++ 中，用 `std::map<int, int>` 建立“区间左端点 $\to$ 右端点”的有序映射，即可把单次 `addNum` 的最坏时间复杂度压到 $O(\log(m + 1))$。`upper_bound(value)` 在对数时间内返回第一个左端点严格大于 `value` 的迭代器 `next`，其前驱 `prev = std::prev(next)` 即为最后一个左端点 $\le \text{value}$ 的区间[^map-upper-bound]。

```cpp
#include <map>
#include <vector>

class SummaryRanges {
    std::map<int, int> intervals;

public:
    SummaryRanges() = default;

    void addNum(int value) {
        auto next = intervals.upper_bound(value);
        auto prev = next;
        if (prev != intervals.begin()) {
            --prev;
            if (prev->second >= value) {
                return;
            }
        }

        // At this point prev->second < value and next->first > value, so neither
        // prev->second + 1 nor next->first - 1 can overflow a signed int.
        const bool left_touch = prev != next && prev->second + 1 == value;
        const bool right_touch = next != intervals.end() && next->first - 1 == value;

        if (left_touch && right_touch) {
            prev->second = next->second;
            intervals.erase(next);
        } else if (left_touch) {
            prev->second = value;
        } else if (right_touch) {
            // std::map keys are const; erase returns the successor iterator for O(1) hinted reinsertion.
            const int right_end = next->second;
            const auto hint = intervals.erase(next);
            intervals.emplace_hint(hint, value, right_end);
        } else {
            intervals.emplace(value, value);
        }
    }

    std::vector<std::vector<int>> getIntervals() const {
        std::vector<std::vector<int>> result;
        result.reserve(intervals.size());
        for (const auto& [start, end] : intervals) {
            result.push_back({start, end});
        }
        return result;
    }
};
```

这里有两处细节使实现既不依赖特定值域、又避免多余的树节点分配：

- **全 `int` 值域无溢出判邻**：若直接计算 `value - 1` 或 `value + 1`，当 `value` 取 `INT_MIN` 或 `INT_MAX` 时会触发有符号整数溢出。而提前返回分支已排除 `prev->second >= value`，保证走到判邻处时必有 $\text{prev->second} < \text{value} \le \text{INT\_MAX}$，故 `prev->second + 1 == value` 绝不溢出；同理 `upper_bound` 保证 $\text{next->first} > \text{value} \ge \text{INT\_MIN}$，故 `next->first - 1 == value` 也绝不下溢。
- **原地改值与带提示改键**：左侧延伸和左右桥接都不改变前驱的左端点键 `prev->first`，直接改写 `prev->second` 即可，无需先删节点再重插同键；右侧延伸因左端点从 `value + 1` 变为 `value`（`std::map` 的键不可原地修改），先 `erase(next)` 取得紧邻的后继迭代器，再传给 `emplace_hint` 在平摊常数时间内完成原位替换[^map-erase][^map-emplace-hint]。

单次 `addNum` 仅做一次 `upper_bound` 查找与常数次迭代器更新，时间复杂度为 $O(\log(m + 1))$；`getIntervals()` 顺序遍历平衡树构造返回数组，时间复杂度为 $O(m)$，空间复杂度为 $O(m)$。

## 并查集视角：写快读慢的权衡

回看[《最长连续序列：哈希起点、并查集与边界缝合》](/notes/algorithm/longest-consecutive-sequence/)提到的并查集：每次 `addNum(x)` 时，若 $x - 1$ 或 $x + 1$ 已存在则将它们合并，并在每个连通分量的根节点维护该分量的最小、最大元素，单次 `addNum` 的平摊时间可降至 $O(\alpha(n))$[^tarjan-dsu]。

但并查集的连通分量之间没有顺序：每次调用 `getIntervals()` 都必须遍历所有活跃根节点并按左端点排序，查询耗时升至 $O(m \log m)$。有序列表与 `std::map` 则在写入时维护了左端点全序，让每次查询保持在线性扫描 $O(m)$。

本题每次到达的仍是单个整数 $x$，至多触碰左右两个相邻区间；当新到达的对象变成跨度任意的闭区间 $[L, R]$ 时，它可能一次吞并中间连续的一批区间——这正是[《插入区间：三段式线性划分》](/notes/algorithm/insert-interval/)要解决的问题。

[^bisect]: [Python 文档：`bisect` — 数组二分查找算法](https://docs.python.org/3/library/bisect.html)——说明在有序序列中以对数次比较定位插入点，`key` 参数自 Python 3.10 起支持。

[^python-slice-assign]: [Python 文档：可变序列操作](https://docs.python.org/3/library/stdtypes.html#mutable-sequence-types)——说明切片赋值 `s[i:j] = t` 会将切片 `[i:j]` 替换为可迭代对象 `t` 的内容，切片与替换序列的长度不必相等。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——说明 `list` 基于连续动态数组实现，在任意中间位置插入或删除切片平均与最坏均需移动 $O(m)$ 个后续元素。

[^map-upper-bound]: [cppreference：`std::map::upper_bound`](https://en.cppreference.com/w/cpp/container/map/upper_bound.html)——说明返回首个键严格大于给定值的元素迭代器，时间复杂度与容器大小成对数关系。

[^map-erase]: [cppreference：`std::map::erase`](https://en.cppreference.com/w/cpp/container/map/erase.html)——说明 `std::map` 的键不可原地修改，按迭代器擦除单个节点自 C++11 起返回紧随被删元素之后的迭代器。

[^map-emplace-hint]: [cppreference：`std::map::emplace_hint`](https://en.cppreference.com/w/cpp/container/map/emplace_hint.html)——说明当提示迭代器恰好指向新元素紧邻的后继位置时，插入操作的平摊时间复杂度为常数。

[^tarjan-dsu]: [Robert E. Tarjan：*Efficiency of a Good But Not Linear Set Union Algorithm* (JACM, 1975)](https://doi.org/10.1145/321879.321884)——证明带路径压缩与按秩合并的并查集单次操作平摊时间复杂度为 $O(\alpha(n))$。
