---
title: "将数据流变为多个不相交区间：在线区间的增量熔接"
publishDate: "2026-10-21T20:00:00+08:00"
description: "LeetCode 352 将数据流变为多个不相交区间：数字逐个到达时的四种边界合并情形，Python 用 bisect 切片替换，C++ 用 std::map 对数级维护端点，并与并查集对比。"
tags: ["algorithm", "interval", "python", "cpp"]
---

[LeetCode 352. 将数据流变为多个不相交区间](https://leetcode.cn/problems/data-stream-as-disjoint-intervals/)要求实现 `SummaryRanges` 类：`addNum(value)` 逐个接收数据流中的整数，`getIntervals()` 返回当前所有已接收整数构成的、按左端点升序排列的不相交闭区间列表 $[l_i, r_i]$。

在[《最长连续序列：哈希起点、并查集与边界缝合》](/posts/algorithm/longest-consecutive-sequence/)中，原题只要求输出最大长度。集合起点法适合一次性扫描；`boundary_len` 边界哈希则已能在每次插入后维护当前最大长度，但不能直接按序枚举全部区间。设已接收 $u$ 个不同整数，若每次查询都重跑集合扫描，平均需要 $O(u)$ 时间；为了按序输出区间，还需对得到的区间排序。若直接沿用无序的 `boundary_len`，内部节点还残留着过期长度，不能把每个表项都当成独立区间。进入在线场景后，既然 `getIntervals()` 要求按序输出全部不相交区间，直接把**按左端点升序排列的不相交区间集合**作为维护状态，能让更新与查询各司其职。

## 四种边界合并情形

这里维护的是连续整数段，除了不重叠，还要合并相邻整数：`[1, 2]` 与 `[3, 4]` 应表示为 `[1, 4]`。因此相邻两段必须满足 $r_i + 1 < l_{i+1}$。这与[普通闭区间的重叠合并](/posts/algorithm/merge-intervals/#为什么先排序)不同，后者会保留这两个没有公共点的区间。

设当前已维护的 $m$ 个不相交闭区间满足 $l_0 \le r_0 < l_1 \le r_1 < \dots < l_{m-1} \le r_{m-1}$。新到达的整数 $x$（对应参数 `value`）若已落在某个既有区间 $[l_k, r_k]$ 内部（$l_k \le x \le r_k$），区间集合保持不变；否则 $x$ 位于两个相邻区间之间或全部区间的外侧；不存在的邻居不参与判定。它只可能通过 $x - 1$ 与 $x + 1$ 触碰左右邻居的端点，触发四种局部变化：

1. **孤立成段**：前驱右端点 $< x - 1$ 且后继左端点 $> x + 1$，新增独立区间 $[x, x]$；
2. **左侧延伸**：前驱恰好为 $[L, x - 1]$，后继左端点 $> x + 1$，前驱右界扩充为 $[L, x]$；
3. **右侧延伸**：前驱右端点 $< x - 1$，后继恰好为 $[x + 1, R]$，后继左界扩充为 $[x, R]$；
4. **左右桥接**：同时存在前驱 $[L, x - 1]$ 与后继 $[x + 1, R]$，$x$ 将两段缝合为一个区间 $[L, R]$，区间总数减一。

由于区间互不重叠且按左端点严格递增，定位到第一个左端点严格大于 $x$ 的区间后，唯一可能包含 $x$ 或与 $x$ 左侧相连的就只有它的直接前驱，唯一可能与 $x$ 右侧相连的就只有它本身。

## Python：有序列表上的 bisect 切片替换

Python 标准库没有内置平衡搜索树，可以用有序 `list` 保存区间，配合 `bisect_left` 二分定位。以下代码需要 Python 3.10 或更新版本，因为使用了 `key` 参数[^bisect]。查找第一个左端点 $\ge x + 1$ 的下标 $i$ 后，用切片范围 `[start:end]` 记录本次被新区间 `merged` 吞并的旧区间。`getIntervals()` 复制外层列表和每个区间列表，调用方修改返回值不会影响内部状态：

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
        # Copy both list levels so callers cannot mutate the maintained intervals.
        return [interval[:] for interval in self.intervals]
```

下标 `< i` 的区间左端点都 $\le x$，又因区间互不相交，`self.intervals[i - 1]` 拥有其中最大的左端点和最大的右端点；因此只需检查 `prev[1] >= value` 就能判断 $x$ 是否已被覆盖。随后的四种合并情形统一收敛到 `self.intervals[start:end] = [merged]`[^python-slice-assign]：

- **孤立成段**：`start == i` 且 `end == i`，对空切片 `self.intervals[i:i]` 赋值等价于在下标 `i` 处插入 `[value, value]`；
- **左侧或右侧延伸**：`[i - 1 : i]` 或 `[i : i + 1]` 长度为 $1$，原地替换单个邻居；
- **左右桥接**：`[i - 1 : i + 1]` 长度为 $2$，把前后两个邻居合并替换为单个 `[prev[0], self.intervals[i][1]]`。

设当前共有 $m$ 个不相交区间。`bisect_left` 需要 $O(\log(m + 1))$ 次比较，但 Python `list` 是连续数组，插入新段或桥接删段在最坏情况下需要搬移 $O(m)$ 个元素，因此 `addNum()` 最坏耗时 $O(m)$[^python-list-complexity]。内部区间状态占 $O(m)$ 空间，更新只需常数个临时区间和下标。`getIntervals()` 构造独立快照，时间与输出空间均为 $O(m)$，除输出外辅助空间为 $O(1)$。列表方案适合区间总数较小的情况；若需避免频繁更新时的线性搬移，可换用平衡搜索树。

## C++：std::map 的对数级端点维护

下面使用结构化绑定，需要 C++17 或更新版本。在 C++ 中，用 `std::map<int, int>` 建立“区间左端点 $\to$ 右端点”的有序映射，即可把`addNum` 的平摊时间复杂度压到 $O(\log(m + 1))$。`upper_bound(value)` 在对数时间内返回第一个左端点严格大于 `value` 的迭代器 `next`，其前驱 `prev = std::prev(next)` 即为最后一个左端点 $\le \text{value}$ 的区间[^map-requirements]。

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

        // For each existing neighbor, prev->second < value and next->first > value; neither
        // prev->second + 1 nor next->first - 1 can overflow a signed int.
        const bool left_touch = prev != next && prev->second + 1 == value;
        const bool right_touch = next != intervals.end() && next->first - 1 == value;

        if (left_touch && right_touch) {
            prev->second = next->second;
            intervals.erase(next);
        } else if (left_touch) {
            prev->second = value;
        } else if (right_touch) {
            // Insert before erasing so allocation failure preserves the existing interval.
            intervals.emplace_hint(next, value, next->second);
            intervals.erase(next);
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

- **全 `int` 值域无溢出判邻**：若直接计算 `value - 1` 或 `value + 1`，当 `value` 取 `INT_MIN` 或 `INT_MAX` 时会触发有符号整数溢出。而提前返回分支已排除 `prev->second >= value`，保证走到判邻处时必有 `prev->second < value <= INT_MAX`，故 `prev->second + 1 == value` 绝不溢出；同理 `upper_bound` 保证 `next->first > value >= INT_MIN`，故 `next->first - 1 == value` 也绝不下溢。
- **原地改值与带提示改键**：左侧延伸和左右桥接都不改变前驱的左端点键 `prev->first`，直接改写 `prev->second` 即可，无需先删节点再重插同键；右侧延伸因左端点从 `value + 1` 变为 `value`（`std::map` 的键不可原地修改），先以 `next` 为正确的后继提示插入新节点，再删除旧节点。这两步各有平摊常数复杂度；先插后删还能保证新节点分配失败时旧区间仍然存在，不会丢失已接收的整数[^map-requirements]。

单次 `addNum` 仅做一次 `upper_bound` 查找与常数次节点更新。查找与无提示插入为对数时间，按迭代器删除与正确提示插入具有平摊常数界，因此按标准容器契约合并得到平摊 $O(\log(m + 1))$ 时间；不能把后两项的平摊保证直接当作单次最坏常数保证。内部映射占 $O(m)$ 空间；`getIntervals()` 与 Python 版一样返回独立快照，时间与输出空间均为 $O(m)$，除输出外辅助空间为 $O(1)$。这两个版本的更新成本不同，来自有序列表与平衡搜索树的选择。

## 并查集视角：写快读慢的权衡

回看[《最长连续序列：哈希起点、并查集与边界缝合》](/posts/algorithm/longest-consecutive-sequence/)提到的并查集：每次 `addNum(x)` 时，若 $x - 1$ 或 $x + 1$ 已存在则合并对应分量，并在根节点维护最小、最大元素。设已接收 $u$ 个不同整数，采用路径压缩与按秩合并时，并查集操作的平摊时间为 $O(\alpha(u))$[^tarjan-dsu]；任意整数到并查集下标的映射还需平均常数时间的哈希查询。

若另外维护活跃根节点集合，查询可以枚举 $m$ 个分量，再按左端点排序，耗时 $O(m\log(m + 1))$；若没有这份集合，还要扫描全部 $u$ 个元素寻找根。并查集及映射占 $O(u)$ 状态空间，而有序区间方案只保存 $O(m)$ 个端点对。选择依据是更新、查询和存储成本，而不只是单次合并的复杂度。

## 系统拓展：数据流熔接与并发任务流

下面是将区间状态用于任务完成记录的一种设计推导，不代表具体流处理框架的实现：

- **乱序任务流的连续水位推进**：在流水线或异步任务池架构中（正如[《并发编程（五）：消息传递、任务池与背压》](/posts/concurrency/message-passing-workers-backpressure/#fan-out--fan-in分工与汇总)所分析的 fan-out / fan-in 模型），分发给多个工作线程或消费者的切片任务往往因执行耗时不同而乱序返回。若任务编号连续且起点已知，收集器可以维护已完成编号的区间，并寻找从该起点连续覆盖的最右端点，作为连续确认进度。新完成编号仅需局部更新端点，无需每次对全部编号重新排序；已经确认的前缀还可以移除。这里记录的是离散任务完成情况，不能直接等同于事件时间 Watermark；是否可提交或释放缓冲，还取决于失败重试、结果持久化及下游消费约定。
- **区间问题族的模式谱系**：回看区间处理的整体脉络，[《合并区间：排序后维护右边界》](/posts/algorithm/merge-intervals/)面向静态无序区间全集，通过预先排序将重叠合并收敛为单趟扫描；[《插入区间：三段式线性划分》](/posts/algorithm/insert-interval/)面向已有序不相交区间，以三段式游标在线性时间内完成任意跨度新区间的吸收；而本题则面向数字逐个到达的在线场景，借助有序映射将单点注入时的局部桥接与延伸控制在平摊 $O(\log(m + 1))$，三者分别代表了批处理全局合并、单次流式插入与在线增量熔接的演进阶段。

[^bisect]: [Python 文档：`bisect` — 数组二分查找算法](https://docs.python.org/3/library/bisect.html)——说明在有序序列中以对数次比较定位插入点，`key` 参数自 Python 3.10 起支持。

[^python-slice-assign]: [Python 文档：可变序列操作](https://docs.python.org/3/library/stdtypes.html#mutable-sequence-types)——说明切片赋值 `s[i:j] = t` 会将切片 `[i:j]` 替换为可迭代对象 `t` 的内容，切片与替换序列的长度不必相等。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——说明 `list` 基于连续动态数组实现，中间插入与切片删除可能需要移动线性数量的元素；这里采用 CPython 动态数组模型，不能把某次尾部操作也说成必然搬移 $m$ 个元素。

[^map-requirements]: [C++ 工作草案：关联容器要求](https://eel.is/c++draft/associative.reqmts)——说明 `upper_bound` 的对数复杂度、按迭代器删除和正确后继提示插入的平摊常数复杂度，以及单元素插入抛出异常时不改变容器的保证。

[^tarjan-dsu]: [Robert E. Tarjan：_Efficiency of a Good But Not Linear Set Union Algorithm_ (JACM, 1975)](https://doi.org/10.1145/321879.321884)——证明带路径压缩与按秩合并的并查集单次操作平摊时间复杂度为 $O(\alpha(n))$。
