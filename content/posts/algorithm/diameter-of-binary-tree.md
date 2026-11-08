---
title: "二叉树的直径：单侧深度贡献与拐点路径全局结算"
publishDate: "2026-11-10T12:00:00+08:00"
description: "LeetCode 543：剖析树形 DP 中的职责解耦——后序遍历中向上层汇报单侧最大深度贡献，并在当前节点结算跨越左右子树的拐点路径，为树上路径极值问题奠定通用模型。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 543. 二叉树的直径](https://leetcode.cn/problems/diameter-of-binary-tree/)（Hot 100）给定一棵二叉树的根节点 `root`，要求返回该二叉树的**直径**（diameter）：即树中任意两个节点之间最长简单路径的**边数**（等于经过的节点数减 1）。这条路径可能经过根节点 `root`，也可能完全位于某棵子树内部。

## 拐点结算与单侧向上贡献的解耦

在无环连通的树结构中，任意一条简单路径都有且仅有一个深度最小的节点，称为这条路径的**最高拐点**（highest turning point）[^clrs-trees]——正如[《二叉树的最近公共祖先：自底向上状态汇聚与分治判定》](/posts/algorithm/lowest-common-ancestor-of-a-binary-tree/)所分析的，该拐点正是路径两端点的最近公共祖先（LCA）：路径从左子树某个节点向上爬升至该拐点，再折向进入右子树向下延伸（或者仅包含其中一侧）。

因此，“整棵树的最长简单路径”可以转化为：枚举树中每一个节点 $u$ 作为路径的最高拐点，计算以 $u$ 为最高点的最长路径边数 $d(u)$，并在所有节点上取全局最大值。

当节点 $u$ 作为路径的最高拐点时，从 $u$ 向左子树延伸所能获得的最大边数，恰好等于左子树的节点高度 $l(u)$（即[《二叉树的最大深度：后序分解合并与调用栈深度》](/posts/algorithm/maximum-depth-of-binary-tree/)中定义的子树最大节点深度）；同理，向右子树延伸的最大边数恰好等于右子树的高度 $r(u)$。因为一条从 $u$ 的左孩子 `u.left` 出发向下包含 $k$ 个节点的单链，内部包含 $k - 1$ 条边，再加上连接 $u$ 与 `u.left` 的 $1$ 条边，总边数恰好等于节点数 $k$。由此得到以 $u$ 为最高拐点的最长路径边数：

$$
d(u) = l(u) + r(u)
$$

如果对每个节点都单独调用一次求深度函数，树中大量节点会被重复扫描，最坏时间复杂度会退化至 $O(n^2)$。要在单次遍历中以 $O(n)$ 时间求解，关键在于利用[《从调用栈理解递归》](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中的后序分解与合并模型，将**局部拐点结算**与**单侧向上贡献**解耦[^sicp-tree]：

1. 在节点 $u$ 内部更新全局答案时，可以将左右两侧同时拼接，用 $l(u) + r(u)$ 更新外部维护的全局最大直径 `max_diameter`。
2. 当递归函数向父节点返回时，返回值代表从 $u$ 出发向下延伸的**单侧最大深度** $h(u) = 1 + \max(l(u), r(u))$，决不能返回 $l(u) + r(u)$。

原因在于简单路径不允许分叉：如果父节点将 $u$ 纳入其路径，路径在 $u$ 处只能选择左子树或右子树中的一条分支继续向下延伸；若同时纳入左右两支，路径就会在 $u$ 处形成三叉分流，不再是简单路径。

```text
          parent
            |  <-- 向父节点只能汇报单侧最大深度 1 + max(l(u), r(u))
            u  <-- 在 u 处结算跨左右子树的拐点路径边数 l(u) + r(u)
           / \
        l(u) r(u)
```

## Python：闭包变量与后序分解

在 Python 中，通过外层函数的局部变量 `max_diameter` 配合内层递归函数的 `nonlocal` 声明[^py-nonlocal]，可以在不引入类成员变量的情况下维护跨栈帧的全局极值，同时让递归函数的返回值纯粹承担“汇报子树高度”的职责：

```python
from typing import Optional


class Solution:
    def diameterOfBinaryTree(self, root: Optional[TreeNode]) -> int:
        max_diameter = 0

        def depth(node: Optional[TreeNode]) -> int:
            nonlocal max_diameter
            if node is None:
                return 0

            left_depth = depth(node.left)
            right_depth = depth(node.right)

            # Settle the longest path that uses `node` as its highest turning point.
            max_diameter = max(max_diameter, left_depth + right_depth)

            # A path extending to the parent cannot fork at `node`; return single-branch height.
            return 1 + max(left_depth, right_depth)

        depth(root)
        return max_diameter
```

## C++：引用参数透传与零动态分配

在 C++ 中，将 `int& max_diameter` 作为引用参数沿调用栈透传，每次入口调用都重新初始化答案，避免类成员状态残留；后序回退时通过 `std::max`[^cpp-max] 更新直径。这里不需要 `std::function`，也不为树节点分配动态内存：

```cpp
#include <algorithm>

class Solution {
    int depth(const TreeNode* node, int& max_diameter) const {
        if (node == nullptr) {
            return 0;
        }

        const int left_depth = depth(node->left, max_diameter);
        const int right_depth = depth(node->right, max_diameter);

        // Settle the candidate diameter bending across `node`.
        max_diameter = std::max(max_diameter, left_depth + right_depth);

        // Only a single downward branch can continue upward to the parent.
        return 1 + std::max(left_depth, right_depth);
    }

public:
    int diameterOfBinaryTree(const TreeNode* root) const {
        int max_diameter = 0;
        depth(root, max_diameter);
        return max_diameter;
    }
};
```

## 边界分析与相关问题延伸

需要注意，最长路径并不一定经过整棵树的根节点 `root`。当整棵树呈现“根部一侧只有短链，另一侧深层子树内部却有宽阔分叉”时，最长路径的最高拐点位于深层子树内部。因此必须在每个节点的后序位置都更新一次 `max_diameter`，而不能只在根节点计算 `depth(root.left) + depth(root.right)`。

设二叉树共有 $n$ 个节点，树高为 $h$（按节点层数计，空树为 0）。递归函数严格访问每个节点一次，每个节点内部仅执行常数次算术加法与比较操作，时间复杂度为 $O(n)$。辅助空间完全取决于递归调用栈的最大深度 $O(h)$：在平衡二叉树中为 $O(\log n)$，在退化为单链的最坏情况下为 $O(n)$。两种实现均只读输入树，返回整数不需要额外结果容器；深树上仍需留意 Python 递归限制与 C++ 线程栈容量。

本题建立的“后序递归向上返回单侧链贡献 + 当前节点作为最高拐点更新全局最优解”模型，是树上路径极值问题的通用基础。当边权固定为 $1$ 时，子树的深度非负，因此从当前节点向某个子树下探时，延伸到该子树最深叶子不会变差；一旦把“边数”推广为“带正负权值的节点和”，只需在接收左右子树贡献时增加一步 `max(0, gain)` 的负收益截断剪枝，即可直接过渡到[《二叉树中的最大路径和：负收益归零剪枝与树上后序贡献》](/posts/algorithm/binary-tree-maximum-path-sum/)。

[^clrs-trees]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——Appendix B.5 介绍自由树与有根树的基础概念；本文据唯一简单路径推导最高拐点的结算方式。

[^sicp-tree]: [SICP §2.2.2: Hierarchical Structures](https://sicp.sourceacademy.org/chapters/2.2.2.html)——阐述层次化树形结构上的递归分解与子问题结果组合模型。

[^py-nonlocal]: [Python 文档：`nonlocal` 语句](https://docs.python.org/3/reference/simple_stmts.html#the-nonlocal-statement)——说明内层嵌套函数如何绑定并修改外层封闭作用域中的非全局变量。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明 `<algorithm>` 中的最大值比较函数模板及其常数时间开销。
