---
title: "验证二叉搜索树：开区间上下界收缩与中序严格单调"
publishDate: "2026-11-13T12:00:00+08:00"
description: "LeetCode 98：剖析仅比对直接子节点的局部判定陷阱，对比开区间上下界收缩与中序严格递增两种判定方式，并处理 C++ 整型极值边界。"
---

[LeetCode 98. 验证二叉搜索树](https://leetcode.cn/problems/validate-binary-search-tree/)（Hot 100）要求判断给定的二叉树是否是一个有效的**二叉搜索树**（binary search tree, BST）。有效二叉搜索树满足以下定义[^clrs-bst]：

1. 节点的左子树只包含严格小于当前节点的数。
2. 节点的右子树只包含严格大于当前节点的数。
3. 所有左子树和右子树自身必须也是二叉搜索树。

## 局部判定的陷阱

初学者常见的实现误区是只检查每个节点与其左右直接子节点的大小关系，即对当前节点 `node` 仅测试 `node.left.val < node.val` 与 `node.right.val > node.val`。这种局部检查在如下层序输入 `[5, 4, 6, null, null, 3, 7]` 上会给出错误结果：

```text
      5
     / \
    4   6
       / \
      3   7
```

在节点 `6` 处，其左子节点 `3` 和右子节点 `7` 满足 $3 < 6 < 7$；在根节点 `5` 处，直接子节点满足 $4 < 5 < 6$。然而节点 `3` 位于根节点 `5` 的右子树内部，却违反了“右子树所有节点必须严格大于 $5$”的全局约束。因此，合法性判定不能只看父子相邻两层，而必须把祖先节点的约束传递到整棵子树，或者将其转化为全局序列的单调性检验。

## 两种核心判定范式

围绕祖先约束的传递方向，可以得到两种等价的判定方法，分别对应[《从调用栈理解递归》](/posts/understanding-recursion/)中讨论的两种跨层数据流动通道：

### 范式一：自顶向下收缩开区间

第一种思路通过函数参数自顶向下传递合法的取值开区间 $(l, r)$。根节点没有祖先限制，初始区间为 $(-\infty, +\infty)$。当检查当前节点值 $x$（对应代码中的 `node.val`）时：

- 若 $x \le l$ 或 $x \ge r$，说明当前节点越过了某个祖先设定的边界，直接返回 `false`。
- 递归进入左子树时，左子树所有节点必须严格小于 $x$，因此上界收紧为 $x$，合法区间变为 $(l, x)$。
- 递归进入右子树时，右子树所有节点必须严格大于 $x$，因此下界收紧为 $x$，合法区间变为 $(x, r)$。

刚才的反例 `[5, 4, 6, null, null, 3, 7]` 中，根节点 `5` 向右子树传入区间 $(5, +\infty)$，节点 `6` 再向左子树传入收紧后的区间 $(5, 6)$。当检查节点 `3` 时，因 $3 \notin (5, 6)$ 立即识别出非法。

### 范式二：中序遍历验证严格递增

根据二叉搜索树的结构性质，按“左子树 $\to$ 根节点 $\to$ 右子树”顺序执行中序遍历时，访问到的节点值序列必然单调递增[^clrs-bst]。在题目要求严格不等号的前提下，整棵树是合法 BST 当且仅当其中序序列严格递增。

这与[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/notes/algorithm/binary-tree-inorder-traversal/)及[《二叉搜索树中第 K 小的元素：中序遍历与迭代提前终止》](/notes/algorithm/kth-smallest-element-in-a-bst/)共享同一性质。实现时无需先将整棵树的值收集到数组中再做二次扫描，只需在遍历过程中维护前驱节点值 `prev`：每访问一个当前节点 `curr`，立即校验 `curr.val > prev` 是否成立，随后将 `prev` 更新为 `curr.val`。一旦遇到 `curr.val <= prev` 即可提前返回 `False`。

| 判定范式       | 跨层状态通道                   | 核心不变量                          | 提前终止时机                    |
| :------------- | :----------------------------- | :---------------------------------- | :------------------------------ |
| 开区间收缩     | 递归参数向下传值 `(low, high)` | 当前子树内所有节点值 $v \in (l, r)$ | 首次遇到 $v \le l$ 或 $v \ge r$ |
| 中序单调性检验 | 遍历状态记录前驱 `prev`        | 当前访问值严格大于中序前驱值        | 首次遇到 `curr.val <= prev`     |

## Python：显式栈中序遍历与前驱校验

Python 的 `float("-inf")` 可以直接与任意整数比较[^python-compare]。利用显式栈模拟中序遍历，既消除了深层树上的函数调用开销，又能在发现逆序对时直接返回：

```python
from typing import Optional


class Solution:
    def isValidBST(self, root: Optional[TreeNode]) -> bool:
        stack: list[TreeNode] = []
        curr = root
        prev = float("-inf")

        # Inorder traversal of a valid BST must yield a strictly increasing sequence.
        while curr is not None or stack:
            while curr is not None:
                stack.append(curr)
                curr = curr.left
            curr = stack.pop()
            if curr.val <= prev:
                return False
            prev = curr.val
            curr = curr.right

        return True
```

设树中节点总数为 $n$，树高为 $h$。每个节点至多入栈、出栈各一次，时间复杂度为 $O(n)$；栈中同时保留的节点数不超过从根到当前节点的路径长度，辅助空间复杂度为 $O(h)$，在平衡树上为 $O(\log n)$，最坏退化为链状树时为 $O(n)$。

## C++：开区间递归与整型极值边界

在 C++ 中实现开区间收缩法时，需要特别处理 32 位有符号整数的极值边界。如果用 `INT_MIN` 和 `INT_MAX` 作为初始开区间 `(low, high)`[^cpp-climits]，当测试用例恰好只有单个节点 `[2147483647]`（即 `INT_MAX`）时，开区间判定 `node->val >= high` 会将该合法节点误判为越界。

工程上有两种常见的无歧义边界写法：

1. 将上下界类型拓宽为 64 位整数 `long long`，并用 `LLONG_MIN` 与 `LLONG_MAX` 初始化开区间[^cpp-climits]。因为 32 位 `int` 的全部取值都严格落在 `(LLONG_MIN, LLONG_MAX)` 内部，根节点不会在初始边界上触发假阳性。
2. 若节点值本身已经是 `long long` 或泛化比较类型，无法继续拓宽位宽，则可将上下界声明为对应值类型的 `std::optional<T>`（或传入 `const TreeNode*` 边界指针），用 `std::nullopt` 显式表达“尚无上界/下界”[^cpp-optional]。

下面给出位宽拓宽的递归实现：

```cpp
#include <climits>

class Solution {
    bool validate(const TreeNode* node, long long low, long long high) const {
        if (node == nullptr) {
            return true;
        }
        // Every node in the current subtree must stay strictly inside (low, high).
        if (node->val <= low || node->val >= high) {
            return false;
        }
        return validate(node->left, low, node->val) &&
               validate(node->right, node->val, high);
    }

public:
    bool isValidBST(const TreeNode* root) const {
        return validate(root, LLONG_MIN, LLONG_MAX);
    }
};
```

递归过程在失败时会短路，每个节点至多访问一次，最坏时间为 $O(n)$；递归栈深度为 $O(h)$，平衡树为 $O(\log n)$，最坏单链为 $O(n)$，深树可能耗尽 C++ 线程栈。两种方法都只读输入树，返回布尔值；显式栈实现可直接提前退出，若改用 Morris，则须先确保所有临时线索都已恢复。

[^clrs-bst]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 12 章给出二叉搜索树的定义及定理 12.1（Inorder tree walk prints the keys of a binary search tree in sorted order）。

[^python-compare]: [Python 文档：值比较](https://docs.python.org/3/reference/expressions.html#value-comparisons)——说明 Python 数值类型 `int` 与 `float('-inf')` 跨类型比较时的全序规则。

[^cpp-climits]: [cppreference：`<climits>`](https://en.cppreference.com/w/cpp/types/climits.html)——定义 `INT_MIN`、`INT_MAX` 与 `LLONG_MIN`、`LLONG_MAX` 等整型极值宏，支撑将 `int` 节点边界拓宽至 `long long` 的范围安全性。

[^cpp-optional]: [cppreference：`std::optional`](https://en.cppreference.com/w/cpp/utility/optional.html)——说明可选值包装器的语义，适合在不拓宽整数位宽时无歧义地表达“无上下界”状态。
