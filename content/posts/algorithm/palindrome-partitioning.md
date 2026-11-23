---
title: "分割回文串：预计算回文与逐段回溯"
publishDate: "2026-11-24T12:00:00+08:00"
description: "LeetCode 131 分割回文串：将字符串切分映射为子集式切割点回溯，结合区间动态规划预计算回文表将单次子串判定降至常数时间，对比 Python 与 C++ 实现。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 131. 分割回文串](https://leetcode.cn/problems/palindrome-partitioning/)（Hot 100）给定一个仅含小写英文字母的字符串 `s`，要求将 `s` 分割成若干子串，使每个子串都是**回文串**，返回所有可能的分割方案。例如 `s = "aab"` 返回 `[["a", "a", "b"], ["aa", "b"]]`。题目保证 $1 \le \lvert s\rvert \le 16$。

## 字符串切分与子集模型的同构性

在[《单词拆分：前缀可行性转移与子串查找成本》](/posts/algorithm/word-break/)中，我们按前缀判断字符串能否切分为字典中的单词；本题同样是切分字符串，但要求输出**全部合法切分方案**，且每个片段的合法条件是“自身为回文串”。

对长度为 $n$ 的字符串，字符之间共有 $n - 1$ 个潜在切割缝隙。选或不选这些缝隙，恰好与[《子集：递增下标回溯与位掩码枚举》](/posts/algorithm/subsets/)中的 $2^{n-1}$ 种选择同构。用回溯表达时，递归参数 `start` 表示当前尚未切分的后缀起点：

1. 当 `start == n` 时，说明整个字符串已被合法切分完毕，将当前路径 `path` 的副本加入结果集。
2. 否则，枚举当前回文片段的右端点 `end`（从 `start` 到 `n - 1`）。只要 `s[start..end]` 是回文串，就切下该片段加入 `path`，递归处理剩余后缀 `end + 1`，返回后弹出恢复。

## 区间 DP 预计算回文表

如果每次枚举 `(start, end)` 都用双指针从两端向中间扫描校验回文，同一个子串 `s[l..r]` 会在不同前缀切分路径下被反复检查。借用[《最长回文子串：中心扩展与区间状态转移》](/posts/algorithm/longest-palindromic-substring/)中的区间性质，子串 `s[l..r]` 是回文串当且仅当：

$$
\textit{isPal}[l][r] = (s[l] == s[r]) \land \bigl(r - l \le 2 \lor \textit{isPal}[l + 1][r - 1]\bigr).
$$

按左端点 `l` 从大到小（`n - 1` 到 `0`）、右端点 `r` 从小到大（`l` 到 `n - 1`）填表，可以在 $O(n^2)$ 时间内预先求出所有子串的回文真值。之后回溯中每次校验 `isPal[start][end]` 只需 $O(1)$ 查表。

## Python：回文表预处理与切片回溯

```python
class Solution:
    def partition(self, s: str) -> list[list[str]]:
        # Time complexity: O(n * 2^n)
        # Space complexity: O(n^2) auxiliary space for palindrome table (excluding output)
        n = len(s)
        is_pal = [[False] * n for _ in range(n)]

        # Precompute palindrome flags bottom-up so dp[l + 1][r - 1] is ready before dp[l][r].
        for l in range(n - 1, -1, -1):
            for r in range(l, n):
                if s[l] == s[r] and (r - l <= 2 or is_pal[l + 1][r - 1]):
                    is_pal[l][r] = True

        result: list[list[str]] = []
        path: list[str] = []

        def backtrack(start: int) -> None:
            if start == n:
                result.append(path.copy())
                return

            for end in range(start, n):
                if is_pal[start][end]:
                    path.append(s[start : end + 1])
                    backtrack(end + 1)
                    path.pop()

        backtrack(0)
        return result
```

## C++：扁平回文表与子串构造

C++ 版本用 `std::vector<std::uint8_t>`（或二维 `std::vector<std::vector<char>>`）替代 `std::vector<bool>` 以避免位代理访问开销[^cpp-vector-bool]，并用 `std::string_view` 引用原串，仅在确实需要加入路径时通过 `emplace_back` 构造子串[^cpp-string-view]：

```cpp
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

class Solution {
    void backtrack(std::string_view sv,
                   int start,
                   const std::vector<std::uint8_t>& is_pal,
                   std::vector<std::string>& path,
                   std::vector<std::vector<std::string>>& result) const {
        const int n = static_cast<int>(sv.size());
        if (start == n) {
            result.push_back(path);
            return;
        }

        for (int end = start; end < n; ++end) {
            if (is_pal[static_cast<std::size_t>(start) * n + end] != 0) {
                path.emplace_back(sv.substr(start, end - start + 1));
                backtrack(sv, end + 1, is_pal, path, result);
                path.pop_back();
            }
        }
    }

public:
    std::vector<std::vector<std::string>> partition(const std::string& s) const {
        // Time complexity: O(n * 2^n)
        // Space complexity: O(n^2) auxiliary space for palindrome table (excluding output)
        const int n = static_cast<int>(s.size());
        std::vector<std::uint8_t> is_pal(static_cast<std::size_t>(n) * n, 0);

        for (int l = n - 1; l >= 0; --l) {
            for (int r = l; r < n; ++r) {
                if (s[l] == s[r] &&
                    (r - l <= 2 ||
                     is_pal[static_cast<std::size_t>(l + 1) * n + (r - 1)] != 0)) {
                    is_pal[static_cast<std::size_t>(l) * n + r] = 1;
                }
            }
        }

        std::vector<std::vector<std::string>> result;
        std::vector<std::string> path;
        path.reserve(static_cast<std::size_t>(n));
        backtrack(s, 0, is_pal, path, result);
        return result;
    }
};
```

## 复杂度分析与方案对比

当字符串由同一个字符重复组成（如 `"aaaa...a"`）时，任意子串都是回文串，所有 $2^{n - 1}$ 种切割方式均合法。

- **时间复杂度**：共有至多 $2^{n - 1}$ 种合法方案，每种方案包含总计 $n$ 个字符的子串拷贝，因此输出构造与回溯展开合计为 $O(n \cdot 2^n)$。区间 DP 预处理的 $O(n^2)$ 在 $n$ 较大时被指数项吸收。
- **辅助空间复杂度**：预处理表占 $O(n^2)$，递归栈与当前路径 `path` 占 $O(n)$，总辅助空间（不含返回结果）为 $O(n^2)$。若改用回溯时现场双指针判断回文，辅助空间可降至 $O(n)$，但最坏情况下仍受输出规模 $O(n \cdot 2^n)$ 主导，且会重复校验重叠子串。

| 方案 | 预处理耗时 | 单次校验成本 | 总时间复杂度 | 辅助空间（不含输出） |
| :--- | :--------- | :----------- | :----------- | :------------------- |
| 现场双指针校验 + 回溯 | $O(1)$ | $O(n)$ | $O(n \cdot 2^n)$ | $O(n)$ |
| 区间 DP 预计算 + 回溯 | $O(n^2)$ | $O(1)$ | $O(n \cdot 2^n)$ | $O(n^2)$ |

[^cpp-vector-bool]: [cppreference：`std::vector<bool>`](https://en.cppreference.com/w/cpp/container/vector_bool.html)——`std::vector<bool>` 为按位打包特化，返回代理对象而非原生引用；高频布尔查表常用 `std::uint8_t` 数组替代。

[^cpp-string-view]: [C++ 工作草案：字符串视图](https://eel.is/c++draft/string.view)——非拥有式只读视图，`substr` 仅调整指针与长度，延迟到合法分支才构造 `std::string`。
