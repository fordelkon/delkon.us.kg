---
title: "二叉树的最大深度：后序分解合并与调用栈深度"
publishDate: "2026-11-07T12:00:00+08:00"
description: "LeetCode 104：从树形递归的分解与合并模型出发，对比 Python 后序递归与 BFS 层序遍历，再用 C++ 栈上标量求值规避堆开销，推导调用栈深度与树高的映射关系。"
---

[LeetCode 104. 二叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-binary-tree/)（Hot 100）给定二叉树的根节点 `root`，要求返回其最大深度。最大深度是指从根节点到最远叶子节点的最长路径上的节点数（空树深度为 0，单根节点深度为 1）。

二叉树天然由“根节点、左子树、右子树”递归构成。计算整棵树深度的前提，是必须先获知左右两棵子树各自的最大深度。这种“等待子问题返回结果、再在当前层结算合并”的依赖关系，正是标准的后序分治模式，其求值机制与[《从调用栈理解递归》中的分解与合并](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)所拆解的 `height` 递归原型完全一致。

## 递归模型：分治、不变量与后序合并

将规模为 $n$ 的二叉树问题拆解为其子结构：

$$
\text{depth}(\text{node}) =
\begin{cases}
0, & \text{node 为空} \\
1 + \max(\text{depth}(\text{node.left}), \text{depth}(\text{node.right})), & \text{node 非空}
\end{cases}
$$

该递归成立的不变量是：**以任意节点为根的子树，其最大深度必然等于左右子树最大深度的较大者加 1**。

由于父节点必须使用左右子树的计算产物，当前栈帧无法在深入子节点之前得出答案。在递归执行模型中，当前栈帧被保存在调用栈中，程序控制流依次向下展开直到叶子节点的空指针（基准条件，返回 0），随后在**回溯（退栈）阶段**完成 $+1$ 的合并操作。

### Python 简洁实现

Python 实现通过类型注解 `Optional[TreeNode]` 清晰表达指针可能为空的语义：

```python
from typing import Optional


class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if root is None:
            return 0

        # Subproblem decomposition: compute depths of left and right subtrees.
        left_depth = self.maxDepth(root.left)
        right_depth = self.maxDepth(root.right)

        # Merge step: current height is 1 + maximum of both subtrees.
        return 1 + max(left_depth, right_depth)
```

代码中也可以紧凑地缩写为 `return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right)) if root else 0`。拆分成局部变量 `left_depth` 和 `right_depth` 则使调试断点和调用栈分析更加直观。

### 广度优先（BFS）层序迭代对照

除了基于调用栈的深度优先分解，还可以通过广度优先搜索（BFS）按层推进。每处理完一整层节点，深度计数器累加 1：

```python
from collections import deque
from typing import Optional


class SolutionBFS:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if root is None:
            return 0

        queue: deque[TreeNode] = deque([root])
        depth = 0

        while queue:
            # Process all nodes at the current level.
            level_size = len(queue)
            for _ in range(level_size):
                curr = queue.popleft()
                if curr.left is not None:
                    queue.append(curr.left)
                if curr.right is not None:
                    queue.append(curr.right)
            depth += 1

        return depth
```

两种思路展现了空间占用的不同切面：
- **DFS（递归）**的空间开销取决于树的**垂直高度** $h$（调用栈的最大深度）；
- **BFS（队列）**的空间开销取决于树的**水平宽度** $w$（单层最多节点数）。

对于满二叉树，$w = \lceil n / 2 \rceil \in O(n)$，此时 BFS 队列峰值远大于 DFS 调用栈深度 $O(\log n)$；而在极端退化的链状树中，$w = 1$，BFS 仅占用 $O(1)$ 辅助空间，DFS 递归栈则深达 $O(n)$。

## C++ 实现：栈上标量与求值顺序

在 C++ 中，可以通过标量局部变量与内联递归规避任何堆动态分配。

```cpp
#include <algorithm>

class Solution {
public:
    int maxDepth(const TreeNode* root) {
        if (root == nullptr) {
            return 0;
        }

        // Explicitly sequence left and right sub-evaluations.
        const int leftDepth = maxDepth(root->left);
        const int rightDepth = maxDepth(root->right);

        return 1 + std::max(leftDepth, rightDepth);
    }
};
```

这里将 `leftDepth` 和 `rightDepth` 分开声明，不仅提升可读性，还明确固定了先左后右的调用顺序。若直接写为 `std::max(maxDepth(root->left), maxDepth(root->right))`，根据 C++ 标准，函数实参之间的求值顺序是未指定的（unspecified）[^eval-order]，由编译器决定先计算哪一边。

该实现仅使用基本整型标量，所有中间状态都保存在执行栈帧中，无需引入任何额外数据结构。

## 复杂度分析与调用栈深度

- **时间复杂度**：$O(n)$。二叉树中的每个节点恰好被访问一次，每次访问仅执行空指针判断与常数次标量比较、加法。
- **空间复杂度**：$O(h)$，其中 $h$ 为树的高度。辅助空间完全由递归调用栈帧占用：
  - **最佳情况（树高度平衡）**：$h = \lfloor \log_2 n \rfloor + 1 \in O(\log n)$；
  - **最坏情况（树完全倾斜退化为链表）**：$h = n \in O(n)$，此时可能面临深度调用栈溢出风险。

树形递归的本质是自顶向下拆分至最小项、自底向上合成规约[^sicp-tree]。理解这种后序依赖，不仅是求解树高、平衡树判定的基础，也是后续更复杂的树形动态规划（如直径计算与最大路径和）的通用思维锚点。

## References

[^eval-order]: [cppreference: Order of evaluation](https://en.cppreference.com/w/cpp/language/eval_order.html)——说明 C++ 中函数参数的求值顺序在 C++17 之后虽有细化，但同一函数调用的多个参数之间仍未指定先后顺序。

[^sicp-tree]: [SICP Section 2.2.2: Hierarchical Structures](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——剖析树形结构（Tree Recursion）上的封闭分治过程与子树规约机制。
