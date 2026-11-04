---
title: "二叉树展开为链表：逆先序递归与前驱节点就地嫁接"
publishDate: "2026-11-06T12:00:00+08:00"
description: "LeetCode 114：对比先序破坏性修改与逆先序后序连接，再利用左子树最右节点就地嫁接右子树，实现 O(1) 辅助空间展开。"
---

[LeetCode 114. 二叉树展开为链表](https://leetcode.cn/problems/flatten-binary-tree-to-linked-list/)（Hot 100）要求将给定的二叉树原地展开为单链表：展开后的节点顺序必须与二叉树的**先序遍历**（preorder traversal，根 $\to$ 左子树 $\to$ 右子树）一致，其中每个节点的 `right` 指针指向链表中的下一个节点，而 `left` 指针一律置为空。

如果在正向先序遍历过程中直接执行 `node.right = node.left`，原本挂在 `node.right` 下的右子树引用就会在尚未被访问前被覆盖丢失。正如[《从调用栈理解递归》](/posts/understanding-recursion/#前序中序与后序是操作位置的区别)所分析的，当原地修改会破坏后续子问题所需的指针时，要么把改写动作推迟到子问题全部返回之后，要么在改写前提前为原右子树在左子树中找到正确的挂载位置。

## Python：逆先序递归与头插回溯

正向先序遍历的访问顺序是“根 $\to$ 左 $\to$ 右”。如果反过来按照“右子树 $\to$ 左子树 $\to$ 根”的**逆先序**（reverse preorder）次序执行递归并在回溯时改写指针，那么当控制流退回当前节点 `node` 时，其右子树和左子树都已经各自展开成了有序链表，且外部维护的指针 `prev` 恰好指向“紧随 `node` 之后的先序后继链表头”[^py-nonlocal]。此时只需令 `node.right = prev`、`node.left = None`，再将 `prev` 更新为 `node`，即可安全完成头插而不会丢失任何未访问分支[^sicp-recursion]：

```python
from typing import Optional


class Solution:
    def flatten(self, root: Optional[TreeNode]) -> None:
        prev: Optional[TreeNode] = None

        def dfs(node: Optional[TreeNode]) -> None:
            nonlocal prev
            if node is None:
                return
            # Process right then left so `prev` always holds the already-flattened preorder successor.
            dfs(node.right)
            dfs(node.left)
            node.right = prev
            node.left = None
            prev = node

        dfs(root)
```

设二叉树共有 $n$ 个节点，树高为 $h$。每个节点恰好被访问一次并执行常数次指针赋值，时间复杂度为 $O(n)$；递归调用栈的深度取决于树高，辅助空间为 $O(h)$，平衡树为 $O(\log n)$，最坏单链为 $O(n)$，并可能触及 Python 递归限制。展开结果复用输入节点，不另占 $O(n)$ 输出空间。

## C++：左子树最右节点就地嫁接

要将辅助空间进一步压缩至 $O(1)$，可以借鉴[《随机链表的复制：哈希表与交织节点》](/notes/algorithm/copy-list-with-random-pointer/)中利用原结构指针暂存拓扑关系的思路，以及[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/notes/algorithm/binary-tree-inorder-traversal/)中寻找左子树最右节点的技巧，在迭代推进中直接完成子树嫁接[^morris-1979]。

考察当前节点 `curr`。若 `curr->left` 为空，则 `curr` 已经满足单链表形态，直接令 `curr = curr->right` 推进即可。若 `curr->left` 非空，按照先序遍历“根 $\to$ 左子树 $\to$ 右子树”的规则，原右子树 `curr->right` 应当紧接在整棵左子树所有节点访问完毕之后被访问。

从 `curr->left` 沿 `right` 走到底找到 `predecessor`，把原右子树挂到它的空 `right` 上。`predecessor` 未必是左子树的先序末节点：它还可能有左子树。但先序遍历会先访问这棵左子树，再进入新挂上的右子树；而右链上其余祖先的左子树也都在到达 `predecessor` 前访问完毕。因此，嫁接后的先序序列仍是“原左子树序列 + 原右子树序列”。再令 `curr->right = curr->left`、`curr->left = nullptr`，整个局部改写保持先序序列不变。

循环始终维持：`curr` 之前的已处理前缀中，每个节点的 `left` 都为空，`right` 都指向原先序序列中的下一节点。局部改写使 `curr` 也满足这一条件，再沿 `right` 前进，便将前缀延长一个节点；循环结束时，全部节点都已按原先序序列连接。两种实现都复用原节点并永久修改输入树，不创建新节点。

与[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/notes/algorithm/binary-tree-inorder-traversal/)相比，中序 Morris 遍历将 `predecessor->right` 临时指向当前根节点 `curr` 并在第二次经过时恢复为 `nullptr`；而本题的目标本就是将原树重排为单链表，因此直接将 `predecessor->right` 永久指向 `curr->right`，随后沿着改写后的 `curr = curr->right` 单向推进，无需回溯拆桥：

```cpp
class Solution {
public:
    void flatten(TreeNode* root) {
        TreeNode* curr = root;
        while (curr != nullptr) {
            if (curr->left != nullptr) {
                TreeNode* predecessor = curr->left;
                while (predecessor->right != nullptr) {
                    predecessor = predecessor->right;
                }
                // Graft original right subtree onto the rightmost node of the left subtree
                // so it is visited immediately after the entire left subtree finishes.
                predecessor->right = curr->right;
                curr->right = curr->left;
                curr->left = nullptr;
            }
            curr = curr->right;
        }
    }
};
```

外层游标 `curr` 沿右链单向走过全部 $n$ 个节点；内层指针 `predecessor` 仅在左子树的右边界上向下滑动，每条原本属于左子树右边界的边至多被内层循环滑过一次，随后便随着上层左子树的右移汇入主链，总时间复杂度严格为 $O(n)$。由于全程仅使用 `curr` 与 `predecessor` 两个指针变量，额外辅助空间复杂度为 $O(1)$[^sicp-iter]。

[^py-nonlocal]: [Python 文档：`nonlocal` 语句](https://docs.python.org/3/reference/simple_stmts.html#the-nonlocal-statement)——说明内层嵌套函数如何绑定并更新外层函数作用域中的变量 `prev`。

[^sicp-recursion]: [SICP §5.1.4: Using a Stack to Implement Recursion](https://sicp.sourceacademy.org/chapters/5.1.4.html)——说明递归调用如何保存并恢复待完成的上下文；本题指针重连的正确性由正文的访问顺序与 `prev` 不变量说明。

[^morris-1979]: [J. M. Morris: _Traversing binary trees simply and cheaply_ (Information Processing Letters, 1979)](<https://doi.org/10.1016/0020-0190(79)90068-1>)——提出利用左子树最右节点的空闲右指针编码后续访问路径的思想，本题在此基础上将临时回溯线索改为对原右子树的永久嫁接。

[^sicp-iter]: [SICP §1.2.1: Linear Recursion and Iteration](https://sicp.sourceacademy.org/chapters/1.2.1.html)——对比需要维护延迟操作链的递归过程与仅靠固定数量状态变量推进的常数空间迭代过程。
