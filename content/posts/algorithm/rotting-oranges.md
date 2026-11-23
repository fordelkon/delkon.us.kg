---
title: "腐烂的橘子：多源 BFS 与按层计时"
publishDate: "2026-11-27T12:00:00+08:00"
description: "LeetCode 994 腐烂的橘子：将多个初始腐烂源合并入队执行多源分层 BFS，复用层序快照记录扩散分钟数，并用剩余新鲜计数消除末尾多算一分钟的边界误差。"
tags: ["algorithm", "graph", "python", "cpp"]
---

[LeetCode 994. 腐烂的橘子](https://leetcode.cn/problems/rotting-oranges/)（Hot 100）给定一个 $m \times n$ 网格 `grid`，每个单元格的值为 `0`（空格）、`1`（新鲜橘子）或 `2`（腐烂橘子）。每经过 1 分钟，任何与腐烂橘子四邻域相邻的新鲜橘子都会腐烂。要求返回直到网格中没有新鲜橘子为止所经过的**最小分钟数**；如果不可能让全部新鲜橘子腐烂，返回 `-1`。题目保证 $1 \le m, n \le 10$。

## 从单源遍历到多源同步扩散

在[《岛屿数量：四邻域遍历与原地标记》](/posts/algorithm/number-of-islands/)中，我们每发现一个未访问陆地就单独开启一次 BFS，只关心连通性而不关心距离。本题则要求计算**所有腐烂橘子同时向外扩散**时，最后一个被感染的新鲜橘子的最短到达时间。

在无权图中，广度优先搜索按距离起点由近到远的顺序逐层访问顶点[^clrs-bfs]。当存在多个初始腐烂源 $s_1, s_2, \dots, s_k$ 时，不需要对每个源分别跑 BFS 再取每个格子的最小值；只需在搜索开始前把**全部初始腐烂橘子一次性放入同一个队列**，即可等价地看作在图外引入一个虚拟超级源点 $S$，向每个 $s_i$ 连一条权为 0 的边。

随后，直接复用[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/posts/algorithm/binary-tree-level-order-traversal/)中的**层级长度快照**模式：每轮外层循环开始时记录 `level_size = len(queue)`，固定弹出这一批同一分钟内刚腐烂的橘子，将它们感染的新鲜邻居原地标记为 `2` 并压入队尾，整批处理完毕恰好对应时间推进 1 分钟。

### 两个易错边界：初始无新鲜橘子与末尾多算一分钟

写多源 BFS 时，最容易出错的不是扩散本身，而是分钟数的边界计数：

1. **初始就没有新鲜橘子**：例如 `grid = [[0]]` 或 `grid = [[2]]`。此时不需要经过任何时间，答案应为 `0`。
2. **最后一层出队后不应再加 1 分钟**：考虑最小反例 `grid = [[2, 1]]`。第 0 分钟队列中只有 `(0, 0)`；第 1 轮循环将其弹出并感染 `(0, 1)`，此时网格中已无新鲜橘子，答案是 `1`。如果外层循环条件只写 `while queue:`，那么 `(0, 1)` 仍会触发第 2 轮循环（虽然它没有新邻居可感染），把分钟数错误地多加 1 变成 `2`。

维护一个全局计数器 `fresh`（初始统计网格中 `1` 的总数），每次把新鲜橘子变成 `2` 时立刻执行 `fresh -= 1`，并将外层循环条件写作 **`while queue and fresh > 0:`**，就能同时干净地解决上述两个边界：

- 初始 `fresh == 0` 时循环直接跳过，返回 `0`；
- 最后一个新鲜橘子在第 $t$ 分钟被感染并入队后，`fresh` 归零，下一轮循环立即停止，不会再多计一分钟；
- 循环结束后若 `fresh > 0`，说明存在被空格隔绝的新鲜橘子，返回 `-1`。

## Python：多源队列与 `fresh` 守卫循环

实现会在原地将感染的单元格由 `1` 改为 `2`；与[《岛屿数量：四邻域遍历与原地标记》](/posts/algorithm/number-of-islands/)一致，必须在**入队瞬间**完成状态改写，防止同一新鲜橘子在同一分钟被两个相邻腐烂橘子重复入队并重复扣减 `fresh`[^py-deque]：

```python
from collections import deque


class Solution:
    def orangesRotting(self, grid: list[list[int]]) -> int:
        # Time complexity: O(m * n)
        # Space complexity: O(m * n) auxiliary space for BFS queue
        rows, cols = len(grid), len(grid[0])
        queue: deque[tuple[int, int]] = deque()
        fresh = 0

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == 2:
                    queue.append((r, c))
                elif grid[r][c] == 1:
                    fresh += 1

        minutes = 0
        # Stop as soon as no fresh oranges remain to avoid counting a trailing empty wave.
        while queue and fresh > 0:
            level_size = len(queue)
            for _ in range(level_size):
                cr, cc = queue.popleft()
                for nr, nc in ((cr - 1, cc), (cr + 1, cc), (cr, cc - 1), (cr, cc + 1)):
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                        grid[nr][nc] = 2
                        fresh -= 1
                        queue.append((nr, nc))
            minutes += 1

        return minutes if fresh == 0 else -1
```

## C++：按层快照与原地扩散

C++ 版本使用 `std::queue`[^cpp-queue] 和静态四方向数组 `std::array`[^cpp-array]，同样在扫描初始化阶段收集全部初始腐烂源并统计 `fresh`：

```cpp
#include <array>
#include <cstddef>
#include <queue>
#include <utility>
#include <vector>

class Solution {
public:
    int orangesRotting(std::vector<std::vector<int>>& grid) const {
        // Time complexity: O(m * n)
        // Space complexity: O(m * n) auxiliary space for BFS queue
        const int rows = static_cast<int>(grid.size());
        const int cols = static_cast<int>(grid[0].size());
        constexpr std::array<std::pair<int, int>, 4> kDirs = {
            {{-1, 0}, {1, 0}, {0, -1}, {0, 1}}
        };

        std::queue<std::pair<int, int>> q;
        int fresh = 0;

        for (int r = 0; r < rows; ++r) {
            for (int c = 0; c < cols; ++c) {
                if (grid[r][c] == 2) {
                    q.emplace(r, c);
                } else if (grid[r][c] == 1) {
                    ++fresh;
                }
            }
        }

        int minutes = 0;
        while (!q.empty() && fresh > 0) {
            const std::size_t level_size = q.size();
            for (std::size_t i = 0; i < level_size; ++i) {
                const auto [cr, cc] = q.front();
                q.pop();

                for (const auto [dr, dc] : kDirs) {
                    const int nr = cr + dr;
                    const int nc = cc + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                        grid[nr][nc] == 1) {
                        grid[nr][nc] = 2;
                        --fresh;
                        q.emplace(nr, nc);
                    }
                }
            }
            ++minutes;
        }

        return fresh == 0 ? minutes : -1;
    }
};
```

## 复杂度分析与相关算法对照

初始化扫描访问全部 $m \cdot n$ 个单元格；在 BFS 过程中，每个橘子至多入队一次、出队一次，并检查常数个（4 个）邻居，因此总时间复杂度为 $O(m \cdot n)$。最坏情况下（例如网格几乎全为初始腐烂橘子），队列初始即容纳 $O(m \cdot n)$ 个坐标，辅助空间复杂度为 $O(m \cdot n)$。

把本题与同系列另外两道基于队列的算法放在一起对照，可以看到“多源入队 + 分层推进”如何在不同图结构上复用：

| 题目 | 初始入队集合 | 触发邻居入队的条件 | 队列层次含义 |
| :--- | :----------- | :----------------- | :----------- |
| [二叉树的层序遍历](/posts/algorithm/binary-tree-level-order-traversal/) | 单一根节点 `root` | 左右孩子非空 | 节点深度 $d$ |
| 腐烂的橘子（本题） | 所有初始腐烂格（`grid == 2`） | 四邻域存在新鲜格（`grid == 1`） | 同步扩散分钟数 $t$ |
| [课程表（Kahn 算法）](/posts/algorithm/course-schedule/) | 所有入度为 0 的课程节点 | 删除前驱边后邻居入度恰好降为 0 | 可并行修读的学期轮次 |

[^clrs-bfs]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 20.2 节证明了无权图上广度优先搜索计算出的层数即最短路径距离；多源同时入队等价于引入虚拟超级源点。

[^py-deque]: [Python 文档：`collections.deque`](https://docs.python.org/3/library/collections.html#collections.deque)——支持两端常数时间队列操作。

[^cpp-queue]: [cppreference：`std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——先进先出队列适配器，配合 `size()` 快照按层弹出。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——用于存放编译期定长四邻域偏移表。
