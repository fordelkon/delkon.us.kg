---
title: "从前序与中序遍历构造二叉树：根划分与哈希常数定位"
publishDate: "2026-11-16T12:00:00+08:00"
description: "LeetCode 105：利用前序首元素定位根节点、中序遍历划分左右子树规模，借助哈希表实现 O(1) 索引映射以消除线性查找，在双闭区间内递归重构二叉树。"
---

[LeetCode 105. 从前序与中序遍历序列构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/)（Hot 100）要求根据一棵二叉树的前序遍历序列 `preorder` 和中序遍历序列 `inorder`（保证无重复值）重构出该二叉树。

二叉树的重构依赖遍历序列对子树边界的显式划分。前序遍历的结构契约为 `[根节点, [左子树前序], [右子树前序]]`，而中序遍历的结构契约为 `[[左子树中序], 根节点, [右子树中序]]`。由于树中所有节点值互不相同，前序序列区间的首个元素 `preorder[pre_l]` 必然在当前子树的中序序列中唯一对应一个下标 $k$。正是这个中序位置 $k$ 将整棵子树切分为左、右两个独立的几何分支。

## 从线性查找退化到哈希常数定位

若在每层递归中都通过线性扫描（如 Python 的 `inorder.index(...)` 或 C++ 的 `std::find`）在当前中序区间寻找根节点位置，在整棵树退化为单侧倾斜链的最坏情况下，每层都要遍历剩余全部元素，总时间复杂度将恶化为：

$$
\sum_{k=1}^n k = O(n^2)
$$

正如在[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)中所展示的核心思想——通过建立哈希表索引以空间换时间，消解反复嵌套的线性扫描——我们可以在进入递归之前预先对中序序列执行一趟哈希映射，建立 `val -> index` 的常数时间查询表。这样在递归向下构建子树时，定位根节点在中序序列中的位置仅需平均 $O(1)$ 时间，从而将整棵树的构造耗时严格压缩至 $O(n)$。

## 双闭区间映射不变量

设当前子树在前序遍历中的闭区间为 $[pre\_l, pre\_r]$，在中序遍历中的闭区间为 $[in\_l, in\_r]$。
1. 当前子树的根节点值为 `root_val = preorder[pre_l]`；
2. 通过哈希表查得其在中序序列中的对应下标 $k$；
3. 左子树在中序序列中的范围为 $[in\_l, k - 1]$，节点数量为 $size_L = k - in\_l$；
4. 右子树在中序序列中的范围为 $[k + 1, in\_r]$，节点数量为 $size_R = in\_r - k$。

由于前序遍历中左子树节点紧随根节点之后，前序区间的划分被完全确定：
- **左子树**：前序区间 $[pre\_l + 1, pre\_l + size_L]$，中序区间 $[in\_l, k - 1]$；
- **右子树**：前序区间 $[pre\_l + size_L + 1, pre\_r]$，中序区间 $[k + 1, in\_r]$。

当 $pre\_l > pre\_r$ 或 $in\_l > in\_r$ 时，区间内已无可用节点，递归到达基本情况，返回 `None` / `nullptr`。

## Python：哈希预处理与索引递归

通过向内层函数传递双区间的起始与结束下标，避免了在递归调用中切片数组带来的多次内存分配开销：

```python
from typing import Optional


class Solution:
    def buildTree(
        self, preorder: list[int], inorder: list[int]
    ) -> Optional[TreeNode]:
        # Precompute the index of each value in inorder traversal.
        in_pos: dict[int, int] = {val: i for i, val in enumerate(inorder)}

        def build(
            pre_l: int, pre_r: int, in_l: int, in_r: int
        ) -> Optional[TreeNode]:
            if pre_l > pre_r:
                return None

            root_val = preorder[pre_l]
            root = TreeNode(root_val)

            # Locate root index in inorder sequence in O(1) time.
            k = in_pos[root_val]
            left_size = k - in_l

            root.left = build(pre_l + 1, pre_l + left_size, in_l, k - 1)
            root.right = build(pre_l + left_size + 1, pre_r, k + 1, in_r)
            return root

        return build(0, len(preorder) - 1, 0, len(inorder) - 1)
```

## C++：容量预留与零拷贝重构

C++ 实现中利用 `std::unordered_map::reserve` 预先分配桶空间，防止因动态扩容重散列引发的额外开销[^cpp-unordered-map]；`preorder` 与 `inorder` 全程以常引用传递，仅通过整型下标传递树的边界：

```cpp
#include <unordered_map>
#include <vector>

// Definition for a binary tree node.
class Solution {
    std::unordered_map<int, int> in_pos;

    TreeNode* build(const std::vector<int>& preorder,
                    int pre_l,
                    int pre_r,
                    int in_l,
                    int in_r) {
        if (pre_l > pre_r) {
            return nullptr;
        }

        // The first element in the preorder range is the root.
        const int root_val = preorder[pre_l];
        auto* root = new TreeNode(root_val);

        // O(1) lookup for the partition point in inorder sequence.
        const int k = in_pos.find(root_val)->second;
        const int left_size = k - in_l;

        root->left = build(preorder, pre_l + 1, pre_l + left_size, in_l, k - 1);
        root->right = build(preorder, pre_l + left_size + 1, pre_r, k + 1, in_r);
        return root;
    }

public:
    TreeNode* buildTree(const std::vector<int>& preorder,
                        const std::vector<int>& inorder) {
        in_pos.clear();
        in_pos.reserve(inorder.size());
        for (int i = 0; i < static_cast<int>(inorder.size()); ++i) {
            in_pos.emplace(inorder[i], i);
        }
        return build(preorder, 0, static_cast<int>(preorder.size()) - 1,
                     0, static_cast<int>(inorder.size()) - 1);
    }
};
```

## 序列重构的充要性与复杂度

在二叉树遍历重构问题中，必须至少有一个遍历序列提供**根节点的左右划分依据**[^sicp-tree]。前序序列（根-左-右）和后序序列（左-右-根）仅能提供根节点的身份信息，当一个父节点仅拥有单个子节点时，前序后序都无法判断该子节点是左孩子还是右孩子。而中序序列以根节点为绝对锚点，强行将左侧与右侧的拓扑边界隔开，这是序列能够无二义性重建二叉树的根本原因。

- **时间复杂度**：构造哈希表耗时 $O(n)$。树中包含 $n$ 个节点，每次递归调用构造 1 个节点并执行一次常数时间哈希查找，递归共发生 $n$ 次有效调用，总时间复杂度为 $O(n)$。
- **空间复杂度**：哈希表存储 $n$ 个节点的映射，占用 $O(n)$ 辅助空间。递归调用栈深度由树的高度决定：最好情况（高度平衡树）为 $O(\log n)$，最坏情况（退化单链）为 $O(n)$。因此总辅助空间为 $O(n)$。

[^cpp-unordered-map]: [cppreference：`std::unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明预留指定元素数量的存储桶以避免动态插入时的 rehash 抖动。

[^sicp-tree]: [SICP Section 2.3.3: Representing Sets](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——讨论基于符号标签与二叉分支的构造器（Constructor）与选择器（Selector）的数据抽象与结构递归还原。
