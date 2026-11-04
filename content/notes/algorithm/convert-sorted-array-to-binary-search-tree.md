---
title: "将有序数组转换为二叉搜索树：中点二分与高度平衡构建"
publishDate: "2026-11-15T12:00:00+08:00"
description: "LeetCode 108：利用升序数组随机访问特性二分选取根节点，在闭区间内递归构建高度平衡二叉搜索树，对比链表二分开销与递归栈空间。"
---

[LeetCode 108. 将有序数组转换为二叉搜索树](https://leetcode.cn/problems/convert-sorted-array-to-binary-search-tree/)（Hot 100）要求将一个升序排列的整数数组转换为一棵**高度平衡**的二叉搜索树（BST）。一棵高度平衡二叉树的几何契约是：每个节点的左右子树高度差绝对值不超过 1（即 $|h_L - h_R| \le 1$）。

二叉搜索树的中序遍历序列天然具有严格升序性质；反过来，题目给出的升序数组便构成了目标 BST 的中序遍历序列。但仅靠中序遍历无法唯一确定一棵树的拓扑形态——若每次取最左元素为根，整棵树将退化为深达 $O(n)$ 的单链。为了满足高度平衡约束，必须使任意子树的左右节点数尽可能均分，即左右子树的节点数量差满足 $|n_L - n_R| \le 1$。通过数学归纳法可知，选择当前区间正中位置的元素作为子树根节点，能保证生成的二叉树总高度被严格压至 $\lceil \log_2(n + 1) \rceil \le O(\log n)$。

## 数组随机访问与链表快慢指针的开销差异

在数组上实现二分划分极其高效：由于连续内存块支持常数时间的随机访问[^cpp-vector]，计算中点下标 `mid = left + (right - left) / 2` 并读取 `nums[mid]` 仅需 $O(1)$ 时间，因此递归关系式为：

$$
T(n) = 2T(n / 2) + O(1) = O(n)
$$

这与链表上的二分构建形成鲜明对照。在[《排序链表：递归归并与自底向上归并》](/notes/algorithm/sort-list/)中，单链表节点在内存中离散分布且缺乏随机访问能力；为了定位链表中点，必须使用快慢双指针从头推进扫描 $O(m)$ 步。如果在链表上套用相同的自顶向下二分切分，递归方程将变为 $T(n) = 2T(n / 2) + O(n) = O(n \log n)$，必须改用全局顺序遍历推进指针模拟中序遍历才能做回 $O(n)$。数组的连续布局与随机寻址特性消除了所有中间搜寻开销，使自顶向下分治构建天然达到线性下界。

## Python：闭区间递归与避免切片拷贝

若直接写 `nums[:mid]` 与 `nums[mid + 1:]`，每次切片都会为子序列分配新的列表对象，使递归过程总共产生 $O(n \log n)$ 的额外内存分配与数据搬运。通过辅助函数传递闭区间下标 $[left, right]$，可以直接在原始列表上原地定位，保持每层递归的 $O(1)$ 局部辅助空间：

```python
from typing import Optional


class Solution:
    def sortedArrayToBST(self, nums: list[int]) -> Optional[TreeNode]:
        def build(left: int, right: int) -> Optional[TreeNode]:
            if left > right:
                return None

            # Pick the middle element to ensure subtree sizes differ by at most 1.
            mid = left + (right - left) // 2
            root = TreeNode(nums[mid])
            root.left = build(left, mid - 1)
            root.right = build(mid + 1, right)
            return root

        return build(0, len(nums) - 1)
```

当 $left > right$ 时区间为空，返回 `None` 作为子树叶子节点的空指针哨兵。选取 $mid = \lfloor (left + right) / 2 \rfloor$ 时，偶数长度区间的左子树比右子树少 1 个节点；若改选上中点 $\lceil (left + right) / 2 \rceil$，右子树比左子树少 1 个节点。两种选法均完全满足题目对高度平衡的定义。

## C++：常引用传递与紧凑递归栈

C++ 实现中将 `nums` 以常引用传递，杜绝函数调用中的容器拷贝；闭区间边界传入整型下标，中点计算采用 `left + (right - left) / 2` 避免有符号 32 位整数相加潜在的溢出风险。

```cpp
#include <vector>

// Definition for a binary tree node.
class Solution {
    TreeNode* build(const std::vector<int>& nums, int left, int right) {
        if (left > right) {
            return nullptr;
        }

        // Midpoint selection guarantees |size(left) - size(right)| <= 1.
        const int mid = left + (right - left) / 2;
        auto* root = new TreeNode(nums[mid]);
        root->left = build(nums, left, mid - 1);
        root->right = build(nums, mid + 1, right);
        return root;
    }

public:
    TreeNode* sortedArrayToBST(const std::vector<int>& nums) {
        return build(nums, 0, static_cast<int>(nums.size()) - 1);
    }
};
```

## 平衡性归纳与时空复杂度

令包含 $k$ 个元素的闭区间被中点划分为两部分。当选择 $mid = left + \lfloor (k - 1) / 2 \rfloor$ 时：
- 左子树包含元素个数 $n_L = \lfloor (k - 1) / 2 \rfloor$；
- 右子树包含元素个数 $n_R = k - 1 - n_L = \lceil (k - 1) / 2 \rceil$。

显然 $|n_L - n_R| \le 1$。对于完全由尺寸相差至多为 1 的子树递归构造而成的二叉树，其高度严格满足 $h = \lceil \log_2(n + 1) \rceil$[^sicp-tree]，因而必然满足高度平衡二叉搜索树 $|h_L - h_R| \le 1$ 的定义要求。

- **时间复杂度**：每个数组元素恰好被读取一次并构造为一个 `TreeNode` 实例，不存在任何冗余遍历或重复查找。主定理下 $T(n) = 2T(n / 2) + O(1) = O(n)$。
- **空间复杂度**：由于构建出的树结构严格平衡，递归调用栈的深度等于树的最大高度 $\lceil \log_2(n + 1) \rceil$，即递归调用栈空间为 $O(\log n)$。若不计返回结果所需的 $n$ 个树节点内存，纯辅助空间为 $O(\log n)$。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——说明 `vector` 的元素在内存中连续存储，支持常数时间随机访问迭代器。

[^sicp-tree]: [SICP Section 2.3.3: Representing Sets](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——阐述将有序列表等额二分转换为高度平衡二叉搜索树（`list->tree`）的递归构建与对数高度性质。
