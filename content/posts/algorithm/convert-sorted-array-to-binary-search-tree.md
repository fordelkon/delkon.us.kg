---
title: "将有序数组转换为二叉搜索树：中点二分与高度平衡构建"
publishDate: "2026-11-15T12:00:00+08:00"
description: "LeetCode 108：利用升序数组随机访问特性二分选取根节点，在闭区间内递归构建高度平衡二叉搜索树，对比链表二分开销与递归栈空间。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 108. 将有序数组转换为二叉搜索树](https://leetcode.cn/problems/convert-sorted-array-to-binary-search-tree/)（Hot 100）给定一个元素已按严格升序排列、没有重复值的整数数组 `nums`，要求将其转换为一棵**高度平衡**（height-balanced）二叉搜索树。高度平衡二叉树是指每个节点的左右两个子树的高度差的绝对值不超过 $1$。

在[《验证二叉搜索树：开区间上下界收缩与中序严格单调》](/posts/algorithm/validate-binary-search-tree/)中，我们利用“BST 的中序遍历序列严格递增”这一性质将二维树结构还原为一维有序序列。本题恰好是这一映射的逆过程：给定严格递增的中序序列 `nums`，将其折叠还原为一棵二叉搜索树[^sicp-trees]。

仅靠一维中序序列无法唯一确定二叉树的形态——任选序列中的一个元素作为根节点，其左侧子数组作为左子树、右侧子数组作为右子树，递归构造出的树都满足 BST 的大小约束。但题目额外要求树必须**高度平衡**。设数组长度为 $n$，若每次选区间首元素作为根，整棵树会退化为高度为 $n$ 的单支斜树；要使左右子树高度尽可能接近，直接的策略是在闭区间 $[l, r]$（对应代码中的下标区间 `[left, right]`）内选取区间中点：

$$
m = l + \lfloor (r - l) / 2 \rfloor
$$

将中点元素作为当前子树的根节点后，左子区间 $[l, m - 1]$ 的节点数为 $n_L = m - l$，右子区间 $[m + 1, r]$ 的节点数为 $n_R = r - m$。由于向下取整的性质，左右子树的规模差始终满足 $\lvert n_L - n_R \rvert \le 1$。以层数计高度、空树高度为 $0$，这一均分构造对规模为 $s$ 的子问题生成高度 $H(s) = \lceil \log_2(s + 1) \rceil$ 的树。左右规模相差至多 $1$，代入该高度公式可知高度也相差至多 $1$，并且两棵子树递归满足同一条件，因此整棵树高度平衡。节点数均分是保证高度平衡的一种充分构造，并非所有高度平衡树都要求左右节点数接近。这也是[《从调用栈理解递归》](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)中典型的分治构造过程。

当区间长度 $r - l + 1$ 为偶数时，取左中点 $m = l + \lfloor (r - l) / 2 \rfloor$ 或右中点 $m = l + \lceil (r - l) / 2 \rceil$ 会生成形态不同但同样高度平衡的合法 BST。

## 数组随机访问与链表中点扫描对比

同样是对有序序列做中点切分，底层容器的访问模型决定了分治的时间复杂度：

- 在本题的连续数组中，通过下标 `mid` 可以在 $O(1)$ 时间内直接随机访问中点元素[^cpp-vector]，无需拷贝切片或扫描区间。递推关系式为 $T(n) = 2T(n / 2) + O(1)$，总时间复杂度为 $O(n)$。
- 若输入改为单向有序链表（如 [LeetCode 109. 有序链表转换二叉搜索树](https://leetcode.cn/problems/convert-sorted-list-to-binary-search-tree/)），或者像[《排序链表：递归归并与自底向上归并》](/posts/algorithm/sort-list/)那样用快慢指针寻找链表中点，单次定位中点需要 $O(n)$ 的线性扫描开销，朴素顶层二分的递推式会变为 $T(n) = 2T(n / 2) + O(n)$，总时间上升为 $O(n \log n)$（链表场景下需结合中序遍历顺序同步推进链表头指针，才能降回 $O(n)$）。

## Python：闭区间下标递归

若递归传入 `nums[:mid]` 和 `nums[mid + 1:]`，每层切片都会复制元素，累计切片时间与累计分配量为 $O(n \log n)$。但顺序执行左右递归时，同时存活的切片规模沿调用链按几何级数递减，因此峰值辅助空间为 $O(n)$，不是 $O(n \log n)$；返回树的 $O(n)$ 节点空间另计。下面只传原数组引用与闭区间下标 `left`、`right`，既不修改输入，也避免切片：

```python
from typing import Optional


class Solution:
    def sortedArrayToBST(self, nums: list[int]) -> Optional[TreeNode]:
        def build(left: int, right: int) -> Optional[TreeNode]:
            if left > right:
                return None

            # Choosing the midpoint keeps the left and right subtree sizes balanced.
            mid = (left + right) // 2
            root = TreeNode(nums[mid])
            root.left = build(left, mid - 1)
            root.right = build(mid + 1, right)
            return root

        return build(0, len(nums) - 1)
```

## C++：闭区间分治与节点所有权

C++ 实现同样以 `const std::vector<int>&` 只读引用传递原数组[^cpp-vector]，并用 `left + (right - left) / 2` 计算中点下标 `mid`。递归函数每次通过 `new TreeNode(nums[mid])` 在堆上动态分配树节点[^cpp-new]，构造完成的整棵二叉树节点所有权交由调用方或评测框架在生命周期结束时管理与销毁。下列评测用裸指针代码不处理分配异常；若构造中途抛异常，已建子树不会自动释放：

```cpp
#include <vector>

class Solution {
    TreeNode* build(const std::vector<int>& nums, int left, int right) const {
        if (left > right) {
            return nullptr;
        }
        // Selecting the middle element keeps subtree sizes differing by at most 1.
        const int mid = left + (right - left) / 2;
        TreeNode* root = new TreeNode(nums[mid]);
        root->left = build(nums, left, mid - 1);
        root->right = build(nums, mid + 1, right);
        return root;
    }

public:
    TreeNode* sortedArrayToBST(const std::vector<int>& nums) const {
        return build(nums, 0, static_cast<int>(nums.size()) - 1);
    }
};
```

设数组长度为 $n$。数组中每个元素恰好作为中点被选作根节点一次，单次递归调用只做常数次算术与指针赋值，因此时间复杂度为 $O(n)$。不计返回树本身的 $n$ 个节点，递归调用栈的深度严格受平衡树高度限制，辅助空间复杂度为 $O(\log n)$。

[^sicp-trees]: [SICP §2.3.3: Example: Representing Sets](https://sicp.sourceacademy.org/chapters/2.3.3.html)——阐述有序表与平衡二叉搜索树的对应关系，以及通过折半递归在 $O(n)$ 步内由有序序列构造平衡树的过程。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——说明连续存储与 $O(1)$ 随机访问 `operator[]` 的保证，使按下标取中点无需额外拷贝。

[^cpp-new]: [cppreference：`new` 表达式](https://en.cppreference.com/w/cpp/language/new.html)——说明在动态存储区分配并初始化 `TreeNode` 对象的行为，其生命周期持续至调用方显式释放。
