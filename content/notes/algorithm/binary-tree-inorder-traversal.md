---
title: "二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化"
publishDate: "2026-11-03T12:00:00+08:00"
description: "LeetCode 94：从系统栈帧机制对比显式栈模拟，再利用 Morris 线索化在 O(1) 辅助空间下完成中序遍历并恢复树结构。"
---

[LeetCode 94. 二叉树的中序遍历](https://leetcode.cn/problems/binary-tree-inorder-traversal/)（Hot 100）要求返回给定二叉树节点值的**中序遍历**（inorder traversal）序列，即按照“左子树 $\to$ 根节点 $\to$ 右子树”的次序收集所有节点值。

对于树中任意非空节点 `u`，中序遍历序列维持如下偏序关系：其左子树 `u.left` 中的所有节点值均先于 `u.val` 出现，而右子树 `u.right` 中的所有节点值均晚于 `u.val` 出现。正如[《从调用栈理解递归》](/posts/understanding-recursion/#前序中序与后序是操作位置的区别)所分析的，前序、中序与后序遍历沿着完全相同的深度优先路径行进，核心区别仅在于访问当前节点的动作处于两次递归调用之间的哪个位置：中序遍历将 `u.val` 的收集置于 `u.left` 递归返回之后、`u.right` 递归进入之前。当二叉树满足二叉搜索树（BST）的有序性质时，这一左中右次序恰好将树结构映射为严格递增的线性序列，直接支撑了[《验证二叉搜索树：开区间上下界收缩与中序严格单调》](/notes/algorithm/validate-binary-search-tree/)中的单调性检验与[《二叉搜索树中第 K 小的元素：中序遍历与迭代提前终止》](/notes/algorithm/kth-smallest-element-in-a-bst/)中的按序计数。

## Python：递归与隐式系统调用栈

递归实现直接复刻了中序遍历的归纳定义。每当函数深入 `node.left` 时，语言运行时会在调用栈上压入当前调用的栈帧，挂起当前节点直到左子树完全返回[^sicp-recursion]：

```python
from typing import Optional


class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> list[int]:
        result: list[int] = []

        def dfs(node: Optional[TreeNode]) -> None:
            if node is None:
                return
            dfs(node.left)
            # Record node value only after its entire left subtree has returned.
            result.append(node.val)
            dfs(node.right)

        dfs(root)
        return result
```

设二叉树共有 $n$ 个节点，树高为 $h$。每个节点恰好触发一次函数调用与一次常数时间的列表追加 `result.append(node.val)`[^py-list]，时间复杂度为 $O(n)$。不计存储返回结果所需的空间，辅助空间取决于递归调用栈的最大深度 $O(h)$：在平衡二叉树上为 $O(\log n)$，而在退化为单链表的极端树形下达到 $O(n)$。

## C++：显式栈模拟深入与回溯

按照[《从调用栈理解递归》](/posts/understanding-recursion/#从递归改写为迭代)中将隐式调用栈转化为显式数据结构的思路，我们可以用 `std::vector<TreeNode*>` 维护尚未访问自身及右子树的祖先节点[^cpp-vector]。内层循环不断沿 `curr = curr->left` 深入并将沿途节点压栈，相当于递归展开阶段；当 `curr` 触底为空时，弹出栈顶节点收集其值，并将 `curr` 转向 `curr->right`，模拟从左子树回溯后进入右子树的过程：

```cpp
#include <vector>

class Solution {
public:
    std::vector<int> inorderTraversal(TreeNode* root) {
        std::vector<int> result;
        std::vector<TreeNode*> st;
        TreeNode* curr = root;

        while (curr != nullptr || !st.empty()) {
            // Defer visiting ancestor nodes until their left spines are exhausted.
            while (curr != nullptr) {
                st.push_back(curr);
                curr = curr->left;
            }
            curr = st.back();
            st.pop_back();
            result.push_back(curr->val);
            // Left subtree and root are done; transition to the right subtree.
            curr = curr->right;
        }
        return result;
    }
};
```

每个节点恰好进栈、出栈各一次，时间复杂度同样为 $O(n)$；显式栈 `st` 最多同时持有从根到当前叶节点的左倾祖先链，辅助空间复杂度仍为 $O(h)$。相比递归调用栈，显式栈把待回溯节点保存在堆内存连续缓冲区中，避开了固定大小线程栈帧的溢出风险。

## C++：Morris 线索化遍历

无论是系统调用栈还是显式栈，耗费 $O(h)$ 辅助空间的根本原因都在于：二叉树节点缺乏指向父节点的指针，一旦深入 `curr->left`，若不提前缓存 `curr`，遍历完左子树后便无法回到 `curr`。Joseph M. Morris 在 1979 年提出的**线索化遍历**（Morris traversal）利用左子树最右侧节点的空闲 `right` 指针临时记录这一回溯目标，从而消除了栈开销[^morris-1979]。

对于拥有非空左子树的当前节点 `curr`，其中序前驱 `pred` 是 `curr->left` 子树中沿右指针一路向下所能到达的最后一个节点。由于 `pred` 没有右孩子，`pred->right` 必然为空。Morris 遍历在首次到达 `curr` 时定位到 `pred`：

1. 若 `pred->right == nullptr`，说明左子树尚未访问。此时令 `pred->right = curr` 建立临时回溯线索，随后将 `curr` 移向 `curr->left`。
2. 若 `pred->right == curr`，说明之前建立的线索刚刚将控制流从左子树末端带回 `curr`，即左子树已完整遍历。此时将 `pred->right` 重置为 `nullptr` 以恢复原树拓扑，收集 `curr->val`，再将 `curr` 移向 `curr->right`。

这与[《二叉树展开为链表：逆先序递归与前驱节点就地嫁接》](/notes/algorithm/flatten-binary-tree-to-linked-list/)形成了清晰的对照：后者同样在左子树中寻找最右侧节点，但目的是将原右子树永久嫁接过去并清空 `left` 指针以完成先序原地展开；而 Morris 中序遍历借用 `pred->right` 建立临时环路，并在第二次经过 `curr` 时拆桥复原，在遍历结束时保持原树结构完全不变。

```cpp
#include <vector>

class Solution {
public:
    std::vector<int> inorderTraversal(TreeNode* root) {
        std::vector<int> result;
        TreeNode* curr = root;

        while (curr != nullptr) {
            if (curr->left == nullptr) {
                result.push_back(curr->val);
                curr = curr->right;
            } else {
                TreeNode* pred = curr->left;
                // Stop if we hit either the rightmost node or the existing thread back to curr.
                while (pred->right != nullptr && pred->right != curr) {
                    pred = pred->right;
                }

                if (pred->right == nullptr) {
                    // Thread the inorder predecessor back to curr before descending left.
                    pred->right = curr;
                    curr = curr->left;
                } else {
                    // Left subtree finished; restore original tree topology before moving right.
                    pred->right = nullptr;
                    result.push_back(curr->val);
                    curr = curr->right;
                }
            }
        }
        return result;
    }
};
```

虽然每次在 `curr` 处寻找前驱 `pred` 都需要沿左子树的右边界向下探测，但树中每条左子树的右边界在整场遍历中只会经历“建线索时向下走一次”与“拆线索时向下走一次”。树中全部 $n-1$ 条边被访问的次数上限为常数，总时间复杂度依然保持为 $O(n)$；由于全程仅维护 `curr` 与 `pred` 两个游标指针，额外辅助空间严格降至 $O(1)$。

| 实现策略 | 时间复杂度 | 辅助空间复杂度 | 树结构影响 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| 递归 DFS | $O(n)$ | $O(h)$ | 只读不修改 | 代码紧凑，树高受控场景 |
| 显式栈迭代 | $O(n)$ | $O(h)$ | 只读不修改 | 支持随时中断（如在 BST 中提前终止查找） |
| Morris 线索化 | $O(n)$ | $O(1)$ | 遍历中临时改写指针，结束时复原 | 严苛内存受限且允许遍历期间独占写树节点 |

[^sicp-recursion]: [SICP §5.1.4: Using a Stack to Implement Recursion](https://sicp.sourceacademy.org/chapters/5.1.4.html)——阐述递归过程在深入子调用时如何利用调用栈保存尚未完成的上下文，并在子问题返回后恢复执行。

[^py-list]: [Python 文档：列表操作](https://docs.python.org/3/tutorial/datastructures.html#more-on-lists)——说明 Python `list.append` 在动态数组末尾追加元素的平摊 $O(1)$ 时间开销。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——说明 `std::vector` 以连续内存存储元素，支持在尾部以平摊常数时间执行 `push_back` 与常数时间执行 `pop_back`，适合作为显式栈容器。

[^morris-1979]: [J. M. Morris: *Traversing binary trees simply and cheaply* (Information Processing Letters, 1979)](https://doi.org/10.1016/0020-0190(79)90068-1)——提出利用空闲右指针临时构建回溯线索、在 $O(1)$ 辅助空间与 $O(n)$ 时间内完成二叉树遍历并恢复原树结构的算法。
