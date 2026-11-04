---
title: "二叉搜索树中第 K 小的元素：中序遍历与迭代提前终止"
publishDate: "2026-11-14T12:00:00+08:00"
description: "LeetCode 230 二叉搜索树中第 K 小的元素，利用中序遍历严格单调特性，通过显式栈迭代在第 k 次出栈时提前终止剪枝，探讨频繁插入删除场景下的红黑树或树节点计数改造。"
---

[LeetCode 230. 二叉搜索树中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/)（Hot 100）给定一棵二叉搜索树的根节点 `root` 和一个整数 $k$（$1 \le k \le n$，其中 $n$ 为树中节点总数），要求找出树中按升序排序后第 $k$ 小的节点值。

## 中序单调性与第 $k$ 位的等价转换

根据二叉搜索树的根本性质，对其执行中序遍历（左子树 $\to$ 根节点 $\to$ 右子树）所访问的节点序列，严格保持非降（且在节点值各不相同时为严格递增）的顺序[^clrs-bst]。

因此，“寻找第 $k$ 小的元素”完全等价于：**在中序遍历访问序列中，找到第 $k$ 个被访问的节点**。

直接进行完整的递归中序遍历，并将遍历结果存入动态数组后再取下标 $k - 1$，固然能解决问题，但其时间与空间复杂度均为 $O(n)$。即便是查找最小元素（$k = 1$），这种朴素做法仍会强行访问剩余的 $n - 1$ 个节点，造成了巨大的冗余开销。

## 显式栈迭代与提前终止剪枝

要实现按需遍历并提前终止，最自然且高效的方法是将递归调用栈转化为**显式栈迭代**：

1. 维护一个显式栈 `stack` 与当前扫描游标 `curr`（初始指向 `root`）；
2. **一路向左压栈**：只要 `curr` 非空，便将其压入栈中，并向左推进 `curr = curr.left`。当 `curr` 达到 `nullptr` 时，栈顶即为当前尚未访问的子树中值最小的节点；
3. **出栈并计数**：弹出栈顶节点 `node`，这就是中序遍历的当前访问节点。将计数器 $k$ 递减 1；
4. **提前终止**：若 $k$ 递减后等于 0，说明当前弹出的节点恰好就是整棵树中第 $k$ 小的元素，立即将其数值返回，直接退出遍历；
5. **转向右子树**：若 $k > 0$，令 `curr = node.right`，回到第 2 步继续处理右分支。

这种方式的优势在于**流式消费（Streaming / Lazy Evaluation）**：算法仅遍历到第 $k$ 小的节点便立刻中断，完全避开了右侧庞大子树的无效遍历。

## Python：显式栈迭代提前终止

```python
from typing import Optional


class Solution:
    def kthSmallest(self, root: Optional[TreeNode], k: int) -> int:
        stack: list[TreeNode] = []
        curr: Optional[TreeNode] = root

        while curr is not None or stack:
            # Dive deep into the leftmost branch.
            while curr is not None:
                stack.append(curr)
                curr = curr.left

            # Process the next smallest element in inorder sequence.
            curr = stack.pop()
            k -= 1
            if k == 0:
                return curr.val

            # Traverse the right subtree.
            curr = curr.right

        return -1
```

## C++：零额外堆分配的栈迭代

在 C++ 中使用标准库容器 `std::stack`，无需递归函数的栈帧额外开销：

```cpp
#include <stack>

class Solution {
public:
    int kthSmallest(TreeNode* root, int k) {
        std::stack<TreeNode*> stack;
        TreeNode* curr = root;

        while (curr != nullptr || !stack.empty()) {
            // Push all left ancestors onto the explicit stack.
            while (curr != nullptr) {
                stack.push(curr);
                curr = curr->left;
            }

            // Pop the current in-order element.
            curr = stack.top();
            stack.pop();

            // Decrement remaining count and terminate early once reached.
            if (--k == 0) {
                return curr->val;
            }

            // Move to the right child to resume traversal.
            curr = curr->right;
        }

        return -1;
    }
};
```

## 复杂度分析

- **时间复杂度**：$O(h + k)$，其中 $h$ 为二叉搜索树的高度。首先需要 $O(h)$ 步沿左分支下潜到树的最左叶子节点，随后每弹出并访问一个元素需要分摊 $O(1)$ 时间，共计访问 $k$ 个元素后立即终止。在平衡树下 $h = O(\log n)$，因此总时间为 $O(\log n + k)$；若 $k \ll n$，其效率远优于全树扫描的 $O(n)$。
- **空间复杂度**：$O(h)$。显式栈在任何时刻保存的节点数量均不超过树的高度 $h$。

## 进阶思考：频繁修改场景下的顺序统计树

题目提出了进一步的拓展：若这棵二叉搜索树经常被修改（频繁执行插入与删除操作），并且需要频繁查询第 $k$ 小的元素，如何优化数据结构？

在此场景下，若每次查询都消耗 $O(h + k)$，在 $k$ 接近 $n$ 时仍退化为 $O(n)$。标准解法是引入**顺序统计树（Order-Statistic Tree）**[^clrs-ost]：

1. **节点结构增强**：为树中的每个节点额外维护一个元数据字段 `size`，记录以当前节点为根的子树中的节点总数：
   $$
   \text{size}(x) = \text{size}(x.\text{left}) + \text{size}(x.\text{right}) + 1
   $$
2. **基于计数的二分查找**：
   - 设当前节点左子树节点数为 $s = \text{size}(\text{curr}.\text{left})$；
   - 若 $k = s + 1$，则当前节点恰好是第 $k$ 小的元素；
   - 若 $k \le s$，说明第 $k$ 小的元素必然落在左子树中，递归进入左子树寻找第 $k$ 小；
   - 若 $k > s + 1$，说明目标落在右子树中，递归进入右子树寻找第 $k - s - 1$ 小。
3. **动态维护成本**：
   - 在红黑树或 AVL 树的基础上维护 `size`，单次查询时间仅为 $O(h) = O(\log n)$，完全与 $k$ 的大小无关；
   - 插入与删除操作在沿着树高回溯并进行旋转调整时，仅需伴随常数次子树大小重算，整体插入与删除的时间复杂度依旧稳定保持在 $O(\log n)$。

[^clrs-bst]: Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein. *Introduction to Algorithms*, 4th Edition. MIT Press, 2022. 第 12 章二叉搜索树及其遍历性质。
[^clrs-ost]: Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein. *Introduction to Algorithms*, 4th Edition. MIT Press, 2022. 第 14.1 节（顺序统计树）：讨论通过在红黑树节点中扩充子树节点计数字段 `size`，在 $O(\log n)$ 时间内完成选择与秩计算。
