---
title: "二叉搜索树中第 K 小的元素：中序遍历与迭代提前终止"
publishDate: "2026-11-14T12:00:00+08:00"
description: "LeetCode 230：利用二叉搜索树中序遍历严格递增的性质，通过显式栈迭代在第 k 次出栈时提前返回，并讨论频繁修改下的顺序统计树扩充。"
---

[LeetCode 230. 二叉搜索树中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/)（Hot 100）给定一棵二叉搜索树的根节点 `root` 和一个整数 `k`（$1 \le k \le n$，其中 $n$ 为节点总数），要求查找其中按升序排列的第 $k$ 小的元素（从 $1$ 开始计数）。

## 中序单调性与显式栈提前终止

正如[《验证二叉搜索树：开区间上下界收缩与中序严格单调》](/notes/algorithm/validate-binary-search-tree/)中所分析的，二叉搜索树的中序遍历（左子树 $\to$ 根节点 $\to$ 右子树）在本题不含重复键的约定下，会严格按从小到大的顺序访问所有节点。一般允许重复键的 BST 只能保证非递减顺序[^clrs-bst]。因此，寻找第 $k$ 小的元素等价于求中序遍历序列中的第 $k$ 个访问节点。

如果采用朴素的递归中序遍历，把全部 $n$ 个节点的值依次写入列表后再读取下标 `k - 1`，无论 $k$ 多小都必须完整遍历整棵树，耗时与额外空间均为 $O(n)$。即便在递归函数内部维护计数器，命中第 $k$ 个节点后也仍需逐层检查终止标志并退回外层递归调用栈。

参照[《从调用栈理解递归》](/posts/understanding-recursion/#从递归改写为迭代)与[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/notes/algorithm/binary-tree-inorder-traversal/)中的显式栈模式，将递归调用栈改写为显式维护的节点栈后，控制流完全收敛在单层循环内：每从栈顶弹出一个节点，就代表按升序确认了一个元素；将计数器 `k` 减 $1$，一旦 `k == 0` 即可立即通过 `return` 直接退出函数，无需访问剩余节点。

## Python：显式栈迭代与提前返回

使用 Python 的 `list` 作为显式栈时，每次先沿着左子链一路压栈到底，弹出栈顶节点时恰好按升序结算当前最小元素[^python-list-stack]：

```python
from typing import Optional


class Solution:
    def kthSmallest(self, root: Optional[TreeNode], k: int) -> int:
        stack: list[TreeNode] = []
        curr = root

        # Each pop from the explicit inorder stack yields the next smallest element.
        while curr is not None or stack:
            while curr is not None:
                stack.append(curr)
                curr = curr.left
            curr = stack.pop()
            k -= 1
            if k == 0:
                return curr.val
            curr = curr.right

        return -1
```

## C++：基于 `std::vector` 的显式栈迭代

在 C++ 中，既可以使用容器适配器 `std::stack<TreeNode*>`，也可以直接使用 `std::vector<TreeNode*>` 作为显式栈。需要注意[《从调用栈理解递归》](/posts/understanding-recursion/#从递归改写为迭代)中强调的内存模型事实：无论选用 `std::vector` 还是 `std::stack`（默认底层为 `std::deque`），容器中的节点指针依然分配在**堆内存**（动态存储区）上，并非“零堆分配”[^cpp-vector]。显式栈的优势在于省去了线程调用栈帧（返回地址、寄存器保存区与局部变量）的开销，并且允许在命中第 $k$ 个节点时直接退出整个函数：

```cpp
#include <vector>

class Solution {
public:
    int kthSmallest(const TreeNode* root, int k) const {
        std::vector<const TreeNode*> st;
        const TreeNode* curr = root;

        // Maintain ancestors whose left subtrees are still being explored.
        while (curr != nullptr || !st.empty()) {
            while (curr != nullptr) {
                st.push_back(curr);
                curr = curr->left;
            }
            curr = st.back();
            st.pop_back();
            if (--k == 0) {
                return curr->val;
            }
            curr = curr->right;
        }
        return -1;
    }
};
```

题目保证 `k` 合法，因此代码末尾的 `-1` 是不可达的兜底，不是一个额外约定的错误返回值。设树高为 $h$（按节点层数计）。停止时已出栈 $k$ 个节点，尚留在栈中的节点至多有 $h$ 个，因而总压栈数至多为 $k + h$，时间复杂度为 $O(h + k)$（平衡树为 $O(\log n + k)$，最坏链状树为 $O(n)$）。显式栈辅助空间为 $O(h)$，返回值占常数空间；两种语言的实现都只读输入树。递归同样可以通过传播终止状态达到这一时间界，显式栈的优势是退出控制更直接。Morris 会临时改写树，不能在找到目标后直接返回，否则可能留下未拆除的线索。

## 进阶：频繁修改下的顺序统计树

题目进阶追问：如果二叉搜索树经常被修改（插入、删除操作）而且需要频繁地查找第 $k$ 小的值，该如何优化？

在单次查询场景下，$O(h + k)$ 的中序迭代已经足够高效；但在高频查询且 $k$ 较大的动态场景下，每次重新走过前 $k$ 个节点的线性部分会成为瓶颈。此时可以将普通 BST 扩充为**顺序统计树**（order-statistic tree）[^clrs-ost]，在每个节点 $x$ 中额外维护一个字段 $\text{size}(x)$，记录以 $x$ 为根的子树所包含的节点总数（定义空节点 $\text{size}(\text{nil}) = 0$），满足如下结构不变量：

$$
\text{size}(x) = \text{size}(l) + \text{size}(r) + 1
$$

其中 $l$ 与 $r$ 分别为节点 $x$ 的左、右子节点。借助子树规模信息，查找以 $x$ 为根的子树中第 $k$ 小元素的过程可以直接转化为类似二分查找的单路下行：记左子树规模与根节点构成的当前相对秩为 $r_x = \text{size}(l) + 1$，则：

1. 若 $k = r_x$，说明左子树恰好有 $k - 1$ 个严格小于 $x$ 的元素，当前根节点 $x$ 即为第 $k$ 小元素，直接返回。
2. 若 $k < r_x$，说明目标位于左子树中，直接向 $l$ 递归或迭代查找第 $k$ 小元素。
3. 若 $k > r_x$，说明目标位于右子树中，且左子树与根节点已排在它前面（共 $r_x$ 个元素），因此转向右子节点 $r$ 查找第 $k - r_x$ 小元素。

| 方案                        | 节点额外字段                | 单次插入 / 删除代价 | 单次查找第 $k$ 小代价 |
| :-------------------------- | :-------------------------- | :------------------ | :-------------------- |
| 显式栈中序迭代              | 无                          | $O(h)$              | $O(h + k)$            |
| 顺序统计树（平衡 BST 扩充） | 子树节点数 $\text{size}(x)$ | $O(\log n)$         | $O(\log n)$           |

当底层采用红黑树或 AVL 树维护平衡时，插入或删除节点只需沿访问路径更新 $\text{size}$ 字段，并在左旋、右旋操作中以 $O(1)$ 时间局部重算受影响的两个节点的 $\text{size}$ 值[^clrs-ost]。这样单次修改与单次按秩查询的时间复杂度均稳定在 $O(\log n)$。

[^clrs-bst]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 12 章证明二叉搜索树的中序遍历按非递减序输出所有节点关键字。

[^python-list-stack]: [Python 文档：将列表当作栈使用](https://docs.python.org/3/tutorial/datastructures.html#using-lists-as-stacks)——说明用尾部 `append()` 与 `pop()` 实现栈；平摊时间界见 [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——说明 `std::vector` 在堆上维护动态连续内存，尾部压入与弹出为平摊常数时间。

[^clrs-ost]: [CLRS: _Introduction to Algorithms_ (4th ed.)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——第 17.1 节 “Dynamic order statistics” 介绍 $\text{size}$ 扩充、按秩选择及旋转中的规模维护；章节与版次可由 [MIT Press 第四版目录](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/11599/4e_toc.pdf)核对。
