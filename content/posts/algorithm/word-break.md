---
title: "单词拆分：前缀可行性转移与子串查找成本"
publishDate: "2026-11-05T10:00:00+08:00"
description: "LeetCode 139 单词拆分：按前缀记录可拆分性，用字典词长限制分割点，比较 Python 切片、C++ 字符串视图与前缀树匹配的成本。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 139. 单词拆分](https://leetcode.cn/problems/word-break/)给定字符串 `s` 与字典 `wordDict`，要求判断能否把 `s` 完整切分为字典中的单词，同一单词可以重复使用。例如 `s = "leetcode"`、`wordDict = ["leet", "code"]` 返回 `True`；若字符串是 `"codeleet"`，也可以切分，但需要按 `"code"`、`"leet"` 的顺序匹配。

题目保证字符串与单词都只含小写英文字母，$1\le\lvert s\rvert\le300$，字典条目数在 1 到 1000 之间，每个单词长度在 1 到 20 之间。与[《零钱兑换：完全背包自底向上与不可达哨兵》](/posts/algorithm/coin-change/)相似，候选可以重复使用；区别是金额只关心总和，而字符串还要求每个字符与其位置匹配。仅仅让单词长度之和等于字符串长度并不够。

## 记录每个前缀能否拆分

定义 $dp[i]$ 表示长度为 $i$ 的前缀 `s[:i]` 能否拆分。空前缀无需任何单词，所以 $dp[0]=\text{true}$，它是第一段单词的起点。

若某个分割点 $j$ 满足以下两项，就可以把末尾单词接到一个已可拆分的前缀之后：

1. $dp[j]=\text{true}$。
2. `s[j:i]` 是字典中的单词。

因此：

$$
dp[i]=\bigvee_{j=0}^{i-1}\left(dp[j]\land(s[j:i]\in\textit{wordDict})\right).
$$

反过来，任何合法拆分都有最后一个单词，取它的起点作为 $j$ 就满足这两个条件，因此转移不会漏解。单词非空保证 $j<i$，按前缀长度递增计算时，所需状态都已求出；找到一个可行分割点即可停止当前内层循环。这里使用的是动态规划的状态合并思路[^clrs-prefix-dp]。

## 用词长限制分割点

若为每个前缀枚举所有分割点，候选有 $O(n^2)$ 个，其中 $n=\lvert s\rvert$。但切片与新子串的哈希还要读取字符：在平均散列条件下，对候选长度求和，朴素实现的时间上界为 $O(n^3)$；不能把集合成员检查连同切片都算成一次常数操作。

记字典的最短、最长词长为 $L_{\min}$、$L_{\max}$。可能匹配的后缀必须满足 $L_{\min}\le i-j\le L_{\max}$，所以只需枚举：

$$
\max(0,i-L_{\max})\le j\le i-L_{\min}.
$$

每个前缀最多检查 $L_{\max}$ 个位置，本题至多为 20 个。还可以先看 `dp[j]`，不可达时就跳过切片与查找。例如 `s = "catsandog"`、字典为 `["cats", "dog", "sand", "and", "cat"]` 时，`"catsand"` 虽然可拆分，但余下的 `"og"` 不在字典中；另一个末尾候选 `"dog"` 之前的 `"catsan"` 又不可拆分，最终返回 `False`。

## Python：先检查前驱，再截取候选

用 `set` 保存字典，支持去重与成员检查[^python-set]。代码只读输入，依赖题目保证的非空字典和非空单词：

```python
class Solution:
    def wordBreak(self, s: str, wordDict: list[str]) -> bool:
        # Time complexity: O(W + n * L_max^2)
        # Space complexity: O(n + d + L_max) auxiliary space
        words = set(wordDict)
        max_len = max(len(w) for w in words)
        min_len = min(len(w) for w in words)

        n = len(s)
        dp = [False] * (n + 1)
        dp[0] = True

        for i in range(min_len, n + 1):
            start = max(0, i - max_len)
            end = i - min_len
            for j in range(start, end + 1):
                # Invariant: dp[j] is True iff prefix s[:j] can be segmented into words.
                # Short-circuit before slicing when the preceding prefix is unreachable.
                if dp[j] and s[j:i] in words:
                    dp[i] = True
                    break

        return dp[n]
```

设字典条目数为 $d$，总字符数为 $W=\sum_{w\in\textit{wordDict}}\lvert w\rvert$。构建集合的哈希工作至多为 $O(W)$；每个前缀至多考察 $L_{\max}$ 个候选，每次切片、哈希及匹配比较至多读取 $O(L_{\max})$ 个字符。在平均散列条件下[^python-set-complexity]，总时间为 $O(W+nL_{\max}^2)$，极端碰撞不在这个平均界内。

集合保存的是原字符串的引用，不复制整份字典字符；加上 DP 列表与单次切片，峰值辅助空间为 $O(n+d+L_{\max})$。返回布尔值占 $O(1)$ 空间。

## C++：用字符串视图避免复制候选字符

`std::string::substr()` 会创建拥有字符的字符串，复制所选字符；小字符串优化可能免去堆分配，因此不能断言每次截取都分配堆内存。C++17 的 `std::string_view` 则是不拥有字符的视图，截取子视图无需复制字符[^cpp-string-view]。

下面集合中的视图引用 `wordDict`，候选视图引用 `s`。输入必须在调用期间保持存活且不被修改，函数不会把视图返回给调用方：

```cpp
#include <algorithm>
#include <limits>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

class Solution {
public:
    bool wordBreak(const std::string& s, const std::vector<std::string>& wordDict) {
        // Time complexity: O(W + n * L_max^2)
        // Space complexity: O(n + d) auxiliary space
        int max_len = 0;
        int min_len = std::numeric_limits<int>::max();
        std::unordered_set<std::string_view> words;
        words.reserve(wordDict.size());

        for (const auto& w : wordDict) {
            max_len = std::max(max_len, static_cast<int>(w.size()));
            min_len = std::min(min_len, static_cast<int>(w.size()));
            words.emplace(w);
        }

        const int n = static_cast<int>(s.size());
        // dp[i] indicates whether prefix of length i can be broken into dictionary words.
        std::vector<bool> dp(n + 1, false);
        dp[0] = true;

        const std::string_view sv(s);

        for (int i = min_len; i <= n; ++i) {
            const int start = std::max(0, i - max_len);
            const int end = i - min_len;
            for (int j = start; j <= end; ++j) {
                // Short-circuit: only inspect candidate substring if the preceding prefix is valid.
                if (dp[j]) {
                    const std::string_view sub = sv.substr(j, i - j);
                    if (words.find(sub) != words.end()) {
                        dp[i] = true;
                        break;
                    }
                }
            }
        }

        return dp[n];
    }
};
```

视图消除了字符复制，但哈希仍要读取候选字符。在通常的线性字符串哈希和平均散列假设下，总时间同样为 $O(W+nL_{\max}^2)$，辅助空间为 $O(n+d)$。只读视图也不能保证其他线程不修改底层字符串，并发访问仍需调用方遵守这些生命周期与同步条件。

## 用前缀树共享字符匹配

除了为每个候选重新计算哈希，也可以把字典单词反序插入**前缀树**（Trie）。从前缀末尾 `s[i - 1]` 开始向左扫描，按字符沿树向下走：

- 缺少当前字符对应的分支时，立即停止，继续向左也不可能得到匹配单词。
- 走到词尾标记且 `dp[k]` 为真时，说明 `s[k:i]` 是一个单词，前面的前缀也可拆分，置 `dp[i] = true`。

其中 $k$ 是本次扫描到的字符下标，最多向左走 $L_{\max}$ 步。这里共享的是反向单词的前缀，也就是原单词的后缀。若每个节点用固定 26 个子链接表示分支，建树耗时与空间均为 $O(W)$，总时间为 $O(W+nL_{\max})$，辅助空间为 $O(W+n)$。这是按词长分析得到的复杂度变化，实际耗时还取决于节点布局和字典分布。

```cpp
#include <array>
#include <string>
#include <vector>

class Solution {
private:
    struct TrieNode {
        // Indices of child nodes within the flat pool; -1 indicates an empty branch.
        std::array<int, 26> next;
        bool is_end = false;

        TrieNode() {
            next.fill(-1);
        }
    };

public:
    bool wordBreak(const std::string& s, const std::vector<std::string>& wordDict) {
        // Time complexity: O(W + n * L_max)
        // Space complexity: O(W + n) auxiliary space
        // Contiguous node arena eliminates fine-grained heap allocations and automatically reclaims memory.
        std::vector<TrieNode> trie;
        trie.emplace_back(); // Root node at index 0.

        // Insert reversed words so that backward scans from s[i - 1] trace forward Trie branches.
        for (const auto& word : wordDict) {
            int curr = 0;
            for (auto it = word.rbegin(); it != word.rend(); ++it) {
                const int char_idx = *it - 'a';
                if (trie[curr].next[char_idx] == -1) {
                    const int next_idx = static_cast<int>(trie.size());
                    trie.emplace_back();
                    // Re-index trie[curr] after emplace_back to guard against reallocation.
                    trie[curr].next[char_idx] = next_idx;
                }
                curr = trie[curr].next[char_idx];
            }
            trie[curr].is_end = true;
        }

        const int n = static_cast<int>(s.size());
        // dp[i] records whether prefix s[0..i-1] of length i is segmentable.
        std::vector<bool> dp(n + 1, false);
        dp[0] = true;

        for (int i = 1; i <= n; ++i) {
            int curr = 0;
            // Scan backwards from s[i - 1] down to s[0].
            for (int j = i - 1; j >= 0; --j) {
                const int char_idx = s[j] - 'a';
                const int next_node = trie[curr].next[char_idx];
                if (next_node == -1) {
                    // Current prefix path does not exist in the reversed Trie; prune backward scan early.
                    break;
                }
                curr = next_node;
                // Valid word s[j..i-1] matches and previous prefix s[0..j-1] is breakable.
                if (trie[curr].is_end && dp[j]) {
                    dp[i] = true;
                    break;
                }
            }
        }

        return dp[n];
    }
};
```

## 方案对比

| 方案 | 时间复杂度 | 辅助空间复杂度 | 核心机制 |
| :--- | :--------- | :------------- | :------- |
| 哈希集合 + 词长截断 (Python) | $O(W + nL_{\max}^2)$ | $O(n + d + L_{\max})$ | `set` 查重，按词长范围枚举切片 |
| 字符串视图 + 哈希集合 (C++) | $O(W + nL_{\max}^2)$ | $O(n + d)$ | `std::string_view` 免除候选字符复制 |
| 反向字典树 + 动态规划 (C++) | $O(W + nL_{\max})$ | $O(W + n)$ | 反向字典树共享后缀匹配与提前剪枝 |

[《编辑距离：三种字符操作的网格对齐与空间压缩》](/posts/algorithm/edit-distance/)也按前缀推进，但状态需要同时指定两个字符串的前缀长度；本题只沿一个字符串前进，转移条件是“已有可行前缀加上一个匹配单词”，因此一维状态就足够。

[^clrs-prefix-dp]: [Introduction to Algorithms (4th ed., Chapter 14)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——动态规划的状态设计与子问题复用背景；本文的前缀可行性转移由最后一个单词的分割点推导。

[^python-set]: [Python 文档：Set Types](https://docs.python.org/3/library/stdtypes.html#set-types-set-frozenset)——定义集合的去重与成员检查语义。

[^python-set-complexity]: [Python 文档：内置类型操作复杂度](https://docs.python.org/3/library/time-complexity.html#time-complexity)——列出 CPython 集合成员检查的平均与最坏成本；不把字符切片或新字符串的哈希视为免费操作。

[^cpp-string-view]: [C++ 工作草案：字符串视图](https://eel.is/c++draft/string.view)——规定非拥有式字符串视图及 `substr` 的常数时间语义。
