---
title: "字母异位词分组：排序签名、频次元组与质数哈希"
publishDate: "2026-10-18T12:00:00+08:00"
description: "LeetCode 49 的字母异位词分组：对比排序签名、26 维频次元组与质数乘积，区分字符串引用、键存储和 C++ 移动输入的成本。"
---

[LeetCode 49. 字母异位词分组](https://leetcode.cn/problems/group-anagrams/)要求将给定的字符串数组按**字母异位词**（Anagram）重新归类，同属一组的字符串以列表形式输出，组的顺序不限。字母异位词意味着两个字符串包含完全相同的字母，且每个字母出现的频次完全一致，仅仅是排列顺序不同。

## 多重集等价与哈希签名设计

设字符串数为 $n$，最大长度为 $k$，字符集为 $\Sigma$。题目限定小写英文字母，因此 $\lvert\Sigma\rvert = 26$。每个字符串都可以抽象为一个**字符多重集**（multiset）或字符频次向量：

$$
S_1 \text{ 与 } S_2 \text{ 是字母异位词} \iff \forall c \in \Sigma, \text{count}_{S_1}(c) = \text{count}_{S_2}(c)
$$

若对字符串两两比对，每对长度为 $k$ 的串需要 $O(k)$，整体分组将达到 $O(n^2 \cdot k)$。要在单次遍历内完成聚合，核心在于为每个多重集提取一个**规范化哈希签名**（Canonical Key），使得所有属于同一异位词等价类的字符串映射到同一个键中。

常见的签名设计有三种，各具权衡：

| 方案         | 键设计方式                     | 单词处理时间                | 单词额外空间            | 适用场景与缺陷                     |
| :----------- | :----------------------------- | :-------------------------- | :---------------------- | :--------------------------------- |
| **字符排序** | `sorted(s)` 得到的排序列       | $O(k \log k)$               | $O(k)$                  | 逻辑直观，但面对长单词排序成本高   |
| **频次元组** | 统计 26 维字符频次构成元组     | $O(k + \lvert\Sigma\rvert)$ | $O(\lvert\Sigma\rvert)$ | 有限字符集下线性复杂度，无溢出风险 |
| **质数乘积** | 每个字母映射唯一质数，求累乘积 | 固定字长模型下 $O(k)$       | 固定字长模型下 $O(1)$   | 仅适用于乘积可精确表示的长度范围   |

## Python：频次元组规避排序开销

`Counter` 一次构造即可完成频次统计，缺失的字母按 0 计[^counter-missing]；把计数投影到固定的 26 个字母上，得到等长的计数序列。这里元组的元素都是可哈希的整数，因此整个 `tuple` 可作为字典键[^python-hashable]。代码不修改输入，分组列表保存原字符串的引用；字符串不可变，新的外层列表和各分组列表由本次调用创建。

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

按字符统计、整数计数和哈希操作的通常单位成本模型，每个字符串耗时 $O(k + \lvert\Sigma\rvert)$，总时间平均为 $O(n(k + \lvert\Sigma\rvert))$；极端哈希冲突可能使查找退化。设最终分组数为 $g$，每组保留一个频次键，除输出列表外辅助空间为 $O(g\lvert\Sigma\rvert + \lvert\Sigma\rvert)$，输出列表及字符串引用占 $O(n)$ 空间。合计新增存储为 $O(n + g\lvert\Sigma\rvert + \lvert\Sigma\rvert)$，固定 26 字母时为 $O(n + 1)$，没有额外复制 $O(nk)$ 个字符。与排序签名相比，频次法省去逐字符串排序，但实际耗时还取决于词长与容器开销。

## C++：排序签名、桶容量预留与移动输入

在 C++ 中，`std::hash` 默认没有为 `std::array` 提供特化，而 `std::string` 具备标准散列支持[^cpp-hash]。因此工程上常将 26 维频次编码为短字符串（如 `"1#0#...#1"` 或定长字节串），或者按字符排序后作为 `std::unordered_map` 的 `std::string` 键[^unordered-map]。

下面选择排序后的字符串作为键，并用 `reserve` 预分配桶容量，减少动态增长期间的重新散列[^unordered-reserve]。与上面的 Python 实现不同，这份代码会将 `strs` 中的字符串移动到分组中：调用后数组长度不变，各元素仍有效，但内容处于未指定状态，不能假定为空[^cpp-string-move]。若需保留输入，将 `push_back(std::move(s))` 改为 `push_back(s)`，并计入字符复制成本。代码使用 C++17 的结构化绑定：

```cpp
#include <algorithm>
#include <string>
#include <unordered_map>
#include <utility>
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
            // Keep the sorted signature separate from the input string moved into the group.
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

`std::move` 本身只进行值类别转换，让后续构造有机会选择移动重载[^cpp-move]；这里实际执行字符串和分组容器的移动构造，不能把它理解为无条件转交堆缓冲区，例如短字符串可能直接存储在对象内[^cpp-string-move]。

设分组数为 $g$。计入复制排序键、排序和散列字符串的成本，总时间平均为 $O(n(1 + k\log(k + 1)))$，极端哈希冲突会使查找退化。`reserve(strs.size())` 预留的桶占 $O(n)$ 空间，保留的键共占 $O(gk)$，当前排序键占 $O(k)$；加上排序调用栈，除输出外辅助空间为 $O(n + gk + k)$。输出包含 $n$ 个字符串对象及其字符内容，内容来自被移动的输入，不能再解释为 Python 版本那样只存储字符串引用。

若希望省去逐字符串排序，也可以用 `std::array<int, 26>` 搭配组合散列函数（例如 Boost 的 `hash_combine`），使单个字符串的签名构造与散列耗时为 $O(k + \lvert\Sigma\rvert)$[^boost-hash]。这是签名设计的选择，不是 Python 与 C++ 必然采用不同算法；实际耗时仍需结合词长分布实测。

## 算术基本定理的视角：质数哈希

由**算术基本定理**（Fundamental Theorem of Arithmetic）可知：任何大于 1 的自然数都可以唯一分解为质数的乘积。为 26 个小写字母依次指定前 26 个质数：

$$
a \to 2, b \to 3, c \to 5, d \to 7, \dots, z \to 101
$$

字符串的特征值定义为字符映射质数的乘积，空串对应空积 $1$。在精确整数运算下，乘法满足**交换律**与**结合律**，字符以任意顺序排列算出的乘积都相同；由分解的唯一性可知，字符频次不同的串对应不同的乘积。只有当乘积始终能用固定字长整数精确表示、每次乘法按常数时间计时，单串计算才是 $O(k)$ 时间、$O(1)$ 额外空间。

但其代价是**整型溢出风险**：第 26 个质数为 $101$，由于 $101^{10} > 2^{64} - 1$，仅 10 个 `'z'` 连乘就会超出 64 位无符号整数（`uint64_t`）的表示上限。生产代码中若使用大整数运算，乘法开销不再是常数；若改为对固定模数取余，又会破坏唯一性并引入哈希碰撞，因此实用性不如频次元组。

本题处理的是互不相关的独立字符串，签名为每个字符串全量计算一次，元素之间也没有顺序约束，一个键聚合的列表可以随时追加，因此不涉及[《和为 K 的子数组：先查前缀，再记录频次》](/notes/algorithm/subarray-sum-equals-k/)里“先查后写”的时序约束，也不像[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)那样命中单个下标即可返回。当判定对象变成长主串中重叠的连续子串时，全量重算签名开始浪费，[《找到所有字母异位词：定长滑窗与频次差分维护》](/notes/algorithm/find-all-anagrams-in-a-string/)把静态签名演进为增量维护。

[^python-hashable]: [Python 文档：可哈希对象与字典键](https://docs.python.org/3/glossary.html#term-hashable)——元组只有在所有元素均可哈希时才可哈希；不可变本身不足以保证这一点。

[^counter-missing]: [Python 文档：`collections.Counter`](https://docs.python.org/3/library/collections.html#collections.Counter)——说明计数器对缺失的元素返回 0 计数，而不是抛出 `KeyError`。

[^cpp-hash]: [cppreference：`std::hash`](https://en.cppreference.com/w/cpp/utility/hash.html)——说明标准库默认提供 `std::string` 的散列特化，而未为 `std::array` 提供默认特化。

[^unordered-map]: [cppreference：`std::unordered_map`](https://en.cppreference.com/w/cpp/container/unordered_map.html)——说明基于哈希表实现的键值对容器与平均常数时间复杂度。

[^unordered-reserve]: [cppreference：`unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明预先调整桶数以减少重新散列。

[^cpp-move]: [cppreference：`std::move`](https://en.cppreference.com/w/cpp/utility/move.html)——说明值类别转换使表达式可参与移动重载选择，本身不执行资源转移。

[^cpp-string-move]: [cppreference：`std::basic_string` 构造函数](https://en.cppreference.com/w/cpp/string/basic_string/basic_string.html)——普通移动构造具有常数复杂度，源字符串保持有效但状态未指定；不保证源串为空或具体缓冲区布局。

[^boost-hash]: [Boost 文档：`hash_combine`](https://www.boost.org/doc/libs/release/libs/container_hash/doc/html/hash.html#ref_hash_combine)——说明通过迭代混合元素散列值来为定长序列或复合结构构造组合散列函数。
