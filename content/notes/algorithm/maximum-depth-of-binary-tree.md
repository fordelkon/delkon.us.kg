---
title: "二叉树的最大深度：后序分解合并与调用栈深度"
publishDate: "2026-11-07T12:00:00+08:00"
description: "LeetCode 104：从树形递归的分解与合并模型出发，对比后序递归与层序遍历的空间边界，推导调用栈深度与树高的映射关系。"
---

[LeetCode 104. 二叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-binary-tree/)（Hot 100）要求计算给定二叉树的**最大深度**（maximum depth），即从根节点到最远叶子节点的最长路径上的节点总数（空树深度为 0，单节点树深度为 1）[^sicp-tree]。

二叉树自身具有递归结构：任意非空节点 `node` 都由根节点本身、左子树 `node.left` 和右子树 `node.right` 构成。求整棵树的最大深度，可以直接映射为[《从调用栈理解递归》](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中讨论的**分解与合并**（divide and merge）模型：

1. 基本情况：若当前节点为空（`node is None`），路径上不包含任何节点，深度为 $0$。
2. 子问题分解：分别求左子树 `node.left` 的最大深度 $d_L$ 与右子树 `node.right` 的最大深度 $d_R$。
3. 后序合并：当前子树的最大深度等于左右子树最大深度的较大值加上当前节点自身贡献的 $1$ 层：

$$
d(u) = \max(d_L, d_R) + 1
$$

由于父节点的深度依赖左右子树的深度结果，合并计算必须发生在左右子树递归调用返回之后的后序位置。这种“后序回退汇总单侧深度贡献”的模式是许多树形路径问题的共同骨架——例如在[《二叉树的直径：单侧深度贡献与拐点路径全局结算》](/notes/algorithm/diameter-of-binary-tree/)中，递归函数返回值完全复用此处的最大深度定义，仅在后序合并时额外用左右深度的和 $d_L + d_R$ 更新全局最长路径。

## Python：后序分治实现

在 Python 中，可以直接按照上述递推关系写出后序分治实现[^py-max]：

```python
from typing import Optional


class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if root is None:
            return 0
        # Post-order merge: a parent's depth can only be resolved after
        # both subtrees have returned their maximum root-to-leaf depths.
        left_depth = self.maxDepth(root.left)
        right_depth = self.maxDepth(root.right)
        return max(left_depth, right_depth) + 1
```

递归执行期间，调用栈中同时存活的栈帧对应从根节点到当前访问节点的单条树路径。当递归深入左子树时，右子树的调用尚未发生；当左子树全部回退完毕并释放栈帧后，右子树才开始入栈。因此，调用栈的峰值深度严格等于树的最大深度 $h$。

## C++：后序递归与求值顺序约束

在 C++ 中实现相同的后序分治时，建议将 `maxDepth(root->left)` 与 `maxDepth(root->right)` 拆分为两条独立语句，再传入 `std::max`[^cpp-max]：

```cpp
#include <algorithm>

class Solution {
public:
    int maxDepth(const TreeNode* root) const {
        if (root == nullptr) {
            return 0;
        }
        // Sequence the two recursive calls explicitly; function argument
        // evaluation order in C++ is unspecified inside std::max(f(), g()).
        const int left_depth = maxDepth(root->left);
        const int right_depth = maxDepth(root->right);
        return std::max(left_depth, right_depth) + 1;
    }
};
```

C++ 标准规定函数实参的求值顺序是未指定的（unspecified）[^cpp-eval]。虽然求最大深度是无副作用的只读调用、先走左子树还是先走右子树不影响返回结果，但在带有共享状态或访问顺序要求的树形 DFS 中，显式绑定 `left_depth` 与 `right_depth` 能够保证确定的左子树优先遍历顺序，并在调试时直接观察两侧子树的返回值。

## 空间边界对比：调用栈深度与队列前沿宽度

除后序 DFS 外，也可以复用[《二叉树的层序遍历：队列前沿管理与批量按层弹出》](/notes/algorithm/binary-tree-level-order-traversal/)中的按层推进框架：每次在循环开头锁定当前层节点数 `level_size = q.size()`，将该层节点全部弹出并推入下一层非空子节点，每完成一层批处理就将层数计数器加 $1$。

两种方案在时间开销上都必须访问全部 $n$ 个节点，每次访问仅执行常数次指针判空与算术比较，时间复杂度均为 $O(n)$。二者的核心差异体现在辅助空间复杂度的树形依赖上：后序 DFS 的辅助空间取决于树的高度 $h$，即 $O(h)$；在平衡二叉树中 $h = O(\log n)$，而在退化为单链表的极端情况下 $h = n$。与之相对，层序 BFS 的辅助空间取决于树的最大层宽 $w$，即 $O(w)$；在退化链状树上每层仅有 $1$ 个节点，队列峰值空间为 $O(1)$，但在满二叉树的最底层包含约 $\lceil n / 2 \rceil$ 个叶子节点，队列峰值空间达到 $O(n)$。当树高极大但每层较窄时适合用层序 BFS 规避调用栈溢出；当树接近完全二叉树且层宽较大时，后序 DFS 的 $O(\log n)$ 栈空间更为紧凑。

[^sicp-tree]: [SICP §2.2.2: Hierarchical Structures](https://sicp.sourceacademy.org/chapters/2.2.2.html)——将树视为由分支递归构成的层次结构，树上的聚合性质可分解为子树同一性质的递归组合。

[^py-max]: [Python 文档：内置函数 `max`](https://docs.python.org/3/library/functions.html#max)——说明 `max(arg1, arg2)` 返回两个参数中的较大值，用于后序合并左右子树深度。

[^cpp-max]: [cppreference：`std::max`](https://en.cppreference.com/w/cpp/algorithm/max.html)——说明 `<algorithm>` 中的最大值比较函数接口与常数时间保证。

[^cpp-eval]: [cppreference：求值顺序](https://en.cppreference.com/w/cpp/language/eval_order.html)——说明 C++ 函数调用中各实参表达式的求值顺序未指定，分句求值可确立确定的遍历次序。
