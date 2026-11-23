---
title: "N 皇后：逐行放置与位掩码判冲突"
publishDate: "2026-11-25T12:00:00+08:00"
description: "LeetCode 51 N 皇后：按行递归并利用列与两条对角线的下标不变量实现常数时间冲突判定，进一步用位掩码与低位提取在 C++ 中压缩搜索开销。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 51. N 皇后](https://leetcode.cn/problems/n-queens/)（Hot 100，困难）要求将 `n` 个皇后放置在 $n \times n$ 的棋盘上，使得任意两个皇后都不能互相攻击（即不能处于同一行、同一列或同一条斜线上），返回所有不同的棋盘布局。每一种解法包含由 `'Q'` 和 `'.'` 构成的 $n$ 行字符串。题目保证 $1 \le n \le 9$。

## 从二维枚举到按行放置与常数冲突判定

由于棋盘共有 $n$ 行且每行至多放 1 个皇后，合法解必然满足**每行恰好放置 1 个皇后**。因此不需要在 $n^2$ 个格子里做组合搜索，只需按行号 `row` 从 `0` 到 `n - 1` 逐行递归，每一层只决定当前行的皇后放在哪一列 `col`。

如果每次尝试 `(row, col)` 都沿着上方所有行扫描棋盘检查是否冲突，单次校验需要 $O(n)$ 时间。借助坐标不变量，可以把冲突判定降到 $O(1)$：

1. **同一列**：列号 `col` 相同，范围 $0 \le \text{col} < n$。
2. **主对角线（左上到右下）**：沿该方向移动时行号与列号同步加 1，因此差值 $\text{row} - \text{col}$ 为定值，范围 $[-(n - 1), n - 1]$。加上偏移量 $n - 1$ 即可映射到下标 $[0, 2n - 2]$。
3. **副对角线（右上到左下）**：沿该方向移动时行号加 1、列号减 1，因此和值 $\text{row} + \text{col}$ 为定值，范围 $[0, 2n - 2]$。

**主对角线（`row - col` 相等）**

<div class="algorithm-table">

| `row \ col` | 0 | 1 | 2 | 3 |
| :---: | :---: | :---: | :---: | :---: |
| **0** | **0** | -1 | -2 | -3 |
| **1** | 1 | **0** | -1 | -2 |
| **2** | 2 | 1 | **0** | -1 |
| **3** | 3 | 2 | 1 | **0** |

</div>

**副对角线（`row + col` 相等）**

<div class="algorithm-table">

| `row \ col` | 0 | 1 | 2 | 3 |
| :---: | :---: | :---: | :---: | :---: |
| **0** | 0 | 1 | 2 | **3** |
| **1** | 1 | 2 | **3** | 4 |
| **2** | 2 | **3** | 4 | 5 |
| **3** | **3** | 4 | 5 | 6 |

</div>

只要分别维护三个布尔数组 `cols`、`diag1`（主对角线）、`diag2`（副对角线），进入下一行前将对应三条线的占用置为 `True`，回退时再置回 `False`，就能在 $O(1)$ 时间内过滤全部冲突位置，同时仅用一维数组 `queens[row] = col` 记录每行皇后的列位置，到达 `row == n` 时再一次性生成棋盘字符串。

## Python：三数组冲突追踪与延迟构造棋盘

```python
class Solution:
    def solveNQueens(self, n: int) -> list[list[str]]:
        # Time complexity: O(n!) upper bound for search + O(n^2 * S) for board materialization
        # Space complexity: O(n) auxiliary space (excluding output)
        cols = [False] * n
        diag1 = [False] * (2 * n - 1)  # row - col + (n - 1)
        diag2 = [False] * (2 * n - 1)  # row + col
        queens = [-1] * n
        result: list[list[str]] = []

        def backtrack(row: int) -> None:
            if row == n:
                board = [
                    "." * col + "Q" + "." * (n - 1 - col)
                    for col in queens
                ]
                result.append(board)
                return

            for col in range(n):
                d1 = row - col + n - 1
                d2 = row + col
                if cols[col] or diag1[d1] or diag2[d2]:
                    continue

                queens[row] = col
                cols[col] = diag1[d1] = diag2[d2] = True
                backtrack(row + 1)
                cols[col] = diag1[d1] = diag2[d2] = False

        backtrack(0)
        return result
```

延迟到 `row == n` 才按 `queens` 拼装字符串，避免了在无效中间分支上反复修改二维字符矩阵的开销。

## C++：位掩码状态传播与低位提取

在本题 $n \le 9$ 的规模下，每行只有不超过 9 个列位，完全可以把“列、主对角线、副对角线”在当前行的受攻击位置分别压缩进三个无符号整型位掩码 `cols`、`diag1`、`diag2` 中：

- 当前行所有**可安全放置**的列掩码为：

$$
\textit{available} = \textit{full} \mathbin{\&} \sim(\textit{cols} \mid \textit{diag1} \mid \textit{diag2}),
$$

其中 $\textit{full} = (1 \ll n) - 1$。

- 用 `lowbit = available & (~available + 1)` 每次直接提取最低位的合法列，省去遍历已被封锁的列；随后用 `available &= (available - 1)` 清除该位。
- 当在第 `row` 行选中比特位 `bit` 后，向下推进到 `row + 1` 行时：
  - 列占用变为 `cols | bit`；
  - 主对角线（向右下延伸）在下一行右移 1 位，变为 `(diag1 | bit) >> 1`（若列 0 对应最低位，则向列号增大方向移动对应左移 `(diag1 | bit) << 1`，只需保持与 `std::countr_zero` 的列号映射一致即可）；
  - 副对角线（向左下延伸）向相反方向移 1 位。

因为三个位掩码都是按值传递的局部整数，子调用返回后父帧的掩码天然保持原值，甚至**无需显式撤销占用标记**[^understanding-recursion]。

以下实现使用 C++20 `<bit>` 头文件中的 `std::countr_zero` 将单比特掩码直接转为列号[^cpp-countr-zero]：

```cpp
#include <bit>
#include <string>
#include <vector>

class Solution {
    void backtrack(int row,
                   int n,
                   unsigned int cols,
                   unsigned int diag1,
                   unsigned int diag2,
                   std::vector<int>& queens,
                   std::vector<std::vector<std::string>>& result) const {
        if (row == n) {
            std::vector<std::string> board(static_cast<std::size_t>(n),
                                           std::string(static_cast<std::size_t>(n), '.'));
            for (int r = 0; r < n; ++r) {
                board[r][queens[r]] = 'Q';
            }
            result.push_back(std::move(board));
            return;
        }

        const unsigned int full = (1u << n) - 1u;
        unsigned int available = full & ~(cols | diag1 | diag2);

        while (available != 0u) {
            // Isolate the lowest set bit representing a conflict-free column.
            const unsigned int bit = available & (~available + 1u);
            available &= (available - 1u);

            queens[row] = std::countr_zero(bit);
            // Bit i corresponds to column i:
            // - Main diagonal (col + 1 on next row) shifts left by 1.
            // - Anti-diagonal (col - 1 on next row) shifts right by 1.
            backtrack(row + 1,
                      n,
                      cols | bit,
                      (diag1 | bit) << 1u,
                      (diag2 | bit) >> 1u,
                      queens,
                      result);
        }
    }

public:
    std::vector<std::vector<std::string>> solveNQueens(int n) const {
        // Time complexity: O(n!) upper bound
        // Space complexity: O(n) auxiliary space (excluding output)
        std::vector<std::vector<std::string>> result;
        std::vector<int> queens(static_cast<std::size_t>(n), -1);
        backtrack(0, n, 0u, 0u, 0u, queens, result);
        return result;
    }
};
```

注意 `(diag1 | bit) << 1u` 可能在第 `n` 位及以上产生超出棋盘宽度的比特，但下一层计算 `available` 时会与 `full = (1u << n) - 1u` 按位与，自动屏蔽高位溢出；在 $n \le 9$ 且使用至少 32 位 `unsigned int` 时不会发生移位未定义行为。

## 复杂度分析与方案对比

- **时间复杂度**：按行放置且列不重复本身已经把搜索树限制在排列上界 $n!$ 之内，加上两条对角线的强约束，实际访问的节点数远小于 $n!$（例如 $n = 8$ 时 $8! = 40320$，但最终合法解只有 $S = 92$ 个）。每得到一个合法解，构造 $n \times n$ 棋盘耗时 $O(n^2)$，整体时间复杂度常记作 $O(n!)$（更精细地为搜索树访问节点数加 $O(n^2 \cdot S)$）。
- **辅助空间复杂度**：不含返回的所有棋盘时，布尔数组写法需 $O(n)$ 空间存放 `queens`、三个状态数组与深度为 $n$ 的调用栈；位掩码写法把三组状态压进三个整型寄存器参数，但调用栈与 `queens` 仍为 $O(n)$。

| 方案 | 单步冲突判定 | 遍历无冲突列 | 辅助空间（不含输出） | 特点 |
| :--- | :----------- | :----------- | :------------------- | :--- |
| 棋盘回溯扫描 | $O(n)$ | 逐列 $O(n)$ | $O(n^2)$ 或 $O(n)$ | 实现直接，但每层重复向上扫描 |
| 三布尔数组标记 | $O(1)$ | 逐列 $O(n)$ | $O(n)$ | 逻辑清晰，不依赖字长限制 |
| 位掩码 + 低位提取 | $O(1)$ | 仅跳过冲突列 | $O(n)$ | 常数极小，按值传参免显式回溯恢复 |

[^understanding-recursion]: [从调用栈理解递归：哪些状态需要显式恢复](/posts/understanding-recursion/#哪些状态需要显式恢复)——按值传递的局部整型参数随栈帧独立保存，返回后自然保持父层状态。

[^cpp-countr-zero]: [cppreference：`std::countr_zero`](https://en.cppreference.com/w/cpp/numeric/countr_zero.html)——C++20 `<bit>` 标准函数，统计无符号整数末尾连续 `0` 的个数，常映射为单条硬件指令。
