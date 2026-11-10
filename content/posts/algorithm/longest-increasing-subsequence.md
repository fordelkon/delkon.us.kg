---
title: "最长递增子序列：结尾状态转移与贪心二分分堆"
publishDate: "2026-11-05T12:00:00+08:00"
description: "LeetCode 300 的最长递增子序列：从以元素结尾的动态规划，到维护最小结尾的贪心二分，解释重复值的处理、牌堆数为何等于答案，以及如何还原序列。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 300. 最长递增子序列](https://leetcode.cn/problems/longest-increasing-subsequence/)（Hot 100）给定非空整数数组 `nums`，要求返回最长严格递增子序列（Longest Increasing Subsequence, LIS）的长度。子序列可以删除元素，但保留相对顺序；选择的下标 $i_1<i_2<\dots<i_k$ 必须满足 $nums[i_1]<nums[i_2]<\dots<nums[i_k]$，相等元素不能接入同一递增链。设输入长度为 $n$。

[《最长公共子序列：双串前缀对齐与单行滚动优化》](/posts/algorithm/longest-common-subsequence/)用两个前缀定义状态，本题则需要保留结尾元素的信息，才能判断后来的值是否接得上。先按结尾位置做动态规划，再把同一长度的候选压缩成一个最小结尾值。

## 经典状态转移：以元素结尾的 O(n^2) 递推

如果只保存“前缀 `nums[0..i]` 内的 LIS 长度”，我们不知道最优序列以什么值结尾，无法判断新元素能否追加。因此定义 $dp[i]$ 为**以 `nums[i]` 结尾**的最长严格递增子序列长度。

### 递推关系与状态依赖

1. 每个元素单独构成长度为 1 的子序列，因此初始化 $dp[i]=1$。
2. 枚举前驱位置 $0\le j<i$。只有 $nums[j]<nums[i]$ 时，才能将当前元素接在以 `nums[j]` 结尾的序列后，得到长度 $dp[j]+1$：

$$
dp[i] = \max\left(\{1\} \cup \{dp[j]+1 \mid 0 \le j<i,\ nums[j]<nums[i]\}\right)
$$

3. 答案是 $\max_{0\le i<n}dp[i]$，而不是 $dp[n-1]$，因为最优序列未必以最后一个元素结尾。例如 `[1, 2, 0]` 的答案为 2，最后一个结尾状态只有 1。

状态只依赖更小的下标，按索引递增计算即可让前驱先就绪。这与[从记忆化到自底向上递推](/posts/understanding-recursion/#从记忆化到自底向上递推)的做法相同，也省去了递归栈。

### Python：自底向上递推实现

```python
class Solution:
    def lengthOfLIS(self, nums: list[int]) -> int:
        if not nums:
            return 0

        n = len(nums)
        # Every element starts a length-1 subsequence ending at its own position.
        dp = [1] * n
        for i in range(1, n):
            for j in range(i):
                if nums[j] < nums[i]:
                    dp[i] = max(dp[i], dp[j] + 1)

        return max(dp)
```

比较前驱的总次数为 $\sum_{i=1}^{n-1}i=\frac{n(n-1)}{2}$，时间复杂度为 $O(n^2)$；`dp` 占 $O(n)$ 辅助空间。

## 进阶突破：Patience Sorting 纸牌分堆与贪心二分

题目规模内可以使用二次递推；若推广到 $n=10^5$，就需要约 50 亿次前驱比较。减少候选的依据是：同样长度的递增子序列，结尾越小，能接纳的后续元素越多。

例如 `[1, 3, 5]` 和 `[2, 8, 10]` 都长为 3，后续的 7 只能接在前者后面。只求长度时，可以保留结尾 5，而不必同时保留结尾 10；任何能接在 10 后面的值，也都能接在 5 后面。

### 纸牌分堆（Patience Sorting）机制

用纸牌分堆的方式维护这些候选[^aldous-diaconis]：数组 `tails[k]` 表示**已扫描前缀中，长度为 $k+1$ 的严格递增子序列的最小结尾值**。每个槽位对应一个牌堆，堆顶就是当前结尾候选。

#### 单调性不变式证明

设当前有 $m$ 个槽位。按定义，它们满足 $tails[0]<tails[1]<\dots<tails[m-1]$。

证明相邻两项即可：`tails[k + 1]` 对应某条长度为 $k+2$ 的递增子序列。去掉最后一项后，剩下长度为 $k+1$ 的递增子序列，结尾记为 $e$。因为原序列严格递增，且 `tails[k]` 是同长度结尾的最小值，有：

$$
tails[k]\le e<tails[k+1].
$$

因此所有相邻槽位严格递增，可以在 `tails` 上二分查找。

### 状态转移与二分查找

读入新值 $x$ 时，查找第一个 $\ge x$ 的槽位，这正是 `std::lower_bound`[^cpp-lower-bound]：

1. 若不存在这样的槽位，说明 $x$ 大于最后一个结尾候选，可以扩展当前最长序列，直接追加。
2. 否则设命中下标为 $k$，用 $x$ 替换 `tails[k]`。若 $k=0$，$x$ 单独构成长度为 1 的序列；若 $k>0$，查找边界保证 $tails[k-1]<x\le tails[k]$，所以 $x$ 可以接在某条长度为 $k$ 的序列后，成为长度为 $k+1$ 的新结尾。

这一替换保留了所有已有长度的可达性，并维护最小结尾定义：对更短的长度，原结尾已经小于 $x$，不必更新；对更长的长度，原前缀中不存在能接上 $x$ 的前驱；在长度 $k+1$ 上，$x$ 则不大于旧候选。更新后它仍大于左邻、小于右邻，不破坏单调性。

#### 为什么必须使用 `std::lower_bound` 而非 `std::upper_bound`

二分边界对应题目中的“严格”要求：

- `lower_bound` 找首个 $\ge x$ 的位置。输入 `[2, 2]` 时，第二个 2 替换第一个槽位，长度仍为 1。
- `upper_bound` 找首个 $>x$ 的位置，会让第二个 2 追加到尾部，求得的是非降子序列长度，而非严格递增长度。

### 数学证明：为什么 tails 的长度精确等于全局 LIS 长度

`tails` 的值未必按原下标顺序组成一条子序列。要证明其长度仍等于答案，可以分别证明存在同样长的序列，以及不存在更长的序列。Schensted 的论文讨论了递增子序列长度与插入表之间的关系[^schensted-1961]；下面用结尾状态和牌堆给出论证。

#### 1. 下界证明（存在性归纳）

归纳命题：扫描过程中，每个槽位 `tails[k]` 都对应一条真实的、长度为 $k+1$ 的严格递增子序列，并以该值结尾。

- 首个元素建立长度为 1 的序列，命题成立。
- 新值替换第 0 项时，它自身就是长度为 1 的序列。
- 新值替换第 $k>0$ 项时，更新前已有一条以 `tails[k - 1]` 结尾、长度为 $k$ 的序列。它的所有元素都先于新值出现，且结尾小于新值，因此可以追加得到长度 $k+1$。
- 新值追加到末尾时，同理扩展原最长候选，得到长度 $m+1$ 的真实序列。

未更新的槽位仍有原先的序列作为见证。因此最终存在长度为 $m=\text{tails.size()}$ 的 LIS 候选，全局最优长度至少为 $m$。

#### 2. 上界证明（不可超越性与牌堆对偶）

把每个元素看作放入 `lower_bound` 找到的首个牌堆，找不到则新开一堆[^aldous-diaconis]。同一堆后放入的元素不大于此前堆顶，所以该堆按原下标顺序非递增。同一条严格递增子序列不可能从一堆取两张牌。

最终只有 $m$ 堆，任意严格递增子序列至多从每堆各取一张，长度不超过 $m$。

#### 3. 综合结论

两边合并得到：

$$
m\le\text{LIS 最大长度}\le m,
\qquad \text{LIS 最大长度}=\text{tails.size()}.
$$

### 区分状态标尺与真实子序列：反例与路径重构

输入 `[3, 5, 2]`，`tails` 依次变成 `[3]`、`[3, 5]`、`[2, 5]`。最后的 `[2, 5]` 不是原数组的子序列，因为 2 出现在 5 后面；但两个槽位分别有真实序列 `[2]` 和 `[3, 5]` 作为见证，最长长度仍是 2。若后续读入 4，较小结尾 2 就能形成 `[2, 4]`。

若要还原一条 LIS，可以额外记录 `pos[i]`：当 `nums[i]` 被放到下标 $k$ 的槽位时，令 `pos[i]=k`。结束后从右向左扫描，依次寻找 $m-1,m-2,\dots,0$，把命中的元素收集后翻转，重构耗时 $O(n)$。

这个倒序选择也保留严格递增性：某个处于第 $k$ 层的元素 $x$ 出现时，它之前已有更小的第 $k-1$ 层结尾。若之后、$x$ 之前还有元素写入第 $k-1$ 层，它只会继续降低该层结尾。因此倒序找到的最近第 $k-1$ 层元素仍小于 $x$，且下标更早。

## C++：基于 std::lower_bound 的二分优化

两种实现都只读取输入并返回长度。下面提前 `reserve` 了 $n$ 个槽位，因此即使 LIS 很短，容量也应按 $O(n)$ 辅助空间计。

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int lengthOfLIS(const std::vector<int>& nums) {
        if (nums.empty()) {
            return 0;
        }

        // tails[k] is the minimum ending value for length k + 1; tails stays strictly sorted.
        std::vector<int> tails;
        tails.reserve(nums.size());
        for (int x : nums) {
            // Equal values replace a slot instead of extending the sequence.
            auto it = std::lower_bound(tails.begin(), tails.end(), x);
            if (it == tails.end()) {
                tails.push_back(x);
            } else {
                *it = x;
            }
        }

        return static_cast<int>(tails.size());
    }
};
```

每个元素做一次二分查找，在至多 $n$ 项的数组中用 $O(\log n)$ 次比较定位。`vector` 的随机访问迭代器也保证定位过程的移动成本为 $O(\log n)$，总时间复杂度为 $O(n\log n)$，辅助空间为 $O(n)$。

## 递推模型与二分贪心方案对比

| 方案             | 时间复杂度   | 辅助空间 | 核心机制               | 扩展                     |
| :--------------- | :----------- | :------- | :--------------------- | :----------------------- |
| 以元素结尾 DP    | $O(n^2)$     | $O(n)$   | 枚举所有可接入的前驱   | 便于计数或权重扩展       |
| 纸牌分堆贪心二分 | $O(n\log n)$ | $O(n)$   | 每种长度只保留最小结尾 | 记录元素所在层可还原序列 |

[^schensted-1961]: [C. Schensted：_Longest Increasing and Decreasing Subsequences_ (1961)](https://doi.org/10.4153/CJM-1961-015-3)——讨论最长递增、递减子序列与插入表之间的关系，本文另外给出基于结尾状态和牌堆的长度证明。

[^aldous-diaconis]: [David Aldous, Persi Diaconis：_Longest Increasing Subsequences: From Patience Sorting to the Baik–Deift–Johansson Theorem_](https://doi.org/10.1090/S0273-0979-99-00796-X)——讨论 Patience Sorting 纸牌分堆与最长递增子序列的对应关系。

[^cpp-lower-bound]: [cppreference：`std::lower_bound`](https://en.cppreference.com/w/cpp/algorithm/lower_bound)——在已划分区间查找首个不小于目标值的位置，比较次数为对数级；非随机访问迭代器的移动次数可能为线性，本文 `vector` 的随机访问迭代器避免了这项开销。
