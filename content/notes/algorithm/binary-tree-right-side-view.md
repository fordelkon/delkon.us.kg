---
title: "二叉树的右视图：层序末项与逆先序深度覆盖"
publishDate: "2026-11-05T12:00:00+08:00"
description: "LeetCode 199：从层序遍历的末尾切片过渡到根-右-左逆先序 DFS，利用深度首次命中机制将辅助空间压缩至树高。"
---

[LeetCode 199. 二叉树的右视图](https://leetcode.cn/problems/binary-tree-right-side-view/)（Hot 100）要求返回从二叉树右侧观察时可见的节点值列表，顺序自顶向下。

右视图的数学契约与几何不变量为：对于树中存在的任意深度 $d \ge 0$，在右侧投影中被看见的节点，必然且仅能是该深度上**水平位置最靠右**的单个节点。同一深度上位于该节点左侧的所有同辈或堂兄弟节点均被遮挡。因此，右视图结果序列的长度必然严格等于树的最大深度（高度）$h$。

在解法形态上，该问题呈现出广度优先（BFS）与深度优先（DFS）两种经典的算法对称性。

## 解法视角的权衡与跨题关联

在[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/notes/algorithm/binary-tree-level-order-traversal/)中，我们建立了基于队列的逐层扫描模型。层序遍历天然具有全层感知能力：在每一层循环连续弹出 `level_size` 个节点的过程中，最后一个出队的节点即为该层最右侧的可见节点。

然而，BFS 为了获得末项节点，必须将整层的所有节点维护在队列中。在宽度为 $w$ 的二叉树中，辅助空间受限于最大层宽 $O(w)$；当二叉树为满二叉树时，叶子层节点数达到 $w \approx \lceil n/2 \rceil$，需要占用 $O(n)$ 辅助内存。

相比之下，深度优先搜索可以通过调整子树访问顺序实现更为敏捷的行级过滤——采用“**根节点 $\to$ 右子树 $\to$ 左子树**”的逆先序遍历（Reverse Preorder Traversal）[^clrs-dfs]：
1. 因为右子树始终优先于左子树被访问，所以对于任何深度 $d$，遍历路径上**首次到达该深度的节点，在几何拓扑上必定是该深度最右侧的节点**。
2. 判定不变量为 `depth == len(result)`（在 C++ 中为 `depth == result.size()`）。若当前访问节点的深度等于当前收集结果数组的长度，说明该深度此前从未被探索过，当前节点即为右视图代表，直接录入；随后探索左子树到达相同深度时，因 `result.size() > depth`，左侧节点被天然忽略。

## Python：逆先序 DFS 深度命中

Python 实现通过内部递归函数维护当前节点的绝对深度 `depth`，利用结果数组的长度作为单调递增的深度标尺。

```python
from typing import Optional


class Solution:
    def rightSideView(self, root: Optional[TreeNode]) -> list[int]:
        result: list[int] = []

        def dfs(node: Optional[TreeNode], depth: int) -> None:
            if node is None:
                return

            # The first node encountered at each depth is strictly the rightmost one.
            if depth == len(result):
                result.append(node.val)

            # Traverse right child first, then left child.
            dfs(node.right, depth + 1)
            dfs(node.left, depth + 1)

        dfs(root, 0)
        return result
```

此实现无需额外的集合或哈希表记录已访问层级，以极简的代码满足了深度不变量。

## C++：逆先序 DFS

递归时先访问右子树，记录每个深度首次遇到的节点。

```cpp
#include <vector>

class Solution {
public:
    std::vector<int> rightSideView(TreeNode* root) {
        std::vector<int> result;
        dfs(root, 0, result);
        return result;
    }

private:
    void dfs(TreeNode* node, std::size_t depth, std::vector<int>& result) {
        if (node == nullptr) {
            return;
        }

        // If this depth is reached for the first time, append to the result.
        if (depth == result.size()) {
            result.push_back(node->val);
        }

        dfs(node->right, depth + 1, result);
        dfs(node->left, depth + 1, result);
    }
};
```

## C++：层序 BFS

使用队列逐层遍历，先将左孩子入队，再将右孩子入队，记录每层最后出队的节点。

```cpp
#include <queue>
#include <vector>

class Solution {
public:
    std::vector<int> rightSideView(TreeNode* root) {
        if (root == nullptr) {
            return {};
        }

        std::vector<int> result;
        std::queue<TreeNode*> q;
        q.push(root);

        while (!q.empty()) {
            const auto level_size = q.size();

            for (std::size_t i = 0; i < level_size; ++i) {
                TreeNode* node = q.front();
                q.pop();

                // The last popped element at this level is the visible rightmost node.
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

向 `std::vector` 尾部追加元素平摊时间为常数级别[^cpp-vector-push]。

## 复杂度与选型对比

| 遍历维度 | 时间复杂度 | 辅助空间复杂度 | 平衡树辅助空间 | 单链退化辅助空间 |
| :--- | :--- | :--- | :--- | :--- |
| **逆先序 DFS** | $O(n)$ | $O(h)$ | $O(\log n)$ | $O(n)$ |
| **层序 BFS** | $O(n)$ | $O(w)$ | $O(n)$ | $O(1)$ |

在实际工程场景中：
- 当树相对平衡时，DFS 的辅助空间取决于树高 $h = \log n$，内存开销远小于持有整层节点的 BFS；
- 当树严重倾斜退化为链表时，DFS 存在调用栈溢出风险，而 BFS 此时每层仅含 1 个节点，队列空间仅为常数 $O(1)$。

[^clrs-dfs]: [Cormen et al.: 《算法导论》(CLRS)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 22 章图算法关于深度优先搜索前序遍历时间戳与树分支结构的性质论证。

[^cpp-vector-push]: [cppreference: `std::vector::push_back`](https://en.cppreference.com/w/cpp/container/vector/push_back)——说明标准向量在尾部平摊常数时间追加元素的性能保证。
