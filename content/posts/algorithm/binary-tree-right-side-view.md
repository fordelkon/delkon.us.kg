---
title: "二叉树的右视图：层序末项与右优先深度覆盖"
publishDate: "2026-11-05T12:00:00+08:00"
description: "LeetCode 199：对比层序遍历末项提取与根-右-左 DFS 的深度首次命中，分析队列宽度和递归树高各自决定的辅助空间。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 199. 二叉树的右视图](https://leetcode.cn/problems/binary-tree-right-side-view/)（Hot 100）要求返回从二叉树右侧观察所能看到的节点值序列，顺序为从顶部到底部。

所谓“右侧可见”，等价于提取二叉树每一层深度 $d \in [0, h - 1]$ 中最靠右的那个节点（其中 $h$ 为树高）。沿着这一定义可以导出两条对应的实现路径：

1. **横向按层提取（BFS）**：直接复用[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/posts/algorithm/binary-tree-level-order-traversal/)的单队列快照框架，在每层弹出的 `level_size` 个节点中，仅将最后一个出队的节点（下标 `i == level_size - 1`）追加到结果数组，无需为整层分配临时数组。
2. **纵向优先探右（右优先 DFS）**：参考[《从调用栈理解递归》](/posts/understanding-recursion/#遍历访问当前节点再继续其他分支)中遍历顺序对访问次序的控制，若将标准先序遍历（根 $\to$ 左 $\to$ 右）对调左右分支次序，改按“根 $\to$ 右 $\to$ 左”的**右优先先序**顺序向下递归，那么在任意深度 `depth` 上，整棵树中最右侧的节点必定第一个到达该深度。这里仅对调先序遍历的左右分支次序；[《二叉树展开为链表：逆先序递归与前驱节点就地嫁接》](/posts/algorithm/flatten-binary-tree-to-linked-list/)则按“右 $\to$ 左 $\to$ 根”访问，是真正将先序访问序列倒置，两者不可混用。

在右优先 DFS 下，结果数组 `result` 的长度天然充当“已探测到的最大深度水位线”：每当递归携带层号 `depth` 到达某个节点时，当前深度 `depth` 首次被访问当且仅当 `depth == len(result)`。此时直接将该节点值追加进 `result`，后续从左分支回落到同一深度 `depth` 的其他节点都会因 `depth < len(result)` 而被自动跳过。

## Python：右优先 DFS 与深度首次命中

Python 实现采用“根 $\to$ 右 $\to$ 左”递归，利用 `depth == len(result)` 判定当前层最右节点的首次命中[^sicp-stack]：

```python
from typing import Optional


class Solution:
    def rightSideView(self, root: Optional[TreeNode]) -> list[int]:
        result: list[int] = []

        def dfs(node: Optional[TreeNode], depth: int) -> None:
            if node is None:
                return
            # Under Root -> Right -> Left order, the first node visiting `depth` is the rightmost one.
            if depth == len(result):
                result.append(node.val)
            dfs(node.right, depth + 1)
            dfs(node.left, depth + 1)

        dfs(root, 0)
        return result
```

即便右子树较浅而左子树更深，当右子树递归返回、控制流转向 `dfs(node.left, depth + 1)` 继续向下推进到超过右子树高度的层级时，`depth == len(result)` 依然会重新成立，从而准确捕获左子树暴露在右侧视野下方的深层节点。

## C++：右优先 DFS 与层序 BFS 末项提取

下面先给出 C++ 的右优先 DFS 实现[^cpp-vector]：

```cpp
#include <cstddef>
#include <vector>

class Solution {
    void dfs(TreeNode* node, std::size_t depth, std::vector<int>& result) {
        if (node == nullptr) {
            return;
        }
        if (depth == result.size()) {
            result.push_back(node->val);
        }
        // Visit right child before left child so the rightmost node claims each depth first.
        dfs(node->right, depth + 1, result);
        dfs(node->left, depth + 1, result);
    }

public:
    std::vector<int> rightSideView(TreeNode* root) {
        std::vector<int> result;
        dfs(root, 0, result);
        return result;
    }
};
```

若树深较大或希望完全避免递归调用栈，也可以在[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/posts/algorithm/binary-tree-level-order-traversal/)的基础上省去单层 `vector` 分配，仅在每层最后一个节点 `i == level_size - 1` 出队时写入 `result`[^cpp-queue]：

```cpp
#include <cstddef>
#include <queue>
#include <vector>

class Solution {
public:
    std::vector<int> rightSideView(TreeNode* root) {
        std::vector<int> result;
        if (root == nullptr) {
            return result;
        }

        std::queue<TreeNode*> q;
        q.push(root);

        while (!q.empty()) {
            const std::size_t level_size = q.size();
            for (std::size_t i = 0; i < level_size; ++i) {
                TreeNode* node = q.front();
                q.pop();
                // Only the last node popped in the current level is visible from the right side.
                if (i == level_size - 1) {
                    result.push_back(node->val);
                }
                if (node->left != nullptr) {
                    q.push(node->left);
                }
                if (node->right != nullptr) {
                    q.push(node->right);
                }
            }
        }
        return result;
    }
};
```

设树中共有 $n$ 个节点，树高为 $h$（按节点层数计），最大层宽为 $w$。两种解法都必须完整访问全部 $n$ 个节点（因无法预知左子树深处是否隐藏着比右子树更深的节点），时间复杂度均为 $O(n)$。两者都只读输入树，输出每层一个值，占 $O(h)$ 空间，另计的辅助空间如下。递归 DFS 在深树上可能触及 Python 递归限制或 C++ 线程栈容量；DFS 的栈也未必比 BFS 的队列小，具体取决于树形。空间开销呈现与[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/posts/algorithm/binary-tree-level-order-traversal/)一致的树形权衡：

| 遍历方式   | 时间复杂度 | 辅助空间复杂度 | 满二叉树辅助空间 | 退化单链辅助空间 |
| :--------- | :--------- | :------------- | :--------------- | :--------------- |
| 右优先 DFS | $O(n)$     | $O(h)$         | $O(\log n)$      | $O(n)$           |
| 层序 BFS   | $O(n)$     | $O(w)$         | $O(n)$           | $O(1)$           |

[^sicp-stack]: [SICP §5.1.4: Using a Stack to Implement Recursion](https://sicp.sourceacademy.org/chapters/5.1.4.html)——说明递归调用如何借栈保存并恢复上下文；正文据本题沿树路径递归的方式分析栈深度。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——说明 `std::vector::size` 为常数时间查询，`push_back` 为平摊常数时间追加，可直接用来维护已覆盖的深度水位线。

[^cpp-queue]: [cppreference：`std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——说明 `std::queue` 提供先进先出队列操作，支撑按层快照宽度并提取每层末项。
