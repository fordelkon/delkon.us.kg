---
title: "二叉树展开为链表：逆先序递归与前驱节点就地嫁接"
publishDate: "2026-11-06T12:00:00+08:00"
description: "LeetCode 114：对比先序破坏性修改与逆先序后序连接，再利用 Morris 前驱线索化将左子树就地嫁接到右侧，实现 O(1) 辅助空间展开。"
---

[LeetCode 114. 二叉树展开为链表](https://leetcode.cn/problems/flatten-binary-tree-to-linked-list/)（Hot 100）要求将给定的二叉树就地展开为单链表：展开后的节点顺序必须严格与二叉树的先序遍历（根节点 $\to$ 左子树 $\to$ 右子树）一致，且展开后每个节点的 `left` 指针必须置为 `nullptr`，`right` 指针作为单链表的后继指针指向下一个节点。

展开契约的关键在于**就地破坏性修改的保护机制**：若尝试在常规先序遍历（根 $\to$ 左 $\to$ 右）中直接将当前节点的 `right` 指针重定向为左子树展开链表，原本的 `root->right` 指针就会被立即覆盖，导致尚未遍历的右子树失去寻址入口。

## 指针重构的演进：从状态缓存到原地借用

这一指针冲突与单链表在就地重构时的挑战高度相通。在[《随机链表的复制：哈希表与交织节点》](/notes/algorithm/copy-list-with-random-pointer/)中，深拷贝操作面临着 `random` 指针跨节点寻址时被提前覆盖的风险；交织节点法通过将副本节点就地插入到原节点之后，原地借用原链表结构传递关系，从而将辅助空间由哈希表的 $O(n)$ 压缩为 $O(1)$。

在二叉树展开为链表的问题中，同样存在两类经典的结构重构策略：
1. **逆先序递归（右 $\to$ 左 $\to$ 根）**：反向先序拓扑，先展开右子树并维护全局链表头指针，自底向上返回时当前节点可以直接接入后续已完成的单链表，避开指针覆盖冲突；
2. **Morris 前驱节点就地嫁接**：借用二叉树中叶节点的空指针域，将右子树提前拼接到左子树的末尾，彻底摆脱递归调用栈，在严格 $O(1)$ 辅助空间下完成原地结构变形[^morris-threading]。

## Python：逆先序 DFS 自底向上缝合

常规先序遍历的生成序列为：`[根, [左子树先序], [右子树先序]]`。
若将访问顺序完全倒置为“**右子树 $\to$ 左子树 $\to$ 根节点**”，序列则变为：`[[右子树逆先序], [左子树逆先序], 根]`。

在这一顺序下，整棵树的根节点恰好是最后一个被处理的节点。我们只需在外部维护一个指针 `prev`，记录“已经组装完毕的链表头部”（初始为 `None`）。当访问当前节点 `node` 时，其右子树与左子树均已完成转换并按序串联在 `prev` 之后，此时可直接执行单链表拼接操作：

```python
from typing import Optional


class Solution:
    def flatten(self, root: Optional[TreeNode]) -> None:
        """Do not return anything, modify root in-place instead."""
        prev: Optional[TreeNode] = None

        def reverse_preorder(node: Optional[TreeNode]) -> None:
            nonlocal prev
            if node is None:
                return

            # Traverse right child first, then left child, finally current node.
            reverse_preorder(node.right)
            reverse_preorder(node.left)

            # Re-wire pointers: link current node to the already flattened chain.
            node.right = prev
            node.left = None
            prev = node

        reverse_preorder(root)
```

逆先序递归由于将收集与拼接延后到子树递归完成之后，巧妙避免了任何显式栈与集合存储，但在树高度较大时仍需要 $O(h)$ 的调用栈空间。

## C++：Morris 前驱节点就地嫁接（常量辅助空间）

为了达成常数辅助空间的终极优化，我们需要从拓扑顺序中挖掘出二叉树先序遍历的几何性质：
- 在先序遍历中，`root->right` 节点在何时被访问？
- 答案是：**必须在 `root->left` 子树的所有节点全部遍历完毕后**，才轮到 `root->right`！
- 而 `root->left` 子树中最后一个被先序遍历访问的节点，正是 `root->left` 的**最右叶子节点**（即 `root->right` 在先序遍历序列中的前驱节点）。

因此，如果 `current->left != nullptr`：
1. 沿着 `current->left` 一路向右，定位到左子树的最右节点 `predecessor`；
2. 将 `predecessor->right` 指向原 `current->right`（将右子树无缝嫁接到左子树的末端）；
3. 将 `current->right` 重定向为 `current->left`，并将 `current->left` 清空为 `nullptr`；
4. `current` 沿右指针推进至 `current->right`，重复上述过程，直至整棵树被拉直为单向右链表[^sedgewick-algs]。

```cpp
class Solution {
public:
    void flatten(TreeNode* root) {
        TreeNode* current = root;

        while (current != nullptr) {
            if (current->left != nullptr) {
                // Find the rightmost node of the left subtree (inorder predecessor).
                TreeNode* predecessor = current->left;
                while (predecessor->right != nullptr) {
                    predecessor = predecessor->right;
                }

                // Graft the original right subtree to the predecessor's right pointer.
                predecessor->right = current->right;

                // Move the left subtree to the right, and clear the left child.
                current->right = current->left;
                current->left = nullptr;
            }

            // Advance downward along the newly formed right branch.
            current = current->right;
        }
    }
};
```

### 复杂度分析

- **时间复杂度 $O(n)$**：外层循环遍历展开后的每个节点；内层寻找最右节点的操作中，树中的每一条边至多被 `predecessor` 遍历访问 2 次。因此所有边转移的总次数与边数 $n-1$ 成严格线性比例，总时间复杂度为 $O(n)$。
- **辅助空间复杂度 $O(1)$**：算法完全在原树节点指针域上进行原地修改，不需要任何显式栈、哈希表或系统递归栈帧开销。

[^morris-threading]: [J. M. Morris (1979): "Traversing binary trees simply and cheaply"](https://doi.org/10.1016/0020-0190(79)90068-1)——讨论通过动态重定位树节点的指针实现无栈原位遍历与拓扑重构的构造范式。

[^sedgewick-algs]: [Robert Sedgewick & Kevin Wayne: 《算法》(Algorithms 4th Edition)](https://algs4.cs.princeton.edu/)——第 3 章树型数据结构的指针修改与不变量维护。
