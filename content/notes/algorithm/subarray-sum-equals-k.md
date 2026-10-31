---
title: "和为 K 的子数组：先查前缀，再记录频次"
publishDate: "2026-10-26T11:00:00+08:00"
description: "LeetCode 560 的连续子数组计数：从前缀和差值推导哈希频次，解释零前缀、更新时序与负数下滑动窗口失效的原因，并给出 C++ 实现。"
---

[LeetCode 560. 和为 K 的子数组](https://leetcode.cn/problems/subarray-sum-equals-k/)要求统计和为 `k` 的**连续、非空子数组**个数。这里的 `k` 是目标和，不是要从数组里选出 `k` 个数。以 `nums = [1, -1, 1]`、$k = 1$ 为例，两个单元素 `[1]` 加上整段 `[1, -1, 1]`，一共是 3 个答案；数值相同但位置不同的子数组要分别计入。

## 为什么不能套固定方向的滑动窗口

如果数组元素都非负，窗口求和偏小就扩大右端，偏大就缩小左端。负数让这套判断失效：`[1, -1, 1]` 的前两个元素之和从 1 降到 0，再加入第三个又升到 1。当前和偏大时，向右扩张也可能使它变小；当前和偏小时，移走左端也可能使它变大。题目允许负数，因此需要一种不依赖窗口和单调性的计数方法。

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

`prefix_count` 记录扫描到当前位置之前每种前缀和出现的次数。代码用 `dict.get(key, 0)` 取得旧频次，键不存在时返回 0[^python-dict]；每遇到一个新元素，先查能与当前前缀配成 `k` 的旧前缀，再把当前前缀加入表中：

```python
class Solution:
    def subarraySum(self, nums: list[int], k: int) -> int:
        prefix_count = {0: 1}
        prefix = 0
        result = 0

        for value in nums:
            prefix += value
            # Query before recording so every match is a nonempty subarray.
            result += prefix_count.get(prefix - k, 0)
            prefix_count[prefix] = prefix_count.get(prefix, 0) + 1

        return result
```

`[0, 0]`、$k = 0$ 时，这段代码依次增加 1、2 个答案，返回 3；它计算的是起止位置不同的非空子数组，而不是去重后的数值组合。哈希查找和插入平均 $O(1)$，总时间平均 $O(n)$，最多存储 $n + 1$ 种前缀，额外空间 $O(n)$。最坏情况下哈希操作的性能仍取决于实现与输入。

## C++：预留容量并复用哈希查找结果

C++ 实现沿用同一条状态不变量。`unordered_map` 为最多 $n + 1$ 种前缀预留空间，减少增长过程中的重新散列；`find` 返回匹配项后直接读取出现次数，不再使用 `operator[]` 重查补数[^reserve]。前缀和及答案总数用 `long long` 暂存，以免把求和和计数绑定在 32 位中间值上。

```cpp
#include <unordered_map>
#include <vector>

class Solution {
public:
    int subarraySum(std::vector<int>& nums, int k) {
        std::unordered_map<long long, int> prefix_count;
        prefix_count.reserve(nums.size() + 1);
        prefix_count.emplace(0LL, 1);

        long long prefix = 0;
        long long result = 0;
        for (int value : nums) {
            prefix += value;
            // Query before inserting the current prefix; operator[] would also insert it.
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

预留容量可能增加峰值内存，哈希桶和节点也比一段紧凑的前缀数组更占空间；它减少重新散列，却不会消除碰撞或保证在所有负载上更快。每个元素只做常数次哈希操作，所以平均 $O(n)$ 时间、$O(n)$ 空间。与[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)相比，两题都在扫描时查找一个差值，但这里表中保存的是**前缀出现次数**：一个终点可能对应多个合法起点，找到一次匹配不能提前返回。

[^python-dict]: [Python 文档：字典映射类型](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——说明 `get(key, default)` 在键缺失时返回指定的默认值。

[^reserve]: [cppreference：`unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明预留元素容量时如何调整桶数，以及重新散列的开销。

[^unordered-subscript]: [cppreference：`unordered_map::operator[]`](https://en.cppreference.com/w/cpp/container/unordered_map/operator_at.html)——说明缺失的键会被插入，`int` 映射值先初始化为 0。
