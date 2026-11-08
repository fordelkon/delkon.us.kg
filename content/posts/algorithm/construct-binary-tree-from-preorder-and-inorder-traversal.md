---
title: "从前序与中序遍历构造二叉树：根划分与哈希常数定位"
publishDate: "2026-11-16T12:00:00+08:00"
description: "LeetCode 105：利用前序首元素定位根节点、中序遍历划分左右子树规模，借助哈希表实现平均 O(1) 索引定位以消除逐次线性查找，在双闭区间内递归重构二叉树。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 105. 从前序与中序遍历序列构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/)（Hot 100）给定两个整数数组 `preorder` 和 `inorder`，其中 `preorder` 是二叉树的**先序遍历**（preorder traversal），`inorder` 是同一棵树的**中序遍历**（inorder traversal），要求构造二叉树并返回其根节点。题目保证树中没有重复元素。

## 双序列互补性质与区间划分

在[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/posts/algorithm/binary-tree-inorder-traversal/)与[《将有序数组转换为二叉搜索树：中点二分与高度平衡构建》](/posts/algorithm/convert-sorted-array-to-binary-search-tree/)中可以看到，单独一个中序遍历序列无法唯一还原二叉树的拓扑形态——108 题之所以能只凭一个升序数组建树，是因为题目允许自由构造任意高度平衡的 BST，从而可以直接取区间中点作为根。而本题要还原的是形态唯一固定的原始二叉树，切分点不能靠折半猜测，必须由先序序列显式给出：

- 先序遍历遵循“根节点 $\to$ 左子树 $\to$ 右子树”，因此当前子树的先序闭区间 $[l_{\text{pre}}, r_{\text{pre}}]$（对应代码中的 `[pre_l, pre_r]`）的首元素必然是当前子树的根节点。
- 中序遍历遵循“左子树 $\to$ 根节点 $\to$ 右子树”，一旦在当前中序闭区间 $[l_{\text{in}}, r_{\text{in}}]$（对应代码中的 `[in_l, in_r]`）中找到该根节点的下标 $k$，区间便自然划分为左子树 $[l_{\text{in}}, k - 1]$ 与右子树 $[k + 1, r_{\text{in}}]$。

由于同一棵左子树在两种遍历中包含的节点个数完全相等，记左子树节点数为：

$$
s_L = k - l_{\text{in}}
$$

即可直接推算出先序区间内左右子树的精确分界：紧随根节点之后的连续 $s_L$ 个元素构成左子树的先序区间 $[l_{\text{pre}} + 1, l_{\text{pre}} + s_L]$，剩余部分构成右子树的先序区间 $[l_{\text{pre}} + s_L + 1, r_{\text{pre}}]$。

```text
preorder: [ 根节点 | <--- 左子树 (s_L 个) ---> | <--- 右子树 ---> ]
           l_pre    l_pre + 1      l_pre + s_L  l_pre + s_L + 1  r_pre

inorder:  [ <--- 左子树 (s_L 个) ---> | 根节点 | <--- 右子树 ---> ]
           l_in                 k - 1    k      k + 1            r_in
```

确定左右子树的双区间边界后，问题便拆解为规模更小的两个同构子问题，符合[《从调用栈理解递归》](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中的分解与合并模型[^sicp-trees]。每次由先序首项确定唯一根，再由中序中的唯一位置确定两个更小区间，递归即可唯一还原原树。

## 借助哈希表消除线性查找

如果在每层递归中都用线性扫描在中序区间 $[l_{\text{in}}, r_{\text{in}}]$ 内寻找根节点下标 $k$，当原树退化为单侧链状树时，每次切分耗时 $O(n), O(n - 1), \dots, O(1)$，总时间复杂度会恶化为 $O(n^2)$。

由于题目保证节点值互不相同，可以借鉴[《两数之和：先查补数，再记下标》](/posts/algorithm/two-sum/)中的空间换时间思路：在递归开始前先遍历一次 `inorder`，用哈希表建立“节点值 $\to$ 中序下标”的映射 `in_pos`。这样每次递归只需平均 $O(1)$ 时间即可查出根位置 $k$，将总体建树时间降为平均 $O(n)$；极端哈希冲突下仍可能退化为 $O(n^2)$。

## Python：预建字典与区间分治

注意左子树规模 $s_L = k - l_{\text{in}}$ 已经完全由 `pre_l`、`pre_r` 和 `in_l` 确定，递归辅助函数只需接收 `pre_l`、`pre_r`、`in_l` 三个边界下标即可推导出全部子区间：

```python
from typing import Optional


class Solution:
    def buildTree(
        self, preorder: list[int], inorder: list[int]
    ) -> Optional[TreeNode]:
        in_pos = {val: idx for idx, val in enumerate(inorder)}

        def build(
            pre_l: int, pre_r: int, in_l: int
        ) -> Optional[TreeNode]:
            if pre_l > pre_r:
                return None

            root_val = preorder[pre_l]
            k = in_pos[root_val]
            left_size = k - in_l

            # Partition preorder into left_size elements for the left subtree
            # and the remaining elements for the right subtree.
            root = TreeNode(root_val)
            root.left = build(pre_l + 1, pre_l + left_size, in_l)
            root.right = build(pre_l + left_size + 1, pre_r, k + 1)
            return root

        return build(0, len(preorder) - 1, 0)
```

## C++：局部只读哈希表与节点所有权

在 C++ 实现中，应将哈希表 `in_pos` 作为 `buildTree` 的局部变量构造，并通过 `const std::unordered_map<int, int>&` 只读引用传给私有辅助函数 `build`，以便把映射的生命周期限制在一次调用内。若使用成员变量，必须在每次调用前重新初始化，才能避免历史数据与额外内存残留。

建表前调用 `in_pos.reserve(n)` 预先分配哈希桶以避免多次重散列[^unordered-reserve]；在 `build` 内由于 `in_pos` 为 `const` 引用，使用 `in_pos.find(root_val)->second` 直接读取下标[^unordered-find]。递归中每次通过 `new TreeNode(root_val)` 动态分配节点[^cpp-new]，整棵二叉树节点的所有权归调用方或评测框架管理：

```cpp
#include <unordered_map>
#include <vector>

class Solution {
    TreeNode* build(const std::vector<int>& preorder,
                    int pre_l,
                    int pre_r,
                    int in_l,
                    const std::unordered_map<int, int>& in_pos) const {
        if (pre_l > pre_r) {
            return nullptr;
        }
        const int root_val = preorder[pre_l];
        const int k = in_pos.find(root_val)->second;
        const int left_size = k - in_l;

        // Partition preorder into [pre_l + 1, pre_l + left_size] for the left
        // subtree and [pre_l + left_size + 1, pre_r] for the right subtree.
        TreeNode* root = new TreeNode(root_val);
        root->left = build(preorder, pre_l + 1, pre_l + left_size, in_l, in_pos);
        root->right = build(preorder, pre_l + left_size + 1, pre_r, k + 1, in_pos);
        return root;
    }

public:
    TreeNode* buildTree(const std::vector<int>& preorder,
                        const std::vector<int>& inorder) const {
        const int n = static_cast<int>(inorder.size());
        std::unordered_map<int, int> in_pos;
        in_pos.reserve(inorder.size());
        for (int i = 0; i < n; ++i) {
            in_pos.emplace(inorder[i], i);
        }
        return build(preorder, 0, n - 1, 0, in_pos);
    }
};
```

设树中节点总数为 $n$，树高为 $h$（按节点层数计）。建表与递归定位切分点的平均总时间为 $O(n)$，极端哈希冲突下最坏为 $O(n^2)$。返回树占 $O(n)$ 节点空间，另计的哈希表占 $O(n)$，递归栈占 $O(h)$（平衡树为 $O(\log n)$，最坏单链为 $O(n)$），总辅助空间为 $O(n)$。两种实现均不修改输入数组，创建的是新节点；输入沿用题目“无重复且来自同一棵树”的保证，C++ 才能直接解引用 `find` 的结果。深树可能触及 Python 递归限制或 C++ 线程栈容量。这里的 C++ 裸指针写法沿用评测接口：正常返回后由调用方释放整棵树；若中途分配抛异常，已建节点不会自动清理，不具有异常安全的资源回收保证。

[^sicp-trees]: [SICP §2.3.3: Example: Representing Sets](https://sicp.sourceacademy.org/chapters/2.3.3.html)——讨论二叉树的递归结构表示，以及树结构与线性列表之间的递归拆解与重构关系。

[^unordered-reserve]: [cppreference：`std::unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明按元素数量预分配哈希桶，按当前最大负载因子为预期元素数量设置桶容量；预留本身有成本，也不消除单个节点的分配成本。

[^unordered-find]: [cppreference：`std::unordered_map::find`](https://en.cppreference.com/w/cpp/container/unordered_map/find.html)——说明在 `const` 哈希表上以平均 $O(1)$ 时间查找键并返回指向键值对的只读迭代器。

[^cpp-new]: [cppreference：`new` 表达式](https://en.cppreference.com/w/cpp/language/new.html)——说明在堆内存动态分配并构造 `TreeNode` 节点的行为，节点生命周期由调用方负责释放。
