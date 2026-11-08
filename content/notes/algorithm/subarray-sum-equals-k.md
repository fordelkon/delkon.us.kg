---
title: "和为 K 的子数组：先查前缀，再记录频次"
publishDate: "2026-10-17T12:00:00+08:00"
description: "LeetCode 560 的连续子数组计数：从前缀和差值推导哈希频次，解释零前缀、更新时序与负数下滑动窗口失效的原因，并给出 C++ 实现。"
---

[LeetCode 560. 和为 K 的子数组](https://leetcode.cn/problems/subarray-sum-equals-k/)要求统计和为 `k` 的**连续、非空子数组**个数。这里的 `k` 是目标和，不是要从数组里选出 `k` 个数。以 `nums = [1, -1, 1]`、$k = 1$ 为例，两个单元素 `[1]` 加上整段 `[1, -1, 1]`，一共是 3 个答案；数值相同但位置不同的子数组要分别计入。

## 为什么不能套固定方向的滑动窗口

如果数组元素都非负，固定左端向右扩张时区间和不减，固定右端收缩左端时区间和不增，可以利用这一单调性设计滑窗。不过本题统计所有子数组，遇到零时同一右端可能有多个合法左端；例如 `[0, 0]`、$k = 0$ 有 3 个答案，每个右端命中后只加 1 会漏算，非负滑窗也需要额外计数逻辑；在[《找到所有字母异位词：定长滑窗与频次差分维护》](/notes/algorithm/find-all-anagrams-in-a-string/)中，窗口大小严格固定为模式串长度，进出字符数量守恒，因而同样适用滑窗。但当数组中存在负数时，区间和与端点移动彻底失去单调性：`[1, -1, 1]` 的前两个元素之和从 1 降到 0，再加入第三个又升到 1。当前和偏大时向右扩张可能使其变小，当前和偏小时移走左端也可能使其变大。负数破坏的是这种仅凭当前和与目标大小决定伸缩方向的简单单调性；这里改用适用于一般整数数组的前缀和差值与哈希计数。

## 把区间和变成两个前缀之差

令 $P_j$ 为前 $j$ 个元素之和，$P_0 = 0$。左闭右开区间 $[i, j)$ 的和为 $P_j - P_i$，因此目标条件可以改写为：

$$
P_j - P_i = k \iff P_i = P_j - k, \qquad 0 \le i < j.
$$

扫描到位置 $j$ 时，只需知道前缀值 $P_j - k$ **已经出现了几次**，它们分别对应不同的起点 $i$。代码中的 `prefix` 保存当前的 $P_j$。

以 `nums = [1, -1, 1]`、$k = 1$ 走一遍：

| 已扫描元素   | 当前前缀和 | 查找先前的前缀和 | 新增答案 |
| ------------ | ---------: | ---------------: | -------: |
| `[1]`        |          1 |     0：出现 1 次 |        1 |
| `[1, -1]`    |          0 |    -1：出现 0 次 |        0 |
| `[1, -1, 1]` |          1 |     0：出现 2 次 |        2 |

最初那一次 `0` 是空前缀，代表从下标 0 开始的子数组。第二次 `0` 来自 `[1, -1]`，代表从下标 2 开始的子数组。两次匹配都要计入。

**先查、后记录当前前缀**，才能保证起点在终点之前。若先记录再查询，$k = 0$ 时会把刚生成的前缀与自己配对，误算一个长度为 0 的子数组。例如 `nums = [0]`，正确答案是 1，错误时序会得到 2。

## Python：一趟扫描完成计数

设输入长度为 $n$；两版实现都只读输入并返回计数，输出空间为 $O(1)$。`prefix_count` 记录扫描到当前位置之前每种前缀和出现的次数。代码用 `dict.get(key, 0)` 取得旧频次，键不存在时返回 0[^python-dict]；每遇到一个新元素，先查能与当前前缀配成 `k` 的旧前缀，再把当前前缀加入表中：

```python
class Solution:
    def subarraySum(self, nums: list[int], k: int) -> int:
        prefix_count: dict[int, int] = {0: 1}
        prefix = 0
        result = 0

        for value in nums:
            prefix += value
            # Query before recording so every match is a nonempty subarray.
            result += prefix_count.get(prefix - k, 0)
            prefix_count[prefix] = prefix_count.get(prefix, 0) + 1

        return result
```

`[0, 0]`、$k = 0$ 时，这段代码依次增加 1、2 个答案，返回 3；它计算的是起止位置不同的非空子数组，而不是去重后的数值组合。哈希查找和插入平均 $O(1)$，总时间平均 $O(n)$，最多存储 $n + 1$ 种前缀，额外空间 $O(n)$；极端冲突下总时间可能退化为 $O(n^2)$；这里采用题目范围内整数运算为常数代价的模型[^python-dict-complexity]。

## C++：预留容量并复用哈希查找结果

C++ 实现沿用同一条状态不变量。`unordered_map` 为最多 $n + 1$ 种前缀预留空间，减少增长过程中的重新散列；`find` 返回匹配项后直接读取出现次数，不再使用 `operator[]` 重查补数[^reserve][^unordered-find]。前缀和及答案总数用 `long long` 暂存，以免把求和和计数绑定在 32 位中间值上。

```cpp
#include <unordered_map>
#include <vector>

class Solution {
public:
    int subarraySum(const std::vector<int>& nums, int k) {
        std::unordered_map<long long, int> prefix_count;
        prefix_count.reserve(nums.size() + 1);
        prefix_count.emplace(0LL, 1);

        long long prefix = 0;
        long long result = 0;
        for (int value : nums) {
            prefix += value;
            // Query old prefixes first; find does not insert an absent complement.
            const auto it = prefix_count.find(prefix - k);
            if (it != prefix_count.end()) result += it->second;
            // A missing key is inserted with count 0 before the increment.
            ++prefix_count[prefix];
        }
        return static_cast<int>(result);
    }
};
```

`++prefix_count[prefix]` 在这个位置执行一次查找或插入：前缀已存在就递增，缺失时先插入值初始化为 0 的频次再递增[^unordered-subscript]。它必须位于查询之后，才能排除空区间。题目数组长度 $n \le 20\,000$，非空子数组数量至多 $\frac{n(n + 1)}{2} \le 200\,010\,000$，因此最终转换回 `int` 在题目约束内安全；如果把接口用于更大的输入，应把返回类型也改成 64 位。

预留容量可能增加峰值内存，哈希桶和节点也比一段紧凑的前缀数组更占空间；它减少重新散列，却不会消除碰撞或保证在所有负载上更快。每个元素只做常数次哈希操作，所以平均 $O(n)$ 时间、$O(n)$ 空间。与[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)相比，两题都在单趟扫描中在哈希表里查找差值，但两数之和只需找到任意一组有效原下标即可立即短路返回，而本题表中保存的是**前缀出现次数**：一个终点可能对应多个合法起点，找到匹配后仍需累加频次并继续扫描。若题目进一步要求返回所有互不重复的数值组合而非连续子数组计数，如[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)与[《四数之和：两层固定与双指针的剪枝边界》](/notes/algorithm/four-sum/)，则因为不再受制于原数组中连续子区间的相对顺序，可以先整体排序，再利用相向双指针与端点剪枝来跳过重复值。

[《路径总和 III：树上前缀和与回溯状态恢复》](/notes/algorithm/path-sum-iii/)也用前缀差统计路径，但表中频次的生命周期不同：数组扫描保留全部历史前缀，每个历史位置都可以成为后续子数组的起点；树上只能保留当前 DFS 路径的活跃祖先前缀，离开子树时必须回退当前前缀的频次，避免把另一分支的节点误当成祖先。

[^python-dict]: [Python 文档：字典映射类型](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——说明 `get(key, default)` 在键缺失时返回指定的默认值。

[^python-dict-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——汇总当前 CPython 的复杂度：字典查找平均常数时间，写入还需平摊扩容成本，极端冲突时单次操作可达线性时间；这不是 Python 语言规范的跨实现保证。

[^reserve]: [cppreference：`unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明预留元素容量时如何调整桶数，以及重新散列的开销。

[^unordered-find]: [cppreference：`unordered_map::find`](https://en.cppreference.com/w/cpp/container/unordered_map/find.html)——说明按键查找并返回指向匹配键值对的迭代器，未命中时返回 `end()` 且不会像 `operator[]` 那样插入新元素。

[^unordered-subscript]: [cppreference：`unordered_map::operator[]`](https://en.cppreference.com/w/cpp/container/unordered_map/operator_at.html)——说明缺失的键会被插入，`int` 映射值先初始化为 0。
