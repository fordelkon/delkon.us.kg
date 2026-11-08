---
title: "对称二叉树：镜像双指针与成对入队检验"
publishDate: "2026-11-09T12:00:00+08:00"
description: "LeetCode 101：将一维双指针推广至树上镜像双指针，拆解结构与数值互为镜像的递归判定条件，并用 C++ 成对入队迭代检验规避调用栈开销。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 101. 对称二叉树](https://leetcode.cn/problems/symmetric-tree/)（Hot 100）要求判断一棵二叉树是否关于根节点轴对称。如果借用[《翻转二叉树：自顶向下镜像传递与自底向上重挂》](/posts/algorithm/invert-binary-tree/)的思路，先把根节点的右子树原地翻转，再检验左右两棵子树是否完全相同，虽然也能得出结论，但不仅修改了输入树结构，还需要额外遍历一轮。更直接的做法是在原树上同步推进两个指针，边遍历边比对镜像位置。

在链表问题中，我们已经多次使用双指针来表达对称或同步演进关系：在[《回文链表：把判定拆成三个指针原语》](/posts/algorithm/palindrome-linked-list/)中，受限于单向指针，该文的常数辅助空间方案先反转后半段链表，才能让两个指针从两端向中间同步比对；在[《相交链表：把状态判定收进循环条件》](/posts/algorithm/linked-list-intersection/)中，两个指针通过拼接路径同步前进，将判空与判等统一收进循环条件。这里需要比较两个镜像位置的结构与数值，直接让递归函数接收一对待比较的节点指针 `(t1, t2)`，便能把镜像关系写进递归参数，构成**镜像双指针**（mirror two pointers）。下文据树的递归结构[^sicp-tree]，将当前节点比较与子树交叉比较组合起来。

## 镜像判定的三项条件

给定一对待检验的子树根节点 `t1` 和 `t2`，它们互为镜像当且仅当同时满足结构对称、当前值相等以及子分支交叉对称：

1. 空指针边界：若 `t1` 与 `t2` 均为空，两处同为空，返回 `True`；若仅有一方为空，结构失配，直接返回 `False`。
2. 根节点数值比对：若 `t1.val != t2.val`，数值失配，返回 `False`。
3. 交叉递归下探：由于树关于中心轴对称，外侧分支 `t1.left` 必须与 `t2.right` 互为镜像，同时内侧分支 `t1.right` 必须与 `t2.left` 互为镜像。

```text
         1
       /   \
     [2]   [2]        <-- t1 与 t2 比对：值相同
     / \   / \
   [3] (4)(4) [3]     <-- 外侧：t1.left(3) 与 t2.right(3) 镜像
                          内侧：t1.right(4) 与 t2.left(4) 镜像
```

## Python：镜像双指针递归实现

将上述三步判定直接编码为辅助函数 `is_mirror(t1, t2)`，初始时从 `(root.left, root.right)` 启动：

```python
from typing import Optional


class Solution:
    def isSymmetric(self, root: Optional[TreeNode]) -> bool:
        if root is None:
            return True

        def is_mirror(
            t1: Optional[TreeNode], t2: Optional[TreeNode]
        ) -> bool:
            if t1 is None and t2 is None:
                return True
            if t1 is None or t2 is None:
                return False
            # Outer subtrees (t1.left, t2.right) and inner subtrees
            # (t1.right, t2.left) must both be mirror images.
            return (
                t1.val == t2.val
                and is_mirror(t1.left, t2.right)
                and is_mirror(t1.right, t2.left)
            )

        return is_mirror(root.left, root.right)
```

Python 的逻辑与运算符 `and` 具有短路求值特性[^py-bool]：一旦 `t1.val == t2.val` 为假，或者外侧子树 `is_mirror(t1.left, t2.right)` 返回 `False`，内侧子树的递归调用便会被立即跳过，不会产生多余的子树遍历。

## C++：成对入队与成对出队迭代检验

在 C++ 中，若希望避免深层递归带来的调用栈帧开销，可以将镜像双指针改写为显式队列迭代[^cpp-queue]。核心队列不变量是：**队列按两项一组存放待检验的镜像位置（允许包含 `nullptr`）；每次完整取出一组，追加的也是完整的组**。

```cpp
#include <queue>

class Solution {
public:
    bool isSymmetric(const TreeNode* root) const {
        if (root == nullptr) {
            return true;
        }
        std::queue<const TreeNode*> q;
        q.push(root->left);
        q.push(root->right);

        while (!q.empty()) {
            const TreeNode* t1 = q.front();
            q.pop();
            const TreeNode* t2 = q.front();
            q.pop();

            if (t1 == nullptr && t2 == nullptr) {
                continue;
            }
            if (t1 == nullptr || t2 == nullptr || t1->val != t2->val) {
                return false;
            }
            // Maintain the mirror-pair invariant by enqueuing outer children
            // together, followed by inner children together.
            q.push(t1->left);
            q.push(t2->right);
            q.push(t1->right);
            q.push(t2->left);
        }
        return true;
    }
};
```

注意在迭代版本中，空指针 `nullptr` 也会被成对压入队列。这是因为二叉树的结构信息包含在空指针位置中：如果忽略 `nullptr` 只将非空节点入队，左偏节点与右偏节点在队列中就会混同，无法区分 `t1->left` 非空而 `t2->right` 为空的不对称情形。将 `nullptr` 一并入队后，循环体顶部的判空分支即可统一拦截结构失配。

每次递归调用或队列弹出都会同步消解一对镜像节点，最坏情况下（整棵树完全对称）需要比对全部 $n$ 个节点，故时间复杂度为 $O(n)$。辅助空间方面，递归实现的调用栈深度不超过按节点层数计的树高 $h$，开销为 $O(h)$；迭代实现的队列中同时存放的节点与空指针数量取决于树的最大层宽 $w$，开销为 $O(w)$，最坏不超过 $O(n)$。两种实现都只读输入树，返回布尔值；递归在平衡树上占 $O(\log n)$ 栈空间，通用上界为 $O(h)$，深树可能触及 Python 递归限制。队列迭代消除了这项递归深度限制。

[^sicp-tree]: [SICP §2.2.2: Hierarchical Structures](https://sicp.sourceacademy.org/chapters/2.2.2.html)——将树形结构分解为分支子树的递归组合，同步遍历两棵子树可视为二元树形递归。

[^py-bool]: [Python 文档：布尔运算](https://docs.python.org/3/reference/expressions.html#boolean-operations)——说明 `x and y` 按短路规则求值，左侧为假时直接返回而不再求值右侧递归调用。

[^cpp-queue]: [cppreference：`std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——说明 FIFO 队列容器适配器支持常数时间的 `push`、`front` 与 `pop` 操作。
