---
title: "二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化"
publishDate: "2026-11-03T12:00:00+08:00"
description: "LeetCode 94：从系统栈帧机制对比显式栈模拟，再利用 Morris 线索化在 O(1) 辅助空间下完成中序遍历并恢复树结构。"
---

[LeetCode 94. 二叉树的中序遍历](https://leetcode.cn/problems/binary-tree-inorder-traversal/)（Hot 100）要求返回给定二叉树节点值的中序遍历序列（左子树 $\to$ 根节点 $\to$ 右子树）。

遍历契约的核心不变量是：对于树中任意非空节点 $u$，其中序遍历序列满足拓扑偏序——其左子树 $u.\text{left}$ 中的所有节点值均严格先于 $u.\text{val}$ 出现，而其右子树 $u.\text{right}$ 中的所有节点值均严格晚于 $u.\text{val}$ 出现。在[《从调用栈理解递归》中的操作位置分析](/posts/understanding-recursion/#前序中序与后序是操作位置的区别)中阐明，前序、中序与后序遍历在计算模型上的本质区别在于**对当前节点执行收集操作的相对位置**：中序遍历将对当前节点值的访问动作严格夹在“左子树递归返回”与“右子树递归进入”之间。

## Python：递归与隐式系统调用栈

递归实现最忠实地表达了树的自相似归纳定义。递归向下展开时，运行环境依赖隐式的活动记录（Activation Record / 栈帧）保存局部变量与返回地址[^sicp-stack]。

```python
from typing import Optional


class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> list[int]:
        result: list[int] = []

        def inorder(node: Optional[TreeNode]) -> None:
            if node is None:
                return
            # Traverse left subtree first.
            inorder(node.left)
            # Visit the current root node between left and right recursions.
            result.append(node.val)
            # Traverse right subtree after processing current node.
            inorder(node.right)

        inorder(root)
        return result
```

递归在遇到空指针时作为基本情况（Base Case）直接返回。时间复杂度为 $O(n)$，每个节点被进入并返回常数次。空间开销由系统调用栈的最大深度决定，即树的高度 $O(h)$：当二叉树接近平衡时树高为 $O(\log n)$；当二叉树退化为单链表时达到最坏情况 $O(n)$。

## C++：显式栈模拟递归执行位置

将递归算法去抽象化为迭代版本时，必须显式模拟调用栈的行为。正如在[《从调用栈理解递归》中的从递归改写为迭代](/posts/understanding-recursion/#从递归改写为迭代)中所分析的，状态转换的核心是**识别每次返回后需要恢复的局部现场**。

在中序遍历中，只要一个节点的左子树尚未探索完毕，该节点就必须保留在栈顶；只有当指针一路向左到达 `nullptr` 触发回溯时，栈顶节点才迎来其收集操作的时刻，随后探索流转向该节点的右子树。

```cpp
#include <vector>

class Solution {
public:
    std::vector<int> inorderTraversal(TreeNode* root) {
        std::vector<int> result;
        std::vector<TreeNode*> stack;
        TreeNode* current = root;

        while (current != nullptr || !stack.empty()) {
            // Traverse down the leftmost branch, pushing nodes onto the stack.
            while (current != nullptr) {
                stack.push_back(current);
                current = current->left;
            }

            // Left subtree is fully explored; retrieve and visit the current node.
            current = stack.back();
            stack.pop_back();
            result.push_back(current->val);

            // Shift exploration focus to the right subtree.
            current = current->right;
        }

        return result;
    }
};
```

这里直接使用连续内存容器 `std::vector<TreeNode*>` 承担栈的职责，相比标准容器适配器 `std::stack` 具备更好的缓存局部性[^cpp-vector-reserve]。显式栈的时间复杂度为 $O(n)$，辅助空间为 $O(h)$（最好 $O(\log n)$，最坏 $O(n)$）。

## 进阶：Morris 线索遍历（常量辅助空间）

无论是递归还是显式栈，保存 $O(h)$ 节点引用的根源在于：二叉树的指针连接是自顶向下的单向边，子节点没有指向父节点的回溯指针。

1979 年 Joseph M. Morris 提出的线索化遍历算法打破了这一空间约束[^morris-paper]：二叉树中存在大量的空指针（在含有 $n$ 个节点的树中，恰好有 $n+1$ 个空指针域）。Morris 算法借用左子树中“最右叶节点”（即当前节点在中序遍历下的直接前驱 `predecessor`）的空闲 `right` 指针，动态构建一条指向当前节点的临时“线索”；当遍历流程通过该线索第二次回到当前节点时，再切断该线索恢复原树结构。

```cpp
#include <vector>

class SolutionMorris {
public:
    std::vector<int> inorderTraversal(TreeNode* root) {
        std::vector<int> result;
        TreeNode* current = root;

        while (current != nullptr) {
            if (current->left == nullptr) {
                // If there is no left child, visit current node and step right.
                result.push_back(current->val);
                current = current->right;
            } else {
                // Find the inorder predecessor (rightmost node in left subtree).
                TreeNode* predecessor = current->left;
                while (predecessor->right != nullptr && predecessor->right != current) {
                    predecessor = predecessor->right;
                }

                if (predecessor->right == nullptr) {
                    // First arrival: construct temporary thread to current node.
                    predecessor->right = current;
                    current = current->left;
                } else {
                    // Second arrival: cut the thread, visit current, and step right.
                    predecessor->right = nullptr;
                    result.push_back(current->val);
                    current = current->right;
                }
            }
        }

        return result;
    }
};
```

### 复杂度与不变式保证

- **时间复杂度 $O(n)$**：每条树边在寻找前驱与切断线索的过程中最多被访问 2 次，整体开销仍与节点数呈严格线性关系。
- **辅助空间复杂度 $O(1)$**：除了保存结果的数组外，算法仅使用常数个指针变量，彻底摆脱了调用栈和显式栈的开销。
- **结构不变式恢复**：只要算法正常遍历结束，所有被建立的线索均在第二次访问时被重置为 `nullptr`，原二叉树的拓扑结构与所有指针关系完全恢复原样。

[^sicp-stack]: [Abelson & Sussman: 《计算机程序的构造和解释》(SICP)](https://mitpress.mit.edu/sites/default/files/sicp/index.html)——第 1.2 节对线性递归计算过程与栈帧保存延迟计算阶段（Deferred Operations）的机制论述。

[^cpp-vector-reserve]: [cppreference: `std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve)——说明通过预留容量减少动态数组重新分配与元素移动，以保证连续内存追加操作的平摊效率。

[^morris-paper]: [J. M. Morris (1979): "Traversing binary trees simply and cheaply"](https://doi.org/10.1016/0020-0190(79)90068-1)——提出利用叶节点的空闲右指针构造中序后继线索，实现无需调用栈或父指针的 $O(1)$ 辅助空间树遍历。
