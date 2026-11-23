---
title: "括号生成：用左右括号计数剪枝"
publishDate: "2026-11-22T12:00:00+08:00"
description: "LeetCode 22 括号生成：用左右括号计数维持前缀合法不变式，在构造阶段直接剪除所有非法前缀，分析卡特兰数规模边界并对比 Python 与 C++ 实现。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 22. 括号生成](https://leetcode.cn/problems/generate-parentheses/)（Hot 100）给定代表生成括号对数的整数 `n`，要求生成所有可能并且**有效**的括号组合。例如 `n = 3` 时返回 `["((()))", "(()())", "(())()", "()(())", "()()()"]`。题目保证 $1 \le n \le 8$。

## 把合法性校验前置为构造不变式

在[《最长有效括号：前驱配对回溯、显式栈与双向扫描》](/posts/algorithm/longest-valid-parentheses/)中我们指出，一个长度为 $2n$ 的括号串有效，当且仅当同时满足两个条件：

1. 左右括号总数均为 $n$；
2. 任意前缀中的右括号数都不超过左括号数。

如果先枚举全部 $2^{2n}$ 个长度为 $2n$ 的括号串、到达叶子后再逐个验证，不仅浪费大量分支，在 $n = 8$ 时需要展开 $2^{16} = 65536$ 个叶子，而真正有效的组合只有 1430 个。

将上述两个条件直接转化为回溯过程中的**前置构造不变式**，就能在每一步只走向必然能补全为有效串的分支：记当前路径已放入 `open_count` 个 `'('` 和 `close_count` 个 `')'`，则：

- 只要 `open_count < n`，就可以追加一个 `'('`；
- 只要 `close_count < open_count`，就可以追加一个 `')'`。

可以验证，沿着这两条规则构造出的任意前缀，其剩余左括号数为 $n - \text{open\_count} \ge 0$，剩余右括号数始终不少于剩余左括号数，因此**每一个中间节点都必然至少能延伸出一个合法完整解**——搜索树上不存在任何一条死路。

```mermaid title="括号生成的前缀剪枝搜索树（n = 2）" description="以 n = 2 为例，节点给出括号前缀及已用的左右括号数，边标签表示追加的括号。两条虚线红框分支分别示范右括号超前（右 > 左）与左括号超限（左 > n）时的剪枝，最终得到 (()) 和 ()()。"
flowchart TB
 root["ε · (0,0)"] -->|"+("| first["( · (1,0)"]
 root -.->|"+)"| pruneR["✗ ) · 剪枝(右 > 左)"]
 first -->|"+("| left["(( · (2,0)"]
 first -->|"+)"| right["() · (1,1)"]
 left -.->|"+("| pruneL["✗ ((( · 剪枝(左 > n)"]
 left -->|"+)"| inner["(() · (2,1)"] -->|"+)"| nested["(()) · (2,2)"]
 right -->|"+("| open["()( · (2,1)"] -->|"+)"| adjacent["()() · (2,2)"]
 class root actor
 class first,left,right,inner,open state
 class nested,adjacent result
 class pruneR,pruneL risk
```

## Python：共享列表缓冲与双计数回溯

与[《电话号码的字母组合：按数字位回溯》](/posts/algorithm/letter-combinations-of-a-phone-number/)一样，用可变的字符列表 `path` 承接当前构造前缀，到达长度 $2n$ 时再通过 `"".join(path)` 生成不可变结果字符串[^python-str]：

```python
class Solution:
    def generateParenthesis(self, n: int) -> list[str]:
        # Time complexity: O(n * C_n), where C_n is the n-th Catalan number
        # Space complexity: O(n) auxiliary space (excluding output)
        result: list[str] = []
        path: list[str] = []

        def backtrack(open_count: int, close_count: int) -> None:
            if len(path) == 2 * n:
                result.append("".join(path))
                return

            # Invariant: open_count <= n and close_count <= open_count at every prefix.
            if open_count < n:
                path.append("(")
                backtrack(open_count + 1, close_count)
                path.pop()

            if close_count < open_count:
                path.append(")")
                backtrack(open_count, close_count + 1)
                path.pop()

        backtrack(0, 0)
        return result
```

## C++：定长字符缓冲按位覆写

由于所有有效括号串的长度恒为 $2n$，当前写入位置恰好等于 `open_count + close_count`。在 C++ 中可以预先分配长度为 $2n$ 的 `std::string path(2 * n, '\0')`，按位覆写 `path[pos]`，省去 `push_back` 与 `pop_back` 的长度维护[^cpp-string]：

```cpp
#include <string>
#include <vector>

class Solution {
    void backtrack(int n,
                   int open_count,
                   int close_count,
                   std::string& path,
                   std::vector<std::string>& result) const {
        const int pos = open_count + close_count;
        if (pos == 2 * n) {
            result.push_back(path);
            return;
        }

        if (open_count < n) {
            path[pos] = '(';
            backtrack(n, open_count + 1, close_count, path, result);
        }

        if (close_count < open_count) {
            path[pos] = ')';
            backtrack(n, open_count, close_count + 1, path, result);
        }
    }

public:
    std::vector<std::string> generateParenthesis(int n) const {
        // Time complexity: O(n * C_n), where C_n is the n-th Catalan number
        // Space complexity: O(n) auxiliary space (excluding output)
        std::vector<std::string> result;
        std::string path(static_cast<std::size_t>(2 * n), '\0');
        backtrack(n, 0, 0, path, result);
        return result;
    }
};
```

注意两个 `if` 分支并不是互斥的：当 `open_count < n` 且 `close_count < open_count` 同时成立时，会先尝试在 `path[pos]` 填入 `'('` 并探索其整棵子树，返回后再在同一位置 `path[pos]` 覆写为 `')'` 探索另一棵子树。父层只依赖 `[0, pos - 1]` 的前缀字符，因此无需额外的恢复语句。

## 复杂度分析：卡特兰数与闭合分解对比

$n$ 对有效括号的总数恰好是第 $n$ 个**卡特兰数**（Catalan number）[^clrs-catalan]：

$$
C_n = \frac{1}{n + 1}\binom{2n}{n} \sim \frac{4^n}{n^{3/2}\sqrt{\pi}}.
$$

- **时间复杂度**：共有 $C_n$ 个叶子，每个叶子拷贝长度为 $2n$ 的字符串耗时 $O(n)$；由于搜索树中每个内部节点至少能到达一个叶子，且树高为 $2n$，总节点数受 $O(n \cdot C_n)$ 约束，整体时间复杂度为 $O\!\left(\frac{4^n}{\sqrt{n}}\right)$。
- **辅助空间复杂度**：不含返回结果数组时，最大递归深度为 $2n$，共享缓冲区长度为 $2n$，辅助空间为 $O(n)$。

本题也存在按**首对括号闭合结构**递推的动态规划写法：任意非空有效括号串都可唯一拆分为 `"(" + A + ")" + B`，其中 `A` 含 $p$ 对括号、`B` 含 $n - 1 - p$ 对括号（$0 \le p \le n - 1$）。但该递推需要缓存 $0$ 到 $n - 1$ 全部中间规模的字符串集合，辅助空间随卡特兰数指数增长；回溯剪枝则在保持最优时间量级的同时，把辅助空间压到了线性 $O(n)$。

| 方案 | 时间复杂度 | 辅助空间（不含输出） | 核心机制 |
| :--- | :--------- | :------------------- | :------- |
| 朴素枚举 + 事后校验 | $O(n \cdot 4^n)$ | $O(n)$ | 生成全部 $2^{2n}$ 个串后逐个验证平衡性 |
| 前缀计数剪枝回溯 | $O(n \cdot C_n) = O(4^n / \sqrt{n})$ | $O(n)$ | 维持 `close <= open <= n` 不变式，零死路展开 |
| 闭合分解递推 DP | $O(n \cdot C_n)$ | $O(n \cdot C_{n-1})$ | 按 `"(A)B"` 组合较小规模的已生成结果集 |

[^python-str]: [Python 文档：Text Sequence Type — `str`](https://docs.python.org/3/library/stdtypes.html#text-sequence-type-str)——在叶子处一次性 `"".join(path)`，避免递归中反复拼接不可变字符串。

[^cpp-string]: [cppreference：`std::basic_string`](https://en.cppreference.com/w/cpp/string/basic_string.html)——支持预分配固定长度缓冲区并按索引常数时间覆写。

[^clrs-catalan]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——Problem 12-4 讨论卡特兰数 $\frac{1}{n+1}\binom{2n}{n}$ 及其渐近增长阶 $\Theta(4^n / n^{3/2})$。
