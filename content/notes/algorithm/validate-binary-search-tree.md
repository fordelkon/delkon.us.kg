---
title: "验证二叉搜索树：开区间上下界收缩与中序严格单调"
publishDate: "2026-11-13T12:00:00+08:00"
description: "LeetCode 98 验证二叉搜索树，剖析仅比对子节点的局部判定陷阱，详解开区间上下界收缩与中序严格递增两种判定范式，以及 C++ 应对 INT_MIN/MAX 边界的类型安全策略。"
---

[LeetCode 98. 验证二叉搜索树](https://leetcode.cn/problems/validate-binary-search-tree/)（Hot 100）要求判断给定的二叉树是否为有效的二叉搜索树（Binary Search Tree, BST）。

根据二叉搜索树的严格定义，一个有效的 BST 必须满足：
1. 节点的左子树只包含**小于**当前节点的所有键值；
2. 节点的右子树只包含**大于**当前节点的所有键值；
3. 节点的左右子树各自也必须是二叉搜索树。

## 局部判定的经典陷阱

初学者容易写出仅在局部检查直接子节点的错误代码：

```text
// 错误示例：仅作局部比较
if (node.left && node.left.val >= node.val) return false;
if (node.right && node.right.val <= node.val) return false;
return isValid(node.left) && isValid(node.right);
```

以树 `[5, 4, 6, null, null, 3, 7]` 为例：根节点为 `5`，其右孩子为 `6`，`6` 的左孩子为 `3`。
- 在节点 `6` 处局部观察：$3 < 6 < 7$，左右孩子完全符合局部大小关系；
- 但从整棵树的全局约束来看，节点 `3` 位于根节点 `5` 的右子树中，右子树的所有节点值都必须严格大于 `5`，因此节点 `3` 违反了 BST 的全局不变量。

BST 的约束是全局性的，子树中的每个节点都背负着所有祖先节点施加的累积约束。

## 范式一：开区间上下界自顶向下收缩

将全局约束自顶向下传递，等价于为每个子树维护一个合法开区间 $(l, r)$：
- 根节点的初始合法范围为 $(-\infty, +\infty)$；
- 递归进入左子树时，当前节点成为左子树所有节点的严格上界，右边界收缩：$(l, \text{node.val})$；
- 递归进入右子树时，当前节点成为右子树所有节点的严格下界，左边界收缩：$(\text{node.val}, r)$；
- 任意节点只要其值不严格落在开区间 $(l, r)$ 内（即 $\text{val} \le l$ 或 $\text{val} \ge r$），整棵树即判定非法。

### C++ 中整型极值的溢出陷阱

LeetCode 给定的节点值范围覆盖了 32 位有符号整型的全部取值 $[-2^{31}, 2^{31}-1]$。
如果使用 `int` 传递上下界，将初始界限设为 `INT_MIN` 与 `INT_MAX`：
- 若根节点本身就是 `INT_MIN`，判断条件 `node->val <= low` 会误报非法；
- 若将区间转为闭区间试图加减 1，`INT_MAX + 1` 会直接触发有符号整型溢出的未定义行为（Undefined Behavior）。

稳妥的解决方案有两种：
1. **拓宽数据类型**：将边界提升为 `long long`，使用更宽广的数域避免截断；
2. **`std::optional<int>`**：更具类型安全的现代 C++ 写法[^cpp-optional]，用 `std::nullopt` 原生表达“无上界”或“无下界”，完全解耦对数值类型位宽的假设。

## 范式二：中序遍历与严格单调递增映射

二叉搜索树与中序遍历之间存在一条核心定理：**一棵二叉树是有效的二叉搜索树，当且仅当它的中序遍历访问序列是严格单调递增的**[^clrs-bst]。

在[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/notes/algorithm/binary-tree-inorder-traversal/)中，我们详细分析了中序遍历“左 $\to$ 根 $\to$ 右”的访问顺序。只要在遍历过程中维护前驱节点的值 `prev`，在每次访问当前节点时校验：

$$
\text{prev} < \text{curr.val}
$$

一旦遇到 $\text{curr.val} \le \text{prev}$，说明存在逆序或相等重复值，可立刻提前终止。

## Python：开区间与中序比较

Python 的整数支持任意精度，且内置 `float("-inf")` 与 `None`，表达开区间非常直观：

```python
from typing import Optional


class Solution:
    def isValidBST(self, root: Optional[TreeNode]) -> bool:
        # In-order traversal tracking the strictly preceding value.
        prev: Optional[int] = None

        def inorder(node: Optional[TreeNode]) -> bool:
            nonlocal prev
            if node is None:
                return True

            if not inorder(node.left):
                return False

            # BST invariant requires strictly increasing sequence.
            if prev is not None and node.val <= prev:
                return False
            prev = node.val

            return inorder(node.right)

        return inorder(root)
```

## C++：开区间收缩与可选值边界

以下给出基于开区间自顶向下收缩的 C++ 实现，采用 `long long` 拓宽边界，逻辑清晰高效：

```cpp
#include <climits>

class Solution {
public:
    bool isValidBST(TreeNode* root) {
        // Expand bounds to 64-bit integer to prevent INT_MIN / INT_MAX overflow.
        return validate(root, LLONG_MIN, LLONG_MAX);
    }

private:
    bool validate(TreeNode* node, long long low, long long high) {
        if (node == nullptr) {
            return true;
        }

        // Current node must strictly reside in open interval (low, high).
        if (node->val <= low || node->val >= high) {
            return false;
        }

        // Left branch tightens high bound; right branch tightens low bound.
        return validate(node->left, low, node->val) &&
               validate(node->right, node->val, high);
    }
};
```

若使用 `std::optional<int>` 编写，代码不依赖宽整型，直接表达开区间的存在性：

```cpp
#include <optional>

class Solution {
public:
    bool isValidBST(TreeNode* root) {
        return validate(root, std::nullopt, std::nullopt);
    }

private:
    bool validate(TreeNode* node, std::optional<int> low, std::optional<int> high) {
        if (node == nullptr) {
            return true;
        }

        if ((low.has_value() && node->val <= *low) ||
            (high.has_value() && node->val >= *high)) {
            return false;
        }

        return validate(node->left, low, node->val) &&
               validate(node->right, node->val, high);
    }
};
```

## 复杂度对比

- **时间复杂度**：两种方法均为 $O(n)$。在最坏情况下需要检查所有 $n$ 个节点；一旦检测到破坏单调性或越界的情况，均能提前返回剪枝。
- **空间复杂度**：$O(h)$，其中 $h$ 为树高。调用栈在平衡树下为 $O(\log n)$，在单支退化树下为 $O(n)$。

开区间法在自顶向下的前序阶段即刻进行区间剪枝；中序单调法则便于与迭代显式栈配合，在流式处理中尽早发现逆序对。

[^clrs-bst]: Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein. *Introduction to Algorithms*, 4th Edition. MIT Press, 2022. 定理 12.1（Inorder Tree Walk）：如果 $x$ 是一棵包含 $n$ 个结点的二叉搜索树的根，则中序遍历将在 $\Theta(n)$ 时间内按关键字的递增顺序输出树中的所有键。
[^cpp-optional]: [cppreference: `std::optional`](https://en.cppreference.com/w/cpp/utility/optional)——说明可选对象的语义与无值哨兵的表达规范。
