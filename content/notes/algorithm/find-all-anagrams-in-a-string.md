---
title: "找到所有字母异位词：定长滑窗与频次差分维护"
publishDate: "2026-10-28T10:00:00+08:00"
description: "LeetCode 438 题：将静态异位词判定放进定长滑动窗口，从每次全量比对 26 个字符频次，优化到维护单变量 differ 的常数级增量更新。"
---

[LeetCode 438. 找到字符串中所有字母异位词](https://leetcode.cn/problems/find-all-anagrams-in-a-string/)给定主串 `s` 和模式串 `p`，要求在 `s` 中找出所有作为 `p` 的**字母异位词**的连续子串，并返回这些子串的起始下标。例如 `s = "cbaebabacd", p = "abc"`，子串 `"cba"`（下标 0）与 `"bac"`（下标 6）满足条件，返回 `[0, 6]`。

## 从全局静态签名到局部滑动窗口

在 [《字母异位词分组：排序签名、频次元组与质数哈希》](/notes/algorithm/group-anagrams/) 中，我们通过为每个独立字符串构造静态特征（字符排序或 26 维频次元组）来完成聚合。若直接在 438 题上对 `s` 中每个长度为 $|p|$ 的子串重复这一静态过程：

- 长度为 $|p|$ 的候选子串共有 $|s| - |p| + 1$ 个；
- 若对每个子串单独统计 26 维频次（耗时 $O(|p|)$），总时间复杂度为 $O((|s| - |p|) \cdot |p|)$。在 $|s| \le 30000$ 的数据规模下将产生大量重复统计。

相邻子串具有极强的**空间局部性**（Locality）：当窗口从区间 $[i, i + |p| - 1]$ 右移一位到 $[i + 1, i + |p|]$ 时，窗口内部有 $|p| - 1$ 个字符保持不变，仅仅是左端字符离开、右端字符加入。利用**定长滑动窗口**，只需处理进出两个字符的增量变化。

## 方案演进：从向量比较到标量 differ 计数器

### 阶段 1：定长滑窗 + 26 维向量逐位比对

维护目标串 `p` 的频次数组与当前窗口的频次数组，每次右移窗口时：

1. 纳入新字符：`window_count[s[i]] += 1`；
2. 剔除旧字符：`window_count[s[i - |p|]] -= 1`；
3. 比对两个长度为 26 的数组是否全等。

由于每次移动都需要对比 26 个字母的频次，时间复杂度为 $O(26 \cdot |s|)$。

用 `Counter` 表达，这套“进—比—出”只需要几行，代码几乎就是文字描述的直接翻译；相等比较把缺失元素视为 0 计数（Python 3.10 起的行为变更），因此左端字符滑出后留下的 0 值条目不会让判定误报不等[^counter-eq]：

```python
from collections import Counter


class Solution:
    def findAnagrams(self, s: str, p: str) -> list[int]:
        cnt_p = Counter(p)  # Target frequencies.
        cnt_s = Counter()  # Current window frequencies.
        ans: list[int] = []

        for right, c in enumerate(s):
            cnt_s[c] += 1  # Right-end character enters the window.

            left = right - len(p) + 1
            if left < 0:  # Window not yet full.
                continue

            if cnt_s == cnt_p:  # Every letter matches the target.
                ans.append(left)

            cnt_s[s[left]] -= 1  # Left-end character leaves the window.

        return ans
```

表达力上去了，开销结构没变：全等比较至多扫过 26 个条目，单次滑动仍是 $O(|\Sigma|)$，总复杂度 $O(|s| \cdot |\Sigma|)$。阶段 2 的目标正是把这步比较也从循环里拿掉。

### 阶段 2：差值数组 + differ 计数器消除循环比较

为了将每次移动的判定开销从 $O(|\Sigma|)$ 降至严格的 $O(1)$，可以维护一个频次差值数组 `count`，其定义为：

$$
\text{count}[c] = \text{window\_count}[c] - \text{p\_count}[c]
$$

同时维护一个整数变量 `differ`，用于记录**当前有多少种字符的频次与目标不一致**（即满足 $\text{count}[c] \neq 0$ 的字符种类数）。

只有当新字符进入或旧字符离开时，对应字符的 `count` 值才会改变，进而可能引起 `differ` 的增减：

- **加入字符 $c$**：
  - 若原本 $\text{count}[c] = 0$（处于完美匹配平衡），加入后使其偏离平衡，`differ += 1`；
  - 若原本 $\text{count}[c] = -1$（原本窗口内少 1 个），加入后刚好抵消缺口，`differ -= 1`；
  - 更新差值：$\text{count}[c] \mathrel{+}= 1$。
- **移出字符 $c$**：
  - 若原本 $\text{count}[c] = 0$（处于平衡），移出后破坏平衡，`differ += 1`；
  - 若原本 $\text{count}[c] = 1$（原本窗口内多 1 个），移出后刚好消除多余，`differ -= 1`；
  - 更新差值：$\text{count}[c] \mathrel{-}= 1$。

只要 `differ == 0`，说明所有 26 个字符的频次差值均为 0，当前窗口即为合法异位词。

## Python：单变量 differ 的 O(1) 增量维护

```python
class Solution:
    def findAnagrams(self, s: str, p: str) -> list[int]:
        s_len, p_len = len(s), len(p)
        if s_len < p_len:
            return []

        result: list[int] = []
        count = [0] * 26

        # Initialize frequency difference on the first window of size p_len.
        for i in range(p_len):
            count[ord(s[i]) - ord("a")] += 1
            count[ord(p[i]) - ord("a")] -= 1

        # Count how many characters have non-zero difference initially.
        differ = sum(1 for c in count if c != 0)
        if differ == 0:
            result.append(0)

        # Slide the window across s one character at a time.
        for i in range(s_len - p_len):
            out_char = ord(s[i]) - ord("a")
            in_char = ord(s[i + p_len]) - ord("a")

            # Outgoing character from the left boundary
            if count[out_char] == 1:
                differ -= 1
            elif count[out_char] == 0:
                differ += 1
            count[out_char] -= 1

            # Incoming character to the right boundary
            if count[in_char] == -1:
                differ -= 1
            elif count[in_char] == 0:
                differ += 1
            count[in_char] += 1

            if differ == 0:
                result.append(i + 1)

        return result
```

建立首个窗口的差值消耗 $O(|p| + |\Sigma|)$，后续每次滑动仅做常数次整数比较与加减，耗时严格 $O(1)$。总时间复杂度为 $O(|s| + |\Sigma|)$，额外空间为固定大小数组 $O(|\Sigma|)$。

## C++：数组直接寻址与常数优化

在 C++ 中，26 个小写字母的频次可以直接使用栈上连续分配的 `std::array<int, 26>` 或原始数组，拥有极致的缓存命中率：

```cpp
#include <array>
#include <string>
#include <vector>

class Solution {
public:
    std::vector<int> findAnagrams(const std::string& s, const std::string& p) {
        const int s_len = static_cast<int>(s.size());
        const int p_len = static_cast<int>(p.size());
        if (s_len < p_len) return {};

        std::vector<int> result;
        std::array<int, 26> count{};

        for (int i = 0; i < p_len; ++i) {
            ++count[s[i] - 'a'];
            --count[p[i] - 'a'];
        }

        int differ = 0;
        for (int c : count) {
            if (c != 0) ++differ;
        }
        if (differ == 0) result.push_back(0);

        for (int i = 0; i < s_len - p_len; ++i) {
            const int out_idx = s[i] - 'a';
            const int in_idx = s[i + p_len] - 'a';

            // Update delta for outgoing character
            if (count[out_idx] == 1) {
                --differ;
            } else if (count[out_idx] == 0) {
                ++differ;
            }
            --count[out_idx];

            // Update delta for incoming character
            if (count[in_idx] == -1) {
                --differ;
            } else if (count[in_idx] == 0) {
                ++differ;
            }
            ++count[in_idx];

            if (differ == 0) result.push_back(i + 1);
        }

        return result;
    }
};
```

除了最终输出的 `result` 容器，算法不需要其他堆分配：差分数组驻留在栈上的连续内存中，访问模式固定，缓存命中率高。

[567. 字符串的排列](https://leetcode.cn/problems/permutation-in-string/)与本题的数学本质相同——排列即字母异位词——区别只在输出形态：它只需判断存在性，循环中一旦检测到 `differ == 0` 即可短路返回，不必收集全部下标。与[《和为 K 的子数组：先查前缀，再记录频次》](/notes/algorithm/subarray-sum-equals-k/)的方向相反：那道题的数组允许负数，前缀和失去单调性，滑动窗口无从判断扩张与收缩的时机；本题窗口长度严格固定为 $|p|$，频次随进出守恒，滑动窗口是天然解。若把单字符步长换成定长单词，问题升维为 [30. 串联所有单词的子串](https://leetcode.cn/problems/substring-with-concatenation-of-all-words/)，其解法把窗口错位拆成 $k$ 条以单词为步长的流水线，逐条维护窗口内的单词频次。

[^counter-eq]: [Python 文档：`collections.Counter`](https://docs.python.org/3/library/collections.html#collections.Counter)——说明相等比较把缺失元素视为 0 计数，Python 3.10 起生效；此前 `Counter(a=1)` 与 `Counter(a=1, b=0)` 不相等。
