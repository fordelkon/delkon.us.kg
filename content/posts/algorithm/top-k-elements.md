---
title: "第 K 大元素与前 K 个高频元素：小顶堆、快速选择与频次桶"
publishDate: "2026-12-09T12:00:00+08:00"
description: "合并解析 LeetCode 215 数组中的第 K 个最大元素与 LeetCode 347 前 K 个高频元素：对比大小为 K 的小顶堆、三路快速选择与频次桶，避免重复元素导致的快速选择退化。"
tags: ["algorithm", "heap", "python", "cpp"]
---

Hot 100 中有两道经典的 Top-K 问题：

- [LeetCode 215. 数组中的第 K 个最大元素](https://leetcode.cn/problems/kth-largest-element-in-an-array/)：给定整数数组 `nums` 和整数 `k`，返回数组中排序后的第 `k` 个最大元素（注意需要的是第 `k` 大，而不是第 `k` 个互异元素）。题目保证 $1 \le k \le n \le 10^5$。
- [LeetCode 347. 前 K 个高频元素](https://leetcode.cn/problems/top-k-frequent-elements/)：给定整数数组 `nums` 和整数 `k`，返回出现频率前 `k` 高的元素，顺序任意，要求时间复杂度优于 $O(n \log n)$。

两题的核心矛盾完全一致：**如何在不执行完整 $O(n \log n)$ 排序的前提下，从 $n$ 个元素中挑出最大的 $k$ 个**。依据数据分布与在线/离线特征，工程上有三条标准路径：大小为 $k$ 的小顶堆、三路快速选择，以及值域受限时的频次桶。

这三种方法维护的对象不同。流式读入时，小顶堆直接保留当前的前 K 项；就地找第 K 大时，快速选择缩小候选区间；按频次取前 K 项时，也可从最高频次的桶向下收集。各方法的适用条件见[方案对比](#方案对比)。

## 路径一：容量为 $k$ 的小顶堆（通用流式解法）

在[《合并 K 个升序链表：小顶堆与两两归并》](/posts/algorithm/merge-k-sorted-lists/)中，小顶堆用来在 $k$ 路有序序列的当前头部中快速摘取最小值；而在 Top-K 问题里，小顶堆的堆顶充当**前 $k$ 名门槛**：

1. 保持堆中最多只有 $k$ 个元素，堆顶是这 $k$ 个候选里**最小**的那个（第 $k$ 名守门员）。
2. 新元素到达时，若堆大小不足 $k$ 直接入堆；若已满且新元素**严格大于堆顶**，则弹出堆顶并压入新元素（在 Python 中 `heapq.heapreplace` 或 `heappushpop` 一次调整即可完成）[^py-heapq]。
3. 扫描结束时，堆顶恰好就是第 $k$ 大元素（LC 215），整个堆内的 $k$ 个键就是前 $k$ 高频元素（LC 347）。

小顶堆的优势是不依赖值域、不修改原数组，且天然支持**海量数据流**（内存只需留住 $k$ 个元素）。每次入堆调整耗时 $O(\log k)$，总时间 $O(n \log k)$，辅助空间 $O(k)$。

## 路径二：三路快速选择（LC 215 原地线性期望）

如果数据全部在内存中且允许重排数组，基于随机基准的**快速选择**（Quickselect）能把第 $k$ 大元素的期望时间压到 $O(n)$[^clrs-select]。

第 $k$ 大元素等价于升序数组下标为 `target = n - k` 的元素。但工程上有一个关键陷阱：LeetCode 215 的测试用例包含**大量重复元素**（例如十万个相同的数）。如果使用普通两路 Lomuto 分区，相等元素会全部挤到同一侧，使递归深度退化为 $O(n)$、时间退化为 $O(n^2)$。

引入荷兰国旗式**三路划分**（3-way partition，即把区间分成 `< pivot`、`== pivot`、`> pivot` 三段，与[《颜色分类：荷兰国旗三路划分》](/posts/algorithm/sort-colors/)同构）就能彻底免疫重复元素退化：如果 `target` 恰好落在中间的 `== pivot` 区间内，直接返回 `pivot`，否则只向左侧或右侧递归。

## 路径三：频次桶排序（LC 347 确定性线性时间）

在 LC 347 中，先用哈希表统计每个元素的出现次数 $f_x$。由于任何元素的出现次数必然满足 $1 \le f_x \le n$，频次的值域天然被限制在 $[1, n]$ 之间！

建立长度为 $n + 1$ 的桶数组 `buckets`，把频次为 $f$ 的元素放进 `buckets[f]`，最后从下标 `n` 倒序向下收集，凑够 $k$ 个元素即止。整个过程无需任何比较排序或堆调整，时间与空间均为确定性的 $O(n)$。

## Python：三路快速选择（LC 215）与频次桶（LC 347）

```python
from collections import Counter
import random


class Solution:
    def findKthLargest(self, nums: list[int], k: int) -> int:
        # LeetCode 215 — Expected O(n) time, O(1) auxiliary space (iterative 3-way quickselect)
        target = len(nums) - k
        lo, hi = 0, len(nums) - 1

        while lo <= hi:
            pivot = nums[random.randint(lo, hi)]
            # Three-way partition: [lo, lt) < pivot, [lt, i) == pivot, (gt, hi] > pivot.
            lt, i, gt = lo, lo, hi
            while i <= gt:
                if nums[i] < pivot:
                    nums[lt], nums[i] = nums[i], nums[lt]
                    lt += 1
                    i += 1
                elif nums[i] > pivot:
                    nums[i], nums[gt] = nums[gt], nums[i]
                    gt -= 1
                else:
                    i += 1

            if target < lt:
                hi = lt - 1
            elif target > gt:
                lo = gt + 1
            else:
                return pivot

        return -1

    def topKFrequent(self, nums: list[int], k: int) -> list[int]:
        # LeetCode 347 — Deterministic O(n) time, O(n) auxiliary space (bucket sort by frequency)
        counts = Counter(nums)
        buckets: list[list[int]] = [[] for _ in range(len(nums) + 1)]
        for val, freq in counts.items():
            buckets[freq].append(val)

        result: list[int] = []
        for freq in range(len(nums), 0, -1):
            for val in buckets[freq]:
                result.append(val)
                if len(result) == k:
                    return result
        return result
```

## C++：基于 `std::priority_queue` 的通用小顶堆模板

C++ 标准库也提供基于 introsort/quickselect 变体的 `std::nth_element`[^cpp-nth-element]；下面展示更具流式通用性的 `std::priority_queue` 小顶堆实现（配合 `std::greater<>` 构成小顶堆[^cpp-pq]），两题结构几乎完全对称：

```cpp
#include <functional>
#include <queue>
#include <unordered_map>
#include <utility>
#include <vector>

class Solution {
public:
    // LeetCode 215 — Time: O(n log k), Auxiliary space: O(k)
    int findKthLargest(const std::vector<int>& nums, int k) const {
        std::priority_queue<int, std::vector<int>, std::greater<int>> min_heap;
        for (int num : nums) {
            if (static_cast<int>(min_heap.size()) < k) {
                min_heap.push(num);
            } else if (num > min_heap.top()) {
                min_heap.pop();
                min_heap.push(num);
            }
        }
        return min_heap.top();
    }

    // LeetCode 347 — Time: O(n + m log k), Auxiliary space: O(m + k), where m is unique count
    std::vector<int> topKFrequent(const std::vector<int>& nums, int k) const {
        std::unordered_map<int, int> counts;
        counts.reserve(nums.size());
        for (int num : nums) {
            ++counts[num];
        }

        using Pair = std::pair<int, int>; // (frequency, value)
        std::priority_queue<Pair, std::vector<Pair>, std::greater<Pair>> min_heap;
        for (const auto& [val, freq] : counts) {
            if (static_cast<int>(min_heap.size()) < k) {
                min_heap.emplace(freq, val);
            } else if (freq > min_heap.top().first) {
                min_heap.pop();
                min_heap.emplace(freq, val);
            }
        }

        std::vector<int> result;
        result.reserve(static_cast<std::size_t>(k));
        while (!min_heap.empty()) {
            result.push_back(min_heap.top().second);
            min_heap.pop();
        }
        return result;
    }
};
```

## 方案对比

| 方法 | 时间复杂度 | 辅助空间 | 抗重复元素退化 | 是否支持在线数据流 |
| :--- | :--------- | :------- | :------------- | :----------------- |
| 容量为 $k$ 的小顶堆 | $O(n \log k)$ | $O(k)$（LC 347 另加 $O(m)$ 计数） | 完全免疫 | 是 |
| 三路快速选择（迭代） | 期望 $O(n)$ | $O(1)$（原地重排输入） | 三路划分免疫 | 否（需全量内存随机访问） |
| 频次桶排序（LC 347） | 确定性 $O(n)$ | $O(n)$ | 完全免疫 | 否（需先统计全部频次） |

当在线流式需求从“保留最大的 $k$ 个元素”升级为“随时查询整个数据流的中位数（动态 $k = n / 2$）”时，单个小顶堆不再够用，需要大顶堆与小顶堆对顶协作，见[《数据流的中位数：用对顶堆维护左右两半》](/posts/algorithm/find-median-from-data-stream/)。

[^py-heapq]: [Python 文档：`heapq` — Heap queue algorithm](https://docs.python.org/3/library/heapq.html)——提供基于列表的小顶堆原语，`heappush` 与 `heappop` 耗时 $O(\log k)$。

[^clrs-select]: [C. A. R. Hoare (1961): _Algorithm 65: FIND_](https://web.eecs.umich.edu/~weimerw/2008-615/reading/HoareFind.pdf)（*Communications of the ACM*, 4(7), p. 321）与 [_Introduction to Algorithms_ (4th ed., Section 9.2)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——提出快速选择算法并证明随机化选择的期望时间复杂度为 $\Theta(n)$。

[^cpp-nth-element]: [cppreference：`std::nth_element`](https://en.cppreference.com/w/cpp/algorithm/nth_element.html)——标准库提供的部分排序选择算法，平均时间复杂度为线性 $O(n)$。

[^cpp-pq]: [cppreference：`std::priority_queue`](https://en.cppreference.com/w/cpp/container/priority_queue.html)——容器适配器，默认构建大顶堆，传入 `std::greater<>` 比较器即转为小顶堆。
