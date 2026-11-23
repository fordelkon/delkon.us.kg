---
title: "岛屿数量：四邻域遍历与原地标记"
publishDate: "2026-11-26T12:00:00+08:00"
description: "LeetCode 200 岛屿数量：将二维字符网格建模为隐式无向图求连通分量，阐明永久淹没标记与回溯撤销标记的本质差异，并解释网格 BFS 必须在入队时标记的防重不变式。"
tags: ["algorithm", "graph", "python", "cpp"]
---

[LeetCode 200. 岛屿数量](https://leetcode.cn/problems/number-of-islands/)（Hot 100）给定一个由 `'1'`（陆地）和 `'0'`（水）组成的 $m \times n$ 二维网格 `grid`，要求计算网格中岛屿的数量。岛屿由水平或竖直方向（四邻域）相邻的陆地连接而成，网格四条边外均视为水。题目保证 $1 \le m, n \le 300$。

把每个值为 `'1'` 的单元格视为一个顶点，把相邻陆地之间的四邻域关系视为无向边，整个网格就构成一张无需显式建邻接表的**隐式图**（implicit graph），岛屿数量恰好等于该无向图的**连通分量**（connected component）个数[^clrs-bfs]。

## 永久淹没与回溯撤销：两种网格标记的生命周期

在[《从调用栈理解递归》](/posts/understanding-recursion/#从树扩展到图时标记代表什么)中我们区分过图上两种截然不同的访问标记语义，放在二维网格上对比尤为清晰：

- 在[《单词搜索：网格路径回溯与原地标记》](/posts/algorithm/word-search/)中，标记表达的是“该单元格正处于当前匹配路径上”。如果当前分支匹配失败，返回时**必须撤销标记**，允许其他路径后续重新经过该格。
- 在本题中，只要某个陆地单元格已经归入某座已计数的岛屿，整次遍历都不应再重复访问它。因此只需在发现新陆地时将岛屿计数加 1，并通过广度优先搜索（BFS）或深度优先搜索（DFS）把整片连通陆地原地改写为 `'0'`（俗称“淹没”），**永不恢复**[^mit-dfs]。

### 为什么网格 BFS 必须在入队时标记？

在[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/posts/algorithm/binary-tree-level-order-traversal/)中，二叉树没有环且每个节点只有一个父节点，不存在从两条路径同时到达同一子节点的可能。但在网格图中，同一个格子最多有 4 个邻居，极易从不同前驱被重复发现。

考虑一个 $2 \times 2$ 全陆地网格：起点 `(0, 0)` 把 `(0, 1)` 和 `(1, 0)` 推入队列。如果等到**出队时**才把格子改成 `'0'`，那么 `(0, 1)` 出队时会把 `(1, 1)` 入队，紧接着 `(1, 0)` 出队时发现 `(1, 1)` 仍是 `'1'`，又会把 `(1, 1)` 再次入队。在更大的全 `'1'` 网格上，这种延迟标记会导致队列内出现大量重复坐标，时间与空间都急剧膨胀。

维持“队列中不会出现重复陆地”的**入队不变式**很简单：**在将陆地坐标压入队列的同一时刻，立即将 `grid[nr][nc]` 置为 `'0'`**。这样每个陆地格至多入队一次、出队一次。

## Python：迭代 BFS 避免深栈溢出

本题网格尺寸可达 $300 \times 300 = 9 \times 10^4$ 个单元格。如果陆地呈蛇形蜿蜒铺满整个网格，递归 DFS 的调用深度会达到 $O(m \cdot n)$，远超 CPython 默认的递归深度上限（通常为 1000）。改用基于 `collections.deque` 的迭代 BFS，可以在两端以均摊 $O(1)$ 时间推进探索前沿[^py-deque]，彻底绕开调用栈深度限制。

下面实现会原地将 `grid` 中的 `'1'` 改写为 `'0'`；如果调用方要求输入网格只读，可改用同等尺寸的布尔矩阵 `visited` 替代原地改写：

```python
from collections import deque


class Solution:
    def numIslands(self, grid: list[list[str]]) -> int:
        # Time complexity: O(m * n)
        # Space complexity: O(min(m, n)) auxiliary space for BFS queue
        rows, cols = len(grid), len(grid[0])
        islands = 0

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] != "1":
                    continue

                islands += 1
                # Mark as visited on enqueue to prevent duplicate frontier entries.
                grid[r][c] = "0"
                queue: deque[tuple[int, int]] = deque([(r, c)])

                while queue:
                    cr, cc = queue.popleft()
                    for nr, nc in ((cr - 1, cc), (cr + 1, cc), (cr, cc - 1), (cr, cc + 1)):
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1":
                            grid[nr][nc] = "0"
                            queue.append((nr, nc))

        return islands
```

## C++：队列扩展与四方向偏移表

C++ 版本同样采用 `std::queue` 执行迭代 BFS[^cpp-queue]，并用编译期 `std::array` 存放四方向偏移量[^cpp-array]，避免在 $m \cdot n$ 级单链网格上耗尽线程栈。函数直接就地淹没 `grid` 中的 `'1'` 单元格：

```cpp
#include <array>
#include <queue>
#include <utility>
#include <vector>

class Solution {
public:
    int numIslands(std::vector<std::vector<char>>& grid) const {
        // Time complexity: O(m * n)
        // Space complexity: O(min(m, n)) auxiliary space for BFS queue
        const int rows = static_cast<int>(grid.size());
        const int cols = static_cast<int>(grid[0].size());
        constexpr std::array<std::pair<int, int>, 4> kDirs = {
            {{-1, 0}, {1, 0}, {0, -1}, {0, 1}}
        };

        int islands = 0;
        std::queue<std::pair<int, int>> q;

        for (int r = 0; r < rows; ++r) {
            for (int c = 0; c < cols; ++c) {
                if (grid[r][c] != '1') {
                    continue;
                }

                ++islands;
                // Sink immediately upon discovery so no cell is enqueued twice.
                grid[r][c] = '0';
                q.emplace(r, c);

                while (!q.empty()) {
                    const auto [cr, cc] = q.front();
                    q.pop();

                    for (const auto [dr, dc] : kDirs) {
                        const int nr = cr + dr;
                        const int nc = cc + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                            grid[nr][nc] == '1') {
                            grid[nr][nc] = '0';
                            q.emplace(nr, nc);
                        }
                    }
                }
            }
        }

        return islands;
    }
};
```

## 复杂度分析与方案对比

每个单元格在外层双重循环中被检查一次，且每块陆地至多入队一次、检查 4 个邻居一次，因此总时间复杂度为 $O(m \cdot n)$。

在空间上，原地淹没省去了 $O(m \cdot n)$ 的独立访问矩阵，峰值辅助空间取决于队列中同时驻留的前沿节点数。在全为 `'1'` 的矩形网格上，BFS 波前沿对角线推进，单层前沿宽度至多为 $\min(m, n) + 1$，因此迭代 BFS 的峰值辅助空间为 $O(\min(m, n))$——这比递归或显式栈 DFS 最坏 $O(m \cdot n)$ 的路径深度空间更省内存。

| 方案 | 时间复杂度 | 辅助空间（原地修改） | 栈溢出风险 | 适用场景 |
| :--- | :--------- | :------------------- | :--------- | :------- |
| 迭代 BFS（本文） | $O(m \cdot n)$ | $O(\min(m, n))$ | 无 | 静态网格连通块计数，内存最稳健 |
| 递归 DFS | $O(m \cdot n)$ | $O(m \cdot n)$ | 大网格蛇形路径可能爆栈 | 小规模网格或代码追求极简 |
| 并查集（Union-Find） | $O(m \cdot n \cdot \alpha(m \cdot n))$ | $O(m \cdot n)$ | 无 | 需要支持动态加陆地查询（如 LeetCode 305） |

本题是对每个连通分量分别启动一次单源 BFS；如果题目要求多个起点**同时**向外扩散并计算到达所有可达节点的最短步数，则演进为多源分层扩散，见[《腐烂的橘子：多源 BFS 与按层计时》](/posts/algorithm/rotting-oranges/)。

[^clrs-bfs]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 20.2 节介绍广度优先搜索与无向图连通性遍历。

[^mit-dfs]: [MIT 6.006，Lecture 14: Depth-First Search (DFS), Topological Sort](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-14-depth-first-search-dfs-topological-sort/)——说明图可达性遍历中访问标记在整个遍历期内保留，避免重复探索同一连通分量。

[^py-deque]: [Python 文档：`collections.deque`](https://docs.python.org/3/library/collections.html#collections.deque)——支持两端均摊 $O(1)$ 的 `append()` 与 `popleft()`，适合作为 BFS 探索前沿队列。

[^cpp-queue]: [cppreference：`std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——先进先出容器适配器，提供常数时间的队首弹出与队尾入队。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——编译期固定长度数组，用于存储四邻域方向偏移量。
