---
title: "最长公共子序列：双串前缀对齐与单行滚动优化"
publishDate: "2026-11-06T08:00:00+08:00"
description: "LeetCode 1143 的最长公共子序列：从两个前缀的末尾字符推导转移，再用一个暂存变量保护对角线旧值，将辅助空间压缩到较短串的长度。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 1143. 最长公共子序列](https://leetcode.cn/problems/longest-common-subsequence/)（Hot 100）给定两个非空字符串 `text1` 和 `text2`，只含小写英文字母，要求返回**最长公共子序列**（Longest Common Subsequence, LCS）的长度。设两串长度分别为 $m$ 与 $n$。例如 `text1 = "abcde"`、`text2 = "ace"` 的最长公共子序列是 `"ace"`，长度为 3；`"abc"` 与 `"def"` 没有公共字符，返回 0。

子序列可以跳过字符，但不能改变相对顺序；[《最长回文子串：区间长度扩展与中心扩散比对》](/posts/algorithm/longest-palindromic-substring/)中的子串则必须连续。空序列始终是公共子序列，因此答案不会小于 0。

## 双串前缀对齐与笛卡尔网格

用两个前缀的长度定位状态：$dp[i][j]$ 表示 `text1` 的前 $i$ 个字符与 `text2` 的前 $j$ 个字符的 LCS 长度，其中 $0 \le i \le m$、$0 \le j \le n$。

引入空前缀后，边界为 $dp[0][j]=dp[i][0]=0$：只要一边为空，就没有非空公共子序列。这样填表时从第 1 行、第 1 列开始，分别读取字符 `text1[i - 1]` 和 `text2[j - 1]`，不必在循环中单独判断空前缀。

按两个末尾字符是否相等分类：

$$
dp[i][j] = \begin{cases}
dp[i - 1][j - 1] + 1, & \text{若 } \mathrm{text1}[i - 1] = \mathrm{text2}[j - 1] \\
\max(dp[i - 1][j], dp[i][j - 1]), & \text{否则}
\end{cases}
$$

这一转移的最优子结构也见 CLRS 第 4 版的 LCS 章节[^clrs-lcs]。可以直接从匹配下标说明：

1. **末尾字符相等**，设都为 $c$。任何不以 $c$ 结尾的公共子序列，其匹配都结束于两串末尾之前，还能追加 $c$，因而不可能最优。所以 LCS 必以 $c$ 结尾，且可把最后一次匹配选在两串末尾。去掉这次匹配，剩余部分属于两个更短前缀，长度至多为 $dp[i-1][j-1]$；反过来，在更短前缀的 LCS 后追加 $c$，能达到这个上界。因此答案为 $dp[i-1][j-1]+1$。这不意味着最优序列唯一，例如 `"abc"` 与 `"bac"` 可取 `"ac"` 或 `"bc"`。
2. **末尾字符不等**。同一个公共子序列不可能同时使用两串的末尾位置：它们若都被使用，就必须对应公共子序列的同一个末尾字符，与不等矛盾。因此至少舍弃一个末尾位置，在 $dp[i-1][j]$ 与 $dp[i][j-1]$ 中取较大值。两者都包含了舍弃两边末尾的候选，不必再比较 $dp[i-1][j-1]$。

## Python：二维网格递推与最优子结构

分配 $(m+1)\times(n+1)$ 的表，按行填入。每个状态依赖的上一行和当前行左侧都已经算出。两份实现都只读输入，返回长度数值。

```python
class Solution:
    def longestCommonSubsequence(self, text1: str, text2: str) -> int:
        # Time complexity: O(m * n)
        # Space complexity: O(m * n) auxiliary space
        m, n = len(text1), len(text2)

        # Invariant: dp[i][j] is the LCS length of prefixes of lengths i and j.
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            char1 = text1[i - 1]
            for j in range(1, n + 1):
                if char1 == text2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

        return dp[m][n]
```

题目保证两串非空，$(m+1)(n+1)$ 个单元可按 $O(mn)$ 计。每个状态只做常数次字符比较和取最大值，时间与辅助空间均为 $O(mn)$。

## 对角线暂存与单行空间压缩

计算 $dp[i][j]$ 只会读取三格：正上方 $dp[i-1][j]$、左侧 $dp[i][j-1]$ 和左上方 $dp[i-1][j-1]$。第 $i-2$ 行及更早的状态已不再使用，可以复用上一行的存储。

只保留一行 `dp` 时，从左向右更新会产生新旧状态混用：

- 覆盖 `dp[j]` 前，它还是上一行的 $dp[i-1][j]$；
- `dp[j - 1]` 已经更新，是当前行的 $dp[i][j-1]$；
- 左上方旧值在更新第 $j-1$ 列时已被覆盖，必须另外暂存。

用 `prev_diag` 保存这份旧值，更新顺序是：

1. 每行开始时令 `prev_diag = 0`，对应边界 $dp[i-1][0]$；
2. 更新 `dp[j]` 前，先令 `temp = dp[j]`，保存上方旧值；
3. 字符相等时写入 `prev_diag + 1`，否则写入 `max(dp[j], dp[j - 1])`；
4. 令 `prev_diag = temp`，使它成为下一列需要的左上方值。

两串的 LCS 长度对称，可以让较短串作为列维度，把辅助数组长度降为 $\min(m,n)+1$。

## C++：短串对齐与单行滚动

下面要求 C++17，使用 `std::string_view` 交换只读视图，不复制字符串[^string-view]。输入在函数调用期间保持存活，视图不逃出函数。若按值接收两个 `std::string`，普通左值调用会产生额外的 $O(m+n)$ 字符副本，完整实现就不能声称只占较短串长度的辅助空间。

```cpp
#include <algorithm>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

class Solution {
public:
    int longestCommonSubsequence(const std::string& text1, const std::string& text2) {
        // Time complexity: O(m * n)
        // Space complexity: O(min(m, n)) auxiliary space
        std::string_view sv1 = text1;
        std::string_view sv2 = text2;
        // Use the shorter string for the stored row without copying characters.
        if (sv1.size() < sv2.size()) {
            std::swap(sv1, sv2);
        }

        const int m = static_cast<int>(sv1.size());
        const int n = static_cast<int>(sv2.size());
        std::vector<int> dp(n + 1, 0);

        for (int i = 1; i <= m; ++i) {
            int prev_diag = 0;
            const char c1 = sv1[i - 1];
            for (int j = 1; j <= n; ++j) {
                // Invariant: dp[j] holds previous row value (from above);
                // dp[j-1] holds current row updated value (from left);
                // prev_diag holds old diagonal value (from top-left).
                const int temp = dp[j];
                if (c1 == sv2[j - 1]) {
                    dp[j] = prev_diag + 1;
                } else {
                    dp[j] = std::max(dp[j], dp[j - 1]);
                }
                prev_diag = temp;
            }
        }

        return dp[n];
    }
};
```

时间仍为 $O(mn)$，辅助空间降为 $O(\min(m,n))$。最终的一行不能直接回溯具体的 LCS，但完整二维表并不是重构的必要条件：常规做法是保留二维表或方向信息；Hirschberg 算法则通过正反向行计算选择分割点，再递归重算，在 $O(mn)$ 时间、线性空间内输出真实的 LCS[^hirschberg]。

## 从记忆化到自底向上递推：状态网格的拓扑演进

按[记忆化到自底向上递推](/posts/understanding-recursion/#从记忆化到自底向上递推)的思路看，同一组状态可以有不同的计算和存储方式：

- 记忆化递归先求子状态，最多缓存 $O(mn)$ 个状态；单条调用链每次至少缩短一个前缀，深度为 $O(m+n)$，仍可能触及递归限制。缓存空间和调用深度是两项不同的成本。
- 二维递推按行或按列计算，让每个状态的前驱先就绪，省去递归栈。
- 单行滚动再根据旧行的使用期限复用存储，用一个 `prev_diag` 保护尚未读完的对角线值。

[《编辑距离：三种字符操作的网格对齐与空间压缩》](/posts/algorithm/edit-distance/)会复用这一覆盖顺序；两题的依赖位置相同，但边界和转移代价不同。

## 方案对比

| 方案                 | 时间复杂度 | 辅助空间复杂度 | 特点                                 |
| :------------------- | :--------- | :------------- | :----------------------------------- |
| 二维网格动态规划     | $O(mn)$    | $O(mn)$        | 状态直观，保留历史信息以便回溯       |
| 单行滚动数组状态压缩 | $O(mn)$    | $O(\min(m,n))$ | 只保留较短串对应的一行，不能直接回溯 |

[^clrs-lcs]: [Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein：_Introduction to Algorithms_ (4th Edition, Section 14.4: Longest common subsequence)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——介绍 LCS 的最优子结构与动态规划；第 3 版对应第 15.4 节。

[^string-view]: [C++ 标准草案：string view](https://eel.is/c++draft/string.view)——只读视图引用原字符序列而不拥有它，本文只在输入字符串存活的函数调用期间使用视图。

[^hirschberg]: [D. S. Hirschberg：_A Linear Space Algorithm for Computing Maximal Common Subsequences_ (CACM 18(6), 1975, pp. 341–343)](https://ics.uci.edu/~dhirschb/pubs/p341-hirschberg.pdf)——Algorithm B 计算边界行，Algorithm C 用正反向结果选择分割点，递归输出 LCS；论文给出 $O(mn)$ 时间与 $O(m+n)$ 空间分析，不要求保存完整二维表。
