---
title: "字母异位词分组：排序签名、频次元组与质数哈希"
publishDate: "2026-10-27T10:00:00+08:00"
description: "LeetCode 49 的字母异位词分组：对比排序签名、26位频次元组与质数乘积三种哈希键设计，并分析小写字符集的性能与空间权衡。"
---

[LeetCode 49. 字母异位词分组](https://leetcode.cn/problems/group-anagrams/)要求将给定的字符串数组按**字母异位词**（Anagram）重新归类，同属一组的字符串以列表形式输出，组的顺序不限。字母异位词意味着两个字符串包含完全相同的字母，且每个字母出现的频次完全一致，仅仅是排列顺序不同。

## 多重集等价与哈希签名设计

从集合论视角看，每个字符串都可以抽象为一个**字符多重集**（Multiset）或 26 维字符频次直方图：

$$
S_1 \text{ 与 } S_2 \text{ 是字母异位词} \iff \forall c \in \Sigma, \text{count}_{S_1}(c) = \text{count}_{S_2}(c)
$$

若对字符串两两比对，每对长度为 $k$ 的串需要 $O(k)$，整体分组将达到 $O(n^2 \cdot k)$。要在单次遍历内完成聚合，核心在于为每个多重集提取一个**规范化哈希签名**（Canonical Key），使得所有属于同一异位词等价类的字符串映射到同一个键中。

常见的签名设计有三种，各具权衡：

| 方案         | 键设计方式                     | 单词处理时间                | 单词额外空间            | 适用场景与缺陷                         |
| :----------- | :----------------------------- | :-------------------------- | :---------------------- | :------------------------------------- |
| **字符排序** | `sorted(s)` 得到的排序列       | $O(k \log k)$               | $O(k)$                  | 逻辑直观，但面对长单词排序成本高       |
| **频次元组** | 统计 26 维字符频次构成元组     | $O(k + \lvert\Sigma\rvert)$ | $O(\lvert\Sigma\rvert)$ | 有限字符集下线性复杂度，极其稳健       |
| **质数乘积** | 每个字母映射唯一质数，求累乘积 | $O(k)$                      | $O(1)$                  | 计算速度极快，但容易因连乘导致整型溢出 |

## Python：频次元组规避排序开销

因为题目明确输入只包含小写英文字母，字符集大小固定为 $|\Sigma| = 26$。`Counter` 一次构造即可完成频次统计，缺失的字母按 0 计[^counter-missing]；把计数投影到固定的 26 个字母上，得到等长的计数序列。`tuple` 不可变且可哈希，可作为 Python 原生字典的合法键[^python-hashable]。

```python
from collections import Counter, defaultdict
from string import ascii_lowercase


class Solution:
    def groupAnagrams(self, strs: list[str]) -> list[list[str]]:
        groups: dict[tuple[int, ...], list[str]] = defaultdict(list)

        for s in strs:
            counts = Counter(s)
            # Project onto the fixed 26-letter alphabet for a fixed-width hashable key.
            key = tuple(counts[ch] for ch in ascii_lowercase)
            groups[key].append(s)

        return list(groups.values())
```

以 `strs = ["eat", "tea", "tan", "ate", "nat", "bat"]` 为例，`"eat"`、`"tea"`、`"ate"` 统计出的元组在下标 0（`a`）、4（`e`）、19（`t`）处均为 1，其余为 0。它们哈希到同一个桶，最终聚合为同一个列表。

遍历每个字符串需要 $O(k)$ 统计频次（$k$ 为字符串最大长度），构造 26 元素元组耗时 $O(|\Sigma|)$。若字符串总数为 $n$，总时间复杂度为 $O(n(k + |\Sigma|))$，空间复杂度为 $O(n \cdot k)$。相比基于排序的 $O(n \cdot k \log k)$，在单词较长时更具优势。

## C++：定长频次编码与桶容量预留

在 C++ 中，`std::unordered_map` 默认没有为 `std::array` 提供散列函数特化。一种工程上常见且高效的做法是将 26 维频次直接编码为短字符串（如 `"1#0#...#1"` 或二进制编码），或者按字符排序后作为 `std::string` 键[^unordered-map]。

当字符串长度通常较短（$k \le 100$）时，字符排序的原地缓存局部性极好；同时配合 `reserve` 预分配桶容量，可消除动态增长期间的频繁重新散列[^unordered-reserve]：

```cpp
#include <algorithm>
#include <string>
#include <unordered_map>
#include <vector>

class Solution {
public:
    std::vector<std::vector<std::string>> groupAnagrams(
        std::vector<std::string>& strs) {
        std::unordered_map<std::string, std::vector<std::string>> groups;
        groups.reserve(strs.size());

        for (std::string& s : strs) {
            std::string key = s;
            std::sort(key.begin(), key.end());
            // Emplace appends to the existing bucket or creates a new one.
            groups[std::move(key)].push_back(std::move(s));
        }

        std::vector<std::vector<std::string>> result;
        result.reserve(groups.size());
        for (auto& [_, group] : groups) {
            result.push_back(std::move(group));
        }
        return result;
    }
};
```

这里使用 `std::move` 减少深拷贝开销。若希望完全消除排序的 $O(k \log k)$，也可以用 `std::array<int, 26>` 搭配自定义组合哈希（例如基于 boost 的 `hash_combine`），在常数要求极严苛的工业场景下提供稳定线性耗时。

## 算术基本定理的视角：质数哈希

由**算术基本定理**（Fundamental Theorem of Arithmetic）可知：任何大于 1 的自然数都可以唯一分解为质数的乘积。为 26 个小写字母依次指定前 26 个质数：

$$
a \to 2, b \to 3, c \to 5, d \to 7, \dots, z \to 101
$$

字符串的特征值定义为字符映射质数的乘积。因为乘法满足**交换律**与**结合律**，字符以任意顺序排列算出的乘积都相同；由分解的唯一性可知，字符频次不同的串对应不同的乘积。该方法的单次计算耗时为严格的 $O(k)$，无需额外数组。

但其代价是**整型溢出风险**：质数增长迅速，字符串稍长（如超过 15 个字符），连乘积便会溢出 64 位无符号整数。生产代码中，除非配合大数运算或可证明无假阳性碰撞的大质数取模，实用性不如频次元组。

本题处理的是互不相关的独立字符串，签名为每个字符串全量计算一次，元素之间也没有顺序约束，一个键聚合的列表可以随时追加，因此不涉及[《和为 K 的子数组：先查前缀，再记录频次》](/notes/algorithm/subarray-sum-equals-k/)里“先查后写”的时序约束，也不像[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)那样命中单个下标即可返回。当判定对象变成长主串中重叠的连续子串时，全量重算签名开始浪费，[《找到所有字母异位词：定长滑窗与频次差分维护》](/notes/algorithm/find-all-anagrams-in-a-string/)把静态签名演进为增量维护。

[^python-hashable]: [Python 文档：可哈希对象与字典键](https://docs.python.org/3/glossary.html#term-hashable)——说明不可变序列 `tuple` 可以作为字典的键，而 `list` 不可哈希。

[^counter-missing]: [Python 文档：`collections.Counter`](https://docs.python.org/3/library/collections.html#collections.Counter)——说明计数器对缺失的元素返回 0 计数，而不是抛出 `KeyError`。

[^unordered-map]: [cppreference：`std::unordered_map`](https://en.cppreference.com/w/cpp/container/unordered_map.html)——说明基于哈希表实现的键值对容器与平均常数时间复杂度。

[^unordered-reserve]: [cppreference：`unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明预先调整桶数以减少重新散列。
