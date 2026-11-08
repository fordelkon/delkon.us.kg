---
title: "二叉树中的最大路径和：负收益归零剪枝与树上后序贡献"
publishDate: "2026-11-11T12:00:00+08:00"
description: "LeetCode 124 二叉树中的最大路径和，剖析单侧延伸贡献与最高拐点结算的解耦设计，处理全负节点初始化与负收益归零剪枝，对比 Python 与 C++ 树形 DP 实现。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 124. 二叉树中的最大路径和](https://leetcode.cn/problems/binary-tree-maximum-path-sum/)（Hot 100）要求计算二叉树中任意两个节点之间路径的最大节点值之和。路径被定义为一条沿父子连接移动的节点序列，同一个节点在一条路径中至多出现一次，且路径**至少包含一个节点**，不一定经过根节点 `root`。树中节点数量满足 $n \in [1, 3 \times 10^4]$，节点值范围为 $[-1000, 1000]$。

## 拐点结算与负收益归零剪枝

本题是[《二叉树的直径：单侧深度贡献与拐点路径全局结算》](/posts/algorithm/diameter-of-binary-tree/)的带权进阶版。在求二叉树直径时，每多走一条边都会使路径长度加 $1$，因此最长路径的端点必为无向树中无法再延伸的端点（度数为 1；单节点树除外），其中也可能包含只有一个孩子的根节点；而在本题中，节点权值可能为负数，继续向下延伸反而可能拉低总和，路径完全可以在半途截断。

这里需要先区分树上两类不同的路径方向约束：在[《路径总和 III：树上前缀和与回溯状态恢复》](/posts/algorithm/path-sum-iii/)中，路径被限制为只能从父节点走向子节点（单向直链），不能跨越某一点同时连接左右两棵子树；而本题允许路径从左子树向上爬升到某个节点 $u$，再折向进入右子树。正如[《二叉树的最近公共祖先：自底向上状态汇聚与分治判定》](/posts/algorithm/lowest-common-ancestor-of-a-binary-tree/)中所示，树中任意一条简单路径都有且仅有一个深度最小的最高拐点 $u$[^clrs-trees]。

遵循[《从调用栈理解递归》](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中的后序分解原则，我们对每个节点 $u$（记其权值为 $v_u$）在后序位置依次完成负收益剪枝、拐点全局结算与单侧向上汇报[^sicp-tree]：

1. **负收益归零剪枝**：设 $g(u)$ 表示从节点 $u$ 出发、仅向单侧子树向下延伸所能获得的最大路径和。当 $u$ 从左孩子 `u.left` 拿到单侧最大贡献后，如果该贡献为负数，把左子树接入路径只会减少总和，此时应当直接舍弃左子树分支（等价于取贡献为 $0$）。同理处理右孩子 `u.right`。约定空子树的贡献为 $g(\varnothing) = 0$；非空节点的 $g(u)$ 必须包含 $u$，可以在该节点结束。设裁剪后的左右单侧非负贡献分别为 $l(u)$ 与 $r(u)$：

$$
l(u) = \max(0, g(\text{left})), \qquad r(u) = \max(0, g(\text{right}))
$$

2. **拐点全局结算与单侧向上汇报**：在获得非负的左右单侧贡献 $l(u)$ 和 $r(u)$ 后，以 $u$ 为最高拐点的最大路径和 $s(u)$ 可以同时囊括节点 $u$ 自身以及左右两侧的非负分支，用于更新全局最大路径和 `max_sum`；而当函数向 $u$ 的父节点返回时，由于简单路径不能在 $u$ 处同时分叉走左右两路，返回值 $g(u)$ 只能选取左右分支中较大的一侧加上 $v_u$：

$$
s(u) = v_u + l(u) + r(u), \qquad g(u) = v_u + \max(l(u), r(u))
$$

注意，$u$ 自身的值 $v_u$ 即使是负数，也必须包含在 $s(u)$ 和 $g(u)$ 中——因为以 $u$ 为拐点的非空路径必然经过 $u$，且向父节点汇报以 $u$ 为起点的连通分支时也不能跳过 $u$（至于 $g(u)$ 是否会因为负数而被父节点舍弃，将由父节点的 `max(0, ...)` 决定）。

## Python：非空根节点初始化与后序递归

题目保证二叉树至少包含 $1$ 个节点。如果将全局最大值初始化为 $0$，当树中所有节点均为负数（例如单节点 `[-3]`）时会错误返回 $0$。在 Python 中，除了使用 `float("-inf")`，更直接的做法是用 `root.val` 初始化 `max_sum`（配合 `nonlocal` 声明[^py-nonlocal]），从而让 `max_sum` 全程保持 `int` 类型，省去末尾的浮点转整型操作：

```python
from typing import Optional


class Solution:
    def maxPathSum(self, root: Optional[TreeNode]) -> int:
        assert root is not None
        max_sum = root.val

        def max_gain(node: Optional[TreeNode]) -> int:
            nonlocal max_sum
            if node is None:
                return 0

            # Prune branches with negative net contribution by clamping at 0.
            left_gain = max(0, max_gain(node.left))
            right_gain = max(0, max_gain(node.right))

            # Settle the best path that uses `node` as its highest turning point.
            max_sum = max(max_sum, node.val + left_gain + right_gain)

            # Only one downward branch can be extended to `node`'s parent.
            return node.val + max(left_gain, right_gain)

        max_gain(root)
        return max_sum
```

## C++：极小值初始化与引用参数更新

在 C++ 中，可以使用 `<limits>` 中的 `std::numeric_limits<int>::min()`[^cpp-limits] 作为初始下界，并在后序回退时通过 `std::max`[^cpp-max] 进行单侧裁剪与全局更新：

```cpp
#include <algorithm>
#include <limits>

class Solution {
    int maxGain(const TreeNode* node, int& max_sum) const {
        if (node == nullptr) {
            return 0;
        }

        // Discard negative subtree contributions before combining at `node`.
        const int left_gain = std::max(0, maxGain(node->left, max_sum));
        const int right_gain = std::max(0, maxGain(node->right, max_sum));

        // Update global optimum with `node` acting as the highest turning point.
        max_sum = std::max(max_sum, node->val + left_gain + right_gain);

        // Return the maximum single-branch gain extendable to the parent.
        return node->val + std::max(left_gain, right_gain);
    }

public:
    int maxPathSum(const TreeNode* root) const {
        int max_sum = std::numeric_limits<int>::min();
        maxGain(root, max_sum);
        return max_sum;
    }
};
```

## 复杂度与同构问题对比

后序遍历对全部 $n$ 个节点各访问一次，每次回退仅执行常数次比较与加法运算，总时间复杂度为 $O(n)$。两种实现都只读输入树，返回一个整数；辅助空间取决于递归调用栈的最大深度，即按节点层数计的树高 $h$，为 $O(h)$（平衡树为 $O(\log n)$，最坏链状树为 $O(n)$）。题目给定范围内，任意路径和的绝对值不超过 $3 \times 10^7$，可由 32 位有符号整数容纳；若扩大输入范围，C++ 需相应拓宽累加类型。树高可达 $3 \times 10^4$，Python 递归可能触及解释器限制，C++ 也可能耗尽线程栈；深树需要显式栈保存后序计算状态。

若把计分方式改为边数，返回子树节点高度并用左右高度之和更新答案，就得到[《二叉树的直径：单侧深度贡献与拐点路径全局结算》](/posts/algorithm/diameter-of-binary-tree/)。反之，如果题目禁止路径在拐点处折返连接左右子树，要求路径必须严格沿着父节点向子节点单向行进，并统计路径和恰好等于目标值的方案数，则思考方向需要从“自底向上的后序贡献汇报”切换为“自顶向下的前缀和传递与回溯恢复”，详见[《路径总和 III：树上前缀和与回溯状态恢复》](/posts/algorithm/path-sum-iii/)。

[^clrs-trees]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——Appendix B.5 介绍树的基础概念；本文据树上唯一路径推导最高拐点及两侧贡献的组合。

[^sicp-tree]: [SICP §2.2.2: Hierarchical Structures](https://sicp.sourceacademy.org/chapters/2.2.2.html)——阐述树形递归中子问题解的归纳合成方法。

[^py-nonlocal]: [Python 文档：`nonlocal` 语句](https://docs.python.org/3/reference/simple_stmts.html#the-nonlocal-statement)——说明嵌套函数修改外层非全局变量的词法作用域规则。

[^cpp-limits]: [cppreference：`std::numeric_limits::min`](https://en.cppreference.com/w/cpp/types/numeric_limits/min.html)——说明如何获取有符号整型可表示的最小有限值。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明 `<algorithm>` 中的极大值函数模板。
