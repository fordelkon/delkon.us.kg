---
title: "数据流的中位数：用对顶堆维护左右两半"
publishDate: "2026-12-10T12:00:00+08:00"
description: "LeetCode 295 数据流的中位数：用大顶堆维护较小一半、小顶堆维护较大一半，通过固定顺序转运维持数量与大小双不变式，实现 O(log n) 插入与 O(1) 查询。"
tags: ["algorithm", "heap", "python", "cpp"]
---

[LeetCode 295. 数据流的中位数](https://leetcode.cn/problems/find-median-from-data-stream/)（Hot 100，困难）要求设计一个支持动态添加整数并随时查询当前所有元素中位数的数据结构 `MedianFinder`：

- `addNum(num)`：从数据流中添加一个整数到数据结构中；
- `findMedian()`：返回目前所有元素的中位数。

题目保证数据流中的元素范围在 $[-10^5, 10^5]$，总操作次数不超过 $5 \times 10^4$，且 `findMedian` 仅在至少已添加一个元素后调用。

## 从静态切分到动态对顶堆

在[《寻找两个正序数组的中位数：在短数组上二分切分点》](/posts/algorithm/median-of-two-sorted-arrays/)中，我们把有序数据切成数量相等（或左半多 1 个）且满足 $\max(\text{左半}) \le \min(\text{右半})$ 的两段，从而只靠两个端点值就确定了中位数。

当元素改为**动态逐个到达**时，每次插入都重排数组或二分插入有序数组需要 $O(n)$ 移动开销。如果只关心“左半的最大值”和“右半的最小值”，根本不需要左半内部和右半内部保持全序——这恰好由两个背靠背的堆（**对顶堆**）承担：

例如，已读入 `2、5、7、10`，较小的两个数放在左堆，较大的两个数放在右堆。只需读两棵树的根：

```mermaid title="四个数分到两个堆" description="左侧大顶堆保存较小一半（堆顶 5 为该半区最大值），右侧小顶堆保存较大一半（堆顶 7 为该半区最小值）。两堆各有两个数且满足左顶 5 ≤ 右顶 7，中位数为 (5 + 7) / 2 = 6。"
flowchart TB
 subgraph small["大顶堆（较小一半 ≤ 5）"]
  maxRoot((5)) --- low((2))
 end
 subgraph large["小顶堆（较大一半 ≥ 7）"]
  minRoot((7)) --- high((10))
 end
 class maxRoot,minRoot result
```

再读入 `6` 时，右堆先筛出最小值 `6` 并把它交给左堆。左堆多出一个元素，直接读左堆顶 `6`。

我们约定两条核心不变式：

1. **数量不变式**：`len(small) == len(large)` 或 `len(small) == len(large) + 1`（即总数为奇数时，多出来的那 1 个元素固定放在左半大顶堆 `small`）；
2. **有序不变式**：`small` 中的所有元素都不大于 `large` 中的所有元素，等价于 $\text{top}(\text{small}) \le \text{top}(\text{large})$。

```mermaid title="addNum 的跨堆迁移与平衡流程" description="每次插入新元素 x 时，先压入大顶堆，再把大顶堆堆顶迁入小顶堆以维持左 ≤ 右的有序边界；若小顶堆元素反超，则把小顶堆堆顶回迁，恢复两堆数量平衡。"
sequenceDiagram
 participant Caller as addNum(x)
 participant Small as 大顶堆（较小一半）
 participant Large as 小顶堆（较大一半）
 Caller->>Small: 1. 压入新元素 x
 Small->>Large: 2. 弹出堆顶最大值，迁入小顶堆（维持左 ≤ 右）
 alt 小顶堆数量 > 大顶堆数量
  Large->>Small: 3. 弹出堆顶最小值，回迁大顶堆（恢复数量平衡）
 end
```

### 为什么“先入对方堆再转运”能免去所有大小分支？

新数 `num` 到达时，如果直接比较 `num` 与当前堆顶再决定塞进哪个堆、然后再做平衡，需要写好几条 `if/else`。用两步固定的**中继过滤**就能统一所有分支：

- **情况 A（当前 `len(small) == len(large)`，需要让 `small` 多 1 个元素）**：先把 `num` 放入右半小顶堆 `large` 筛选一次，再把 `large` 弹出的**最小值**放入 `small`。这样即使 `num` 原本很大，也会留在 `large`，而被挤到 `small` 的一定是右半原来的最小者，有序不变式自动成立！
- **情况 B（当前 `len(small) == len(large) + 1`，需要让 `large` 多 1 个元素）**：对称地，先把 `num` 放入左半大顶堆 `small` 筛选一次，再把 `small` 弹出的**最大值**放入 `large`。

## Python：取反模拟大顶堆与 `heappushpop`

Python 标准库 `heapq` 只提供小顶堆[^py-heapq]。将存入 `small` 的数值取负（`-x`），即可等价实现大顶堆；配合 `heapq.heappushpop(heap, val)` 在单次堆调整内完成“先压入后弹出极值”：

```python
import heapq


class MedianFinder:
    def __init__(self) -> None:
        # `small` is a max-heap simulated by storing negated values.
        self._small: list[int] = []
        # `large` is a standard min-heap.
        self._large: list[int] = []

    def addNum(self, num: int) -> None:
        # Time complexity: O(log n)
        if len(self._small) == len(self._large):
            # Push into `large` first, then move its minimum to `small`.
            moved = heapq.heappushpop(self._large, num)
            heapq.heappush(self._small, -moved)
        else:
            # Push into `small` first, then move its maximum to `large`.
            moved = -heapq.heappushpop(self._small, -num)
            heapq.heappush(self._large, moved)

    def findMedian(self) -> float:
        # Time complexity: O(1)
        if len(self._small) > len(self._large):
            return float(-self._small[0])
        return (-self._small[0] + self._large[0]) / 2.0
```

## C++：原生双 `std::priority_queue` 实现

C++ 的 `std::priority_queue<int>` 默认就是大顶堆，搭配 `std::priority_queue<int, std::vector<int>, std::greater<int>>` 即可直接构成小顶堆[^cpp-pq]，无需取反：

```cpp
#include <functional>
#include <queue>
#include <vector>

class MedianFinder {
    std::priority_queue<int> small_;
    std::priority_queue<int, std::vector<int>, std::greater<int>> large_;

public:
    MedianFinder() = default;

    void addNum(int num) {
        // Time complexity: O(log n)
        if (small_.size() == large_.size()) {
            large_.push(num);
            small_.push(large_.top());
            large_.pop();
        } else {
            small_.push(num);
            large_.push(small_.top());
            small_.pop();
        }
    }

    double findMedian() const {
        // Time complexity: O(1)
        if (small_.size() > large_.size()) {
            return static_cast<double>(small_.top());
        }
        return (static_cast<double>(small_.top()) + static_cast<double>(large_.top())) / 2.0;
    }
};
```

注意在求偶数中位数时先转换为 `double` 再相加，避免在更大整型范围下出现两 `int` 求和溢出。

## 复杂度分析与进阶场景对照

- **时间复杂度**：每次 `addNum` 执行常数次堆插入与堆顶弹出，耗时 $O(\log n)$；`findMedian` 仅读取一个或两个堆顶，耗时 $O(1)$。
- **空间复杂度**：两个堆共同保存已到达的全部 $n$ 个元素，辅助空间为 $O(n)$。

| 场景拓展 | 推荐策略 | 原因 |
| :--- | :------- | :--- |
| 数据流值域固定在 `[0, 100]`（极小稠密值域） | 101 长度计数数组 + 双指针/计数定位 | 插入 $O(1)$，查询 $O(100) = O(1)$，省去堆分配 |
| 99% 的数落在 `[0, 100]`，极少数越界 | `[0, 100]` 计数数组 + 左右溢出计数/有序结构 | 绝大多数中位数查询直接命中内部计数数组 |
| 两个静态已排序数组求中位数 | [短数组切分点二分](/posts/algorithm/median-of-two-sorted-arrays/) | 无需额外空间，$O(\log \min(m, n))$ |

[^py-heapq]: [Python 文档：`heapq` — Heap queue algorithm](https://docs.python.org/3/library/heapq.html)——`heappushpop` 比先 `heappush` 再 `heappop` 少一次堆化调整。

[^cpp-pq]: [cppreference：`std::priority_queue`](https://en.cppreference.com/w/cpp/container/priority_queue.html)——默认模板参数使用 `std::less<T>` 构造大顶堆，传入 `std::greater<T>` 构造小顶堆。
