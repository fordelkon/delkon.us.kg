---
title: "找到所有字母异位词：定长滑窗与频次差分维护"
publishDate: "2026-10-18T20:00:00+08:00"
description: "LeetCode 438 题：将静态异位词判定放进定长滑动窗口，从每次全量比对 26 个字符频次，优化到维护单变量 differ 的常数级增量更新。"
tags: ["algorithm", "sliding-window", "python", "cpp"]
---

[LeetCode 438. 找到字符串中所有字母异位词](https://leetcode.cn/problems/find-all-anagrams-in-a-string/)给定主串 `s` 和模式串 `p`，要求在 `s` 中找出所有作为 `p` 的**字母异位词**的连续子串，并返回这些子串的起始下标。例如 `s = "cbaebabacd", p = "abc"`，子串 `"cba"`（下标 0）与 `"bac"`（下标 6）满足条件，返回 `[0, 6]`。

题目保证 `p` 非空，`s` 与 `p` 都只含小写英文字母；下面的数组寻址依赖这一字符范围，示例不定义空模式串的匹配语义。记主串长度为 $n$、模式串长度为 $m$、字母表大小为 $A = |\Sigma|$，本题 $A = 26$。所有实现都只读字符串，返回新建的下标列表。

## 从全局静态签名到局部滑动窗口

在[《字母异位词分组：排序签名、频次元组与质数哈希》](/posts/algorithm/group-anagrams/)中，我们通过为每个独立字符串构造静态特征（字符排序或 26 维频次元组）来完成聚合。若直接在 438 题上对 `s` 中每个长度为 $|p|$ 的子串重复这一静态过程：

- 当 $n \ge m$ 时，长度为 $m$ 的候选子串共有 $n - m + 1$ 个；$n < m$ 时没有候选；
- 若每个窗口都重新初始化频次数组、统计字符并比较，单窗耗时 $O(m + A)$，总时间为 $O(m + A + (n - m + 1)(m + A))$（$n \ge m$，含模式串预处理）。固定 26 个字母后，可写为 $O(m + (n - m + 1)m)$；不能省略窗口数中的 $+1$，否则两串等长时会错误地得到零次处理。

相邻窗口共享大部分字符：当窗口从区间 $[i, i + |p| - 1]$ 右移一位到 $[i + 1, i + |p|]$ 时，窗口内部有 $|p| - 1$ 个字符保持不变，仅仅是左端字符离开、右端字符加入。利用**定长滑动窗口**，只需处理进出两个字符的增量变化。

## 方案演进：从向量比较到标量 differ 计数器

### 阶段 1：定长滑窗 + 26 维向量逐位比对

维护目标串 `p` 的频次数组与当前窗口的频次数组，每次右移窗口时：

1. 纳入新字符：`window_count[s[i]] += 1`；
2. 剔除旧字符：`window_count[s[i - |p|]] -= 1`；
3. 比对两个长度为 26 的数组是否全等。

参数化字母表时，初始化频次数组与模式串需要 $O(m + A)$，扫描主串并逐窗比较至多需要 $O(nA)$，总时间为 $O(m + A + nA)$。固定 $A = 26$ 后是 $O(n + m)$。

用 `Counter` 表达，这套“进—比—出”只需要几行，代码几乎就是文字描述的直接翻译；相等比较把缺失元素视为 0 计数（Python 3.10 起的行为变更），因此左端字符滑出后留下的 0 值条目不会让判定误报不等[^counter-eq]：

```python
from collections import Counter


class Solution:
    def findAnagrams(self, s: str, p: str) -> list[int]:
        if len(s) < len(p):
            return []

        cnt_p = Counter(p)
        cnt_s = Counter()
        result: list[int] = []

        for right, c in enumerate(s):
            cnt_s[c] += 1

            left = right - len(p) + 1
            if left < 0:
                continue

            # At comparison time, cnt_s describes exactly s[left:right + 1].
            if cnt_s == cnt_p:
                result.append(left)

            cnt_s[s[left]] -= 1

        return result
```

`Counter` 版本的全等比较至多检查两张表中各 $A$ 个键；滑出后保留的零计数键也在这一范围内。在哈希操作平均常数时间、写入扩容平摊计算的模型下，总时间为 $O(m + nA)$，辅助空间为 $O(A)$。若返回 $R$ 个下标，输出空间另计 $O(R)$，且 $R \le \max(0, n - m + 1)$。阶段 2 将逐窗比较从 $O(A)$ 降到 $O(1)$；固定 26 个字母时，两种方法仍同为线性时间，实际耗时需要测量。

### 阶段 2：差值数组 + differ 计数器消除循环比较

为了将每次移动的判定开销从 $O(\lvert\Sigma\rvert)$ 降至严格的 $O(1)$，可以维护一个频次差值数组 `count`，其定义为：

$$
\text{count}[c] = \text{window\_count}[c] - \text{p\_count}[c]
$$

同时维护一个整数变量 `differ`，用于记录**频次不一致的字符种类数**（即满足 $\text{count}[c] \neq 0$ 的字符种类数）。

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

## Python：单变量 differ 的常数时间增量维护

```python
class Solution:
    def findAnagrams(self, s: str, p: str) -> list[int]:
        s_len, p_len = len(s), len(p)
        if s_len < p_len:
            return []

        result: list[int] = []
        count = [0] * 26

        for i in range(p_len):
            count[ord(s[i]) - ord("a")] += 1
            count[ord(p[i]) - ord("a")] -= 1

        differ = sum(1 for c in count if c != 0)
        if differ == 0:
            result.append(0)

        for i in range(s_len - p_len):
            out_char = ord(s[i]) - ord("a")
            in_char = ord(s[i + p_len]) - ord("a")

            # differ only changes when a character's (window - target) delta crosses zero.
            if count[out_char] == 1:
                differ -= 1
            elif count[out_char] == 0:
                differ += 1
            count[out_char] -= 1

            if count[in_char] == -1:
                differ -= 1
            elif count[in_char] == 0:
                differ += 1
            count[in_char] += 1

            if differ == 0:
                result.append(i + 1)

        return result
```

建立首个窗口的差值消耗 $O(|p| + \lvert\Sigma\rvert)$，其中 `ord` 将单个字符转换为对应的 Unicode 码位，从而把连续排列的 `'a'` 至 `'z'` 映射到下标 `0` 至 `25`[^python-ord]；后续每次滑动仅做常数次整数比较与加减，耗时严格 $O(1)$。当 $n \ge m$ 时，总时间为 $O(n + m + A) = O(n + A)$，辅助空间为 $O(A)$；$n < m$ 时在长度检查处直接返回。输出另占 $O(R)$ 空间。这里采用题目规模下整数操作为常数时间的模型。

## C++：数组直接寻址与常数优化

在 C++ 中，26 个小写字母的频次差可直接保存在局部的 `std::array<int, 26>` 对象中，并用空花括号 `count{}` 将全部元素零初始化[^cpp-array]：

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

            // Only transitions into or out of zero change the number of mismatched letters.
            if (count[out_idx] == 1) {
                --differ;
            } else if (count[out_idx] == 0) {
                ++differ;
            }
            --count[out_idx];

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

`std::array` 在对象内部连续存放固定数量的元素，不自行动态分配存储；这里局部对象具有自动存储期，常见实现会放在栈上，但 C++ 标准不规定必须使用物理栈。除输出外，辅助空间为 $O(A)$，时间与 Python 差分版相同，为 $O(n + m + A)$（$n \ge m$）。数组寻址依赖执行字符集中小写字母连续排列，LeetCode 的 ASCII 兼容环境满足这一条件。

[LeetCode 567. 字符串的排列](https://leetcode.cn/problems/permutation-in-string/)与本题的数学本质相同——排列即字母异位词——区别只在输出形态：它只需判断存在性，循环中一旦检测到 `differ == 0` 即可短路返回，不必收集全部下标。与[《和为 K 的子数组：先查前缀，再记录频次》](/posts/algorithm/subarray-sum-equals-k/)的方向相反：那道题的数组允许负数，仅凭当前和与目标大小决定伸缩方向的简单单调性失效；本题窗口长度严格固定为 $|p|$，频次随进出守恒，滑动窗口是天然解。若把单字符步长换成定长单词，问题升维为 [LeetCode 30. 串联所有单词的子串](https://leetcode.cn/problems/substring-with-concatenation-of-all-words/)，若每个单词长度为 $w$，可按起始下标模 $w$ 的余数分成 $w$ 组扫描，每组以一个单词为步长，增量维护单词频次。

[^counter-eq]: [Python 文档：`collections.Counter`](https://docs.python.org/3/library/collections.html#collections.Counter)——说明相等比较把缺失元素视为 0 计数，Python 3.10 起生效；此前 `Counter(a=1)` 与 `Counter(a=1, b=0)` 不相等。

[^python-ord]: [Python 文档：内置函数 `ord`](https://docs.python.org/3/library/functions.html#ord)——说明返回单字符对应的 Unicode 码位整数，用于将小写字母映射为从 0 开始的数组下标。

[^cpp-array]: [C++ 标准草案：`array` 概览](https://eel.is/c++draft/array.overview)——说明封装固定大小连续数组的聚合类型，支持通过 `{}` 对全部元素执行值初始化（置零）且不产生堆分配。
