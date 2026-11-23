---
title: "划分字母区间：在最远末次下标切分"
publishDate: "2026-12-13T12:00:00+08:00"
description: "LeetCode 763 划分字母区间：预处理每个字符的最后出现下标，将字符跨度转化为闭区间合并问题，通过追踪当前片段的最远闭合右边界在单趟扫描中完成切分。"
tags: ["algorithm", "greedy", "python", "cpp"]
---

[LeetCode 763. 划分字母区间](https://leetcode.cn/problems/partition-labels/)（Hot 100）给定只含小写英文字母的字符串 `s`，要求把 `s` 划分为尽可能多的片段，使**同一字母最多出现在一个片段中**，并按顺序返回每个片段的长度。例如 `s = "ababcbacadefegdehijhklij"` 应返回 `[9, 7, 8]`（对应 `"ababcbaca"`、`"defegde"`、`"hijhklij"`）。题目保证 $1 \le \lvert s\rvert \le 500$。下列实现均只读输入字符串。

## 从字符约束到最远闭合右边界

如果某个字母 `c` 在当前片段中出现，那么该片段必须把 `c` 在整个字符串中的**最后一次出现位置** `last[c]` 也囊括进来。于是每个位置 `i` 都像[《跳跃游戏 I 与 II：最远可达边界与按跳分层》](/posts/algorithm/jump-game/)一样，向右撑开一个必达右边界 `end = max(end, last[s[i]])`：

以 `abacbde` 为例，表中把每个位置与该字符的末次下标对齐：

<div class="algorithm-table">

| 下标 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 字符 | a | b | a | c | b | d | e |
| 末次 | 2 | **4** | 2 | 3 | **4** | 5 | 6 |

</div>

`a` 先把片段推到下标 2，`b` 再推到 4。只有扫描到下标 4 才能切下第一段 `abacb`；后面两个字符各自形成一段。

**贪心选择性质（最早闭合切分）**[^clrs-greedy]：循环不变式保证处理到下标 `i` 时，`end = max(last[s[start..i]])`。因此当且仅当 `i == end` 时，子串 `s[start..end]` 内出现过的所有字母都不再在右侧出现。任何更早的切分点都会把至少一个字母劈开到两段中（违反约束），而推迟到更右的位置只会把本可独立成段的后续字符合并进当前段（减少片段总数）。这本质上也是[《合并区间：排序后维护右边界》](/posts/algorithm/merge-intervals/)在字符首末区间 `[first[c], last[c]]` 上的隐式应用——无需显式构造并排序 $\lvert\Sigma\rvert$ 个区间，一次记录 `last` 即可在原串上按顺序完成合并。

## Python & C++：末次下标表与双指针封口

```python
class Solution:
    def partitionLabels(self, s: str) -> list[int]:
        # Record each character's rightmost index; later occurrences overwrite earlier ones.
        last = {ch: i for i, ch in enumerate(s)}
        result: list[int] = []
        start = 0
        end = 0

        for i, ch in enumerate(s):
            # Invariant: every character in s[start..i] has its final occurrence <= end.
            if last[ch] > end:
                end = last[ch]
            if i == end:
                # Earliest valid cut: no character in s[start..end] reappears after end.
                result.append(end - start + 1)
                start = i + 1

        return result
```

C++ 版本用定长 `std::array<int, 26>` 存放各字母的最后出现下标[^cpp-array]，并通过非拥有式只读视图 `std::string_view` 接收字符串以避免拷贝[^cpp-string-view]：

```cpp
#include <algorithm>
#include <array>
#include <cstddef>
#include <string_view>
#include <vector>

class Solution {
public:
    std::vector<int> partitionLabels(std::string_view s) const {
        std::array<int, 26> last{};
        const int n = static_cast<int>(s.size());
        for (int i = 0; i < n; ++i) {
            last[static_cast<std::size_t>(s[i] - 'a')] = i;
        }

        std::vector<int> result;
        int start = 0;
        int end = 0;
        for (int i = 0; i < n; ++i) {
            // Extend the active partition envelope to cover the last copy of s[i].
            end = std::max(end, last[static_cast<std::size_t>(s[i] - 'a')]);
            if (i == end) {
                result.push_back(end - start + 1);
                start = i + 1;
            }
        }

        return result;
    }
};
```

## 复杂度分析

- **时间复杂度**：预处理末次下标与单趟贪心切分各扫描字符串一次，总时间复杂度为 $O(n)$。
- **辅助空间复杂度**：记字符集大小为 $\lvert\Sigma\rvert$（本题为 26 个小写英文字母），`last` 表与边界指针共占 $O(\lvert\Sigma\rvert)$ 额外空间（固定字母表下为 $O(1)$，不含返回数组 `result`）。

[^clrs-greedy]: [_Introduction to Algorithms_ (4th ed., Chapter 15: Greedy Algorithms)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 15 章阐述贪心选择性质：在最早合法闭合点切分不会损害剩余后缀的最优划分数。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——编译期定长栈上数组，按 `ch - 'a'` 直接寻址免除哈希表分配。

[^cpp-string-view]: [C++ 工作草案：字符串视图](https://eel.is/c++draft/string.view)——非拥有式只读字符视图，避免传参拷贝输入字符串。
