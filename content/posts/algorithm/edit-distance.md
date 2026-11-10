---
title: "编辑距离：三种字符操作的网格对齐与空间压缩"
publishDate: "2026-11-06T10:00:00+08:00"
description: "LeetCode 72 的编辑距离：用双串前缀推导插入、删除和替换的转移，解释空串边界与单行滚动时的对角线暂存，并比较时间和空间开销。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 72. 编辑距离](https://leetcode.cn/problems/edit-distance/)（Hot 100）给定两个单词 `word1` 和 `word2`，要求计算将 `word1` 转换成 `word2` 的最少操作数。每次可以插入、删除或替换一个字符，代价均为 1。两串只含小写英文字母，长度分别记为 $m$ 与 $n$，允许为空串。例如 `word1 = "horse"`、`word2 = "ros"` 需要 3 步：`horse` → `rorse`（替换 `h`）→ `rose`（删除第二个 `r`）→ `ros`（删除 `e`）；若其中一串为空，答案就是另一串的长度。

这一指标称为 Levenshtein 距离[^levenshtein-1966]。虽然题目写的是单向转换，但单位代价下距离对称：插入与删除互为逆操作，替换也可逆，因此任意编辑序列都能反向执行。它还是一个度量：非负性与同一性直接成立，三角不等式来自串接两段编辑序列。这一对称性允许后面交换两串的角色，以较短串作为数组维度。

## 三种编辑操作的网格几何映射

沿用[《最长公共子序列：双串前缀对齐与单行滚动优化》](/posts/algorithm/longest-common-subsequence/)的前缀状态：$dp[i][j]$ 表示将 `word1` 的前 $i$ 个字符转换成 `word2` 的前 $j$ 个字符所需的最少操作数，其中 $0 \le i \le m$、$0 \le j \le n$。

先处理空前缀：

- $dp[0][j] = j$：长度要从 0 增到 $j$，至少需要 $j$ 次操作，逐个插入即可达到下界；
- $dp[i][0] = i$：逐个删除源串字符，代价为 $i$；
- $dp[0][0] = 0$。

计算 $dp[i][j]$ 时，按末尾字符的处理方式分成三种转移[^wagner-fischer-1974]：

| 前驱状态       | 到当前状态的操作   | 代价   |
| :------------- | :----------------- | :----- |
| $dp[i-1][j]$   | 删除源串末尾字符   | 1      |
| $dp[i][j-1]$   | 插入目标串末尾字符 | 1      |
| $dp[i-1][j-1]$ | 匹配或替换末尾字符 | 0 或 1 |

删除对应的是：先将源串的前 $i-1$ 个字符转成目标前缀，再删去多出的 `word1[i - 1]`。插入则是先得到目标串的前 $j-1$ 个字符，再补上 `word2[j - 1]`。对角线转移同时处理两个末尾字符，相等时直接保留，不等时替换。

末尾相等时可以直接继承对角线最优值；不等时，三种操作都要付出 1，取最小值：

$$
dp[i][j] = \begin{cases}
dp[i - 1][j - 1], & \text{若 } \mathrm{word1}[i - 1] = \mathrm{word2}[j - 1] \\
1 + \min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]), & \text{否则}
\end{cases}
$$

## Python：二维网格递推与三向决策

先初始化边界行和列，再按行填表；这样每次转移读取的上方、左侧和左上方状态都已算出。实现只读输入并返回距离数值。

```python
class Solution:
    def minDistance(self, word1: str, word2: str) -> int:
        m, n = len(word1), len(word2)

        # dp[i][j] is the edit distance between prefixes of lengths i and j.
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j

        for i in range(1, m + 1):
            c1 = word1[i - 1]
            for j in range(1, n + 1):
                if c1 == word2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(
                        dp[i - 1][j],  # Delete from word1.
                        dp[i][j - 1],  # Insert into word1.
                        dp[i - 1][j - 1],  # Replace a character.
                    )

        return dp[m][n]
```

矩阵分配了 $(m + 1)(n + 1)$ 个单元，初始化和填表的总时间、辅助空间均为 $O((m+1)(n+1))$。两串非空时可简写为 $O(mn)$；但题目允许空串，不能在所有输入上都省去边界项。例如 $n=0$ 时，代码仍要分配 $m+1$ 行并初始化边界列，时间和空间都是 $O(m+1)$。

## 对角线暂存与单行空间压缩

与 LCS 相同，当前状态只依赖上一行的两格，以及当前行左侧的一格。复用一行数组时，在内层循环处理列 $j$ 之前：

- `dp[j]` 仍是上一行的 $dp[i-1][j]$；
- `dp[j - 1]` 已更新成当前行的 $dp[i][j-1]$；
- `prev_diag` 保存被覆盖的左上方旧值 $dp[i-1][j-1]$。

更新 `dp[j]` 前，先用 `temp` 保存它的旧值；转移后再令 `prev_diag = temp`，供下一列使用。

这里与 LCS 的边界不同：每行的 $dp[i][0]=i$，不是恒为 0。因此，开始第 $i$ 行时必须先将旧的 `dp[0]`（值为 $i-1$）存入 `prev_diag`，再写入新的 `dp[0] = i`。反过来更新会使第 1 列读到错误的对角线。

## C++：度量对称性与单行滚动

下面使用 C++17，以只读引用接收输入，再交换 `std::string_view` 视图[^string-view]，避免按值传递产生 $O(m+n)$ 的字符副本。输入不会被修改，视图只在函数调用期间使用。距离对称，因此交换两串后答案不变。

```cpp
#include <algorithm>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

class Solution {
public:
    int minDistance(const std::string& input1, const std::string& input2) {
        std::string_view word1 = input1;
        std::string_view word2 = input2;
        // Distance is symmetric; use the shorter string for the stored row.
        if (word1.size() < word2.size()) {
            std::swap(word1, word2);
        }

        const int m = static_cast<int>(word1.size());
        const int n = static_cast<int>(word2.size());
        std::vector<int> dp(n + 1);
        for (int j = 0; j <= n; ++j) {
            dp[j] = j;
        }

        for (int i = 1; i <= m; ++i) {
            // Save the old boundary before writing dp[i][0].
            int prev_diag = dp[0];
            dp[0] = i;

            const char c1 = word1[i - 1];
            for (int j = 1; j <= n; ++j) {
                // dp[j] is the old top, dp[j-1] the new left, prev_diag the old diagonal.
                const int temp = dp[j];
                if (c1 == word2[j - 1]) {
                    dp[j] = prev_diag;
                } else {
                    dp[j] = 1 + std::min({
                        dp[j],      // Delete.
                        dp[j - 1],  // Insert.
                        prev_diag   // Replace.
                    });
                }
                prev_diag = temp;
            }
        }

        return dp[n];
    }
};
```

内层一共执行 $mn$ 次转移；每次 `std::min` 固定比较三个候选值，只需两次比较[^cpp-min]。加上初始化和每行的边界更新，总时间为 $O(mn+m+n+1)$。数组长度是 $\min(m,n)+1$，辅助空间为 $O(\min(m,n)+1)$。两串非空时，分别简写为 $O(mn)$ 和 $O(\min(m,n))$；若一串为空，当前实现仍需线性更新边界，辅助数组只有一个单元。

单行结果不能直接回溯编辑步骤。若要生成具体的对齐脚本，可以保留二维表或方向信息；也可以采用 Hirschberg 分治：计算正反向的边界行，选取最优分割点，再递归重算两侧，以线性空间重构最优对齐，无需完整保存二维矩阵[^hirschberg]。

## 双序列对齐网格的拓扑同构性

LCS 和编辑距离复用了同一组前缀坐标及上方、左侧、左上方依赖，因此滚动数组的覆盖顺序相同，但移动的含义不同：

- LCS 最大化匹配数，相等的对角线转移增加 1，侧向移动不增加匹配数；
- 编辑距离最小化操作数，相等的对角线转移不收费，替换、插入、删除各收费 1。

两题都可用[记忆化到自底向上递推](/posts/understanding-recursion/#从记忆化到自底向上递推)的方式安排状态计算，再根据每行的使用期限压缩存储。复用的关键是依赖与更新时序，边界值和转移代价仍须按各自题意确定。

## 方案对比

| 方案             | 时间复杂度      | 辅助空间复杂度   | 特点                               |
| :--------------- | :-------------- | :--------------- | :--------------------------------- |
| 二维网格动态规划 | $O((m+1)(n+1))$ | $O((m+1)(n+1))$  | 保留历史状态，便于回溯编辑步骤     |
| 单行滚动状态压缩 | $O(mn+m+n+1)$   | $O(\min(m,n)+1)$ | 只保留一行，不能直接从最终数组回溯 |

表中保留边界项，以覆盖题目允许的空串输入。

[^levenshtein-1966]: [Vladimir I. Levenshtein：_Binary codes capable of correcting deletions, insertions, and reversals_ (Soviet Physics Doklady, 1966)](https://nymity.ch/sybilhunting/pdf/Levenshtein1966a.pdf)——研究二元符号的插入、删除和反转（0 与 1 互换），提供编辑距离的历史背景；本文一般字符串的三操作递推以 Wagner–Fischer 论文为依据。

[^wagner-fischer-1974]: [Robert A. Wagner, Michael J. Fischer：_The String-to-String Correction Problem_ (JACM, 1974)](https://doi.org/10.1145/321796.321811)——讨论插入、删除、替换的字符串校正问题及二维动态规划算法。

[^cpp-min]: [C++ 工作草案：Minimum and maximum](https://eel.is/c++draft/alg.min.max)——`std::min` 的初始化列表重载对 $N$ 个元素执行 $N-1$ 次比较；本文固定传入三个元素，因此只需两次比较。

[^string-view]: [C++ 标准草案：string view](https://eel.is/c++draft/string.view)——视图引用原字符序列而不拥有它；本文用它交换输入角色，不复制字符。

[^hirschberg]: [D. S. Hirschberg：_A Linear Space Algorithm for Computing Maximal Common Subsequences_ (CACM 18(6), 1975, pp. 341–343)](https://ics.uci.edu/~dhirschb/pubs/p341-hirschberg.pdf)——Algorithm C 用分治重算在 $O(mn)$ 时间、$O(m+n)$ 空间内输出 LCS，末节讨论编辑距离的对应分割；[Lloyd Allison：Hirschberg's Algorithm](https://www.allisons.org/ll/AlgDS/Dynamic/Hirsch/)进一步说明如何用正反向行计算重构最优编辑对齐。
