---
title: "最小覆盖子串：计数判断覆盖与双指针收缩"
publishDate: "2026-12-15T12:00:00+08:00"
description: "LeetCode 76 最小覆盖子串：用 formed 达标字符种类计数器避免每次扫描整张频次表，阐述先扩张至覆盖、再收缩至临界的最优子串双指针不变式。"
tags: ["algorithm", "sliding-window", "python", "cpp"]
---

[LeetCode 76. 最小覆盖子串](https://leetcode.cn/problems/minimum-window-substring/)（Hot 100，困难）给定字符串 `s`（长度 $m$）和 `t`（长度 $n$），要求在 `s` 中找出包含 `t` 所有字符（含重复频次）的**最小连续子串**；如果不存在则返回 `""`（特别地，当 $m < n$ 时可直接返回 `""`）。题目保证 $1 \le m, n \le 10^5$，字符串仅含大小写英文字母，且若存在答案则唯一。下列实现均只读输入字符串，仅在最终返回时切出一段子串拷贝。

## 为什么必须用 `formed` / `missing` 计数器而不是每步比对字典

在[《无重复字符的最长子串：用末次下标移动窗口左端》](/posts/algorithm/longest-substring-without-repeating-characters/)中，我们扩张右指针寻找冲突、求**最长**合法窗口；本题则相反，先扩张右指针让窗口**合法**（覆盖 `t`），再不断右移左指针压缩长度，求**最短**合法窗口。

如果每次移动指针后都遍历整张频次表检查“窗口是否覆盖了 `t` 的所有字符”，单次检查耗时 $O(\lvert\Sigma\rvert)$，总时间退化为 $O(m \cdot \lvert\Sigma\rvert)$。借助[《找到所有字母异位词：定长滑窗与频次差分维护》](/posts/algorithm/find-all-anagrams-in-a-string/)中的差分计数思想，只需维护一个标量 `formed`（达标字符种数）或 `missing`（尚缺字符总数）：

- 预先统计 `t` 中每种字符的目标需求频次 `need[c]`，记需要达标的**不同字符种数**为 `required = len(need)`；
- 当窗口内某字符 `c` 的频次**恰好首次达到** `need[c]` 时，`formed += 1`（**易错反例**：若写成 `window[c] >= need[c]` 就递增 `formed`，对于 `t = "AA"`、`s = "AAAB"`，第三个 `'A'` 会让 `formed` 重复加 1，导致 `formed` 与 `required` 失真）；
- 只要 `formed == required`，当前窗口 `[left, right]` 必然完全覆盖 `t`。此时进入内层 `while` 循环：记录更短窗口的起始下标与长度（**延迟切片**，不在循环内构造子串），再把 `s[left]` 移出窗口；一旦某必需字符移出后频次严格跌破 `need[c]`，就令 `formed -= 1`，退出收缩继续向右扩张 `right`。

## Python & C++：达标种数守卫与定长计数表

Python 版本用 `collections.Counter` 统计目标频次[^py-counter]，只在函数返回前做一次切片以避免循环内重复拷贝字符数据：

```python
from collections import Counter


class Solution:
    def minWindow(self, s: str, t: str) -> str:
        if len(s) < len(t):
            return ""

        need = Counter(t)
        required = len(need)
        window: dict[str, int] = {}
        formed = 0

        best_len = len(s) + 1
        best_left = 0
        left = 0

        for right, ch in enumerate(s):
            if ch in need:
                window[ch] = window.get(ch, 0) + 1
                # Count a distinct character as satisfied only on the exact crossing.
                if window[ch] == need[ch]:
                    formed += 1

            # Invariant: while formed == required, s[left..right] covers every char in t.
            while formed == required:
                cur_len = right - left + 1
                if cur_len < best_len:
                    best_len = cur_len
                    best_left = left

                out_ch = s[left]
                if out_ch in need:
                    if window[out_ch] == need[out_ch]:
                        formed -= 1
                    window[out_ch] -= 1
                left += 1

        return "" if best_len > len(s) else s[best_left : best_left + best_len]
```

C++ 版本用单个 128 维 `need` 数组合并需求与窗口余量（正数表示尚缺数量，0 表示刚好满足，负数表示窗口内富余或无关字符），并维护总缺口字符数 `missing = t.size()`[^cpp-array][^cpp-string-view]：

```cpp
#include <array>
#include <string>
#include <string_view>

class Solution {
public:
    std::string minWindow(std::string_view s, std::string_view t) const {
        if (s.size() < t.size()) {
            return "";
        }

        std::array<int, 128> need{};
        for (char ch : t) {
            ++need[static_cast<unsigned char>(ch)];
        }

        const int m = static_cast<int>(s.size());
        int missing = static_cast<int>(t.size());
        // Sentinel m + 1 exceeds any valid window length without relying on INT_MAX.
        int best_len = m + 1;
        int best_left = 0;
        int left = 0;

        for (int right = 0; right < m; ++right) {
            const auto code = static_cast<unsigned char>(s[right]);
            // Only decrement `missing` when s[right] fills an actual remaining deficit.
            if (need[code] > 0) {
                --missing;
            }
            --need[code];

            // Shrink from the left as long as all required characters remain covered.
            while (missing == 0) {
                const int cur_len = right - left + 1;
                if (cur_len < best_len) {
                    best_len = cur_len;
                    best_left = left;
                }

                const auto out_code = static_cast<unsigned char>(s[left]);
                ++need[out_code];
                // Positive need[out_code] after incrementing means we just broke coverage.
                if (need[out_code] > 0) {
                    ++missing;
                }
                ++left;
            }
        }

        return best_len > m ? "" : std::string(s.substr(best_left, best_len));
    }
};
```

## 复杂度分析

- **时间复杂度**：左指针与右指针各自从 `0` 单调向右移动至多 $m$ 次，每个字符至多入窗与出窗各一次；加上统计 `t` 的 $O(n)$ 与最后一次返回子串拷贝（至多 $O(m)$），总时间复杂度为 $O(m + n)$。
- **辅助空间复杂度**：记字符集大小为 $\lvert\Sigma\rvert$（本题大小写英文字母不超过 52 种），频次表占 $O(\lvert\Sigma\rvert)$ 辅助空间（不含最终返回的子串存储）。

[^py-counter]: [Python 文档：`collections.Counter`](https://docs.python.org/3/library/collections.html)——`dict` 子类，用于以线性时间统计可哈希元素的目标频次。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——编译期定长数组，按 ASCII 码直接索引免去哈希表开销。

[^cpp-string-view]: [C++ 工作草案：字符串视图](https://eel.is/c++draft/string.view)——非拥有式只读视图，`substr` 仅调整指针与长度，延迟到最终返回时才构造结果 `std::string`。
