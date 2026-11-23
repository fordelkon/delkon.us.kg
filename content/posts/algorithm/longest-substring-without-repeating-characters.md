---
title: "无重复字符的最长子串：用末次下标移动窗口左端"
publishDate: "2026-12-14T12:00:00+08:00"
description: "LeetCode 3 无重复字符的最长子串：将定长滑窗升级为可变长滑窗，对比逐步收缩左边界与借助字符末次下标表直接跳跃 left 的单调性约束。"
tags: ["algorithm", "sliding-window", "python", "cpp"]
---

[LeetCode 3. 无重复字符的最长子串](https://leetcode.cn/problems/longest-substring-without-repeating-characters/)（Hot 100）给定字符串 `s`，要求找出其中不含有重复字符的**最长连续子串**的长度。例如 `"abcabcbb"` 返回 `3`（`"abc"`），`"bbbbb"` 返回 `1`，`"pwwkew"` 返回 `3`（`"wke"`），空串 `""` 返回 `0`。题目保证 $0 \le \lvert s\rvert \le 5 \times 10^4$，字符由英文字母、数字、符号和空格（ASCII 范围）组成。下列实现均只读输入字符串。

## 从定长滑窗到可变长滑窗

在[《找到所有字母异位词：定长滑窗与频次差分维护》](/posts/algorithm/find-all-anagrams-in-a-string/)中，窗口长度固定为 `len(p)`，右指针推进 1 步、左指针就必须同步推进 1 步。

本题的子串长度不固定，需要维护闭区间 `[left, right]` 内的**无重复不变式**：每轮循环结束后，`s[left..right]` 是以 `right` 结尾的最长无重复子串。当右指针 `right` 读入新字符 `ch` 时：

以 `abcab` 为例，读到第二个 `a` 时，旧 `a` 在窗口内。加粗的格子是每一行当前窗口：

<div class="algorithm-table">

| 窗口 | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| 读到 c | **a** | **b** | **c** | a | b |
| 读到 a | a | **b** | **c** | **a** | b |
| 读到 b | a | b | **c** | **a** | **b** |

</div>

左边界先从 0 跳到 1，再从 1 跳到 2。若查到的旧下标已经在窗口左侧，左边界保持原位。

若用集合维护窗口字符，遇到冲突需逐步 `left += 1` 直到踢出旧的 `ch`；而用映射表记录每个字符的**最后出现下标** `last[ch]`，就能一步把 `left` 跳到 `last[ch] + 1`。

**易错反例（左边界倒退）**：对于 `"abba"`，当 `right = 2` 读到第二个 `'b'` 时，`left` 跳到 `2`；当 `right = 3` 读到第二个 `'a'` 时，`last['a'] = 0 < left`。若缺少 `last[ch] >= left` 的单调守卫，直接赋值 `left = last['a'] + 1 = 1` 会让 `left` 倒退回窗口外，把已经排除的重复 `'b'` 重新卷入窗口，错误返回长度 `3`。

## Python & C++：末次下标查表实现

Python 字典提供均摊 $O(1)$ 的成员检测与更新[^py-dict]，自然兼容任意 Unicode 字符集：

```python
class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last_index: dict[str, int] = {}
        left = 0
        best = 0

        for right, ch in enumerate(s):
            # Guard `last_index[ch] >= left` keeps `left` monotonic so stale indices
            # outside [left, right] (e.g. "abba") never pull `left` backward.
            if ch in last_index and last_index[ch] >= left:
                left = last_index[ch] + 1
            last_index[ch] = right
            cur_len = right - left + 1
            if cur_len > best:
                best = cur_len

        return best
```

C++ 版本针对题目 ASCII 字符集使用定长 `std::array<int, 128>` 初始化为 `-1` 直接寻址[^cpp-array]，并接收只读 `std::string_view`[^cpp-string-view]（注意将 `char` 转为 `unsigned char` 以避免有符号 `char` 在非 ASCII 扩展字节上产生负下标）：

```cpp
#include <algorithm>
#include <array>
#include <string_view>

class Solution {
public:
    int lengthOfLongestSubstring(std::string_view s) const {
        // -1 marks characters not yet seen; ASCII codes 0..127 index directly.
        std::array<int, 128> last_index;
        last_index.fill(-1);

        int left = 0;
        int best = 0;
        const int n = static_cast<int>(s.size());

        for (int right = 0; right < n; ++right) {
            const auto code = static_cast<unsigned char>(s[right]);
            // Advance `left` only if the previous occurrence still lies inside [left, right).
            if (last_index[code] >= left) {
                left = last_index[code] + 1;
            }
            last_index[code] = right;
            best = std::max(best, right - left + 1);
        }

        return best;
    }
};
```

## 复杂度分析与滑窗专题衔接

- **时间复杂度**：右指针单调扫描 $n$ 个字符，每步常数次查表与更新，总时间复杂度为 $O(n)$。
- **辅助空间复杂度**：记字符集大小为 $\lvert\Sigma\rvert$，Python 字典至多存 $\min(n, \lvert\Sigma\rvert)$ 项，占 $O(\min(n, \lvert\Sigma\rvert))$ 辅助空间；C++ 定长 ASCII 表占 $O(\lvert\Sigma\rvert)$ 空间（$\lvert\Sigma\rvert = 128$ 时为 $O(1)$）。

当目标从“排除重复字符求**最长**子串”切换为“必须覆盖目标串 `t` 全部频次求**最短**子串”时，左右指针的扩张与收缩职责恰好对调，见[《最小覆盖子串：计数判断覆盖与双指针收缩》](/posts/algorithm/minimum-window-substring/)。

[^py-dict]: [Python 文档：Mapping Types — `dict`](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——哈希映射支持均摊 $O(1)$ 键查找与写入，且不限定字符集为 ASCII。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——编译期定长数组，按字符编码直接寻址实现 $O(1)$ 查表。

[^cpp-string-view]: [C++ 工作草案：字符串视图](https://eel.is/c++draft/string.view)——非拥有式只读字符视图，避免传参拷贝输入字符串。
