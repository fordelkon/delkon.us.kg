---
title: "二叉树中的最大路径和：负收益归零剪枝与树上后序贡献"
publishDate: "2026-11-11T12:00:00+08:00"
description: "LeetCode 124 二叉树中的最大路径和，剖析单侧延伸贡献与最高拐点结算的解耦设计，处理全负节点初始化与负收益归零剪枝，对比 Python 与 C++ 树形 DP 实现。"
---

[LeetCode 124. 二叉树中的最大路径和](https://leetcode.cn/problems/binary-tree-maximum-path-sum/)（Hot 100）要求计算二叉树中任意两个节点之间路径的最大节点值之和。路径被定义为一条从树中任意节点出发，沿父节点-子节点连接到达任意节点的序列，同一个节点在一条路径中至多出现一次，且路径至少包含一个节点。

## 树上路径与最高拐点：单侧延伸与双侧闭合的解耦

树中的任意一条简单路径，在层级结构上必然存在一个深度最浅的节点——即路径两端节点的最近公共祖先（LCA），我们称其为该路径的**最高拐点**。路径从该拐点出发，至多分别向左子树和右子树向下延伸一条不分叉的单向链。

直接枚举路径的两端节点需要 $O(n^2)$ 的时间。树形动态规划的核心在于解耦两个不同的概念：
1. **子树向父节点贡献的单侧最大路径和**：从当前节点出发向某个子树向下延伸的单链最大和。因为父节点若要将当前节点纳为其路径的一部分，当前节点只能提供一条单向延伸分支，不能同时将左右两条子树分支都连向父节点（否则在当前节点处出现三叉分流，不再是简单路径）。
2. **以当前节点为最高拐点的全局最大路径和**：当前节点将左子树提供的非负收益、右子树提供的非负收益以及自身节点值拼装在一起，形成形如倒 V 字的完整局部路径。该路径的权值和仅用来竞争全局最大值，不可向上返回。

这一模式与后序遍历天然契合：只有先递归求出左右子树能够向上贡献的收益，当前节点才能完成局部拐点路径的结算与自身向上贡献的计算[^clrs-tree-dp]。在[《从调用栈理解递归》中的分解与合并](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中，这类“自底向上汇总子问题解以构造当前层状态”的操作正是树形递归的标准范式。

## 负收益归零剪枝与全负节点初始化

与常规树遍历不同，节点值可以为负数（题目给定取值范围 $[-1000, 1000]$）。这引入了两个关键边界：

- **负收益归零剪枝**：如果某个子树能提供的单侧最大贡献为负数，那么连接该子树只会使总路径和减少。根据贪心原则，路径完全可以在当前节点处断开，选择不包含该子分支。因此子树的有效贡献应定义为 $\max(0, \text{gain})$。
- **全负节点初始化**：当整棵树的所有节点值均为负数（例如单节点 `[-3]` 或树 `[-2, -1]`）时，根据“路径至少包含一个节点”的契约，全局最优路径必然是数值最大的那个单负数节点。因此全局最大值必须初始化为负无穷大（在 C++ 中为 `std::numeric_limits<int>::min()`[^cpp-numeric-limits]，在 Python 中为 `-float("inf")`），绝不能随意初始化为 `0`，否则全负数树会错误地输出 `0`。

## Python：后序遍历自底向上回传

在 Python 中，通过嵌套函数闭包维护全局最大值 `max_path`，辅助函数 `max_gain` 严格遵循“计算单侧向下贡献”的契约：

```python
from typing import Optional


class Solution:
    def maxPathSum(self, root: Optional[TreeNode]) -> int:
        max_path = -float("inf")

        def max_gain(node: Optional[TreeNode]) -> int:
            nonlocal max_path
            if node is None:
                return 0

            # Prune negative branches: a negative contribution only reduces the path sum.
            left_gain = max(0, max_gain(node.left))
            right_gain = max(0, max_gain(node.right))

            # Current node acts as the highest turnaround node: combine left and right branches.
            current_path_sum = node.val + left_gain + right_gain
            if current_path_sum > max_path:
                max_path = current_path_sum

            # Return the single-branch maximum extension to the parent caller.
            return node.val + max(left_gain, right_gain)

        max_gain(root)
        return int(max_path)
```

## C++：极值初始化与局部拐点全局结算

C++ 实现中，显式引入标准库 `<algorithm>` 与 `<limits>`。辅助函数返回值表示以当前节点为起点的单向最大延伸链，传引用更新全局答案：

```cpp
#include <algorithm>
#include <limits>

class Solution {
public:
    int maxPathSum(TreeNode* root) {
        int max_sum = std::numeric_limits<int>::min();
        maxGain(root, max_sum);
        return max_sum;
    }

private:
    int maxGain(TreeNode* node, int& max_sum) {
        if (node == nullptr) {
            return 0;
        }

        // Drop subtrees that produce negative net gains.
        const int left_gain = std::max(0, maxGain(node->left, max_sum));
        const int right_gain = std::max(0, maxGain(node->right, max_sum));

        // Turnaround path at current node combines both branches.
        const int turnaround_sum = node->val + left_gain + right_gain;
        max_sum = std::max(max_sum, turnaround_sum);

        // A path extending up to parent can only choose one downward branch.
        return node->val + std::max(left_gain, right_gain);
    }
};
```

## 复杂度与同构问题对比

每个节点在后序遍历中被访问常数次，总时间复杂度为 $O(n)$。空间复杂度取决于调用栈的最大深度，即树的高度 $h$：在平衡二叉树中最优为 $O(\log n)$，在退化为单链表的最坏情况下为 $O(n)$。

本题在结构上与[《二叉树的直径：单侧深度贡献与拐点路径全局结算》](/notes/algorithm/diameter-of-binary-tree/)完全同构：
- 543 题（直径）中，边权为无权计数，单侧向上贡献为子树最大深度（加 1 向上回传），最高拐点处将左右子树深度相加更新全局直径；
- 124 题（最大路径和）中，点权带有正负权值，单侧向上贡献加上了 $\max(0, \cdot)$ 的负收益剪枝，最高拐点处将左右有效贡献与当前点权三者相加更新全局最大和。

明确了“单侧回传供父节点延伸”与“双侧汇总闭合为最高拐点”的不变量分离，树上一切两端点路径最优化问题都能统一在相同的后序汇总模型之下。

[^clrs-tree-dp]: Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein. *Introduction to Algorithms*, 4th Edition. MIT Press, 2022. 第 14 章关于动态规划与最优子结构在层次树结构上的自底向上结算论证。
[^cpp-numeric-limits]: [cppreference: `std::numeric_limits`](https://en.cppreference.com/w/cpp/types/numeric_limits)——说明各基本数据类型的极值常数与安全获取机制。
