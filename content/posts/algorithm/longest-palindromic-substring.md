---
title: "最长回文子串：区间长度扩展与中心扩散比对"
publishDate: "2026-11-05T20:00:00+08:00"
description: "LeetCode 5 的最长回文子串：解释区间动态规划的边界和填表顺序，用奇偶中心扩散省去二维表，再介绍 Manacher 如何复用镜像半径。"
tags: ["algorithm", "dynamic-programming", "two-pointer", "python", "cpp"]
---

[LeetCode 5. 最长回文子串](https://leetcode.cn/problems/longest-palindromic-substring/)（Hot 100）给定非空字符串 `s`，只含数字和英文字母，要求返回其中最长的回文子串。设长度为 $n$。若有多个同样长的答案，返回任意一个即可；单字符本身就是回文。例如 `"babad"` 可以返回 `"bab"` 或 `"aba"`，`"cbbd"` 返回 `"bb"`。

子串必须在原串中连续；[《最长公共子序列：双串前缀对齐与单行滚动优化》](/posts/algorithm/longest-common-subsequence/)和[《最长递增子序列：结尾状态转移与贪心二分分堆》](/posts/algorithm/longest-increasing-subsequence/)中的子序列则允许跳过元素。

## 随机访问与回文探测模型

[《回文链表：把判定拆成三个指针原语》](/posts/algorithm/palindrome-linked-list/)面对的是单链表，不能通过下标常数时间读取两端，也不能从中心同时向前驱和后继移动。不分配辅助数组时，可以找中点、反转后半段、逐项比较，再恢复连接。

本题字符串支持常数时间的字符索引，不需要改变输入结构。可以选择两种办法：

1. 记录每个区间是否回文，用短区间推导长区间；
2. 枚举回文中心，在原串上用双指针向两侧比较，只保存当前最优起点和长度。

## 区间动态规划：状态定义与子区间依赖

定义 $dp[i][j]$ 表示闭区间子串 $s[i\dots j]$ 是否回文，其中 $0\le i\le j<n$。这是典型的**区间动态规划**（Interval Dynamic Programming）状态设计。

长度大于 2 的区间是回文，当且仅当两端字符相同，且去掉两端后的内部区间也是回文。长度较短时可以直接判断：

$$
dp[i][j] = (s[i] = s[j]) \land \big((j-i<3)\lor dp[i+1][j-1]\big).
$$

### 边界条件与填表拓扑序

这里把长度为 3 的区间也纳入直接判断：

- 长度为 1：单字符总是回文；
- 长度为 2：内部为空，只需两端相同；
- 长度为 3：中间单字符已经回文，也只需两端相同。

所以当跨度 $j-i<3$，即长度 $L=j-i+1\le3$ 时，不必读取子状态。

较长区间依赖 $dp[i+1][j-1]$，其长度为 $L-2$。如果外层 `i` 从小到大、内层 `j` 从 `i` 到末尾，计算当前行时，所需的下一行还没有填好。例如 `"abba"` 的 $dp[0][3]$ 要先知道 $dp[1][2]$。

如[从记忆化到自底向上递推](/posts/understanding-recursion/#从记忆化到自底向上递推)所述，填表顺序必须让依赖先就绪。这里有两种顺序：

1. **按区间长度递增**：先初始化长度为 1 的区间，再从 $L=2$ 算到 $n$，确保 $L-2$ 的状态已完成。矩阵链乘法也采用按区间长度填表的方式[^clrs-matrix-chain]。
2. **行倒序、列正序**：`i` 从 $n-1$ 降到 0，`j` 从 `i` 递增，此时第 $i+1$ 行已经完成。

## Python：按区间长度递推的标准实现

先初始化单字符，再按长度递增计算。实现只读输入，只在最后切片返回结果，避免在循环内不断创建子串。

```python
class Solution:
    def longestPalindrome(self, s: str) -> str:
        # Time complexity: O(n^2)
        # Space complexity: O(n^2) auxiliary space
        n = len(s)
        if n <= 1:
            return s

        # dp[i][j] indicates whether the inclusive interval s[i..j] is a palindrome.
        dp = [[False] * n for _ in range(n)]
        start = 0
        max_len = 1
        for i in range(n):
            dp[i][i] = True

        # Length L depends only on the already computed length L - 2.
        for length in range(2, n + 1):
            for i in range(n - length + 1):
                j = i + length - 1
                if s[i] == s[j]:
                    # Empty and single-character interiors need no lookup.
                    if length <= 3:
                        dp[i][j] = True
                    else:
                        dp[i][j] = dp[i + 1][j - 1]

                if dp[i][j] and length > max_len:
                    max_len = length
                    start = i

        return s[start : start + max_len]
```

有效区间共有 $\frac{n(n+1)}{2}$ 个，每个状态转移为常数时间，总时间为 $O(n^2)$。代码实际分配的是 $n\times n$ 的完整矩阵，辅助空间为 $O(n^2)$。

## C++：双指针中心扩散法（O(1) 辅助空间）

不保存区间表，也能覆盖所有回文：每个回文都有一个中心，从中心向两侧扩展到首次失配，就能得到这个中心的最长回文。长度为 $n$ 的字符串共有 $2n-1$ 个中心：$n$ 个字符中心对应奇数长度，$n-1$ 个字符间隙对应偶数长度。

下面分别调用 `(i, i)` 和 `(i, i + 1)`。最后一个间隙调用会立即越界退出，不影响结果。这是算法选择的差异，与 Python 或 C++ 无关。

```cpp
#include <string>

class Solution {
public:
    std::string longestPalindrome(const std::string& s) {
        // Time complexity: O(n^2)
        // Space complexity: O(1) auxiliary space
        const int n = static_cast<int>(s.size());
        if (n <= 1) {
            return s;
        }

        int max_start = 0;
        int max_len = 1;
        auto expand_around_center = [&](int left, int right) {
            // The open interval (left, right) is already symmetric.
            while (left >= 0 && right < n && s[left] == s[right]) {
                --left;
                ++right;
            }
            // The first mismatch or boundary leaves the valid span [left + 1, right - 1].
            const int current_len = right - left - 1;
            const int current_start = left + 1;
            if (current_len > max_len) {
                max_len = current_len;
                max_start = current_start;
            }
        };

        for (int i = 0; i < n; ++i) {
            expand_around_center(i, i);      // Odd length.
            expand_around_center(i, i + 1);  // Even length.
        }

        return s.substr(max_start, max_len);
    }
};
```

循环退出时，`left` 和 `right` 位于首个失配或越界位置，合法区间是 `[left + 1, right - 1]`，所以长度为：

$$
(\mathrm{right}-1)-(\mathrm{left}+1)+1
=\mathrm{right}-\mathrm{left}-1.
$$

每个中心最多扩展 $O(n)$ 次，共 $O(n)$ 个中心，最坏时间为 $O(n^2)$。例如全为相同字符时，许多中心都会扩展很远。只记录指针与最优区间，辅助空间为 $O(1)$。

## 线性时间跃迁：Manacher 算法的核心思想

中心扩散会在不同中心重复比较同一段字符。**马拉车算法**（Manacher's Algorithm）利用已知回文的对称性，跳过这些比较，达到线性时间[^manacher-1975]。

1. **统一奇偶中心**：在首尾和相邻字符之间插入未在原串出现的分隔符，例如本题可以用 `#`，得到长度为 $2n+1$ 的字符串。原来的偶回文也变成以分隔符为中心的奇回文。
2. **记录最右边界**：设 $P[i]$ 为新串中以 $i$ 为中心、向一侧延伸的回文半径。维护已知回文的最右端点 $R$，以及对应中心 $C$，于是覆盖区间为 $[2C-R,R]$。
3. **复用镜像半径**：计算 $i<R$ 时，镜像点是 $i'=2C-i$。已知覆盖区间内部关于 $C$ 对称，因此可将 $P[i]$ 初始化为 $\min(R-i,P[i'])$。若镜像回文在区间内部结束，其失配也会镜像过来，不必再扩展；若半径到达 $R$，再显式比较边界外的字符。$i\ge R$ 时从半径 0 开始比较。

当扩展得到更靠右的回文时，更新 $R$ 和 $C$。新增的成功比较会推进最右边界，而 $R$ 只能向右移动 $O(n)$ 次；每个中心至多再产生一次终止扩展的失败比较，因此总时间为 $O(n)$。半径数组和变换后的字符串占 $O(n)$ 辅助空间。

```cpp
#include <algorithm>
#include <string>
#include <vector>

class Solution {
public:
    std::string longestPalindrome(const std::string& s) {
        // Time complexity: O(n)
        // Space complexity: O(n) auxiliary space
        const int n = static_cast<int>(s.size());
        if (n <= 1) {
            return s;
        }

        // Insert delimiters and distinct sentinels '^' and '$' to eliminate explicit bounds checking.
        // E.g., "aba" transforms into "^#a#b#a#$".
        std::string transformed = "^";
        transformed.reserve(2 * n + 3);
        for (char c : s) {
            transformed.push_back('#');
            transformed.push_back(c);
        }
        transformed.push_back('#');
        transformed.push_back('$');

        const int m = static_cast<int>(transformed.size());
        // p[i] represents the palindrome radius centered at i in the transformed string.
        std::vector<int> p(m, 0);
        int center = 0;
        int right = 0;
        int max_len = 0;
        int center_index = 0;

        for (int i = 1; i < m - 1; ++i) {
            const int i_mirror = 2 * center - i;

            if (right > i) {
                p[i] = std::min(right - i, p[i_mirror]);
            }

            // Attempt to expand palindrome centered at i; sentinels guarantee mismatch before bounds violation.
            while (transformed[i + 1 + p[i]] == transformed[i - 1 - p[i]]) {
                ++p[i];
            }

            // Advance center and right boundary when palindrome extends beyond current reach.
            if (i + p[i] > right) {
                center = i;
                right = i + p[i];
            }

            // Track maximum palindrome radius discovered so far.
            if (p[i] > max_len) {
                max_len = p[i];
                center_index = i;
            }
        }

        // Palindrome radius in transformed string equals original palindrome length in s.
        const int start = (center_index - max_len) / 2;
        return s.substr(start, max_len);
    }
};
```

### 复杂度推导

- **时间复杂度**：预处理变换字符串耗时 $O(n)$。在主循环中，每一次进入 `while` 循环且匹配成功，都会使当前探测半径越过旧的 $R$ 并推进最右边界；因为 $R$ 从 0 单调递增至 $2n + 2$，成功匹配的累积执行次数不超过 $O(n)$。若匹配失败，则直接跳出 `while`，每个中心至多遭遇一次失配退出（共 $2n + 1$ 次）。因此总比较次数被严格限制在 $O(n)$ 内，算法具有线性时间复杂度 $O(n)$。
- **空间复杂度**：变换后的字符串长度为 $2n + 3$，辅助半径数组 `p` 大小为 $2n + 3$，辅助空间复杂度为 $O(n)$。最终切片返回的最长回文字符串占用 $O(L)$ 的输出空间。

## 复杂度与方案对照

| 方案           | 时间复杂度 | 辅助空间复杂度 | 核心机制                     |
| :------------- | :--------- | :------------- | :--------------------------- |
| 区间动态规划   | $O(n^2)$   | $O(n^2)$       | 按长度计算区间是否回文       |
| 双指针中心扩散 | $O(n^2)$   | $O(1)$         | 枚举奇偶中心，向两侧比较     |
| Manacher       | $O(n)$     | $O(n)$         | 复用最右覆盖区间内的镜像半径 |

两段代码均不修改输入。设返回回文长度为 $L$，字符串结果占 $O(L)$ 输出空间，与表中的辅助空间分开计算。

[^clrs-matrix-chain]: [Introduction to Algorithms (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 14.2 节矩阵链乘法给出按区间长度递增填表的动态规划方法。

[^manacher-1975]: [Glenn Manacher：_A New Linear-Time "On-Line" Algorithm for Finding the Smallest Initial Palindrome of a String_ (1975)](https://doi.org/10.1145/321892.321895)——利用回文对称关系避免重复比较的经典线性时间算法论文。
