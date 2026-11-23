---
title: "滑动窗口最大值：单调双端队列与过期下标"
publishDate: "2026-12-16T12:00:00+08:00"
description: "LeetCode 239 滑动窗口最大值：用双端队列维护窗口内严格递减候选下标，揭示新元素淘汰尾部较弱候选与窗口右移淘汰过期队首的均摊 O(1) 机制，并对照单调栈。"
tags: ["algorithm", "sliding-window", "python", "cpp"]
---

[LeetCode 239. 滑动窗口最大值](https://leetcode.cn/problems/sliding-window-maximum/)（Hot 100，困难）给定整数数组 `nums` 和滑动窗口大小 `k`，窗口每次向右移动一位，要求返回每个窗口中的最大值。题目保证 $1 \le k \le n \le 10^5$，元素范围在 $[-10^4, 10^4]$ 之间。下列实现均只读输入数组，不修改 `nums`。

## 为什么需要双端队列（Deque），而不是堆或单调栈

如果用大顶堆维护窗口元素，需要额外配合惰性删除追踪下标是否滑出左边界，时间复杂度为 $O(n \log n)$。而在队列的两端分别负责一件事，可以把时间压到严格线性 $O(n)$：

```mermaid title="数组起伏与单调队列队头极值走势（k = 3）" description="柱状为输入 nums = [1, 3, -1, -3, 5, 3, 6, 7]，折线为单调队列队头维护的当前窗口最大值 [1, 3, 3, 3, 5, 5, 6, 7]，从下标 2 形成完整窗口（k = 3）起输出 [3, 3, 5, 5, 6, 7]。"
xychart-beta
    title "原数组（柱）与当前窗口最大值（线，k = 3）"
    x-axis [0, 1, 2, 3, 4, 5, 6, 7]
    y-axis "数值" -4 --> 8
    bar [1, 3, -1, -3, 5, 3, 6, 7]
    line [1, 3, 3, 3, 5, 5, 6, 7]
```

以 `[1, 3, -1, -3, 5]`、窗口大小 3 为例。队首在左，队列只列出仍可能成为最大值的下标：

<div class="algorithm-table">

| 窗口下标 | 队列下标 | 最大值 |
| --- | --- | ---: |
| 0–2 | 1、2 | 3 |
| 1–3 | 1、2、3 | 3 |
| 2–4 | 4 | 5 |

</div>

例如下标 4 的值 5 入队时，队尾的 −3、−1、3 都比它小，依次被移除。队首过期检查仍然需要执行，尤其是后来的值不足以淘汰旧队首时。

核心支配淘汰规则如下：假设窗口内旧下标 $j < i$ 且满足 `nums[j] <= nums[i]`。由于 $i$ 不仅数值不小于 $j$，而且在窗口继续向右滑动时，$j$ 还会比 $i$ **更早滑出窗口**——因此 $j$ 在当前及未来任何窗口中都不可能再成为唯一最大值，可以从队尾安全删除。

**为什么队列里必须存下标而不是直接存数值**：如果直接存数值，面对 `[3, 1, 2]`（$k = 2$）这类窗口，无法判断队首的 `3` 究竟是在刚刚滑出的下标 `0` 还是仍在窗口内的新位置；存下标既能通过 `dq[0] <= i - k` 在 $O(1)$ 内判定过期，又能通过 `nums[dq[0]]` 取值。

由此维护一条单调双端队列不变式：**队列中存储的下标严格递增，且它们对应的元素值严格递减**；每当 $i \ge k - 1$ 时，队首下标 `dq[0]` 永远是窗口 `[i - k + 1, i]` 最大值的所在位置。

## Python & C++：均摊 $O(1)$ 单调双端队列

Python 使用 `collections.deque`[^py-deque]，C++ 使用 `std::deque<int>`[^cpp-deque]，两者都在队列两端提供常数时间的插入与删除：

```python
from collections import deque


class Solution:
    def maxSlidingWindow(self, nums: list[int], k: int) -> list[int]:
        # Invariant: indices in `dq` are strictly increasing and their values are
        # strictly decreasing, so dq[0] is always the maximum index in [i - k + 1, i].
        dq: deque[int] = deque()
        result: list[int] = []

        for i, num in enumerate(nums):
            # Evict weaker older candidates from the back: they are both <= num and expire sooner.
            while dq and nums[dq[-1]] <= num:
                dq.pop()
            dq.append(i)

            # Evict the front index once it falls outside the left boundary of [i - k + 1, i].
            if dq[0] <= i - k:
                dq.popleft()

            if i >= k - 1:
                result.append(nums[dq[0]])

        return result
```

```cpp
#include <cstddef>
#include <deque>
#include <vector>

class Solution {
public:
    std::vector<int> maxSlidingWindow(const std::vector<int>& nums, int k) const {
        const int n = static_cast<int>(nums.size());
        std::vector<int> result;
        result.reserve(static_cast<std::size_t>(n - k + 1));
        std::deque<int> dq;

        for (int i = 0; i < n; ++i) {
            // Maintain strictly decreasing values in `dq` by popping dominated tail indices.
            while (!dq.empty() && nums[dq.back()] <= nums[i]) {
                dq.pop_back();
            }
            dq.push_back(i);

            // Drop the front index once it slides past the window's left edge.
            if (dq.front() <= i - k) {
                dq.pop_front();
            }

            if (i >= k - 1) {
                result.push_back(nums[dq.front()]);
            }
        }

        return result;
    }
};
```

## 复杂度分析与单调栈对照

- **时间复杂度**：每个下标至多从队尾入队一次、从队尾或队首出队一次，结合聚合分析[^clrs-amortized]，总时间复杂度为 $O(n)$。
- **辅助空间复杂度**：队尾淘汰加队首过期保证队列长度不超过 $k$，辅助空间为 $O(k)$（不含长度为 $n - k + 1$ 的返回数组 `result`）。

对比[《每日温度：用单调栈找下一次升温》](/posts/algorithm/daily-temperatures/)与[《柱状图中最大的矩形：弹栈确定左右边界》](/posts/algorithm/largest-rectangle-in-histogram/)：单调栈只需在**一端**（栈顶）压入并淘汰比当前元素弱的旧状态，用来找“下一个更大/更矮边界”；而单调双端队列在此基础上增加了**另一端**（队首）的窗口过期淘汰，用来维护“固定滑动区间内的最值”。

[^clrs-amortized]: [_Introduction to Algorithms_ (4th ed., Section 16.1: Aggregate analysis)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 16.1 节聚合分析说明每个元素最多入队与出队各一次时总时间为线性 $O(n)$。

[^py-deque]: [Python 文档：`collections.deque`](https://docs.python.org/3/library/collections.html#collections.deque)——两端 `append()`、`pop()` 与 `popleft()` 均为近似 $O(1)$ 时间复杂度。

[^cpp-deque]: [cppreference：`std::deque`](https://tcs.rwth-aachen.de/docs/cpp/reference/en.cppreference.com/w/cpp/container/deque.html)——双端队列容器，保证首尾插入与删除均为常数时间 $O(1)$。
