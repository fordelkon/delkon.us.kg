---
title: "单词搜索：网格路径回溯与原地标记"
publishDate: "2026-11-23T12:00:00+08:00"
description: "LeetCode 79 单词搜索：在二维字符网格中执行四方向回溯搜索，用原地哨兵字符替代独立访问矩阵，并结合字符频次检查与首尾频次翻转实现提前剪枝。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 79. 单词搜索](https://leetcode.cn/problems/word-search/)（Hot 100）给定一个 $m \times n$ 的二维字符网格 `board` 和一个字符串单词 `word`，判断 `word` 是否存在于网格中。单词必须按字母顺序通过相邻（水平或垂直）单元格内的字母构成，且**同一个单元格内的字母不允许被重复使用**。题目保证 $1 \le m, n \le 6$，$1 \le \lvert\text{word}\rvert \le 15$，字符仅含大小写英文字母。

## 图可达性遍历与网格路径回溯的区别

在[《从调用栈理解递归》](/posts/understanding-recursion/#从树扩展到图时标记代表什么)中我们区分过两类图上访问标记：

- **全局可达性搜索**（如岛屿数量）：访问标记在探索完一个分支后**保留不撤销**，因为目标只是让每个可达格子被访问一次。
- **简单路径回溯**（本题）：标记的含义是“该单元格当前正位于正在匹配的单词前缀路径中”。如果从 `(r, c)` 沿某条路径未能匹配完整个 `word`，回退时**必须撤销该格子的占用标记**，因为另一条路径可能在不同步数上重新经过它。

由于只需判断**是否存在**至少一条合法路径，一旦某条分支匹配到 `word` 的最后一个字符，就可以立刻向上短路返回 `True`，无需继续遍历剩余方向或起点。

### 原地哨兵占位与前置剪枝

为了省去额外的 $m \times n$ 布尔数组 `visited`，进入单元格 `(r, c)` 时，可以先用局部变量 `saved = board[r][c]` 暂存原字母，把 `board[r][c]` 临时改写为非字母哨兵字符（如 `'#'` 或 `'\0'`）；四方向递归结束后，无论结果是成功还是失败，都把 `board[r][c]` 恢复为 `saved`，保证函数退出时网格完好无损。

在此基础上，还有两项零复杂度的前置剪枝在极端用例（如大量重复前缀字符的网格）中效果非常显著：

1. **字符频次与长度检查**：若 `len(word) > m * n`，或 `word` 中任意字符的出现次数超过网格中该字符的总数，直接返回 `False`。
2. **首尾稀缺度翻转**：单词从前向后搜与从后向前搜完全等价。如果 `word[-1]` 在网格中的出现次数严格少于 `word[0]`，将 `word` 翻转后再搜索，可以显著减少入口起点数量与浅层分支爆炸。

## Python：频次剪枝与原地回溯

```python
from collections import Counter


class Solution:
    def exist(self, board: list[list[str]], word: str) -> bool:
        # Time complexity: O(m * n * 3^L), where L = len(word)
        # Space complexity: O(L) auxiliary space for recursion stack (plus O(A) counter)
        rows, cols = len(board), len(board[0])
        word_len = len(word)
        if word_len > rows * cols:
            return False

        # Pre-check character supply before starting DFS.
        board_counts = Counter(ch for row in board for ch in row)
        word_counts = Counter(word)
        if any(word_counts[ch] > board_counts[ch] for ch in word_counts):
            return False

        # Start from the rarer endpoint to minimize root branching.
        if board_counts[word[-1]] < board_counts[word[0]]:
            word = word[::-1]

        def dfs(r: int, c: int, idx: int) -> bool:
            if board[r][c] != word[idx]:
                return False
            if idx == word_len - 1:
                return True

            # Mark cell as occupied in-place using a non-letter sentinel.
            saved = board[r][c]
            board[r][c] = "#"

            found = (
                (r > 0 and dfs(r - 1, c, idx + 1))
                or (r + 1 < rows and dfs(r + 1, c, idx + 1))
                or (c > 0 and dfs(r, c - 1, idx + 1))
                or (c + 1 < cols and dfs(r, c + 1, idx + 1))
            )

            # Always restore the cell before returning to preserve the input grid.
            board[r][c] = saved
            return found

        for r in range(rows):
            for c in range(cols):
                if dfs(r, c, 0):
                    return True
        return False
```

注意 `if idx == word_len - 1: return True` 放在 `board[r][c] != word[idx]` 之后：这样只要当前格子匹配最后一个字符就立刻返回，不需要再向外越界发起一层空递归，也自然兼容了单字符网格与单字符 `word`（例如 `board = [["a"]]`、`word = "a"`）的边界情况。

## C++：静态频次表与零堆分配搜索

由于字符仅包含 ASCII 大小写字母，C++ 可以用固定长度 `std::array<int, 128>` 统计频次，避免哈希表分配[^cpp-array]。同时在 `dfs` 返回前始终恢复 `board[r][c]`，保持输入矩阵的原始状态：

```cpp
#include <algorithm>
#include <array>
#include <string>
#include <vector>

class Solution {
    bool dfs(std::vector<std::vector<char>>& board,
             const std::string& word,
             int r,
             int c,
             int idx) const {
        if (board[r][c] != word[idx]) {
            return false;
        }
        if (idx + 1 == static_cast<int>(word.size())) {
            return true;
        }

        const int rows = static_cast<int>(board.size());
        const int cols = static_cast<int>(board[0].size());
        const char saved = board[r][c];
        board[r][c] = '\0';

        const bool found =
            (r > 0 && dfs(board, word, r - 1, c, idx + 1)) ||
            (r + 1 < rows && dfs(board, word, r + 1, c, idx + 1)) ||
            (c > 0 && dfs(board, word, r, c - 1, idx + 1)) ||
            (c + 1 < cols && dfs(board, word, r, c + 1, idx + 1));

        // Restore original character even when a match is found.
        board[r][c] = saved;
        return found;
    }

public:
    bool exist(std::vector<std::vector<char>>& board, std::string word) const {
        // Time complexity: O(m * n * 3^L), where L = word.size()
        // Space complexity: O(L) auxiliary space (recursion stack)
        const int rows = static_cast<int>(board.size());
        const int cols = static_cast<int>(board[0].size());
        if (static_cast<int>(word.size()) > rows * cols) {
            return false;
        }

        std::array<int, 128> board_counts{};
        for (const auto& row : board) {
            for (char ch : row) {
                ++board_counts[static_cast<unsigned char>(ch)];
            }
        }

        std::array<int, 128> word_counts{};
        for (char ch : word) {
            const auto code = static_cast<unsigned char>(ch);
            if (++word_counts[code] > board_counts[code]) {
                return false;
            }
        }

        if (board_counts[static_cast<unsigned char>(word.back())] <
            board_counts[static_cast<unsigned char>(word.front())]) {
            std::reverse(word.begin(), word.end());
        }

        for (int r = 0; r < rows; ++r) {
            for (int c = 0; c < cols; ++c) {
                if (dfs(board, word, r, c, 0)) {
                    return true;
                }
            }
        }
        return false;
    }
};
```

## 复杂度分析与方案对比

设网格尺寸为 $m \times n$，单词长度为 $L = \lvert\text{word}\rvert$。

- **时间复杂度**：外层最多遍历 $m \cdot n$ 个起点。从任一起点出发，第一步最多有 4 个方向，此后每一步由于不能走回刚刚进入的父单元格（已被标记为哨兵），最多只有 3 个有效延伸方向，递归深度至多为 $L$，因此最坏时间复杂度为 $O(m \cdot n \cdot 3^L)$。前置频次统计耗时 $O(m \cdot n + L)$，不改变最坏渐进上界，但在无解或高重复网格中能剪除绝大部分分支。
- **辅助空间复杂度**：原地占位省去了 $O(m \cdot n)$ 的访问矩阵；递归栈最大深度为 $\min(L, m \cdot n)$，字母频次表大小为常数（ASCII 大小写字母至多 52 种），整体辅助空间为 $O(L)$。如果调用方要求 `board` 严格只读（不可临时改写），则需改用独立的布尔矩阵 `visited`，辅助空间变为 $O(m \cdot n + L)$。

| 标记方式 | 时间复杂度 | 辅助空间复杂度 | 是否临时修改网格 | 适用场景 |
| :--- | :--------- | :------------- | :--------------- | :------- |
| 原地哨兵占位 | $O(m \cdot n \cdot 3^L)$ | $O(L)$ | 是（返回前恢复） | 单线程可变网格，追求最低辅助空间 |
| 独立 `visited` 矩阵 | $O(m \cdot n \cdot 3^L)$ | $O(m \cdot n + L)$ | 否 | 只读输入或多线程并发查询同一网格 |

若题目进一步要求在同一个网格中同时检索**成千上万个单词**（LeetCode 212 单词搜索 II），逐词重启网格 DFS 会重复扫描公共前缀；此时可以把所有目标单词插入前缀树（Trie），沿网格走一步同步在前缀树上推进一层，在单次网格遍历中批量匹配。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——定长栈上数组，用于 ASCII 字符频次统计时无动态内存分配开销。
