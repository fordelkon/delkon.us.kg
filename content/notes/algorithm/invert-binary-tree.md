---
title: "翻转二叉树：自顶向下镜像传递与自底向上重挂"
publishDate: "2026-11-08T12:00:00+08:00"
description: "LeetCode 226：对比自顶向下先序交换与自底向上后序重挂两种镜像传递机制，分析中序原地交换的陷阱，并给出 Python 与 C++ 实现。"
---

[LeetCode 226. 翻转二叉树](https://leetcode.cn/problems/invert-binary-tree/)（Hot 100）要求将一棵二叉树变换为其自身的镜像，并返回根节点。从指针拓扑来看，每个节点只持有 `left` 和 `right` 两个局部引用。一种直接构造是：**树中每一个节点的左右孩子指针都完成一次互换**。每条根到节点路径上的左、右选择都会反向，故节点落在原位置的镜像处。这是基于树的递归结构进行局部变换的实例[^sicp-tree]；原节点被复用，返回的仍是原根节点引用，不创建新树。

将全局变换拆解为每个节点上的局部指针交换后，紧接着的问题是交换动作应当放在递归的哪个位置。正如[《从调用栈理解递归》](/posts/understanding-recursion/#前序中序与后序是操作位置的区别)所分析的，前序、中序与后序的本质区别在于操作相对于两次递归调用的时机：

- **前序位置**（自顶向下交换）：进入节点时先交换 `root.left` 与 `root.right`，随后分别对新的左子树（原右子树）和新的右子树（原左子树）递归执行翻转。只要左右两棵子树各自被访问且仅被访问一次，先交换再下探同样能覆盖所有节点。
- **后序位置**（自底向上重挂）：先递归翻转原左子树与原右子树，拿到两棵已完成内部镜像的子树根节点后，在回退阶段将它们交叉挂载到当前节点的 `left` 和 `right` 指针上。
- **中序原地交换的陷阱**：如果先递归调用 `invertTree(root.left)`，接着原地交换 `root.left` 与 `root.right`，最后再调用 `invertTree(root.right)`，就会产生逻辑错误——原地交换后，此时 `root.right` 指向的恰好是刚刚已经翻转完毕的原左子树。第二次递归调用会将原左子树再翻转回初始状态，而原右子树被换到 `root.left` 后则完全没有被遍历。

若将本题的“构造镜像”与[《对称二叉树：镜像双指针与成对入队检验》](/notes/algorithm/symmetric-tree/)中的“检验镜像”对照：检验对称性是只读判定，通过一对镜像指针同步比对两侧子树而无需修改树结构；翻转二叉树则是原地结构重写，确保每个节点的左右指针恰好互换一次。

## Python：自底向上后序重挂

在 Python 中，可以利用元组并行赋值的求值规则，将后序递归与左右指针重挂合并为一行[^py-assign]：

```python
from typing import Optional


class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if root is None:
            return None
        # Python evaluates the right-hand tuple completely before binding
        # to root.left and root.right, avoiding mid-traversal pointer aliasing.
        root.left, root.right = (
            self.invertTree(root.right),
            self.invertTree(root.left),
        )
        return root
```

根据 Python 语言参考手册，赋值语句会先对等号右侧的表达式列表从左到右完整求值，生成临时元组后，再从左到右依次绑定给左侧的目标引用[^py-assign]。因此，`self.invertTree(root.right)` 和 `self.invertTree(root.left)` 读取到的都是修改前的原始子树引用，从机制上避开了中序原地修改带来的引用覆盖问题。

## C++：前序原地交换与显式队列迭代

在 C++ 中，前序递归可直接调用 `<utility>` 中的 `std::swap` 原地互换 `root->left` 与 `root->right` 两个指针变量，再依次递归左右子树[^cpp-swap]。若要消除深层树上的调用栈开销，也可以用 `std::queue` 维护待翻转节点，在出队时交换其左右指针并将非空子节点入队[^cpp-queue]：

```cpp
#include <queue>
#include <utility>

class Solution {
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
            // Every node popped from the queue swaps its direct child pointers
            // exactly once before its children are enqueued.
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

迭代写法表明，翻转二叉树并不强制依赖特定遍历顺序：无论采用后序 DFS、前序 DFS 还是层序 BFS，只要保证树中每个非空节点恰好进出容器一次、且在访问时完成一次 `std::swap(curr->left, curr->right)`，最终整棵树的指针拓扑就必定是原树的镜像。

无论采用递归还是队列迭代，算法都会访问树中全部 $n$ 个节点，在每个节点处仅执行常数次指针读写操作，因此时间复杂度为 $O(n)$。辅助空间开销同[《二叉树的最大深度：后序分解合并与调用栈深度》](/notes/algorithm/maximum-depth-of-binary-tree/)中的分析一致：递归实现受调用栈深度约束，辅助空间为 $O(h)$（其中 $h$ 为树高，平衡树下为 $O(\log n)$，退化链状树下为 $O(n)$）；基于 `std::queue` 的层序迭代实现受树的最大层宽 $w$ 约束，辅助空间为 $O(w)$。原地修改不等于辅助空间为常数；Python 递归仍可能触及解释器深度限制，而队列迭代没有这一限制。

[^sicp-tree]: [SICP §2.2.2: Hierarchical Structures](https://sicp.sourceacademy.org/chapters/2.2.2.html)——说明树形结构上的全局变换可递归规约为各分支子树的同构变换。

[^py-assign]: [Python 文档：赋值语句](https://docs.python.org/3/reference/simple_stmts.html#assignment-statements)——规定赋值语句先对右侧表达式列表完整求值，再按从左到右顺序绑定给左侧目标，保证并行交换时读取的均为原指针。

[^cpp-swap]: [cppreference：`std::swap`](https://en.cppreference.com/w/cpp/algorithm/swap.html)——说明交换两个对象值的工具函数，对原始指针执行常数时间交换且无堆分配。

[^cpp-queue]: [cppreference：`std::queue`](https://en.cppreference.com/w/cpp/container/queue.html)——说明先进先出队列容器适配器的常数时间入队与出队接口。
