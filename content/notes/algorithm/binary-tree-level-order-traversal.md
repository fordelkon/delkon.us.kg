---
title: "二叉树的层序遍历：队列前沿管理与批量按层弹出"
publishDate: "2026-11-04T12:00:00+08:00"
description: "LeetCode 102：利用先进先出队列维护探索前沿，通过单轮快照层级大小实现逐层批量提取，并与深度优先记录做时空对照。"
---

[LeetCode 102. 二叉树的层序遍历](https://leetcode.cn/problems/binary-tree-level-order-traversal/)（Hot 100）要求逐层、从左到右访问二叉树的所有节点，并将每一层的节点值分别组织为独立的子数组返回。

标准**广度优先搜索**（breadth-first search, BFS）借由先进先出（FIFO）队列维护待扩展的探索前沿，天然保证深度为 $d$ 的节点总是先于深度为 $d+1$ 的节点出队[^clrs-bfs]。但普通单队列 BFS 会把相邻两层的节点首尾相接存放在同一个队列中，若不加定界，输出只会是一维扁平序列。要在不使用双队列交替拷贝的前提下完成按层分组，关键在于每次进入外层循环时先记录当前队列长度快照 `level_size = len(queue)`。此时队列中恰好且仅包含第 $d$ 层的全部节点；固定循环弹出这 `level_size` 个节点，并将它们的非空左右孩子追加到队尾，即可在单队列内严格隔离第 $d$ 层的消费与第 $d+1$ 层的生产。这一按层定界模式也是[《二叉树的右视图：层序末项与逆先序深度覆盖》](/notes/algorithm/binary-tree-right-side-view/)提取每层最右节点的直接基础。

## Python：双端队列与层级长度快照

在 Python 中，若使用内置 `list.pop(0)` 从头部弹出元素，会导致后续所有元素在连续内存中整体前移，单次出队退化为 $O(k)$。因此应当选用 `collections.deque`，通过 `popleft()` 与 `append()` 在两端以 $O(1)$ 时间维护探索前沿[^py-deque]：

```python
from collections import deque
from typing import Optional


class Solution:
    def levelOrder(self, root: Optional[TreeNode]) -> list[list[int]]:
        if root is None:
            return []

        result: list[list[int]] = []
        queue: deque[TreeNode] = deque([root])

        while queue:
            # Snapshot current frontier size so newly enqueued children stay in the next level.
            level_size = len(queue)
            current_level: list[int] = []

            for _ in range(level_size):
                node = queue.popleft()
                current_level.append(node.val)
                if node.left is not None:
                    queue.append(node.left)
                if node.right is not None:
                    queue.append(node.right)

            result.append(current_level)

        return result
```

## C++：队列容器适配与单层预分配

C++ 实现使用 `std::queue<TreeNode*>` 管理节点指针[^cpp-queue]。由于每层开始时已知该层精确节点数 `level_size`，提前调用 `current_level.reserve(level_size)` 可以一次性分配当前层所需的连续内存，避免内层循环 `push_back` 触发多次倍增扩容[^cpp-reserve]；本层收集完毕后通过 `std::move` 将 `current_level` 的缓冲区所有权直接转移进 `result`[^cpp-move]：

```cpp
#include <cstddef>
#include <queue>
#include <utility>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> levelOrder(TreeNode* root) {
        std::vector<std::vector<int>> result;
        if (root == nullptr) {
            return result;
        }

        std::queue<TreeNode*> q;
        q.push(root);

        while (!q.empty()) {
            const std::size_t level_size = q.size();
            std::vector<int> current_level;
            // Pre-allocate exact capacity for the current depth to avoid reallocations.
            current_level.reserve(level_size);

            for (std::size_t i = 0; i < level_size; ++i) {
                TreeNode* node = q.front();
                q.pop();
                current_level.push_back(node->val);

                if (node->left != nullptr) {
                    q.push(node->left);
                }
                if (node->right != nullptr) {
                    q.push(node->right);
                }
            }
            result.push_back(std::move(current_level));
        }

        return result;
    }
};
```

## 复杂度与树形空间权衡

设二叉树共有 $n$ 个节点，最大层宽为 $w$，最大深度（树高）为 $h$。每个节点恰好入队一次、出队一次，时间复杂度为 $O(n)$。不计结果数组 `result` 本身的存储，队列在任意时刻至多同时持有相邻两层的节点，辅助空间复杂度取决于树的最大宽度 $O(w)$。

将这里的 BFS 队列与[《二叉树的最大深度：后序分解合并与调用栈深度》](/notes/algorithm/maximum-depth-of-binary-tree/)中的 DFS 递归栈对比，可以看出不同树形对辅助空间的反向影响：

| 树形特征 | 最大层宽 $w$（BFS 队列空间） | 树高 $h$（DFS 调用栈空间） | 空间表现对比 |
| :--- | :--- | :--- | :--- |
| 退化为单链表 | $w = 1$，空间 $O(1)$ | $h = n$，空间 $O(n)$ | BFS 队列始终仅驻留 1 个节点，显著优于递归栈 |
| 满二叉树 | 底层叶节点数 $\lceil n / 2 \rceil$，空间 $O(n)$ | $h = \lfloor \log_2 n \rfloor + 1$，空间 $O(\log n)$ | BFS 在底层达到容量峰值，而 DFS 调用栈仅需对数级空间 |

若改用前序 DFS 实现层序遍历（递归携带当前深度 `depth`，当 `depth == result.size()` 时新建子数组并追加 `node->val`），时间复杂度同为 $O(n)$，但辅助空间由 $O(w)$ 变为 $O(h)$。在扁平宽阔的完全二叉树上，按深度索引归档的 DFS 具有更低的峰值辅助内存；而在深度不可控的退化树形上，基于队列的迭代 BFS 则能避免调用栈溢出。

[^clrs-bfs]: [CLRS: *Introduction to Algorithms* (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 20.2 节论证广度优先搜索队列中节点深度至多相差 1 的双层前沿性质。

[^py-deque]: [Python 文档：`collections.deque`](https://docs.python.org/3/library/collections.html#collections.deque)——说明 `deque` 基于双向链表块实现，支持在两端以 $O(1)$ 时间复杂度执行 `append` 与 `popleft`。

[^cpp-queue]: [cppreference：`std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——说明容器适配器 `std::queue` 提供先进先出接口，默认以 `std::deque` 作为底层容器实现常数时间的入队 `push` 与出队 `pop`。

[^cpp-reserve]: [cppreference：`std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve.html)——说明 `reserve` 可预先分配指定容量，避免在已知元素数量时因多次 `push_back` 触发重分配与元素拷贝。

[^cpp-move]: [cppreference：`std::move`](https://en.cppreference.com/w/cpp/utility/move.html)——说明通过右值引用转换触发 `std::vector` 的移动语义，将内部缓冲区指针以 $O(1)$ 时间转移至外层结果容器。
