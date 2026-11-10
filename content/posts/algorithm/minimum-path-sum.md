---
title: "最小路径和：网格累加极值与原地状态覆盖"
publishDate: "2026-11-05T18:00:00+08:00"
description: "LeetCode 64 最小路径和：从上方与左方的最优结果推导网格递推，比较二维数组、一维滚动与原地覆写的空间开销，并说明更新顺序和输入副作用。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 64. 最小路径和](https://leetcode.cn/problems/minimum-path-sum/)给定一个非负整数网格 `grid`，每次只能向下或向右移动，要求返回从左上角到右下角的最小路径和，起点与终点都计入。例如 `[[1, 3, 1], [1, 5, 1], [4, 2, 1]]` 的最优路径经过数值 `1 → 3 → 1 → 1 → 1`，总和为 7。

设网格有 $m$ 行、$n$ 列。题目保证 $1 \le m,n \le 200$，各行等长，单格数值在 0 到 200 之间。每条路径含 $m+n-1$ 个格子，路径和至多 $200(m+n-1) \le 79800$，以下 C++ 实现使用 32 位 `int` 足够。

与[《不同路径：网格 DAG 递推与组合数直接计算》](/posts/algorithm/unique-paths/)相比，移动规则相同，但这里要比较路径的累积权值，而不是累加路径条数。仅知道向下、向右各走多少步，无法确定经过哪些数值，因此不能直接用组合数求出最小和。

## 为什么按行递推

把格子看作节点，向右、向下的移动看作有向边。每步都使坐标和 $i+j$ 增加 1，因此图中没有环；逐行从左到右扫描时，一个格子的所有前驱都已处理。这也是 DAG 最短路径按拓扑序松弛的特例[^clrs-dag-sp]。若把进入格子的边权设为该格子的数值，并将起点距离设为 `grid[0][0]`，路径长度就等于题目要求的总和。这里无需优先队列；无环结构也意味着递推本身不依赖权值非负。

定义 $dp[i][j]$ 为从 $(0,0)$ 到格子 $(i,j)$ 的最小路径和。对于内部格子，最后一步只能来自上方或左方。若到达前驱的那一段不是最优路径，换成更小的前驱路径就能改善总和，因此：

$$
dp[i][j] = \min(dp[i-1][j],dp[i][j-1]) + grid[i][j], \qquad i>0,\ j>0.
$$

边界只有一种进入方向：

- 起点：$dp[0][0]=grid[0][0]$。
- 首行：$dp[0][j]=dp[0][j-1]+grid[0][j]$。
- 首列：$dp[i][0]=dp[i-1][0]+grid[i][0]$。

从起点初始化后，每次都从已确定的前驱求出当前最优值，扫描结束时返回 $dp[m-1][n-1]$。这与[《从调用栈理解递归》中的自底向上递推](/posts/understanding-recursion/#从记忆化到自底向上递推)采用同样的依赖顺序，不需要保留递归调用栈。

## Python：用独立数组保存结果

下面只读输入，另建二维列表保存路径和。空网格返回 0 是实现额外约定，题目本身保证非空：

```python
class Solution:
    def minPathSum(self, grid: list[list[int]]) -> int:
        if not grid or not grid[0]:
            return 0

        m, n = len(grid), len(grid[0])
        dp = [[0] * n for _ in range(m)]
        dp[0][0] = grid[0][0]

        # Boundary cells have only one predecessor.
        for j in range(1, n):
            dp[0][j] = dp[0][j - 1] + grid[0][j]
        for i in range(1, m):
            dp[i][0] = dp[i - 1][0] + grid[i][0]

        for i in range(1, m):
            for j in range(1, n):
                dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]

        return dp[m - 1][n - 1]
```

每个格子只做常数次读取、比较和加法，时间为 $O(mn)$，辅助数组占 $O(mn)$ 空间；返回数值占 $O(1)$ 空间。

## 空间压缩：保留一行，或覆写输入

计算内部格子时，只需要上方与左方的结果。可以采用两种存储方式：

- **一维滚动数组**：`dp[j]` 更新前是上一行同列的结果，`dp[j - 1]` 已是当前行左侧的结果。按列从左到右更新即可，辅助空间为 $O(n)$，不修改输入。
- **原地覆写**：若调用方允许修改网格，可直接把 `grid[i][j]` 改成到该格子的最小路径和，辅助空间为 $O(1)$。

原地版先累加首行、首列，再逐行处理内部格子。更新 `(i, j)` 时，上方与左方已经保存路径和，当前位置仍保存原权值；尚未处理的内部格子也保留原权值。后续转移需要的是当前格子的路径和，不再需要其原权值，因此覆盖不会破坏依赖。

调用结束后，网格已变成累积和矩阵，**本实现不负责恢复原始权值**。如果后续还要使用原输入，应选择独立数组或滚动数组。同一网格上的并发读写也需要调用方协调；`const` 引用只限制本函数的写入，不能阻止其他线程修改对象。

## C++：原地覆写

这版通过非常量引用修改输入，空网格的额外约定与 Python 版相同：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int minPathSum(std::vector<std::vector<int>>& grid) {
        if (grid.empty() || grid[0].empty()) {
            return 0;
        }

        const int m = static_cast<int>(grid.size());
        const int n = static_cast<int>(grid[0].size());

        for (int j = 1; j < n; ++j) {
            grid[0][j] += grid[0][j - 1];
        }
        for (int i = 1; i < m; ++i) {
            grid[i][0] += grid[i - 1][0];
        }

        // North and west hold path sums; the current cell still holds its weight.
        for (int i = 1; i < m; ++i) {
            for (int j = 1; j < n; ++j) {
                grid[i][j] += std::min(grid[i - 1][j], grid[i][j - 1]);
            }
        }

        return grid[m - 1][n - 1];
    }
};
```

`std::min` 比较两个值并返回较小者[^cpp-min]。整张网格只扫描一次，时间为 $O(mn)$，辅助空间为 $O(1)$。

## C++：一维滚动数组

若要保留输入，只需另分配一行状态。这里以 `const` 引用接收网格：

```cpp
#include <algorithm>
#include <vector>

class SolutionImmutable {
public:
    int minPathSum(const std::vector<std::vector<int>>& grid) {
        if (grid.empty() || grid[0].empty()) {
            return 0;
        }

        const int m = static_cast<int>(grid.size());
        const int n = static_cast<int>(grid[0].size());

        std::vector<int> dp(n);
        dp[0] = grid[0][0];
        for (int j = 1; j < n; ++j) {
            dp[j] = dp[j - 1] + grid[0][j];
        }

        for (int i = 1; i < m; ++i) {
            dp[0] += grid[i][0];
            for (int j = 1; j < n; ++j) {
                // dp[j] is from the previous row; dp[j - 1] is from this row.
                dp[j] = std::min(dp[j], dp[j - 1]) + grid[i][j];
            }
        }

        return dp[n - 1];
    }
};
```

时间仍为 $O(mn)$，辅助空间为 $O(n)$。这版与原地版的递推相同，区别是路径和保存在新数组还是调用方的网格中。

[《不同路径：网格 DAG 递推与组合数直接计算》](/posts/algorithm/unique-paths/)把两类前驱的路径数相加，本题则取两类前驱的最小和再加当前权值。两题的一维数组都必须从左到右更新，因为转移同时需要上一行同列和当前行左侧的状态。

[^clrs-dag-sp]: [Introduction to Algorithms (4th ed., Section 22.2)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——介绍 DAG 单源最短路径的拓扑序松弛算法；第三版对应第 24.2 节。

[^cpp-min]: [cppreference：`std::min`](https://en.cppreference.com/w/cpp/algorithm/min)——返回给定两个值中的较小者。
