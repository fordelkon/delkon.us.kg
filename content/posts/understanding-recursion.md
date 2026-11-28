---
title: "从调用栈理解递归"
description: "从调用栈出发，用 C++ 理解线性递归、遍历、分治、回溯和记忆化，分析状态保存、执行顺序、栈深上限与递归转迭代，并对应到 AArch64 调用约定与栈帧布局。"
publishDate: "24 Oct 2026"
tags: ["algorithm", "recursion", "cpp"]
---

## 从 `sumTo(3)` 看一次递归调用

`sumTo(3)` 把加法留到 `sumTo(2)` 返回以后。调用深入到 `sumTo(0)` 时，三次加法都还没做，每一层只记着自己该加的那个数。

下面的函数计算从 $1$ 到 $n$ 的整数和；契约约定 $0 \le n \le 65\,535$（以 32 位有符号 `int` 表示结果且 $n = 0$ 对应空和 `0`）。注意代码仅判断 `n == 0`：若违约传入负数，函数会一路递减跳过零点，最终耗尽调用栈并在触发有符号下溢前崩溃（或触发未定义行为）。

```cpp
// Precondition: 0 <= n <= 65535 (so sum n*(n+1)/2 fits in 32-bit signed int).
int sumTo(int n) {
    if (n == 0) {
        return 0;
    }

    // Bind child result first so this frame must retain `n` across the call.
    int child = sumTo(n - 1);
    return child + n;
}
```

### 函数契约、基本情况与递归进展

**基本情况**（base case）是 `n == 0`，这一层直接返回 $0$。**递归进展**（recursive progress）来自每次把正整数 $n$ 减一，逐步逼近并命中基本情况。返回时，`sumTo(n - 1)` 给出前 $n - 1$ 项的和，本层加上 $n$ 就得到前 $n$ 项的和。这也给出了归纳证明的基础和步骤。

### 调用栈保存了什么

**调用栈**（call stack）按后进先出顺序管理尚未返回的调用。每次调用都有自己的**栈帧**（stack frame），记住子调用返回后从哪里继续，以及届时还要用到的状态。这里每层都保留自己的 `n`，等返回值到手才初始化 `child`，再计算 `child + n`。

`sumTo(0)` 返回 `0` 时，只有最内层出栈。栈顶随即回到 `sumTo(1)`，它算出 `0 + 1` 后再把结果交给 `sumTo(2)`。同样的过程逐层重复，直到 `sumTo(3)` 返回 `6`。图中展示的是逻辑栈帧，实际存储方式见[从调用模型到 AArch64 实现](#从调用模型到-aarch64-实现)。

## 线性递归：一个子问题，进入与返回

`sumTo` 每层至多发起一次递归调用，调用链呈一条直线展开。这是**线性递归**（linear recursion）的基本形态：当前问题先归约为一个更小的同类子问题，再根据任务决定工作放在递归调用之前还是之后。

在 `sumTo` 中，每层都要等子调用返回后才能做加法。处理 $n = 3$ 的那一帧保留自己的 `n = 3`，处理 $n = 2$ 的那一帧保留自己的 `n = 2`——变量名相同，但分属不同栈帧。

把处理动作放在递归调用的不同侧，执行顺序就会完全相反：

| 操作位置                   | `n` 从 3 减到 0 时处理正整数的顺序 |
| -------------------------- | ---------------------------------- |
| 在子调用之前处理当前 `n`   | `3`、`2`、`1`                      |
| 在子调用返回后处理当前 `n` | `1`、`2`、`3`                      |

单链表天然具有同样的递归结构：每个节点指向后续子链表。先处理当前节点再递归是正序遍历，等子链表递归返回后再处理当前节点则是逆序操作。例如单链表的反转既可以利用递归返回时的逆序执行重连指针，也可以通过迭代就地推进指针；在[《回文链表：把判定拆成三个指针原语》](/posts/algorithm/palindrome-linked-list/)与[《K 个一组翻转链表：确认边界后再反转》](/posts/algorithm/reverse-nodes-in-k-group/)中，为了避免随链表长度线性增长的递归栈开销，往往使用常数指针原语将这种逆序重连收束到迭代中。

需要注意，“每层只有一个子调用”不代表只需要常量辅助空间。`sumTo` 的加法留在返回之后执行，未完成的调用帧会随递归深度线性增长；把部分结果提前装入参数向下传递（见后文的[累加器与尾调用](#累加器与尾调用)）可以消除返回后逻辑上的待完成操作，但若编译器未实际消除尾调用，物理调用栈仍会随深度增长，此时仍需依赖循环改写才能保证常量辅助空间。**线性描述的是调用图的形状，返回后是否还有工作才决定逻辑上需要保留多少层状态**。

## 遍历：访问当前节点，再继续其他分支

线性递归每层只走一个分支，因此总是“一路到底，再逐层返回”。而在有限、无环的二叉树遍历中，每层可能发起两次递归调用（下面的 `Node` 用 `const Node*` 表达非拥有只读观察指针；若算法需要原地改写树结构，则应使用可写指针 `Node*`）：

```cpp
#include <iostream>

struct Node {
    char value;
    // Non-owning observer pointers; caller owns Node storage lifetimes.
    const Node* left = nullptr;
    const Node* right = nullptr;
};

void preorder(const Node* node) {
    if (node == nullptr) {
        return;
    }

    std::cout << node->value << ' ';
    preorder(node->left);
    preorder(node->right);
}
```

构造一棵包含三个节点的树并调用 `preorder`：

```cpp
// `left` and `right` outlive `root` (destroyed in reverse declaration order).
Node left{'B'};
Node right{'C'};
Node root{'A', &left, &right};
preorder(&root); // Output: "A B C "
```

输出依次为 `A`、`B`、`C`。当 `A` 的左子树 `preorder(node->left)` 返回后，控制流回到处理 `A` 的那一帧，从 `preorder(node->right)` 继续执行，进而发起访问 `C` 的新调用。

因此，多分支递归的调用栈会随分支切换反复增长与回缩。**递归调用树**（recursion tree）展示整个计算过程产生的全部调用关系，而任意时刻的调用栈只保存从根到当前节点这条活跃路径上尚未返回的调用——已经执行完毕的左子树早已出栈，不会与右子树同时留在栈中：

```mermaid title="preorder(&root) 的调用树与访问 C 时的活跃调用栈" description="实线边是访问 C 节点瞬间仍留在调用栈上的活跃路径（A 暂停在 right 调用处等待，C 在栈顶）；虚线边表示左子树 B 及其空子调用均已完成并出栈，不会与 C 同时占住调用栈。"
flowchart TB
 callA["preorder(A)<br/>活跃：等待 right 返回"] -->|当前活跃栈| callC["preorder(C)<br/>当前栈顶"]
 callA -.->|已返回出栈| callB["preorder(B)<br/>左子树已出栈"]
 callB -.->|已返回| bNullL(["nullptr × 2"])
 callC -->|即将进入| cNull(["nullptr × 2"])
 class callA actor
 class callC state
 class callB,bNullL result
 class cNull resource
```

### 前序、中序与后序是操作位置的区别

递归函数体内的语句依然严格按顺序执行，递归调用只是把当前帧暂停，等子调用整棵子树处理完再继续往下走。

因此，二叉树遍历有三个自然的操作位置：

```cpp
// Each frame holds `node` and resumes sequentially at Position 2 then Position 3.
void traverse(const Node* node) {
    if (node == nullptr) {
        return;
    }

    // Position 1: before both recursive calls.
    traverse(node->left);
    // Position 2: between the recursive calls.
    traverse(node->right);
    // Position 3: after both recursive calls.
}
```

把 `std::cout << node->value << ' ';` 分别放在这三个位置，就对应三种深度优先遍历顺序：

| 操作位置 | 遍历方式                       | 对上例的输出 |
| -------- | ------------------------------ | ------------ |
| 位置 1   | 前序：当前节点、左子树、右子树 | `A B C`      |
| 位置 2   | 中序：左子树、当前节点、右子树 | `B A C`      |
| 位置 3   | 后序：左子树、右子树、当前节点 | `B C A`      |

在位置 2，当前帧必须等整棵左子树返回后才输出当前节点；在位置 3，则要等左右两棵子树都返回后才输出。无论选哪个位置，处理 `A` 的栈帧都会一直保留 `node` 指针和当前执行位置，直到两个子调用先后完成。

以节点数定义树高，设有限二叉树共有 $N$ 个节点、树高为 $h$（空树高度为 $0$，单节点树高度为 $1$）：每个非空节点访问一次，时间复杂度为 $O(N)$；非空节点对应的调用最多有 $h$ 层，计入 `preorder(nullptr)` 的终止调用后最大深度为 $h + 1$，辅助空间为 $O(h)$（空树仅需常量空间）。平衡树的 $h$ 为 $O(\log N)$，退化为单链时则达到 $O(N)$。操作位置同样决定了树上原地改写是否安全：例如[《翻转二叉树：自顶向下镜像传递与自底向上重挂》](/posts/algorithm/invert-binary-tree/)在前序或后序位置交换左右指针都能正确完成镜像，唯独不能在中序位置原地交换后再按原方向递归；而[《二叉树展开为链表：逆先序递归与前驱节点就地嫁接》](/posts/algorithm/flatten-binary-tree-to-linked-list/)则利用逆先序（右、左、根）在回退时重连指针，避免提前覆盖尚未访问的右子树。

### 从树扩展到图时，标记代表什么

树没有环，且从根到任意节点只有唯一路径，因此顺着指针递归不会重复访问节点。一般图则可能存在环或多条汇聚路径：在邻接表表示下遍历包含 $V$ 个顶点、$E$ 条边的图时，即使外层循环扫描非连通的所有顶点，每个顶点和边也只处理常数次，时间复杂度为 $O(V + E)$，维护访问标记数组与最深调用栈则需 $O(V)$ 辅助空间[^1]。类似地，克隆带有环或任意跳转指针的结构时，[《随机链表的复制：哈希表与交织节点》](/posts/algorithm/copy-list-with-random-pointer/)通过哈希表记录原节点到克隆节点的映射，充当防止重复展开与破除环路的标记。

状态标记是否需要在回退时撤销，完全取决于标记表达的语义，不同问题需要严格区分三种状态模型[^1]：

1. **可达性与连通分量（只写不撤）**：如在无向图或网格中计算连通块（参见[《岛屿数量：四邻域遍历与原地标记》](/posts/algorithm/number-of-islands/)），进入节点时置 `visited` 并在整次扫描内保留，目标是保证每个可达顶点只展开一次，总复杂度维持在 $O(V + E)$。若需要检测无向图是否有环，只需在永久 `visited` 之外记录直接来源 `parent`，遇到“已访问且非父节点”的邻接点即成环，无需撤销标记。
2. **有向图判环（必须区分三色状态）**：在有向图中，两节点从不同分支汇入同一节点（例如 `0 -> 1 -> 3` 与 `0 -> 2 -> 3` 的菱形 DAG）并不构成环。若只用二值 `visited` 且不清除，二次访问 `3` 会误报成环；若改用二值 `on_path` 并在退出时清除、却不记录“已确认无环”，虽能保持正确，但串联菱形 DAG 会引发 $\Omega(2^{V/2})$ 次指数级重复展开。因此，[《课程表：入度拓扑排序与三色 DFS 判环》](/posts/algorithm/course-schedule/)用**三色标记**区分“未访问 / 当前递归栈路径中 / 已检查完”，既确保精确判环，又把复杂度锁回 $O(V + E)$（类似地，Tarjan 强连通分量算法用独立 `on_stack` 区分“曾发现过”与“尚在活跃连通分量栈中”）。
3. **简单路径回溯（刻意退栈撤销）**：在网格搜词或受约束路径枚举（参见[《单词搜索：网格路径回溯与原地标记》](/posts/algorithm/word-search/)）中，同一顶点在当前路径只能用一次，但在另一条前缀路径中仍须可用，因此进入时标记、返回时撤销，且不能用“已完成”短路，这属于下节讨论的**回溯**（时间复杂度一般呈分支指数级）。不能看到函数名叫 DFS，就机械套用同一种标记规则。

## 分解与合并：用子问题结果求当前答案

遍历关心的是按顺序访问每个节点，子调用返回 `void`；另一类递归则需要把问题拆成几个独立的子问题，用子调用的返回值合成当前层的答案。

以计算有限二叉树高度为例（约定空树高度为 $0$，单节点树高度为 $1$），当前树的高度取决于左右子树的高度，合并操作自然发生在两次递归调用返回之后：

```cpp
#include <algorithm>
#include <cstddef>

std::size_t height(const Node* node) {
    if (node == nullptr) {
        return 0;
    }

    // Sequence left before right; `leftHeight` stays live on this frame across the second call.
    std::size_t leftHeight = height(node->left);
    std::size_t rightHeight = height(node->right);
    return 1 + std::max(leftHeight, rightHeight);
}
```

对前面的树调用 `height(&root)` 返回 `2`。在深入右子树计算 `rightHeight` 的整个过程中，当前栈帧除了记住返回位置和 `node`，还必须保留已经算出的 `leftHeight`，等右子树返回后再执行 `1 + std::max(leftHeight, rightHeight)`（这里拆成两条语句也固定了先左后右的调用顺序；若直接写 `std::max(height(node->left), height(node->right))`，按 C++17 起的函数调用实参规则，两个实参求值互不交错但先后仍属于**未指明顺序**（indeterminately sequenced）[^2]）。

同样是沿二叉树向下递归，遍历与分解合并在栈帧里等待的事情不同：

| 示例     | 当前层的职责             | 子调用返回后要做的事 |
| -------- | ------------------------ | -------------------- |
| 前序遍历 | 访问当前节点，再遍历子树 | 继续进入未访问的分支 |
| 计算树高 | 求当前子树的高度         | 合并左右子树的返回值 |

这种“分解子问题、递归求解、合并结果”的结构，正是**分治**（divide and conquer）的核心思路。相比重叠子问题，经典分治把规模为 $n$ 的问题划成互不重叠的子问题，按划分个数、比例与本层合并/拆分代价决定总开销：

| 分治结构       | 典型递推关系                      | 时间复杂度     | 调用栈空间                                        |
| -------------- | --------------------------------- | -------------- | ------------------------------------------------- |
| 归并排序       | $T(n) = 2T(n/2) + \Theta(n)$      | $\Theta(n\log n)$ | $O(\log n)$                                    |
| 平衡二叉树树高 | $T(n) = 2T(n/2) + \Theta(1)$      | $\Theta(n)$    | $O(\log n)$                                       |
| 二分查找       | $T(n) = T(n/2) + \Theta(1)$       | $\Theta(\log n)$ | $O(\log n)$（或改迭代为 $O(1)$）                 |
| 快速排序最坏   | $T(n) = T(n - 1) + \Theta(n)$     | $\Theta(n^2)$  | $O(n)$（若只对较小区间递归可压至 $O(\log n)$）     |

在归并排序中，[《排序链表：递归归并与自底向上归并》](/posts/algorithm/sort-list/)利用快慢指针找中点切分链表、递归排好左右子链再合并，是“分解合并”在链表上的标准呈现；而当待合并的有序序列扩展到 $k$ 条时，[《合并 K 个升序链表：小顶堆与两两归并》](/posts/algorithm/merge-k-sorted-lists/)展示了分治两两配对归并如何把多路重复扫描降至对数层级。相比之下，快速排序在递归之前先完成分区（partition），递归返回后无需额外合并。分治的关键在于子问题独立划分与结果组合，至于核心工作发生在递归前还是递归后、结果通过返回值还是原地修改数组交付，都只是具体实现形式。

在 `height` 中，左右子树互不重叠，每个节点恰好计算一次，因此时间复杂度为 $O(N)$，递归栈空间为 $O(h)$（与层序遍历队列的空间边界对比见[《二叉树的最大深度：后序分解合并与调用栈深度》](/posts/algorithm/maximum-depth-of-binary-tree/)）。在此基础上，许多树上分治还会区分“向上返回给父节点的单侧贡献”与“在当前拐点处汇总两侧结果的全局答案”，例如[《二叉树的直径：单侧深度贡献与拐点路径全局结算》](/posts/algorithm/diameter-of-binary-tree/)与[《二叉树中的最大路径和：负收益归零剪枝与树上后序贡献》](/posts/algorithm/binary-tree-maximum-path-sum/)。

## 回溯：选择、探索与恢复

### 选择、探索与恢复的节奏

有些问题既要在进入子调用前做出选择，又要在子调用返回后把选择撤回来，以便尝试同一层的其他分支。这就是**回溯**（backtracking）的典型节奏：选择、探索、恢复。

下面以互不相同的整数全排列为例（记输入 `values` 的长度为 $n$）。每层从剩余候选 `remaining` 中挑出一个元素追加到共享路径 `path` 末尾，递归探索剩余元素的所有排列；子调用返回后，再把刚加入的元素从 `path` 弹出，尝试下一个候选：

```cpp
#include <cstddef>
#include <vector>

// Precondition: input contains distinct integers. `path` is shared across branches
// and must be restored to its entry length before this call returns.
void permutationDfs(const std::vector<int>& remaining,
                    std::vector<int>& path,
                    std::vector<std::vector<int>>& result) {
    if (remaining.empty()) {
        result.push_back(path);
        return;
    }

    for (std::size_t index = 0; index < remaining.size(); ++index) {
        // Copying minus one element costs Theta(k) per iteration (total Theta(n^2) peak aux space);
        // swap or a shared `used` vector drops auxiliary space to O(n).
        auto next = remaining;
        next.erase(next.begin() +
                   static_cast<std::vector<int>::difference_type>(index));
        path.push_back(remaining[index]);
        permutationDfs(next, path, result);
        path.pop_back();
    }
}

std::vector<std::vector<int>> permutations(const std::vector<int>& values) {
    std::vector<std::vector<int>> result;
    std::vector<int> path;
    permutationDfs(values, path, result);
    return result;
}
```

这里每次调用的契约很清晰：在已选前缀 `path` 的基础上，把 `remaining` 中元素的所有排列追加到 `result`；**当本次调用正常返回时，`path` 必须恢复到进入本次调用时的状态**。

调用 `permutations({1, 2, 3})` 会依次收集 `{1, 2, 3}`、`{1, 3, 2}`、`{2, 1, 3}`、`{2, 3, 1}`、`{3, 1, 2}`、`{3, 2, 1}`。当第一次到达 `remaining.empty()` 收集 `{1, 2, 3}` 时，调用栈上有四层尚未结束的 `permutationDfs`：

| 调用层  | 当前层的 `remaining` | 当前层的循环进度      | 子调用返回后要做的事             |
| ------- | -------------------- | --------------------- | -------------------------------- |
| 第 1 层 | `{1, 2, 3}`          | `index = 0`，选中 `1` | 弹出 `1`，递增 `index` 后尝试 `2` |
| 第 2 层 | `{2, 3}`             | `index = 0`，选中 `2` | 弹出 `2`，递增 `index` 后尝试 `3` |
| 第 3 层 | `{3}`                | `index = 0`，选中 `3` | 弹出 `3`，随后循环结束并返回     |
| 第 4 层 | `{}`                 | 命中基本情况          | 复制保存 `{1, 2, 3}` 并返回      |

注意栈帧私有状态与跨层共享状态的区别：对于进入 `for` 循环的调用层，循环变量 `index` 属于该层调用自己的局部状态，局部容器 `next` 则在每轮循环迭代中各创建一个（第 2 到 4 层的 `remaining` 分别绑定到上一层尚未销毁的 `next`）；命中基本情况的第 4 层没有执行循环，自然也没有创建这些对象。而 `path` 是通过引用在所有层之间共享的同一个容器：收集 `{1, 2, 3}` 后，第 3 层与第 2 层依次返回并各执行一次 `pop_back()` 将 `path` 恢复为 `{1}`，随后第 2 层保留着自己的 `index` 进度递增选入 `3` 再向下展开，转入 `{1, 3, 2}`。

之所以会连续看到两次 `pop_back()`，是因为第 3 层和第 2 层各自在子调用返回后履行了自己的恢复契约。子调用返回只会回到父调用暂停的那一行继续往下走，既不会重跑父调用的函数开头，也不会重置父调用的 `for` 循环进度。

### 哪些状态需要显式恢复

把每层局部状态和跨层共享状态放在一起对比，就能看清为什么只有 `path` 需要手动撤销：

| 状态或操作               | 作用域与传递方式           | 回退时如何处理                         |
| ------------------------ | -------------------------- | -------------------------------------- |
| 循环下标 `index`         | 每层栈帧私有的局部变量     | 随栈帧自然保留，当前层返回时自动销毁   |
| 剩余集合 `next`          | 每层循环体内的局部容器副本 | 离开本轮循环作用域时自动销毁           |
| 共享路径 `path`          | 引用传递，所有分支共用一份 | 子调用返回后必须由 `pop_back()` 恢复   |
| `result.push_back(path)` | 向结果集追加当前路径的值   | 保存的是独立副本，不受后续回溯弹栈影响 |

因为 `path` 在整棵搜索树的所有分支间复用，进入兄弟分支前必须把它恢复原状（同理，[《路径总和 III：树上前缀和与回溯状态恢复》](/posts/algorithm/path-sum-iii/)在离开当前节点前必须将共享哈希表中的当前前缀和频次减 1，以免左子树的前缀和污染右子树分支）；相反，如果每层都按值把 `path` 复制一份传给子调用，就无需手动 `pop_back()`，但每次递归都要额外承担复制路径的开销。反过来，工程中更常用的做法是不再每轮复制 `remaining`——[《全排列：访问标记数组与原地交换分区》](/posts/algorithm/permutations/)详细对比了“共享布尔 `used` 数组加撤销”与“原地交换分区加换回”两种优化，把除结果外的递归辅助空间从本例的 $O(n^2)$（沿路径保留 $n - 1, n - 2, \ldots, 0$ 大小的 `next`）压到 $O(n)$。

回溯不一定非要枚举全部解：如果只需找一个可行解或判断解是否存在，命中目标后即可提前一路返回；如果在当前节点已经能判定后续分支不可能满足约束，则可以直接跳过子调用，也就是**剪枝**（pruning）。例如在[《四数之和：两层固定与双指针的剪枝边界》](/posts/algorithm/four-sum/)中，利用有序数组上的极值上下界提前跳过不可能分支；在[《单词搜索：网格路径回溯与原地标记》](/posts/algorithm/word-search/)中，则是把网格位置临时标记与回退撤销合到同一张矩阵里。

## 记忆化：复用重复子问题的结果

### 重叠子问题与状态缓存

前面的二叉树里，左右子树互不共享节点；但在很多递推问题中，不同分支会反复走到同一个子问题。以斐波那契数列 $F(0) = 0$、$F(1) = 1$、$F(n) = F(n - 1) + F(n - 2)$（$n \ge 2$）为例，求 `fibonacci(5)` 需要先求 `fibonacci(4)` 和 `fibonacci(3)`，而 `fibonacci(4)` 内部又会再求一次 `fibonacci(3)`。直接按定义递归，相同子问题会被重复展开 $2F(n + 1) - 1 = \Theta(\varphi^n)$ 次（其中 $\varphi = \frac{1 + \sqrt{5}}{2}$），呈指数爆炸。

**记忆化**（memoization）在递归过程中缓存已经算出的状态结果：第一次算完某个状态时写入缓存，后续任何分支再次遇到同一状态时直接读取返回[^3]。下面的实现约定合法输入为 $0 \le n \le 92$——在常见的 64 位有符号 `long long` 下，$F(92) = 7\,540\,113\,804\,746\,346\,429$ 是仍能精确表示的最大斐波那契数，$F(93)$ 就会有符号溢出触发未定义行为[^4]。同时代码在入口对 `n <= 0` 提前返回，避免下文 `static_cast<std::size_t>(n)` 将负数回绕成超大无符号长度：

```cpp
#include <cstddef>
#include <vector>

// Precondition: 0 <= n <= 92 (for 64-bit signed `long long`), `memo.size() > n`,
// and uncomputed slots are initialized to -1.
long long fibonacciDfs(int n, std::vector<long long>& memo) {
    if (n <= 1) {
        return n;
    }

    auto index = static_cast<std::size_t>(n);
    if (memo[index] != -1) {
        return memo[index];
    }

    // Evaluate `n - 1` first so the right branch `n - 2` hits the populated cache.
    long long previous = fibonacciDfs(n - 1, memo);
    long long beforePrevious = fibonacciDfs(n - 2, memo);
    memo[index] = previous + beforePrevious;
    return memo[index];
}

long long fibonacci(int n) {
    // Guard against negative inputs before casting `n` to an unsigned vector size.
    if (n <= 0) {
        return 0;
    }
    std::vector<long long> memo(static_cast<std::size_t>(n) + 1, -1);
    return fibonacciDfs(n, memo);
}
```

这里子问题的答案完全由参数 $n$ 决定，与从哪条调用路径到达无关。由于合法的斐波那契数均为非负数，可以用 `-1` 表示“尚未计算”。计算 `fibonacci(5)` 时，左支 `fibonacciDfs(4, memo)` 展开过程中已经算出了 `memo[3] = 2` 和 `memo[2] = 1`，随后右支 `fibonacciDfs(3, memo)` 以及内部右侧调用 `fibonacciDfs(2, memo)` 都会直接命中缓存返回，不再继续向下递归：

```mermaid title="fibonacci(5) 的记忆化依赖有向无环图（DAG）" description="实线表示真正向下展开的递归调用与缓存写入；虚线表示子问题已被左侧分支算出，再次遇到时直接命中 memo 短路返回，总调用数为 2n - 1。"
flowchart TB
 f5["fibonacci(5)"] -->|首次计算| f4["fibonacci(4)<br/>写入缓存 F(4) = 3"]
 f5 -.->|"命中缓存 F(3) = 2"| f3["fibonacci(3)<br/>写入缓存 F(3) = 2"]
 f4 -->|首次计算| f3
 f4 -.->|"命中缓存 F(2) = 1"| f2["fibonacci(2)<br/>写入缓存 F(2) = 1"]
 f3 -->|首次计算| f2
 f3 --> f1["F(1) = 1"]
 f2 --> f1
 f2 --> f0["F(0) = 0"]
 class f5,f4 actor
 class f3,f2 result
 class f1,f0 state
```

加上缓存后，从 $2$ 到 $n$ 的每个状态只会真正展开计算一次，其余访问均在 $O(1)$ 时间内命中返回，因此（在固定整数宽度下）时间复杂度从指数级降为 $O(n)$，缓存数组与调用栈合计占用 $O(n)$ 辅助空间。

### 缓存结果与标记访问的区别

图的遍历、回溯和记忆化都会在递归之外维护附加数据结构，但三者记录的信息与生命周期截然不同：

| 模式                 | 附加结构保存的信息     | 作用与生命周期                         |
| -------------------- | ---------------------- | -------------------------------------- |
| 图遍历中的 `visited` | 节点是否已被访问过     | 防止重复访问或死循环，整次遍历内保留   |
| 回溯中的共享状态     | 当前搜索路径已做的选择 | 供当前分支向下延伸，返回兄弟分支前撤回 |
| 记忆化中的 `memo`    | 子问题状态对应的计算值 | 将重叠子问题的后续求解直接短路为查表   |

能够有效使用记忆化或动态规划，依赖两条性质：第一，**无后效性与最优子结构**（或可独立组合的无环递推关系）——缓存键必须完整刻画子问题状态，使子状态结果只由键本身决定而与抵达路径无关；如果后续决策还取决于剩余容量、当前下标或已选集合，就不能只拿其中一部分做键。第二，**状态依赖必须无环**——对于这种“先求子状态、返回时写缓存”的自顶向下实现，状态依赖必须构成**有向无环图**（DAG，如本例严格从较大的 $n$ 依赖更小的 $n$）。一旦依赖成环，仅靠“算完才写 `memo`”会在结果填入前无限循环；此时需要借用前文的[三色状态模型](#从树扩展到图时标记代表什么)另行引入 `visiting`（当前栈中）标记，在 $O(V + E)$ 内识破环路，或改用最短路松弛、强连通分量缩点（SCC + DAG DP）等解法处理带环依赖（更多线性递推建模见[《爬楼梯：状态转移矩阵与一维滚动变量》](/posts/algorithm/climbing-stairs/)）。

至此可以看到，本文讨论的递归中，数据流动主要有三种通道：通过参数向子调用传递上下文、通过返回值向父调用交付结果，以及通过共享状态在不同调用层之间交换信息（引用、指针、全局变量或 I/O 副作用均属共享状态）。读懂一段递归，核心就是分清每个数据走的是哪条通道、归哪一层管辖。

## 复杂度对照与分析

前文各节分散给出了每种模式的时间与空间结论，这里集中对照一次。$n$ 表示输入规模（数值上限、元素个数或状态总数），$N$ 与 $h$ 分别表示树节点数与树高，$V$ 与 $E$ 分别表示图的顶点数与边数；下表辅助空间均不含存放最终结果集的存储：

| 算法               | 时间复杂度        | 辅助空间（不含结果集） |
| ------------------ | ----------------- | ---------------------- |
| `sumTo` 线性递归   | $O(n)$            | $O(n)$                 |
| 二叉树前中后序遍历 | $O(N)$            | $O(h)$                 |
| 计算树高           | $O(N)$            | $O(h)$                 |
| 图 DFS（邻接表）   | $O(V + E)$        | $O(V)$                 |
| 全排列（本文实现） | $O(n \cdot n!)$   | $O(n^2)$               |
| 记忆化 Fibonacci   | $O(n)$            | $O(n)$                 |
| 显式栈后序遍历     | $O(N)$            | $O(h)$                 |
| 循环版 `sumTo`     | $O(n)$            | $O(1)$                 |

注：线性递归与记忆化实现按非负整数输入记，$n = 0$ 时仍至少执行 $1$ 次入口调用，严格帧数开销为 $O(n + 1)$（随 $n \ge 1$ 记为 $O(n)$）。

核对任一递归算法的复杂度，可以拆成四个互相独立的问题：递归调用总共发生多少次、每次调用做多少工作、任意时刻同时存活多少状态（决定调用栈或显式栈的峰值开销），以及结果集本身占多少空间。以本文的 `permutationDfs` 为例（$n \ge 1$）：全排列共有 $n!$ 个叶节点，每个叶节点复制长度为 $n$ 的 `path`，合占 $\Theta(n \cdot n!)$ 时间；而在深度 $k \in \{0, 1, \dots, n - 1\}$ 的每个内部节点上，共有 $\frac{n!}{(n - k)!}$ 次调用，每轮循环都复制并擦除长度为 $n - k$ 的容器 `next`，单节点工作量为 $\Theta((n - k)^2)$。令 $m = n - k$ 对所有内部层求和：

$$
\sum_{k=0}^{n-1} \frac{n!}{(n - k)!}(n - k)^2 = n! \sum_{m=1}^{n} \frac{m^2}{m!} < 2e \cdot n! = \Theta(n!)
$$

其中无穷级数 $\sum_{m=1}^{\infty} \frac{m^2}{m!} = \sum_{m=2}^{\infty} \frac{1}{(m-2)!} + \sum_{m=1}^{\infty} \frac{1}{(m-1)!} = 2e$。因此内部节点的容器拷贝开销仅为 $\Theta(n!)$，严格被叶节点 $\Theta(n \cdot n!)$ 的结果复制主导；与此同时，从根到叶的 $n$ 个活跃调用层各自保留一份 `next` 副本，总元素数为 $\sum_{m=0}^{n-1} m = \Theta(n^2)$（改用共享 `used` 标记或原地交换即可把辅助空间压回 $O(n)$）。

未记忆化的 Fibonacci 递归调用树有指数数量的节点。加入缓存后，每个非基本状态只展开一次，缓存命中调用也只有线性数量，因此实际调用总数和总时间均为 $O(n)$。对本文初始缓存全为 `-1` 的实现，当 $n \ge 2$ 时，状态 $2$ 到 $n$ 各展开一次、各发起两次子调用，加上最初的调用，总调用数恰为 $1 + 2(n - 1) = 2n - 1$。

`sumTo` 的 $O(n)$ 辅助空间则完全来自“返回后还有加法”所保留的调用帧——正是线性递归一节“调用图形状”与“返回后待完成工作”的区分。

## 从递归改写为迭代

理解了调用栈替我们保存什么，就能系统地把递归改写为迭代。SICP 将“沿着调用链积压待完成操作”的计算称为**递归计算过程**（recursive process），而将“仅靠固定数量的状态变量不断更新”的计算称为**迭代计算过程**（iterative process）——源码语法上函数是否调用自身，与执行过程中物理状态是否随深度增长，是两个层面的事[^5]。

### 累加器与尾调用

回到开头的 `sumTo(n)`：外层调用之所以不能提前结束，是因为每层都在等待子调用返回后再做一次 `+ n`。如果引入一个累加参数 `total`，在进入下一层之前先把当前层的 `n` 加进去，就能消掉返回后的加法：

```cpp
// Precondition: 0 <= n <= 65535; negative inputs return `total` safely without recursing.
int sumTail(int n, int total = 0) {
    if (n <= 0) {
        return total;
    }
    return sumTail(n - 1, total + n);
}
```

这里 `total + n` 在发起子调用前就已经算完；子调用返回后，当前层除了原样把结果往上传，没有任何剩余工作。这种将函数调用作为返回前最后一个动作的形式称为**尾调用**（tail call），对应的自调用即**尾递归**（tail recursion）。

需要注意，把返回后的计算移入累加器会同时改变运算的结合顺序与操作数顺序：`sumTo(3)` 在回退时按 `((0 + 1) + 2) + 3` 求和，而上面的 `sumTail(3, 0)` 在递进时按 `((0 + 3) + 2) + 1` 累加。对满足前条件的非溢出 32 位有符号整数加法，因为整数加法同时满足**结合律**（associativity）与**交换律**（commutativity），两种顺序结果相同；若换成非交换操作（例如字符串拼接 `s + t`，即便满足结合律，把 `(prev + cur)` 写成 `total + cur` 也会把顺序反过来）、依赖结合顺序或受舍入误差影响的浮点求和，或是带可观察副作用的计算，改写前都必须重新验证求值顺序与数值语义。

既然每一层只把 `(n, total)` 更新为 `(n - 1, total + n)`，且返回后不再使用旧状态，就可以直接改写成一个只维护这两个变量的循环：

```cpp
// Precondition: 0 <= n <= 65535; negative inputs return 0.
int sumIterative(int n) {
    int total = 0;
    while (n > 0) {
        total += n;
        --n;
    }
    return total;
}
```

循环体里先累加 `total += n` 再执行 `--n`，严格对应尾递归传参 `sumTail(n - 1, total + n)` 时两个表达式都基于旧 `n` 求值的数据依赖。

在 C++ 源码层面写成尾递归，**不代表一定只用 $O(1)$ 栈空间**：不同于 Scheme 等在语言规范中强制要求**严格尾调用**（proper tail recursion）的语言[^6]，ISO C++20 标准并未要求编译器实施**尾调用优化**（tail call optimization, TCO）。开启优化后，Clang/GCC 常会把单函数自尾递归改写为寄存器循环、把跨函数尾调用改写为无返回跳转（例如在 Clang 中可用 `[[clang::musttail]]` 对跨函数尾调用显式施加编译器检查[^6]）；但在 `-O0` 调试构建下，或者只要当前层仍存在以下任一阻塞条件，编译器就无法复用当前栈帧：

1. 当前作用域仍有非平凡局部对象存活，其析构函数必须在子调用返回后运行；
2. 把指向本层局部栈变量的指针或引用传给了子调用；
3. 子调用返回值在返回前还需要经过隐式类型转换；
4. 目标调用约定不兼容（如大型结构体经 `sret` 间接返回、不同参数栈槽清理责任），或调用仍位于活跃的 `try` 异常捕获区内。

因此，在 C++ 中直接写成 `sumIterative` 循环，才能在所有优化级别下保证 $O(1)$ 辅助空间。

### 显式栈与继续执行的位置

当每层有多个递归分支、且返回后还有工作时，仅靠一两个累加变量不够用，需要用容器模拟调用栈[^7]。以二叉树的后序遍历为例，当前节点必须在左右子树都访问完之后才能输出。改写成迭代时，可以用 `std::vector` 作为**显式栈**（explicit stack），同时记录节点指针和“左右子树是否已经展开”的阶段标记：

```cpp
#include <iostream>
#include <vector>

struct Pending {
    const Node* node;
    bool isExpanded;
};

void postorderIterative(const Node* root) {
    std::vector<Pending> stack{{root, false}};
    while (!stack.empty()) {
        // Copy by value before pop_back(); structured bindings to stack.back() would dangle.
        auto [node, isExpanded] = stack.back();
        stack.pop_back();
        if (node == nullptr) {
            continue;
        }
        if (isExpanded) {
            std::cout << node->value << ' ';
            continue;
        }

        // LIFO order: left subtree, right subtree, then this node.
        stack.push_back({node, true});
        stack.push_back({node->right, false});
        stack.push_back({node->left, false});
    }
}
```

对前面的三节点树调用 `postorderIterative(&root)`，同样输出 `B`、`C`、`A`。第一次弹出根 `A` 时，`isExpanded` 为 `false`，程序先把 `{A, true}` 压回栈底留作“子树处理完后再输出 `A`”的待办项，再依次压入右孩子和左孩子；由于栈后进先出，接下来会先处理左子树 `B`、再处理右子树 `C`，最后才再次弹出 `{A, true}` 完成输出。这里的 `isExpanded` 标记，本质上就是把原本隐含在调用栈返回地址里的“当前执行到了第几步”显式化了。

对比来看，前序遍历在进入子节点前就已经输出了当前节点，返回后无需再处理自己，因此栈里只需存节点指针，按“先右后左”压入即可；中序遍历则可以用一路向左压栈的指针链代替阶段标记（见[《二叉树的中序遍历：递归栈帧、显式栈与 Morris 线索化》](/posts/algorithm/binary-tree-inorder-traversal/)与[《二叉搜索树中第 K 小的元素：中序遍历与迭代提前终止》](/posts/algorithm/kth-smallest-element-in-a-bst/)）；而在解析嵌套表达式等场景下，还需要用显式栈同时暂存进入子层前的外层字符串与重复次数（见[《字符串解码：用显式栈保存外层上下文》](/posts/algorithm/decode-string/)）。

若要把前面分解与合并中的 `height` 改成显式栈，则除了三段执行阶段外，还要把 `leftHeight` 放进帧记录，并专门用一个变量充当子调用传递返回值的“结果槽”（类似物理寄存器中的返回值寄存器）：

```cpp
#include <algorithm>
#include <cstddef>
#include <vector>

enum class HeightStage { Enter, AfterLeft, AfterRight };

struct HeightFrame {
    const Node* node;
    HeightStage stage = HeightStage::Enter;
    std::size_t leftHeight = 0;
};

std::size_t heightIterative(const Node* root) {
    std::size_t returned = 0;
    std::vector<HeightFrame> stack{{root, HeightStage::Enter, 0}};

    while (!stack.empty()) {
        // Read child pointers before push_back(), because reallocation invalidates `top`.
        HeightFrame& top = stack.back();
        if (top.node == nullptr) {
            returned = 0;
            stack.pop_back();
            continue;
        }

        if (top.stage == HeightStage::Enter) {
            top.stage = HeightStage::AfterLeft;
            const Node* leftChild = top.node->left;
            stack.push_back({leftChild, HeightStage::Enter, 0});
        } else if (top.stage == HeightStage::AfterLeft) {
            top.leftHeight = returned;
            top.stage = HeightStage::AfterRight;
            const Node* rightChild = top.node->right;
            stack.push_back({rightChild, HeightStage::Enter, 0});
        } else {
            std::size_t rightHeight = returned;
            returned = 1 + std::max(top.leftHeight, rightHeight);
            stack.pop_back();
        }
    }
    return returned;
}
```

可见**返回后剩余什么工作，显式栈里就要多存什么字段**：`stage` 显式接管了返回地址，`leftHeight` 接管了跨右子树调用存活的局部变量，而 `returned` 接管了子调用返回值。若遇上 `f` 调 `g`、`g` 又调 `f` 的**互递归**（mutual recursion），把“当前该调度哪个函数”作为枚举状态一同放入帧结构或外层循环状态中即可收拢为单循环状态机；当多个分支以尾调用形式相互跳转、却无法依赖语言层 TCO 时，也可以让每次执行只返回一个“下一步要调用的函数闭包”交给外层 `while` 驱动，这种调度循环称为**蹦床**（trampoline）。

在复杂度上，显式栈后序遍历与 `heightIterative` 一样只处理每个节点常数次，时间复杂度均为 $O(N)$；任意时刻栈中仅保存当前根到叶路径上的祖先待办记录及其未访问的兄弟节点，空间复杂度同样为 $O(h)$。改用显式栈并没有降低渐进空间量级，而是把状态保存在容量远大于线程栈的堆内存容器中——操作系统线程的调用栈通常只有几 MB 上限（例如受 Linux `RLIMIT_STACK` 限制并在末尾设保护页，越界即触发 `SIGSEGV`），Python 等解释器也会通过 `sys.getrecursionlimit()` 主动截断过深调用链[^8]；退化链深度达到 $O(N)$ 时，显式栈可避免耗尽有限的调用栈。

### 转换时先列出需要保留的信息

把五种模式在逐层调用时隐式保存在栈帧里的信息列出来，就是改写迭代时的状态清单：

| 模式       | 逐层调用时栈帧保留的信息                   |
| ---------- | ------------------------------------------ |
| 线性递归   | 当前参数，以及子调用返回后的待执行操作     |
| 遍历       | 当前节点、尚未访问的分支与当前所处阶段     |
| 分解与合并 | 当前所处阶段，以及已算出的部分子问题结果   |
| 回溯       | 当前分支的循环进度，以及共享状态的恢复责任 |
| 记忆化     | 待完成的状态依赖链，以及跨分支复用的缓存表 |

### 从记忆化到自底向上递推

如果进一步把记忆化递归改写为自底向上的动态规划（按表递推），实质上则是预先排好拓扑序，使得计算任意状态时它依赖的子状态都已经算好存入表中，从而连递归调用栈也一并省去。更重要的是，当每个状态只依赖固定步长内的前驱时（例如 `F(i)` 只读 `F(i - 1)` 与 `F(i - 2)`），还可以用少数几个**滚动变量**（rolling variables）替代整张表，把空间复杂度从 $O(n)$ 进一步压缩到 $O(1)$（线性递推与空间压缩实例见[《爬楼梯：状态转移矩阵与一维滚动变量》](/posts/algorithm/climbing-stairs/)）。不过如果状态空间很大、而实际从起点可达的状态只占极小稀疏子集，自顶向下记忆化只计算真正到达的状态，反而常比填满整张表的自底向上递推更省时间。

这种自底向上（bottom-up）的转化思路不仅局限于动态规划，在分治算法中同样能够彻底消除调用栈：例如在 [《排序链表：递归归并与自底向上归并》](/posts/algorithm/sort-list/) 中，无需使用显式栈模拟拆分过程，而是按步长翻倍（1、2、4、……）直接在原链表上自底向上合并相邻有序段，从而在维持 $O(n\log n)$ 时间的同时彻底省去递归栈，达成 $O(1)$ 常量辅助空间。

在实际工程中，递归与迭代的取舍主要看问题结构的表达清晰度与运行时的栈深边界：当状态转移只需原地更新几个变量时，直接写循环最简单；当问题本身具有树形分解或回溯搜索结构时，递归能把“当前层做什么、子问题做什么、返回后做什么”直接映射为代码位置；但如果输入规模可能导致调用深度极大（如退化链或超长路径），则应优先考虑尾递归改循环或用显式栈接管状态。另外还要分清，**显式栈只改变状态的存放位置，不会自动消除重叠子问题**——若原算法存在重复计算，仍需配合记忆化或动态规划才能降低时间复杂度。

## 从调用模型到 AArch64 实现

前面一直在逻辑栈帧层面讨论“保存返回位置与局部变量”。最后一节回到最初的 `sumTo`，看看这些抽象信息在真实机器上如何落到寄存器与栈内存中。

### 寄存器、调用约定与栈布局

[《并发编程（一）：并发、并行与执行单元》](/posts/concurrency/parallelism-execution-units/#线程)提到，每个线程拥有私有的程序计数器、寄存器上下文和线程栈。函数调用完全发生在同一条线程执行流内部，只需按约定的指令读写寄存器和栈内存，无需陷入内核切换线程。

以 AArch64 架构与 AAPCS64 调用约定为例，硬件提供寄存器和跳转指令，调用约定则规定参数怎么传、哪些寄存器跨调用必须保留[^9]；macOS 等 Apple 平台在通用 AAPCS64 之上另有平台约束：例如 `x29` 必须始终指向有效帧记录、`x18` 保留给平台使用（应用代码不得读写），并且用户态在 `SP` 以下划有 128 字节**红区**（red zone）供不再发起子调用的**叶函数**（leaf function）免调 `SP` 暂存局部数据，但像 `sumTo` 这样会再次发起 `BL` 的**非叶函数**（non-leaf function）不能依赖红区，必须先显式下调 `SP` 分配栈帧[^10]：

| 状态或寄存器           | 在函数调用中的角色                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| 程序计数器 `PC`        | 指向当前执行指令；`BL` 调用跳转与 `RET` 函数返回都会改变 `PC`                                        |
| 栈指针 `SP`            | 指向当前栈顶；函数通过调整 `SP` 分配或回收空间，公共接口边界下 `SP` 必须始终保持 16 字节对齐         |
| 链接寄存器 `x30`（`LR`） | 保存 `BL` 调用指令写入的返回地址                                                                   |
| `x0`–`x7`              | 参数与返回值寄存器；本文的 `int` 使用低 32 位 `w0`（写入 `w0` 会自动将 `x0` 高 32 位清零）           |
| `x8` 与 `x9`–`x15`     | 调用者保存寄存器（caller-saved）；`x8` 兼作间接返回地址寄存器 `XR` 与临时寄存器，`x9`–`x15` 跨调用不保留 |
| `x19`–`x28`            | 被调用者保存寄存器（callee-saved）；函数若使用它们必须在返回前恢复原值                               |
| 帧指针 `x29`（`FP`）   | 指向当前帧记录，用于串联调用栈帧链，同样需跨调用保留                                                 |

在 AArch64 中，`BL`（Branch with Link）指令跳转到目标函数的同时，会把下一条指令的地址写入链接寄存器 `LR`。如果当前函数内部还要再调用别的函数（比如递归调用自身），下一次 `BL` 就会覆盖 `LR`。因此，非叶函数通常会在函数的**序言**（prologue）下调 `SP` 分配栈空间，把当前的 `FP` 和 `LR` 保存到栈上并用 `x29` 建立新帧链；等函数结束前，再在**尾声**（epilogue）从栈上恢复 `FP` 和 `LR`，回收栈空间，最后执行 `RET` 按 `LR` 跳回调用者[^9][^11]。

这也说明，“函数调用就是把所有变量通通压栈”只是一种粗糙比喻：小整数参数和返回值直接走 `w0` 等寄存器，生命周期不跨调用的中间值也可以一直留在 `w8`、`w9` 等调用者保存寄存器中；在当前 `sumTo` 示例中，返回地址 `LR` 和子调用后还要用的原参数 `n` 都需要跨调用保留，可以安放在栈帧或被调用者保存寄存器中。更一般地，局部对象的取址需求、局部数组以及寄存器分配产生的溢出保存也可能需要栈存储，具体布局由编译器、优化选项与 ABI 决定[^9]。

将开头的 `sumTo` 保存为 `sum.cpp`，在 macOS arm64 上用 Clang 关闭优化并显式保留帧指针来生成汇编[^12]：

```sh
clang++ -std=c++20 -O0 -fno-omit-frame-pointer -S sum.cpp -o sum.s
```

本文摘录由 Homebrew Clang 21.1.3（target `arm64-apple-darwin`）生成并逐指令核对。注意 `-O0` 下开辟 32 字节栈帧与各槽位偏移只是这次编译的具体布局，并非所有递归函数或工具链的固定大小；下面列出这 32 字节栈帧的内存分布，以及对应的函数入口、递归分支与公共退出段汇编（省略 `n == 0` 条件跳转标签及写入 `wzr` 清零返回槽的分支和 CFI 伪指令）：

| 相对当前 `SP` 的字节偏移 | 大小  | 存放内容                             |
| ------------------------ | ----- | ------------------------------------ |
| `[sp, #24]` .. `[sp, #31]` | 8 字节 | 保存调用者的返回地址 `x30`（`LR`）  |
| `[sp, #16]` .. `[sp, #23]` | 8 字节 | 保存调用者的帧指针 `x29`（`FP`），且新 `x29 = sp + 16` |
| `[sp, #12]` .. `[sp, #15]` | 4 字节 | 公共返回值槽 `[x29, #-4]`           |
| `[sp, #8]` .. `[sp, #11]`  | 4 字节 | 当前层的参数 `n`                    |
| `[sp, #4]` .. `[sp, #7]`   | 4 字节 | 当前层的局部变量 `child`            |
| `[sp, #0]` .. `[sp, #3]`   | 4 字节 | 对齐填充，使整块帧长 `32` 保持 16 字节对齐 |

```asm
// Entry (prologue): allocate 32 bytes and save caller's FP (x29) and LR (x30).
sub sp, sp, #32
stp x29, x30, [sp, #16]
add x29, sp, #16
str w0, [sp, #8]

// Base case (`n == 0`) writes zero via `stur wzr, [x29, #-4]` and jumps to exit (omitted).

// Recursive branch: compute n - 1 in w0 and call sumTo.
ldr w8, [sp, #8]
subs w0, w8, #1
bl __Z5sumToi

// Resume after child returns: w0 holds sumTo(n - 1).
str w0, [sp, #4]
ldr w8, [sp, #4]
ldr w9, [sp, #8]
add w8, w8, w9
stur w8, [x29, #-4]

// Common exit (epilogue): load return value, restore FP/LR, free stack frame.
ldur w0, [x29, #-4]
ldp x29, x30, [sp, #16]
add sp, sp, #32
ret
```

对照第一节的逻辑栈帧，这段汇编把每一步都落到了具体位置：

1. 入口 `sub sp, sp, #32` 在栈上分配 32 字节（总帧长与填充字节共同满足 AAPCS64 对 `SP` 的 16 字节对齐要求[^9]），`stp x29, x30, [sp, #16]` 保存调用者的 `FP` 与返回地址 `LR`，`add x29, sp, #16` 让本帧的 `FP` 指向刚保存的帧记录完成链表串联[^9][^10]，随后 `str w0, [sp, #8]` 把参数 `n` 存进本层栈槽 `[sp, #8]`。
2. 递归分支用 `subs w0, w8, #1` 计算 `n - 1` 放入 `w0`（指令后缀 `s` 会顺便更新状态标志位，本分支未读取标志仅取计算结果），随后 `bl __Z5sumToi` 跳转到 `sumTo` 开头，同时把下一条指令 `str w0, [sp, #4]` 的地址写入 `LR`[^11]。至于 `n == 0` 分支，编译器用 `stur wzr, [x29, #-4]` 直接把硬件零寄存器写入公共返回值槽后跳向退出段。
3. 子调用返回后，`w0` 带回 `sumTo(n - 1)` 的结果并存入 `[sp, #4]`（即 `child`），接着从 `[sp, #8]` 读出当前帧保留的 `n` 到 `w9`，经 `add w8, w8, w9` 算出 `child + n`，写入与基本情况共用的返回值槽 `[x29, #-4]`——这里使用 `stur`/`ldur` 是因为偏移 `-4` 相对于 `x29` 为负值，而正偏移 `[sp, #4]`/`[sp, #8]` 使用无符号缩放寻址指令 `str`/`ldr`[^11]。
4. 公共退出段先执行 `ldur w0, [x29, #-4]` 将返回值装入 `w0`，再用 `ldp` 恢复进入本层时保存的 `FP` 和 `LR`，之后才用 `add sp, sp, #32` 回收栈帧，确保恢复完成前栈帧始终在有效 `SP` 之上不被信号或中断破坏，最后执行 `ret` 按恢复后的 `LR` 跳回上一层。

正因为每一层都各自在栈上分出一块 32 字节空间保存自己的 `n`、`child` 和 `LR`，`sumTo(3)`、`sumTo(2)`、`sumTo(1)` 才能互不干扰地挂起等待，再按后进先出的顺序依次恢复完成加法。如果开启优化编译前文的 `sumTail`（例如同一个 Clang 21.1.3 在 `-O1` 下编译 `__Z7sumTailii`），编译器不再生成 `sub sp`/`stp`/`bl` 指令，而是直接下沉为只更新 `w1`（`total`）与 `w0`（`n`）的寄存器循环；若是在优化级别下遇到符合 ABI 条件的跨函数尾调用，则可能生成不写 `LR` 的无条件跳转指令 `b`，直接交由下一个函数替当前调用执行 `ret`[^12]。

### return、清理与机器返回

最后区分一下源码中的 `return` 与机器指令 `ret`。在 `sumTo` 写出 `int child = sumTo(n - 1); return child + n;` 时，程序必须先发起子调用、拿到返回值并做完加法，才能确定当前函数的返回值（即便把两条语句合并写成 `return sumTo(n - 1) + n;`，求值依然如此）；返回结果初始化后，还必须按声明逆序销毁本次退出作用域时应当销毁的局部自动对象[^13]。

在返回值传递上，C++20 按场景区分三种机制[^14]：第一，若 `return` 返回纯右值（如临时构造表达式 `return std::vector<int>{...};`），C++17 起标准**强制消除复制与移动**，直接在调用者目标位置就地构造；第二，若返回非易失性局部具名对象（例如 `permutations` 中的 `result`），标准允许（但不强制）**具名返回值优化**（named return value optimization, NRVO），若实施 NRVO，`result` 会直接构造在调用者预留的返回槽中（如通过 `x8` 间接传入地址），仅 `path` 在退出前析构；第三，若未能实施 NRVO，则按**隐式移动**（implicit move）规则优先将具名局部返回对象视作右值执行移动构造，因此切忌刻意写成 `return std::move(result);`——一旦加上 `std::move`，返回表达式不再是直接标识变量的名字，反而彻底堵死了 NRVO 的资格[^14]。

因此，源码里的 `return` 表示“开始构造返回值并准备清理局部作用域后离开当前调用”，而汇编末尾的 `ret` 只是所有计算、析构清理与栈帧恢复全部完成后，把控制权交回调用者的最后一步跳转。看清“返回前还有哪些工作没做完”，也就抓住了理解递归执行顺序、栈空间开销、显式栈字段设计以及尾递归优化边界的同一条主线。

## 总结

观察任意一段递归代码，只要顺次拆解三个问题就能看透其行为与开销：

1. **契约与通道**：每一层的输入输出契约是什么、如何推进并命中基本情况；数据究竟通过参数下传、返回值上交，还是借由引用/共享状态在层间修改并负责恢复。
2. **形态与边界**：它在调用图上属于线性递归、树/图遍历、分支合并、回溯枚举，还是带 `memo` 的有向无环记忆化——分别决定了时间复杂度、访问标记规则（只写不撤 / 三色判环 / 退栈撤销）以及活跃帧深度。
3. **迭代与硬件落点**：把“子调用返回后仍需保留的执行阶段与局部数据”逐项列成显式结构体或累加器，即可系统地改写为 `while` 循环或拓扑序递推；而在机器层面上，这些等待工作正对应 `LR`、溢出到栈帧的局部槽位以及 `BL`/`RET` 与函数 `return` 清理的严格顺序。

## 延伸阅读

- [Compiler Explorer（Godbolt）](https://gcc.godbolt.org)——在线交互式对比不同优化级别（`-O0`/`-O1`/`-O2`）与 `[[clang::musttail]]` 在 AArch64 与 x86-64 下将递归、尾递归及返回值构造编译出的真实汇编差异。
- [Algorithms, 4th Edition: Directed Graphs](https://algs4.cs.princeton.edu/42digraph/)——Robert Sedgewick 与 Kevin Wayne 对有向图可达性、三色环检测与逆后序拓扑排序的系统教材与代码实现。

[^1]: [MIT 6.006, Lecture 14: Depth-First Search (DFS), Topological Sort](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-14-depth-first-search-dfs-topological-sort/)——阐述图的深度优先遍历、边分类、三色与栈中状态判环，以及邻接表下的 $O(V + E)$ 时间与 $O(V)$ 辅助空间分析。

[^2]: [C++20 工作草案 N4861: expr.call](https://timsong-cpp.github.io/cppwp/n4861/expr.call) 与 [intro.execution](https://timsong-cpp.github.io/cppwp/n4861/intro.execution)——规定自 C++17 起函数调用各实参的求值彼此不交错但属于未指明顺序（indeterminately sequenced），因此双分支递归需通过拆句定序才能确保调用次序。

[^3]: [MIT 6.006, Lecture 19: Dynamic Programming I: Fibonacci, Shortest Paths](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-19-dynamic-programming-i-fibonacci-shortest-paths/)——以斐波那契数列为例引入记忆化（memoization）、重叠子问题复用与动态规划递推，将指数级展开降为按状态数线性求解。

[^4]: [C++20 工作草案 N4861: basic.fundamental](https://timsong-cpp.github.io/cppwp/n4861/basic.fundamental)——规定 `long long int` 至少具备 64 位有符号表示范围；在常见 64 位补码实现下，$F(92)$ 为最大不溢出斐波那契数，$F(93)$ 会导致有符号整数溢出这一未定义行为。

[^5]: [SICP Comparison Edition §1.2.1: Linear Recursion and Iteration](https://sicp.sourceacademy.org/chapters/1.2.1.html)——区分沿着调用链积压待完成操作的递归计算过程，以及只依靠固定状态变量更新推进的迭代计算过程，并讨论尾递归实现。

[^6]: [R7RS-small §3.5: Proper tail recursion](https://small.r7rs.org/attachment/r7rs.pdf) 与 [Clang Attribute Reference: musttail](https://clang.llvm.org/docs/AttributeReference.html#musttail)——Scheme 规范强制要求严格尾递归以保证常量栈空间，而 ISO C++ 标准并不保证尾调用优化；Clang 提供 `[[clang::musttail]]` 对跨函数尾调用显式验证并要求生成尾跳转。

[^7]: [SICP Comparison Edition §5.1.4: Using a Stack to Implement Recursion](https://sicp.sourceacademy.org/chapters/5.1.4.html)——在寄存器机器模型中用 `save`/`restore` 把子调用返回后仍需继续使用的状态与返回继续点压栈并按后进先出恢复，展示显式栈如何模拟多分支递归。

[^8]: [Linux manual page: getrlimit(2)](https://man7.org/linux/man-pages/man2/getrlimit.2.html) 与 [Python 文档: sys.getrecursionlimit](https://docs.python.org/3/library/sys.html#sys.getrecursionlimit)——分别说明类 Unix 进程线程栈大小上限（`RLIMIT_STACK`）及越界触发机制，以及 Python 通过全局递归深度上限在耗尽物理 C 栈前主动抛出 `RecursionError` 的保护措施。

[^9]: [Arm AAPCS64, 2025Q4](https://github.com/ARM-software/abi-aa/blob/2025Q4/aapcs64/aapcs64.rst)——§6.1.1 规定参数寄存器（`x0`–`x7`）、间接结果寄存器 `x8`、临时寄存器（`x9`–`x15`）、被调用者保存寄存器（`x19`–`x28`）与 `x29`/`x30` 职责；§6.4.5 规定 `SP` 16 字节对齐；§6.4.6、§6.5 与 §6.8–§6.9 说明帧记录、调用返回约定及标量/间接返回机制。

[^10]: [Apple Developer Documentation: Writing ARM64 code for Apple platforms](https://developer.apple.com/documentation/xcode/writing-arm64-code-for-apple-platforms)——规定 `x29` 必须始终指向有效帧记录、`x18` 为平台保留寄存器，并阐明用户态 128 字节红区（red zone）仅限不再发起子调用的叶函数使用，非叶函数及自调用递归必须下调 `SP` 分配栈帧。

[^11]: [Arm: A64 Instruction Set Architecture, Guide 1.3](https://documentation-service.arm.com/static/68cd1a81cccf2a5517018d62)——说明 64 位 `X` 与写入即清零高 32 位的 `W` 寄存器视图、第 26 章函数调用指令 `BL`/`LR`/`RET`、置标志减法指令 `subs` 与带符号非缩放偏移寻址指令 `stur`/`ldur`。

[^12]: [Clang Command Line Reference](https://clang.llvm.org/docs/ClangCommandLineReference.html) 与 [Clang Compiler User's Manual](https://clang.llvm.org/docs/UsersManual.html)——说明 `-O0` 与 `-O1`/`-O2` 优化级别及 `-fno-omit-frame-pointer` 对保留完整帧指针链、栈槽布局与尾调用循环化/尾跳转代码生成的影响。

[^13]: [C++20 工作草案 N4861: stmt.return](https://timsong-cpp.github.io/cppwp/n4861/stmt.return)——规定函数 `return` 语句初始化返回值结果与按声明逆序销毁局部自动存储期对象的先后关系。

[^14]: [C++20 工作草案 N4861 §11.10.5: class.copy.elision](https://timsong-cpp.github.io/cppwp/n4861/class.copy.elision)——区分 C++17 起纯右值返回的强制构造消除、第 1.1 段允许而非强制的具名返回值优化（NRVO），以及第 3 段在未消除时把具名局部返回对象视作右值优先移动构造的隐式移动规则。
