---
title: "二叉树的最近公共祖先：自底向上状态汇聚与分治判定"
publishDate: "2026-11-12T12:00:00+08:00"
description: "LeetCode 236：剖析自底向上后序分治的状态汇聚契约，说明命中目标节点提前返回的正确性，并给出 Python 与 C++ 实现。"
---

[LeetCode 236. 二叉树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/)（Hot 100）要求在给定二叉树中找到两个指定节点 `p` 和 `q` 的**最近公共祖先**（lowest common ancestor, LCA）：即同时拥有 `p` 和 `q` 作为后代（允许节点作为自身的后代）且深度尽可能大的节点[^clrs-tree]。题目保证树中所有节点值唯一，`p`、`q` 是两个不同且均存在于树中的节点。下面按节点身份比较，不修改输入树；返回值借用原树中的节点，节点所有权不变。若取消“均存在”的保证，当前算法可能返回唯一存在的目标，需另行验证两者存在性。

从树上简单路径的角度看，树中任意两节点 `p` 与 `q` 之间存在唯一一条简单路径，而它们的最近公共祖先正是这条路径上**深度最小的唯一最高拐点**——这与[《二叉树的直径：单侧深度贡献与拐点路径全局结算》](/notes/algorithm/diameter-of-binary-tree/)及[《二叉树中的最大路径和：负收益归零剪枝与树上后序贡献》](/notes/algorithm/binary-tree-maximum-path-sum/)中“枚举树上路径最高拐点并在后序位置汇总两侧分支信息”的拓扑模型一致。具体而言，节点 `root` 成为 `p` 和 `q` 的最近公共祖先，当且仅当满足以下两种情形之一：

1. **分居两侧**：`p` 和 `q` 分别位于 `root.left` 和 `root.right` 两棵不同的子树中。
2. **祖先包含**：`root` 本身就是 `p`（或 `q`），而另一个节点 `q`（或 `p`）位于 `root` 的左子树或右子树中。

## 后序分治契约与提前返回的正确性

要在单次遍历中完成上述判定，可以遵循[《从调用栈理解递归》](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中的分解与合并思路，为 `lowestCommonAncestor(root, p, q)` 定义一个兼顾“目标存在性探针”与“LCA 传递”的返回契约：

- 若以 `root` 为根的子树中既不含 `p` 也不含 `q`，返回 `None`（或 `nullptr`）。
- 若子树中同时包含 `p` 和 `q`，返回它们的最近公共祖先。
- 若子树中仅包含 `p` 或 `q` 中的一个，返回找到的那个目标节点本身。

在这一契约下，当递归下探遇到 `root == p` 或 `root == q` 时，函数会**直接返回 `root`，而不再继续向下搜索其子树**。初学者常担心：如果另一个目标节点 `q` 恰好藏在当前节点 `p` 的子树内部，提前返回会不会漏掉 `q`？

借助题目“两个节点均存在于树中”的前提，提前返回在两种完备情形下都保持严格正确：

- 若 `q` 确实位于 `p` 的子树内部，根据定义，`p` 本身就是 `p` 与 `q` 的最近公共祖先。既然答案已经确定为 `p`，直接将 `p` 向上返回即可，无需再深入子树确认 `q` 的具体位置；在回退过程中，`p` 的所有祖先节点只会在一侧收到非空返回值 `p`、另一侧收到空值，因而会将 `p` 原样一路透传到整棵树的根部。
- 若 `q` 不在 `p` 的子树内部，说明 `q` 必然位于整棵树的另一分支。此时直接返回 `p` 正好履行了“汇报当前子树含有 `p`”的探针职责；当 `p` 与另一分支返回的 `q` 在它们的真实最近公共祖先处汇合时，后序合并逻辑看到左右返回值均非空，便会将该交汇节点作为最终 LCA 向上返回。

## Python：后序状态汇聚实现

在 Python 中，由于 `p` 和 `q` 是树中已有的节点对象引用，可以直接使用身份比较运算符 `is` 判断指针相等[^py-is]：

```python
from typing import Optional


class Solution:
    def lowestCommonAncestor(
        self, root: Optional[TreeNode], p: TreeNode, q: TreeNode
    ) -> Optional[TreeNode]:
        # Early return is safe: if the other target lies inside this subtree,
        # current `root` is already their LCA; otherwise `root` acts as a
        # presence indicator to be merged at a higher ancestor.
        if root is None or root is p or root is q:
            return root

        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)

        if left is not None and right is not None:
            return root
        return left if left is not None else right
```

后序合并仅需三行分支：当 `left` 与 `right` 同时非空时，`p` 和 `q` 分居 `root` 两侧，当前 `root` 即为最近公共祖先；当只有一侧非空时（无论是单侧找到了某个目标节点，还是单侧子树已经算出了 LCA），直接将该非空引用向上透传；若两侧皆为空，则自然返回 `None`。

## C++：指针分治实现

C++ 实现与 Python 逻辑一致，直接比较节点指针地址并利用条件运算符转发单侧非空结果：

```cpp
class Solution {
public:
    TreeNode* lowestCommonAncestor(
        TreeNode* root, TreeNode* p, TreeNode* q
    ) const {
        if (root == nullptr || root == p || root == q) {
            return root;
        }
        TreeNode* left = lowestCommonAncestor(root->left, p, q);
        TreeNode* right = lowestCommonAncestor(root->right, p, q);

        // Both sides non-null means p and q split across `root`, making `root`
        // the unique highest turning point on the simple path between them.
        if (left != nullptr && right != nullptr) {
            return root;
        }
        return left != nullptr ? left : right;
    }
};
```

## 与父指针溯源法（相交链表模型）的对比

如果先用哈希表预处理记录每个节点的父指针 `parent[node]`（或者树节点本身带有 `parent` 指针），从 `p` 和 `q` 分别向根节点回溯的路径就构成了两条最终汇聚于根节点 `root` 的单链表。此时寻找最近公共祖先的问题，等价于[《相交链表：把状态判定收进循环条件》](/notes/algorithm/linked-list-intersection/)中求两条单链表的首个公共交点。

对比两种方案，新建父指针哈希表并用集合记录一侧祖先时，平均时间与辅助空间均为 $O(n)$，极端哈希冲突下时间可达 $O(n^2)$；若节点已有父指针，也可以沿两条祖先链用双指针在 $O(h)$ 时间、$O(1)$ 辅助空间内求交点。而后序递归分治无需建立额外的父指针表，在单次 DFS 中每个节点最多被访问一次，时间复杂度为 $O(n)$，辅助空间开销仅来自递归调用栈 $O(h)$（其中 $h$ 为按节点层数计的树高，平衡树为 $O(\log n)$，最坏链状树为 $O(n)$）。递归虽能在命中目标时提前返回，但深层目标仍可能触及 Python 递归限制或耗尽 C++ 线程栈。

[^clrs-tree]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——Appendix B.5 给出有根树中祖先（ancestor）、后代（descendant）及树上简单路径唯一性的标准定义。

[^py-is]: [Python 文档：身份比较](https://docs.python.org/3/reference/expressions.html#is-not)——说明 `is` 与 `is not` 检验两个引用是否指向内存中的同一个对象实例，适用于树节点指针判等与 `None` 检查。
