---
title: "二叉树的最近公共祖先：自底向上状态汇聚与分治判定"
publishDate: "2026-11-12T12:00:00+08:00"
description: "LeetCode 236 二叉树的最近公共祖先，剖析自底向上后序分治的状态汇聚契约，推导左右子树非空即拐点判定的正确性，提供 Python 与 C++ 实现。"
---

[LeetCode 236. 二叉树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/)（Hot 100）给定一棵二叉树以及树中的两个指定节点 $p$ 与 $q$，要求找到它们的最近公共祖先（Lowest Common Ancestor, 简称 LCA）。树中所有节点值唯一，且保证 $p$ 和 $q$ 均存在于树中且 $p \neq q$。

## 最近公共祖先的充要判定

在树结构中，节点 $x$ 是节点 $p$ 和 $q$ 的**公共祖先**，当且仅当 $p$ 和 $q$ 同时位于以 $x$ 为根的子树中（一个节点也可以是它自身的祖先）[^clrs-tree]。**最近公共祖先** $x$ 则是所有满足该条件的公共祖先中深度最大的节点。

将该定义转化为局部的充要判定条件：节点 $x$ 是 $p$ 与 $q$ 的最近公共祖先，当且仅当以 $x$ 为根的子树同时包含 $p$ 和 $q$，且以 $x$ 的任何一个直接子节点为根的子树都**不能**同时包含 $p$ 和 $q$。换言之，对于 LCA 节点 $x$，必然满足以下两类情况之一：
1. **分立两侧**：$p$ 位于 $x$ 的左（右）子树中，而 $q$ 位于 $x$ 的右（左）子树中；
2. **自为祖先**：$x = p$ 且 $q$ 位于 $p$ 的某个子树中（或者 $x = q$ 且 $p$ 位于其子树中）。

## 分治函数契约与自底向上状态汇聚

解决此问题无需显式记录所有节点的父指针，利用后序遍历自底向上的分治机制即可在单次遍历中定位答案。我们定义递归函数 `lowestCommonAncestor(root, p, q)` 的语义契约如下：
- 若以 `root` 为根的子树同时包含 $p$ 和 $q$，返回二者的最近公共祖先；
- 若该子树仅包含 $p$ 或 $q$ 其中的一个，返回被发现的那个目标节点；
- 若该子树既不包含 $p$ 也不包含 $q$，返回空指针（`None` / `nullptr`）。

### 为什么遇到目标节点即可提前返回？

在递归基阶段，若当前节点满足 `root == p || root == q`，函数可以直接返回 `root`，无需继续递归搜索其子树。这种剪枝的正确性由以下两难推理保证：
- **分支一：另一个目标节点不在当前节点的子树中**。此时该节点本就应该返回自身，向上层汇报“本分支发现了目标”；另一个节点必然在树的其他分支中被发现，最终会在它们真正的 LCA 处汇聚。
- **分支二：另一个目标节点恰好就在当前节点的子树中**（例如 $q$ 是 $p$ 的后代）。根据定义，先被发现的节点 $p$ 本身就是二者的最近公共祖先！即便我们不进入其子树寻找 $q$，$p$ 也能作为最终答案一路沿着调用栈回传至整棵树的根部。

### 后序汇总逻辑

在分别递归求得左子树返回值 `left` 与右子树返回值 `right` 后，当前节点的状态转移完全由两者的空与非空决定：
- **`left != nullptr && right != nullptr`**：说明 $p$ 与 $q$ 分别落在当前节点的两侧子树中。当前节点恰好满足“分立两侧”判定，它就是我们要找的 LCA，直接返回当前节点 `root`。
- **仅一侧非空**（如 `left != nullptr` 且 `right == nullptr`）：说明两个节点都在左子树中，或者只有一个目标节点在左子树中。无论哪种情况，非空的子树返回值 `left` 就是该子树给出的阶段性结论（或已确定的 LCA，或发现的目标），将其继续向上传递即可。
- **两侧均为空**：说明当前子树不包含任何目标，返回空指针。

## Python：优雅的分治实现

Python 实现清晰展示了后序状态汇聚的结构：

```python
from typing import Optional


class Solution:
    def lowestCommonAncestor(
        self, root: Optional[TreeNode], p: TreeNode, q: TreeNode
    ) -> Optional[TreeNode]:
        # Base case: reached null leaf or discovered either target node.
        if root is None or root is p or root is q:
            return root

        # Post-order: aggregate search status from left and right subtrees.
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)

        # If both subtrees yield a target, current node is their lowest common ancestor.
        if left is not None and right is not None:
            return root

        # Otherwise pass up the discovered non-null target or ancestor.
        return left if left is not None else right
```

## C++：指针条件运算与栈帧开销

C++ 中直接比对指针地址，利用三目条件表达式可以极其紧凑地表达状态分发：

```cpp
class Solution {
public:
    TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
        // Base case: empty node or matched target identity.
        if (root == nullptr || root == p || root == q) {
            return root;
        }

        // Divide and conquer across left and right branches.
        TreeNode* const left = lowestCommonAncestor(root->left, p, q);
        TreeNode* const right = lowestCommonAncestor(root->right, p, q);

        // If targets are split across both subtrees, current node is the LCA.
        if (left != nullptr && right != nullptr) {
            return root;
        }

        // Return whichever branch found a target (or nullptr if neither did).
        return (left != nullptr) ? left : right;
    }
};
```

## 复杂度与不变式分析

- **时间复杂度**：$O(n)$。二叉树中的每个节点最多被访问一次。当目标节点位于根节点的左右浅层子树时，算法甚至可能在遍历完整棵树之前便通过递归基剪枝。
- **空间复杂度**：$O(h)$。取决于二叉树的高度 $h$ 决定的递归调用栈深度。最好情况下树完全平衡，空间为 $O(\log n)$；最坏情况下树退化为单支链表，空间为 $O(n)$。

与通过哈希表记录父节点指针后转为[《相交链表：把状态判定收进循环条件》](/notes/algorithm/linked-list-intersection/)求交点的解法相比，自底向上的分治法不仅省去了建立哈希映射的额外动态内存分配与常数开销，更直观展现了树上状态在调用栈回溯过程中逐步归约的拓扑性质。

[^clrs-tree]: Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein. *Introduction to Algorithms*, 4th Edition. MIT Press, 2022. 第 10 章二叉树结构定义与第 21 章关于祖先关系与不相交集合数据结构的论述。
