---
title: "二叉树的层序遍历：队列前沿管理与批量按层弹出"
publishDate: "2026-11-04T12:00:00+08:00"
description: "LeetCode 102：利用先进先出队列维护探索前沿，通过单轮快照层级大小实现逐层批量提取，并与深度优先记录做时空对照。"
---

[LeetCode 102. 二叉树的层序遍历](https://leetcode.cn/problems/binary-tree-level-order-traversal/)（Hot 100）要求按照从根节点到叶节点、从左向右的顺序逐层返回所有节点的值，结果组织为二维数组。

二叉树层序遍历的本质是基于图的广度优先搜索（BFS）[^clrs-bfs]。其搜索前沿在演化过程中始终满足**双深度窗口不变量**（Two-Level Window Invariant）：在先进先出（FIFO）队列中，若队首节点的深度为 $d$，则队列中任意节点的深度必然属于区间 $[d, d+1]$。

要将展平的一维节点流按层切分为独立的二维子列表，关键在于**快照当前层的队列容量**：在每一层循环迭代开始时，队列中现存的元素个数 $k = |\text{queue}|$ 恰好严格代表了深度为 $d$ 的所有节点。只要在本轮内层循环中连续弹出恰好 $k$ 个节点，新生成的下一层子节点（深度 $d+1$）虽然被依次追加到队尾，但绝不会干扰本层的批量弹出边界。

## Python：双端队列与单轮快照提取

Python 标准库提供了基于双向链表/块列表实现的 `collections.deque`，其两端插入和删除操作均具有严格的 $O(1)$ 时间复杂度保证[^python-deque]。

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
            # Snapshot the number of nodes present at the current level.
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

代码中利用 `level_size = len(queue)` 在每轮外层循环头部完成层容量捕获，避免了通过特殊占位符（如插入 `None` 分隔标记）所带来的判空分支与状态混乱。

## C++：显式队列与预留容量优化

在 C++ 中，标准库提供了容器适配器 `std::queue`，其底层默认封装 `std::deque`，能够按需分块分配内存，避免了大块连续内存频繁重定位的开销[^cpp-queue]。为了优化每层收集子向量的吞吐，可针对获取到的 `level_size` 显式调用 `reserve`，并通过移动语义转交所有权。

```cpp
#include <queue>
#include <utility>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> levelOrder(TreeNode* root) {
        if (root == nullptr) {
            return {};
        }

        std::vector<std::vector<int>> result;
        std::queue<TreeNode*> q;
        q.push(root);

        while (!q.empty()) {
            const auto level_size = q.size();
            std::vector<int> current_level;
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

每个节点入队出队恰好一次，总体时间复杂度为 $O(n)$。在内存方面，`current_level.reserve(level_size)` 避免了单层收集时的多次动态扩容重分配，`std::move(current_level)` 则消除了向外层二维容器追加时的深拷贝。

## 延伸探讨：与右视图的演化权衡

层序遍历构建了整棵树的全局水平分层骨架。在后续题目[《二叉树的右视图：层序末项与逆先序深度覆盖》](/notes/algorithm/binary-tree-right-side-view/)中，我们只需获取每一层的最右侧投影。

若直接基于当前层序遍历解题，只需在内层循环中提取索引为 `level_size - 1` 的节点值。然而，BFS 的内在瓶颈在于它必须完整持有整层节点。在完全二叉树中，最后一层的节点数达到 $w \approx \lceil n/2 \rceil$，导致队列的辅助空间开销达到 $O(n)$。而在右视图中转向“根 $\to$ 右 $\to$ 左”逆先序 DFS 时，由于利用深度索引进行了即时行级过滤，辅助空间将大幅回退至调用栈深度 $O(h)$（平衡树时仅为 $O(\log n)$）。

## 复杂度分析

- **时间复杂度 $O(n)$**：二叉树中的每个节点恰好进入队列一次，并从队头弹出一次。在内层循环中，左右子节点的判空与入队均为常数时间操作。
- **辅助空间复杂度 $O(w)$**：队列在任一时刻保存的节点数量取决于二叉树的最大层宽度 $w$。
  - 在最好情况下（二叉树退化为单支链表），每层节点数 $w = 1$，辅助队列空间为 $O(1)$。
  - 在最坏情况下（满二叉树或完全二叉树），最底层包含约 $n/2$ 个节点，辅助队列空间达到 $O(n)$。
- **输出空间 $O(n)$**：外层二维列表最终存储全部 $n$ 个节点的值。

[^clrs-bfs]: [Cormen et al.: 《算法导论》(CLRS)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 22 章论证广度优先搜索前沿（Frontier）扩展的单调性与逐层遍历性质。

[^python-deque]: [Python 文档：`collections.deque`](https://docs.python.org/3/library/collections.html#collections.deque)——说明双端队列的两端弹出与追加操作具有严格 $O(1)$ 时间保证，优于基于连续数组列表切片的 $O(k)$ 开销。

[^cpp-queue]: [cppreference: `std::queue`](https://en.cppreference.com/w/cpp/container/queue)——说明队列适配器在默认底层容器 `std::deque` 上的 FIFO 保证。
