---
title: "对称二叉树：镜像双指针与成对入队检验"
publishDate: "2026-11-09T12:00:00+08:00"
description: "LeetCode 101：将一维链表对撞双指针推广至树上二维镜像双指针，拆解结构与数值互为镜像的递归判定不变量，并用 C++ 成对入队迭代检验规避栈开销。"
---

[LeetCode 101. 对称二叉树](https://leetcode.cn/problems/symmetric-tree/)（Hot 100）给定一棵二叉树的根节点 `root`，检查它是否轴对称。单节点树或空树天然对称；对于含有子节点的二叉树，其轴对称的充要条件是根节点的左右两棵子树关于中轴线互为镜像。

在一维线性数据结构中，对称性常由双指针夹逼完成：例如[《回文链表：把判定拆成三个指针原语》](/notes/algorithm/palindrome-linked-list/)通过寻找中点并反转后半段，让两个指针从两端向中间对撞比对；又如[《相交链表：把状态判定收进循环条件》](/notes/algorithm/linked-list-intersection/)通过换头消除长度差，将多分支状态归约到统一的判等循环。然而在分叉的二叉树中，单指针递归只能顺着单一调用路径深入，无法同时获知另一侧对称分支的拓扑与数值。解题的关键在于将问题维度提升：从单指针递归跃迁为**树上二维镜像双指针**。

## 镜像不变式：从一维对撞到二维分支交织

要判定整棵树是否轴对称，等价于判定它的左右子树 `root.left` 与 `root.right` 是否互为镜像。定义双指针谓词 $\text{isMirror}(t_1, t_2)$，它必须严格满足以下四重契约不变量：

1. **结构空性一致**：
   - 若 $t_1$ 与 $t_2$ 均为空指针，对称成立，返回 `True`；
   - 若 $t_1$ 与 $t_2$ 仅有一方为空，说明拓扑结构缺损，返回 `False`。
2. **当前节点值相等**：$t_1.\text{val} = t_2.\text{val}$。
3. **外侧分支镜像**：$t_1.\text{left}$ 必须与 $t_2.\text{right}$ 互为镜像。
4. **内侧分支镜像**：$t_1.\text{right}$ 必须与 $t_2.\text{left}$ 互为镜像。

```text
         1
       /   \
     [2]   [2]        <-- t1 与 t2 比对：值相同
     / \   / \
   [3] (4)(4) [3]     <-- 外侧：t1.left(3) 与 t2.right(3) 镜像
                          内侧：t1.right(4) 与 t2.left(4) 镜像
```

单指针只需管自身向下展开，而镜像双指针每一步都需要同时推动两个指针，并交织访问对方的相反方向孩子。

## Python 实现：镜像双指针递归

通过辅助函数 `is_mirror` 组织双指针逻辑，利用 Python 的逻辑与短路特性优雅表达四重契约：

```python
from typing import Optional


class Solution:
    def isSymmetric(self, root: Optional[TreeNode]) -> bool:
        if root is None:
            return True

        def is_mirror(
            t1: Optional[TreeNode], t2: Optional[TreeNode]
        ) -> bool:
            # Base case 1: both pointers are None.
            if t1 is None and t2 is None:
                return True
            # Base case 2: exactly one pointer is None.
            if t1 is None or t2 is None:
                return False

            # Invariant: values match, and outer/inner pairs are mirrors.
            return (
                t1.val == t2.val
                and is_mirror(t1.left, t2.right)
                and is_mirror(t1.right, t2.left)
            )

        return is_mirror(root.left, root.right)
```

在判定 `t1.val == t2.val` 之前，前面的两道空指针防护罩保证了解引用的安全性。

## C++ 进阶：成对入队检验（规避调用栈开销）

递归写法虽然简洁，但在树退化为极端链状形态时可能积压深层调用栈。我们可以用显式队列将递归的隐式状态栈显式化：每次将**逻辑上成对需要比较的两个指针**相邻压入队列。

为了规避 `std::pair` 带来的额外模板实例化与开销，可以直接使用一个平坦的 `std::queue<const TreeNode*>`，每次成对 push、成对 pop：

```cpp
#include <queue>

class Solution {
public:
    bool isSymmetric(const TreeNode* root) {
        if (root == nullptr) {
            return true;
        }

        std::queue<const TreeNode*> q;
        // Push initial mirror pair.
        q.push(root->left);
        q.push(root->right);

        while (!q.empty()) {
            const TreeNode* t1 = q.front();
            q.pop();
            const TreeNode* t2 = q.front();
            q.pop();

            // Both null: this subtree pair is symmetric, continue verifying others.
            if (t1 == nullptr && t2 == nullptr) {
                continue;
            }

            // Asymmetric structure or value mismatch.
            if (t1 == nullptr || t2 == nullptr || t1->val != t2->val) {
                return false;
            }

            // Enqueue outer mirror pair.
            q.push(t1->left);
            q.push(t2->right);

            // Enqueue inner mirror pair.
            q.push(t1->right);
            q.push(t2->left);
        }

        return true;
    }
};
```

这种成对入队的模式保持了极高的一致性：队列中任意相邻的偶数对位置始终承载着对称互检的不变式。一旦发现任何不对称，立即触发短路返回 `false`，无需遍历剩余节点。

## 复杂度分析

- **时间复杂度**：$O(n)$。在最坏情况下（整棵树完全对称），树中的每一个节点恰好被成对访问一次，常数次指针比较与入队出队操作。
- **空间复杂度**：
  - **递归实现**：$O(h)$，由调用栈深度决定。完全平衡树最好为 $O(\log n)$，极端退化倾斜树最坏为 $O(n)$。
  - **迭代队列实现**：$O(w)$，由最宽一层的节点数量决定。在完全二叉树中，最后一层最多有 $\lceil n / 2 \rceil$ 个节点，队列最大占用空间为 $O(n)$。

对称判定展示了如何将结构等价性匹配推向二维分支拓扑[^sicp-tree-equality]。无论是一维链表的首尾对撞，还是二叉树上的内外侧交叉推进，双指针的核心思想始终是通过协同约束将全局对称性校验拆解为局部不变量的连续验证。

## References

[^sicp-tree-equality]: [SICP Section 2.2.2: Hierarchical Structures and Symbolic Equality](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——讨论复合结构中各子分支的结构等价性与模式递归匹配。

[^cpp-queue]: [cppreference: `std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——说明标准库队列容器适配器的先进先出语义与接口复杂度保证。
