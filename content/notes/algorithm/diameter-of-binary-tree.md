---
title: "二叉树的直径：单侧深度贡献与拐点路径全局结算"
publishDate: "2026-11-10T12:00:00+08:00"
description: "LeetCode 543：剖析树形 DP 中的职责解耦——后序遍历中向上层汇报单侧最大深度贡献，并在当前节点结算跨越左右子树的拐点路径，为 LeetCode 124 奠定通用模型。"
---

[LeetCode 543. 二叉树的直径](https://leetcode.cn/problems/diameter-of-binary-tree/)（Hot 100）给定一棵二叉树的根节点 `root`，返回该二叉树的直径。二叉树的直径是指树中任意两个节点之间最长路径的**边数**（路径长度即包含的边数，等于经过的节点数减 1）。这条最长路径可能穿过根节点，也可能完全位于某一棵子树内部。

求解二叉树直径的关键，是建立树形动态规划（Tree DP）的核心抽象：将**向上层汇报的单侧最大贡献**与**在当前拐点结算的跨子树全局路径**彻底解耦。

## 路径的几何特征：拐点与双侧延伸

在无环连通的二叉树中，任意两节点之间的简单路径均有唯一的最高节点——路径上的“最高折返点”或“拐点”（turning point / LCA）。

若某条简单路径以节点 $u$ 为拐点，则该路径在 $u$ 处分为左右两侧向下延伸：
- 左侧延伸的最深深度为 $L$（左子树的高度，以边数计）；
- 右侧延伸的最深深度为 $R$（右子树的高度，以边数计）。

穿过 $u$ 且以 $u$ 为拐点的最长简单路径长度必然为 $L + R$。

```text
            (u)          <-- 拐点结算：路径长度 = L + R
           /   \
         /       \
      [L 深度]   [R 深度]
```

由于整棵树的全局最长直径必然存在某一个节点作为其拐点，只要遍历所有可能的拐点并取其 $L + R$ 的最大值，就能得到答案。

### 为什么不能使用双重递归？

直觉上容易写出如下的双重递归伪代码：

$$
\text{diameter}(u) = \max \big( \text{diameter}(u.\text{left}), \, \text{diameter}(u.\text{right}), \, \text{depth}(u.\text{left}) + \text{depth}(u.\text{right}) \big)
$$

这种写法在计算每个节点的直径时，都向下重新递归计算一次子树深度。大量节点被重复访问，最坏情况下时间复杂度退化至 $O(n^2)$。

正确的做法是在单次后序遍历中，自底向上同时完成**深度计算**与**直径结算**。

## 树形 DP 的职责解耦：单侧贡献 vs 拐点结算

一次后序遍历函数 `maxDepth(node)` 承担两个独立的职责：

1. **拐点结算（全局状态更新）**：
   在获得左右子树深度 $L$ 和 $R$ 后，当前节点作为拐点能构成的最长路径边数为 $L + R$。我们用 $L + R$ 挑战全局最大直径：

   $$
   \text{max\_diameter} = \max(\text{max\_diameter}, L + R)
   $$

2. **单侧贡献（向上层汇报）**：
   函数向其父调用栈帧返回的值**不能**是 $L + R$。因为一条简单路径绝不能在父节点分叉的同时又在子节点分叉！父节点如果将当前节点纳入其路径，只能沿当前节点深入最深的一条单链继续延伸。因此，当前节点对上层父节点的深度贡献只能是：

   $$
   \text{depth\_contribution} = 1 + \max(L, R)
   $$

这一“向上只报单链，原地结算拐点”的解耦机制，正是树形 DP 能够在线性时间内解决路径极值问题的本质所在。

### 为 LeetCode 124（最大路径和）奠定模型基础

该模型是树上路径类动态规划的通用范式。在后续的 [LeetCode 124. 二叉树中的最大路径和](https://leetcode.cn/problems/binary-tree-maximum-path-sum/) 中：
- 每个节点向上汇报的单侧最大贡献为 $\max(0, \text{val} + \max(L, R))$（负增益可截断不选）；
- 在当前拐点结算的跨分支路径和为 $L + R + \text{val}$。

两者结构完全同构：543 题是边数贡献的累加，124 题是带权节点增益的累加与截断。掌握 543 题的贡献/结算拆分，便掌握了 124 题的核心模型。

## Python 实现：闭包与 nonlocal 状态结算

在 Python 中，通过闭包内部的 `nonlocal` 变量维护遍历过程中的最大直径：

```python
from typing import Optional


class Solution:
    def diameterOfBinaryTree(self, root: Optional[TreeNode]) -> int:
        max_diameter = 0

        def max_depth(node: Optional[TreeNode]) -> int:
            nonlocal max_diameter
            if node is None:
                return 0

            # Post-order traversal: recursively compute left and right subtree depths.
            left_depth = max_depth(node.left)
            right_depth = max_depth(node.right)

            # Local settlement: update global maximum diameter at this turning point.
            max_diameter = max(max_diameter, left_depth + right_depth)

            # Upward contribution: report the longest single-branch depth to parent.
            return 1 + max(left_depth, right_depth)

        max_depth(root)
        return max_diameter
```

这里 `max_depth` 返回以节点为根向下延伸的边数（以空节点为 0），单节点返回 1（表示向上的 1 条边贡献，空节点无边），节点作为拐点时左右两子树深度直接相加即为跨越该节点的总边数。

## C++ 实现：栈上引用与零动态分配

在 C++ 中，将全局结果以非 const 引用 `int& maxDiameter` 的形式在栈帧间透传，消除了类成员变量在多次调用间的状态残留，同时完全规避堆内存分配[^cpp-max]：

```cpp
#include <algorithm>

class Solution {
public:
    int diameterOfBinaryTree(const TreeNode* root) {
        int maxDiameter = 0;
        maxDepth(root, maxDiameter);
        return maxDiameter;
    }

private:
    int maxDepth(const TreeNode* node, int& maxDiameter) {
        if (node == nullptr) {
            return 0;
        }

        const int leftDepth = maxDepth(node->left, maxDiameter);
        const int rightDepth = maxDepth(node->right, maxDiameter);

        // Settle the longest path with current node as the turning point.
        maxDiameter = std::max(maxDiameter, leftDepth + rightDepth);

        // Return single-side edge contribution to the parent caller.
        return 1 + std::max(leftDepth, rightDepth);
    }
};
```

局部变量 `leftDepth` 和 `rightDepth` 保证了自底向上的计算顺序，辅助函数仅使用基本的标量整型与指针，能够被编译器高效内联优化。

## 复杂度分析

- **时间复杂度**：$O(n)$。二叉树中的每个节点仅被后序遍历访问一次，并在常数时间内完成标量加法、最大值比较与更新。
- **空间复杂度**：$O(h)$，其中 $h$ 为树的高度。辅助空间完全由递归函数调用栈深度决定：
  - **最佳情况（平衡二叉树）**：$h = \lfloor \log_2 n \rfloor + 1 \in O(\log n)$；
  - **最坏情况（倾斜单支树）**：$h = n \in O(n)$。

通过在后序遍历中分离单侧贡献与拐点结算，我们避免了多重遍历的冗余开销，以优雅且高效的单趟扫描完成了全局极值路径的寻找[^sicp-tree-accumulator]。

## References

[^sicp-tree-accumulator]: [SICP Section 2.2.2: Hierarchical Structures and Accumulators](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——分析如何在树形递归中结合自底向上规约与累积器状态维护。

[^cpp-max]: [cppreference: `std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明 `std::max` 接受常量引用并返回较大者的引用，常数时间且无分配。
