---
title: "最长连续序列：哈希起点、并查集与边界缝合"
publishDate: "2026-10-19T12:00:00+08:00"
description: "LeetCode 128 的最长连续序列：Python 哈希起点与过半剪枝、并查集与 C++ 边界哈希单次遍历，最后给出按值域宽度自适应的直接寻址优化。"
---

[LeetCode 128. 最长连续序列](https://leetcode.cn/problems/longest-consecutive-sequence/)给定未排序的整数数组 `nums`，要求找出数字连续的最长序列长度，且时间复杂度为 $O(n)$。例如输入 `[100, 4, 200, 1, 3, 2]`，最长连续序列为 `[1, 2, 3, 4]`，返回长度 `4`。

在[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)中，后续双指针扫描本身需要 $O(n^2)$，因此先花 $O(n \log n)$ 排序不会推高整体复杂度；而本题要求 $O(n)$，排序本身就已超支。要在不排序的前提下识别连续关系，思路与[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)一致——利用哈希表的平均 $O(1)$ 查询直接定位目标值，只是查询对象从“和为 `target` 的补数”变成了“步长固定为 $1$ 的相邻整数 $x - 1$ 与 $x + 1$”。围绕这一邻接关系，可以从**链状连通分量**与**离散单元区间缝合**两个角度给出解法，并分别延伸向在线数据流与区间合并问题。

## Python：只从链条起点向后计数与过半剪枝

把数组中出现的每个整数看作顶点，若 $x$ 与 $x + 1$ 同时存在则连一条边。由于每个整数至多只有一个前驱 $x - 1$ 和一个后继 $x + 1$，整张图由若干条互不相交的链组成，最长连续序列就是顶点数最多的一条链。

若从每个数字出发都向后枚举 $x + 1, x + 2, \dots$，同一条链会被反复扫描，最坏退化为 $O(n^2)$。避免重复遍历的条件很直接：只有当 $x - 1$ **不在集合中**时，$x$ 才是一条链的起点，此时才启动向后计数；若 $x - 1$ 存在，$x$ 必然会在从该链起点出发的那次扫描中被访问到，当前轮直接跳过。

```python
class Solution:
    def longestConsecutive(self, nums: list[int]) -> int:
        num_set = set(nums)
        max_length = 0

        # Iterate over unique values so duplicate streak starts do not rescan the chain.
        for num in num_set:
            if num - 1 in num_set:
                continue

            end = num + 1
            while end in num_set:
                end += 1

            max_length = max(max_length, end - num)
            # Disjoint streaks partition num_set; no other streak can exceed len(num_set) - max_length.
            if max_length * 2 >= len(num_set):
                break

        return max_length
```

以 `[100, 4, 200, 1, 3, 2]` 为例，`num_set` 共含 $u = 6$ 个唯一元素。`4`、`3`、`2` 的前驱都在集合中，经一次 `in` 判断即跳过；从起点 `1` 出发时，`end` 一路推进到首个缺失值 `5`，半开区间 $[1, 5)$ 的长度直接由 `end - num = 4` 算出，无需在 `while` 循环内同步累加第二个计数变量。此时 `max_length = 4` 已满足 `4 * 2 >= 6`：由于各条连续链将 `num_set` 划分为互不相交的子集，剩余元素总数至多为 $u - \text{max\_length} = 2 < 4$，即便剩余数字全部相连也不可能超过当前最优解，外层循环即可提前终止。

这里有三处保持通用性的细节：

- **遍历 `num_set` 而非 `nums`**：若原数组包含大量重复的链起点（如一万个 `1` 和一个 `2`），遍历 `nums` 会让每个 `1` 都重新走一遍整条链；在 `num_set` 上迭代则保证每个唯一值至多作为起点进入内层循环一次。
- **过半剪枝比较 `len(num_set)` 而非 `len(nums)`**：去重后的集合大小 $u \le n$ 是所有互斥连续链共享的真实顶点池；只要已知最长链占去至少一半唯一元素（$2 \cdot \text{max\_length} \ge u$），余下顶点数 $u - \text{max\_length} \le \text{max\_length}$ 就无法构造出更长的链。当原数组存在重复值时，用 `len(num_set)` 加上 `>=` 比用 `len(nums)` 的 `>` 界限更紧。
- **去重与查询复杂度**：去重建表与集合成员查询平均耗时 $O(1)$[^hash-lookup]。外层循环至多执行 $u$ 次前驱检查；内层 `while` 每成功推进一次都对应链上的一个后继元素，每个唯一元素至多作为后继被推进一次、在链尾再触发一次失败查找。因此哈希查询总次数不超过 $3u \le 3n$，平均时间复杂度为 $O(n)$，额外空间复杂度为 $O(n)$。

## 并查集：连通分量视角的在线延伸

同样从连通分量出发，也可以在检测到 $x - 1$ 或 $x + 1$ 已存在时调用**并查集**（Disjoint Set Union）的 `union`，并在根节点维护分量大小。带路径压缩与按秩合并的单次操作平摊为 $O(\alpha(n))$（$\alpha$ 为反阿克曼函数）[^tarjan-dsu]。不过面对任意整数输入时，数值本身并非 $[0, n)$ 内的稠密下标，无法直接用定长数组充当父节点表，仍要先靠哈希表把数值映射到节点，外加维护父指针与分量大小两份状态，在一次性给定的静态数组上常数开销明显高于集合起点法。

并查集的真正用武之地在于**在线数据流**：当数字逐个到达且穿插查询时，静态起点法每来一个数都要重扫集合，而增量维护的连通结构只需局部合并。[《将数据流变为多个不相交区间：在线区间的增量熔接》](/notes/algorithm/data-stream-as-disjoint-intervals/)正是把这一增量合并思想搬到有序区间结构上。

## C++：边界哈希的单次遍历

如果把视角从“图搜索”切换到“区间缝合”，可以在一次遍历中一边去重一边合并，无需先建完整集合再回头找起点。这种**边界哈希法**（Boundary Map）将每个新数字 $x$ 视为单点闭区间 $[x, x]$，用哈希表 `boundary_len` 维护已形成区间**外侧端点的总长度**。

设当前读入整数 $x$（代码中为 `num`）：

1. 若 $x$ 已在 `boundary_len` 中出现过，说明它是重复元素，直接跳过；
2. 查询左邻点记录的长度 $L$（`boundary_len` 中键 $x - 1$ 的值，不存在则为 $0$）与右邻点记录的长度 $R$（键 $x + 1$ 的值，不存在则为 $0$）；
3. $x$ 将左右两段拼接为闭区间 $[x - L, x + R]$，新区间总长度为：
   $$
   \text{current\_total} = L + 1 + R
   $$
4. 先把 `boundary_len[x]` 写入表中标记 $x$ 已访问，再将新区间**最左端点** $x - L$（当 $L > 0$）与**最右端点** $x + R$（当 $R > 0$）的长度更新为 $\text{current\_total}$。

```cpp
#include <algorithm>
#include <limits>
#include <unordered_map>
#include <vector>

class Solution {
public:
    int longestConsecutive(const std::vector<int>& nums) {
        std::unordered_map<int, int> boundary_len;
        boundary_len.reserve(nums.size());
        int max_len = 0;

        for (int num : nums) {
            // Skip duplicates; re-evaluating an interior point would read stale neighbor lengths.
            if (boundary_len.find(num) != boundary_len.end()) continue;

            int left = 0;
            if (num > std::numeric_limits<int>::min()) {
                if (const auto it = boundary_len.find(num - 1); it != boundary_len.end()) {
                    left = it->second;
                }
            }

            int right = 0;
            if (num < std::numeric_limits<int>::max()) {
                if (const auto it = boundary_len.find(num + 1); it != boundary_len.end()) {
                    right = it->second;
                }
            }

            const int current_total = left + 1 + right;
            // Always record num itself: when left == 0 or right == 0 it is an outer endpoint,
            // and when both > 0 it is an interior point that must still block later duplicates.
            boundary_len[num] = current_total;
            if (left > 0) boundary_len[num - left] = current_total;
            if (right > 0) boundary_len[num + right] = current_total;

            max_len = std::max(max_len, current_total);
        }

        return max_len;
    }
};
```

以依次读入 `1, 2, 4, 5, 3, 3` 为例：前四个数分别形成区间 `[1, 2]`（`boundary_len[1] = boundary_len[2] = 2`）与 `[4, 5]`（`boundary_len[4] = boundary_len[5] = 2`）。当第一个 `3` 到达时，查得 `left = boundary_len[2] = 2`、`right = boundary_len[4] = 2`，算出 `current_total = 5`，随即把外侧端点 `boundary_len[1]` 和 `boundary_len[5]` 更新为 `5`。此时区间内部的 `boundary_len[2]` 和 `boundary_len[4]` 仍停留在旧值 `2`，但这不会影响后续结果：任何尚未见过的新整数都只能从区间外侧的 `0` 或 `6` 接入，只会读取 `boundary_len[1]` 或 `boundary_len[5]`。与此同时，`boundary_len[3] = 5` 的写入一举两得：当 $L = 0$ 或 $R = 0$ 时，`num` 本身就是外侧端点，配合 `if (left > 0)` 与 `if (right > 0)` 可省去对同一键的重复写入；当 $L > 0$ 且 $R > 0$ 时，`num` 落入区间内部，写入 `boundary_len[num]` 则保证紧接着到达的第二个 `3` 被判重拦截，不会再次读取 `2` 和 `4` 上的过期长度覆写外侧端点。

这份实现不依赖特定值域约束：试探邻居前先检查 `num` 是否为 `INT_MIN` 或 `INT_MAX`，避免 `num - 1` 与 `num + 1` 触发有符号整数溢出[^cpp-limits]；一旦查得 `left` 或 `right` 非零，说明远端端点 `num - left` 或 `num + right` 本就是此前已存入表中的合法 `int` 键，回算端点坐标自然不会越界。`reserve` 预先分配桶数以减少插入期间的重新散列[^unordered-reserve]，每个不重复元素只执行常数次哈希查找与写入，平均时间复杂度为 $O(n)$，额外空间复杂度为 $O(n)$。

## C++ 进阶：按值域宽度自适应的直接寻址

上面的哈希起点法与边界哈希法都默认输入值可能高度稀疏；但如果输入是 `[3, 1, 2, 2, 5]`，只需为最小值 `1` 到最大值 `5` 分配五个标记位置，得到 `[1, 1, 1, 0, 1]`，顺序扫描即可求出最长连续段长度 `3`。这就是**直接寻址**：用 `x - min_value` 作为数组下标，省去哈希桶与节点分配开销；反之，若输入为 `[1, 1000000000]`，为整个值域分配数组就不切实际。完整静态数组一次性给定时，可以先扫描最小值与最大值，按值域宽度在字节标记数组与哈希起点扫描之间自适应切换：

```cpp
#include <algorithm>
#include <cstddef>
#include <limits>
#include <unordered_set>
#include <vector>

class Solution {
public:
    int longestConsecutive(const std::vector<int>& nums) {
        if (nums.empty()) return 0;

        const auto [min_it, max_it] = std::minmax_element(nums.begin(), nums.end());
        const int min_value = *min_it;
        // Widen to long long before subtracting so [INT_MIN, INT_MAX] does not overflow.
        const long long span = static_cast<long long>(*max_it) - min_value;
        constexpr long long MAX_DENSE_SPAN = 1'000'000;
        constexpr long long DENSE_SPAN_FACTOR = 2;

        // Direct-address a byte array only when the value range is both small and dense.
        if (span <= MAX_DENSE_SPAN &&
            span <= DENSE_SPAN_FACTOR * static_cast<long long>(nums.size())) {
            std::vector<char> exists(static_cast<std::size_t>(span + 1), 0);
            for (int num : nums) {
                exists[static_cast<std::size_t>(static_cast<long long>(num) - min_value)] = 1;
            }

            int max_len = 0;
            int current_len = 0;
            for (char present : exists) {
                current_len = present ? current_len + 1 : 0;
                max_len = std::max(max_len, current_len);
            }
            return max_len;
        }

        std::unordered_set<int> values;
        values.reserve(nums.size());
        values.insert(nums.begin(), nums.end());
        int max_len = 0;

        for (int num : values) {
            // Guard against signed overflow at INT_MIN/INT_MAX when probing neighbors.
            if (num > std::numeric_limits<int>::min() && values.count(num - 1)) {
                continue;
            }

            int current = num;
            int current_len = 1;
            while (current < std::numeric_limits<int>::max() && values.count(current + 1)) {
                ++current;
                ++current_len;
            }
            max_len = std::max(max_len, current_len);
            if (2LL * max_len >= static_cast<long long>(values.size())) break;
        }
        return max_len;
    }
};
```

设输入长度为 $n$，唯一元素数量为 $u$，值域宽度为 $W = \max - \min + 1$；代码中的 `span` 对应 $W - 1$。两个分支的开销分别为：

| 分支               | 时间复杂度             | 额外空间复杂度                     |
| ------------------ | ---------------------- | ---------------------------------- |
| 字节标记数组       | $O(n + W)$             | $O(W)$                             |
| 哈希集合与起点扫描 | 平均 $O(n + u) = O(n)$ | $O(n)$，包含按输入长度预留的桶容量 |

进入数组分支时，条件保证 $W \le 2n + 1$，因此初始化、写入和扫描合计仍为 $O(n)$，空间也为 $O(n)$。另一个条件把数组长度限制为至多 1,000,001 个 `char`；`vector<char>` 是字节标记数组，并非每个值只占一位的压缩位图[^cpp-vector-bool]。大量重复值会让 $n$ 远大于 $u$，所以这里按输入长度估算分配成本，不能把分支条件理解为对唯一值密度的精确测量。

这两个阈值只影响性能取舍，不影响正确性：超出阈值仍由哈希分支兜底，算法并不要求输入落在小值域内。减法前先转成 `long long`，使最小值与最大值分别为 `INT_MIN` 和 `INT_MAX` 时也能安全计算跨度；稀疏分支则在查询相邻整数前检查极值[^cpp-limits]，沿用集合去重、`reserve` 容量预留[^unordered-set-reserve]与过半剪枝。连续数组访问省去了稠密分支中的哈希与节点分配，但混合方案需要先调用 `std::minmax_element` 额外扫描一次最小值和最大值[^cpp-minmax-element]；最终走稀疏分支时，这次扫描就是相对纯哈希解法增加的工作。阈值 `2` 和 `1'000'000` 是可调参数，具体耗时取决于数据分布、标准库和硬件，不能仅凭源码断言它在所有输入上都更快。

回看整道题，每个数字都相当于长度为 $1$ 的单点区间 $[x, x]$，拼接只发生在左右紧邻的整数边界上。当数字改为逐个在线到达并需要随时输出有序区间时，问题延伸为[《将数据流变为多个不相交区间：在线区间的增量熔接》](/notes/algorithm/data-stream-as-disjoint-intervals/)；当输入对象从离散单点扩展为任意闭区间 $[l, r]$ 时，[《插入区间：三段式线性划分》](/notes/algorithm/insert-interval/)处理单个新区间融入有序不相交列表的局部合并，[《合并区间：排序后维护右边界》](/notes/algorithm/merge-intervals/)则通过排序解决乱序区间集合的全局合并。

[^hash-lookup]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——说明 Python `set` 成员检查与迭代的平均时间复杂度。

[^tarjan-dsu]: [Robert E. Tarjan：*Efficiency of a Good But Not Linear Set Union Algorithm* (JACM, 1975)](https://doi.org/10.1145/321879.321884)——证明同时采用路径压缩与按秩（或大小）合并的并查集，其单次操作的平摊时间复杂度受反阿克曼函数 $\alpha(n)$ 约束。

[^cpp-limits]: [cppreference：`std::numeric_limits`](https://en.cppreference.com/w/cpp/types/numeric_limits.html)——提供目标整型可表示的最小与最大极值，用于在减一或加一前排除有符号溢出。

[^unordered-reserve]: [cppreference：`unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明按元素数量预留桶容量，以避免插入过程中频繁重新散列。

[^unordered-set-reserve]: [cppreference：`unordered_set::reserve`](https://en.cppreference.com/w/cpp/container/unordered_set/reserve.html)——参数是预期容纳的元素数量，实际桶数还取决于最大负载因子。

[^cpp-vector-bool]: [cppreference：`std::vector<bool>`](https://en.cppreference.com/w/cpp/container/vector_bool.html)——说明标准库仅对 `std::vector<bool>` 做了按位压缩特化，而 `std::vector<char>` 按普通连续字节数组存储。

[^cpp-minmax-element]: [cppreference：`std::minmax_element`](https://en.cppreference.com/w/cpp/algorithm/minmax_element.html)——说明在单趟遍历中同时找出范围的最小与最大元素，至多执行 $\max(\lfloor\frac{3}{2}(n - 1)\rfloor, 0)$ 次比较。
