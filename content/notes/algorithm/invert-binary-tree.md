---
title: "翻转二叉树：自顶向下镜像传递与自底向上重挂"
publishDate: "2026-11-08T12:00:00+08:00"
description: "LeetCode 226：以翻转二叉树为例探讨自顶向下先序交换与自底向上后序重挂两种镜像传递机制，对比 Python 结构解构赋值与 C++ 栈上指针交换及 BFS 迭代实现。"
---

[LeetCode 226. 翻转二叉树](https://leetcode.cn/problems/invert-binary-tree/)（Hot 100）给定一棵二叉树的根节点 `root`，要求翻转这棵二叉树并返回其根节点。翻转的契约是不变式：对于树中的每一个非空节点，其左子树与右子树在结构与内容上全部互换。

翻转二叉树看似简单，实则是考察树形操作时序（前序 vs 后序）与状态传递机制的经典样本。翻转操作既可以在遍历深入时自顶向下传递，也可以在子问题规约后自底向上重挂。

## 两种递归思维：自顶向下先序与自底向上后序

针对任意节点 `node`，翻转需要完成两类动作：
1. 交换 `node` 本身的左子节点指针与右子节点指针；
2. 递归翻转其左子树与右子树内部的所有节点。

这两个动作的执行先后，对应着两种截然不同的递归视角：

### 1. 自顶向下（先序模式：先交换，再递归）

先直接交换当前节点的左右子指针，再顺着已交换的指针深入递归：

```text
       4
     /   \
    2     7      -->  第一步：交换 4 的左右子节点（2 与 7）
   / \   / \
  1   3 6   9

       4
     /   \
    7     2      -->  第二步：递归深入翻转左子树 7 与右子树 2
   / \   / \
  6   9 1   3
```

这种模式强调“状态变更自上而下广播”：父节点先完成自身拓扑关系的重置，再驱动子树继续各自对调。

### 2. 自底向上（后序模式：先递归，再重挂）

将子树视为黑盒，先把左右子树分别翻转完毕，再将结果交叉挂接回当前节点：

$$
\begin{aligned}
\text{inverted\_left} &= \text{invertTree}(\text{root.left}) \\
\text{inverted\_right} &= \text{invertTree}(\text{root.right}) \\
\text{root.left} &= \text{inverted\_right} \\
\text{root.right} &= \text{inverted\_left}
\end{aligned}
$$

这属于标准的**分解与合并**模式：子树在黑盒内独立完成镜像映射，父节点栈帧等待两方返回值就位后，完成最终的交叉重挂。

### 为什么标准中序遍历会出错？

如果尝试按照中序顺序（“先翻转左子树 $\to$ 交换左右指针 $\to$ 再翻转右子树”）编写代码，将会触发逻辑漏洞：
1. `invertTree(root.left)` 翻转了原左子树；
2. 交换 `root.left` 与 `root.right`，此时**原左子树变成了现在的右子树**；
3. 继续调用 `invertTree(root.right)`，实际上是在对刚才已经翻转过的原左子树进行第二次翻转，致使其恢复原样；而原右子树则完全未被访问！

若执意使用中序，第三步必须违背常规写法改写为 `invertTree(root.left)`。这种反常行为凸显了递归中指针重写与遍历时序之间的高度依赖。

## Python 实现：优雅的元组解构求值

Python 的赋值机制在解构前会自左向右完整求出右侧表达式的值，天然支持在后序位置一次性完成子调用与交叉绑定：

```python
from typing import Optional


class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if root is None:
            return None

        # The right-hand side tuple is fully evaluated before binding,
        # recursively inverting both subtrees and swapping their references.
        root.left, root.right = self.invertTree(
            root.right
        ), self.invertTree(root.left)
        return root
```

这一写法没有引入多余的临时变量，同时确保了左右子树均按独立子问题规约后再赋值。

若采用先序自顶向下风格，也可以写成显式交换：

```python
class SolutionPreOrder:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if root is None:
            return None

        # Top-down pointer swap before recursing into children.
        root.left, root.right = root.right, root.left
        self.invertTree(root.left)
        self.invertTree(root.right)
        return root
```

## C++ 实现：原地指针交换与 BFS 迭代

在 C++ 中，`std::swap` 可以高效对调两个指针变量，完全在栈上发生，不分配任何堆内存[^cpp-swap]。

### 递归版

```cpp
#include <utility>

class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (root == nullptr) {
            return nullptr;
        }

        // Swap left and right child pointers at the current node.
        std::swap(root->left, root->right);

        invertTree(root->left);
        invertTree(root->right);

        return root;
    }
};
```

### 迭代版（基于 BFS 队列消除递归栈）

当树的高度极大时，递归可能导致调用栈溢出。可以使用显式队列进行广度优先层序遍历，每次出队一个节点，交换其左右子节点，并将非空子节点推入队列：

```cpp
#include <queue>
#include <utility>

class SolutionIterative {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (root == nullptr) {
            return nullptr;
        }

        std::queue<TreeNode*> q;
        q.push(root);

        while (!q.empty()) {
            TreeNode* curr = q.front();
            q.pop();

            // Swap child pointers of the popped node.
            std::swap(curr->left, curr->right);

            if (curr->left != nullptr) {
                q.push(curr->left);
            }
            if (curr->right != nullptr) {
                q.push(curr->right);
            }
        }

        return root;
    }
};
```

迭代版将隐式调用栈的状态转移显式委托给外部队列，避免了系统调用栈的深度限制。

## 复杂度分析

- **时间复杂度**：$O(n)$。无论递归还是迭代，树中的所有 $n$ 个节点都恰好被访问一次，每次指针交换耗费 $O(1)$ 时间。
- **空间复杂度**：
  - **递归实现**：$O(h)$，由调用栈深度决定。最好情况下树完全平衡，$h = \lfloor \log_2 n \rfloor + 1 \in O(\log n)$；最坏情况下树退化为单支链表，$h = n \in O(n)$。
  - **BFS 迭代实现**：$O(w)$，由树的最大层宽决定。满二叉树的最底层拥有 $\lceil n / 2 \rceil$ 个叶子节点，队列峰值辅助空间为 $O(n)$。

对树中各节点的递归映射本质上是对层次复合数据实施同态重构[^sicp-tree-mapping]。自顶向下的指针互换与自底向上的解构重挂展示了两种平行的执行模型，选择哪一种取决于是否需要利用子树的后序规约结果。

## References

[^cpp-swap]: [cppreference: `std::swap`](https://en.cppreference.com/w/cpp/algorithm/swap.html)——说明 `std::swap` 通过移动语义或标量赋值在常数时间内就地交换两个对象的值，不分配外部存储。

[^sicp-tree-mapping]: [SICP Section 2.2.2: Mapping over trees](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——讨论将变换过程高阶映射到树形分支层次结构的抽象范式。
