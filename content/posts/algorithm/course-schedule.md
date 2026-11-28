---
title: "课程表：入度拓扑排序与三色 DFS 判环"
publishDate: "2026-11-28T12:00:00+08:00"
description: "LeetCode 207 课程表：将先修依赖建模为有向图判环问题，对比基于入度队列的 Kahn 拓扑排序与三色标记 DFS，解释二值访问标记在有向菱形图上失效的原因。"
tags: ["algorithm", "graph", "python", "cpp"]
---

[LeetCode 207. 课程表](https://leetcode.cn/problems/course-schedule/)（Hot 100）给定课程总数 `numCourses`（编号为 `0` 到 `numCourses - 1`）以及先修依赖列表 `prerequisites`，其中每项 `[a, b]` 表示修读课程 `a` 之前必须先完成课程 `b`。要求判断是否可能完成所有课程的学习。题目保证 $1 \le \text{numCourses} \le 2000$，$0 \le \lvert\text{prerequisites}\rvert \le 5000$，且 `prerequisites` 中的依赖对互不重复。

把每门课程看作顶点，把先修关系 `[a, b]` 连成一条有向边 $b \to a$（读作“`b` 指向依赖它的 `a`”）。所有课程能够修完，当且仅当这张有向图存在**拓扑排序**（topological sort）——而一个有限有向图存在拓扑排序，当且仅当它是**有向无环图**（directed acyclic graph, DAG），不包含任何有向环[^clrs-topo]。这也正是[《从调用栈理解递归》](/posts/understanding-recursion/#记忆化复用重复子问题的结果)中强调“状态依赖必须无环”在图论上的直接表述。

例如，课程 1 和 2 都要求先修课程 0，课程 3 又同时要求修完 1 和 2：初始只有 0 的入度为零；修完 1 时 3 还剩一条入边，修完 2 才会把 3 解锁。

## 方案一：Kahn 算法与入度多源队列（Python）

入度（indegree）为 0 的课程没有任何未完成的先修要求，可以直接修读[^kahn-1962]。每修完一门入度为 0 的课程 `u`，就相当于把 `u` 连向后续课程 `v` 的有向边删去，使 `indegree[v]` 减 1；一旦某个 `v` 的入度恰好降为 0，说明它的所有先修课程都已满足，即可加入可修队列。

从队列机制上看，Kahn 算法与[《腐烂的橘子：多源 BFS 与按层计时》](/posts/algorithm/rotting-oranges/)完全同构：初始把所有入度为 0 的节点一次性推入队列作为多源起点，不断弹出并触发邻居状态变化。区别在于橘子扩散只要相邻就感染，而课程表必须等**全部**前驱都完成后（入度归零）才能解锁。

若最终出队完成的课程数 `taken == numCourses`，说明整张图被完全剥离，不存在环；否则剩余未入队的节点必然陷入至少一个有向环的互相等待中（它们的入度永远大于 0）。

```python
from collections import deque


class Solution:
    def canFinish(self, numCourses: int, prerequisites: list[list[int]]) -> bool:
        # Time complexity: O(V + E), where V = numCourses and E = len(prerequisites)
        # Space complexity: O(V + E) auxiliary space for adjacency list, indegree, and queue
        adj: list[list[int]] = [[] for _ in range(numCourses)]
        indegree = [0] * numCourses

        for course, prereq in prerequisites:
            adj[prereq].append(course)
            indegree[course] += 1

        # Enqueue every course with no unmet prerequisites as an initial frontier.
        queue: deque[int] = deque(i for i in range(numCourses) if indegree[i] == 0)
        taken = 0

        while queue:
            u = queue.popleft()
            taken += 1
            for v in adj[u]:
                indegree[v] -= 1
                if indegree[v] == 0:
                    queue.append(v)

        return taken == numCourses
```

## 方案二：三色标记 DFS 判环（C++）

如果不使用入度队列，也可以直接用深度优先搜索检测有向图是否存在**后向边**（back edge）——即从当前正在探索的节点指向其递归调用栈上某个祖先节点的边[^mit-dfs]。

### 为什么二值 `visited` 在有向图判环中会误判？

在[《岛屿数量：四邻域遍历与原地标记》](/posts/algorithm/number-of-islands/)中，布尔值“未访问 / 已访问”就足够了；但在有向图判环里，二值标记会把**无环汇聚（菱形图）**误判成环。考虑四节点有向无环图：`0 -> 1`、`0 -> 2`、`1 -> 3`、`2 -> 3`。DFS 从 `0` 经 `1` 到达 `3` 并返回后，再从 `0` 经 `2` 再次看到 `3`——此时 `3` 确实已经访问过，但 `3` 早已离开当前递归调用栈，并非 `2` 的祖先，不存在环。

正如[《从调用栈理解递归》](/posts/understanding-recursion/#从树扩展到图时标记代表什么)所述，必须用**三色状态**区分“当前路径上”与“已彻底完成”：

- `0`（`Unvisited` / 白色）：尚未访问；
- `1`（`Visiting` / 灰色）：正处于当前递归调用栈路径上；
- `2`（`Visited` / 黑色）：从该节点出发的所有后继都已确认无环，后续分支再次遇到可直接跳过。

在遍历 `u` 的后继 `v` 时：若 `state[v] == Visiting`，说明发现了一条指向当前栈上祖先的后向边，立即判定存在环；若 `state[v] == Visited`，直接跳过；只有 `state[v] == Unvisited` 时才继续递归。当 `u` 的全部出边都安全返回后，再将 `state[u]` 从 `Visiting` 转为 `Visited`。

```cpp
#include <cstdint>
#include <vector>

class Solution {
    enum class State : std::uint8_t {
        Unvisited = 0,
        Visiting = 1,
        Visited = 2,
    };

    bool hasCycle(int u,
                  const std::vector<std::vector<int>>& adj,
                  std::vector<State>& state) const {
        state[u] = State::Visiting;

        for (int v : adj[u]) {
            if (state[v] == State::Visiting) {
                // Back edge to an active ancestor on the current DFS stack.
                return true;
            }
            if (state[v] == State::Unvisited && hasCycle(v, adj, state)) {
                return true;
            }
        }

        // All reachable paths from `u` are acyclic; seal as completed.
        state[u] = State::Visited;
        return false;
    }

public:
    bool canFinish(int numCourses,
                   const std::vector<std::vector<int>>& prerequisites) const {
        // Time complexity: O(V + E)
        // Space complexity: O(V + E) auxiliary space for adjacency list, states, and stack
        std::vector<std::vector<int>> adj(static_cast<std::size_t>(numCourses));
        for (const auto& edge : prerequisites) {
            adj[edge[1]].push_back(edge[0]);
        }

        std::vector<State> state(static_cast<std::size_t>(numCourses), State::Unvisited);
        for (int i = 0; i < numCourses; ++i) {
            if (state[i] == State::Unvisited && hasCycle(i, adj, state)) {
                return false;
            }
        }
        return true;
    }
};
```

由于有向图可能包含多个互不连通的分量，外层必须遍历 `0..numCourses - 1` 对每个 `Unvisited` 顶点发起检查。

## 复杂度分析与方案对比

设顶点数 $V = \text{numCourses}$，有向边数 $E = \lvert\text{prerequisites}\rvert$。两种算法均只读输入 `prerequisites` 并构建邻接表：

- **时间复杂度**：建图耗时 $O(V + E)$；Kahn 算法中每个顶点至多入队出队一次、每条边仅在遍历邻接表时访问一次；三色 DFS 中每个顶点至多进入 `Visiting` 和 `Visited` 各一次，每条边检查一次。两者总时间复杂度均为 $O(V + E)$。
- **辅助空间复杂度**：邻接表占 $O(V + E)$，入度数组与队列（或状态数组与最坏链状图的递归调用栈）占 $O(V)$，合计为 $O(V + E)$。当 $V$ 更大时，退化单链上的递归 DFS 存在栈溢出风险，而迭代 Kahn 算法不依赖调用栈，更稳健；如果题目升级为 [LeetCode 210. 课程表 II](https://leetcode.cn/problems/course-schedule-ii/)（要求返回具体修读顺序），Kahn 算法直接记录出队序列即可，三色 DFS 则需在标记 `Visited` 的后序位置记录节点再反转输出。

| 方案 | 时间复杂度 | 辅助空间 | 栈溢出风险 | 扩展为输出拓扑序（LC 210） |
| :--- | :--------- | :------- | :--------- | :------------------------- |
| Kahn 入度队列（BFS） | $O(V + E)$ | $O(V + E)$ | 无 | 直接按出队顺序收集 |
| 三色标记判环（DFS） | $O(V + E)$ | $O(V + E)$ | 极深链状图可能爆栈 | 后序收集完成后整体反转 |

[^clrs-topo]: [_Introduction to Algorithms_ (4th ed., Section 20.4: Topological sort)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 20.4 节给出拓扑排序定义并证明有限有向图存在拓扑排序当且仅当其无环（Lemma 20.11）。

[^kahn-1962]: [A. B. Kahn (1962): _Topological sorting of large networks_](https://www.semanticscholar.org/paper/Topological-sorting-of-large-networks-Kahn/7724172425879e96bd4deee1c175ba840ebac5a6)（*Communications of the ACM*, 5(11), pp. 558–562）——提出基于零入度前沿队列逐步剥离节点的拓扑排序算法。

[^mit-dfs]: [MIT 6.006，Lecture 14: Depth-First Search (DFS), Topological Sort](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-14-depth-first-search-dfs-topological-sort/)——阐述有向图边分类、后向边判环准则与拓扑排序的关系。
