---
title: "路径总和 III：树上前缀和与回溯状态恢复"
publishDate: "2026-11-17T12:00:00+08:00"
description: "LeetCode 437：将一维连续子数组前缀和移植到树形路径，分析路径单向性与前缀和溢出风险，阐明回溯离开节点时从全局哈希表中撤销频次的不变式与生命周期契约。"
tags: ["algorithm", "binary-tree", "python", "cpp"]
---

[LeetCode 437. 路径总和 III](https://leetcode.cn/problems/path-sum-iii/)（Hot 100）要求计算二叉树中节点值之和等于目标值 `targetSum` 的路径数目。路径不需要从根节点开始，也不需要在叶子节点结束，但方向必须向下（只能从父节点指向子节点）。树中节点总数在 $[0, 1000]$ 范围内，节点值范围为 $[-10^9, 10^9]$。

## 从一维前缀和到树上回溯

与[《二叉树中的最大路径和：负收益归零剪枝与树上后序贡献》](/posts/algorithm/binary-tree-maximum-path-sum/)不同，本题明确要求路径方向只能从父节点指向子节点——路径不能在某个拐点处折返连接左右两棵子树，而必然是某条“从根节点 `root` 到叶子节点的向下路径”上的一个连续片段。

一旦把目光聚焦在从根节点 `root` 到当前节点 $u$ 的唯一向下路径上，这条路径就退化成了一个标准的一维数组。我们可以直接复用[《和为 K 的子数组：先查前缀，再记录频次》](/posts/algorithm/subarray-sum-equals-k/)中的前缀和差分思想：记从根节点 `root` 到节点 $u$ 的路径节点总和为**树上前缀和**（tree prefix sum）$P_u$，目标和 `targetSum` 记为 $t$。若从 $u$ 的某个祖先节点 $a$ 的下一层开始、到 $u$ 结束的向下路径和恰好等于 $t$，则必然满足：

$$
P_u - P_a = t \iff P_a = P_u - t
$$

因此，当深度优先搜索（DFS）到达节点 $u$ 时，以 $u$ 为底端终点的合法路径条数，恰好等于从 `root` 到 $u$ 的直系祖先链上前缀和等于 $P_u - t$ 的出现次数。为了涵盖“从根节点 `root` 直接开始到 $u$ 结束”（即 $P_u = t$）的合法路径，需要在搜索开始前预先在哈希表 `prefix_count` 中放入空前缀基准状态 `0: 1`。

### 为什么在树上必须显式执行状态回溯？

在一维数组中，索引从左向右单向推进，左侧的所有位置永远是右侧位置的合法前驱，哈希表只需单向累加频次；但在二叉树中，DFS 会依次探索不同的子树分支。假设节点 $u$ 的左子树中存在某个节点 $x$，当递归从左子树返回并转而进入 $u$ 的右子树节点 $y$ 时，$x$ 并不是 $y$ 的祖先——从 $x$ 到 $y$ 的路径需要向上经过 $u$ 再折向下，违反了“只能从父节点指向子节点”的单向约束。

```text
          root
           |
           u
          / \
         x   y   <-- 探索右分支 y 时，左分支节点 x 的前缀和不能残留在 prefix_count 中
```

这正对应了[《从调用栈理解递归》](/posts/understanding-recursion/#哪些状态需要显式恢复)中关于状态生命周期的区分：

1. 当前累加和 `current_sum` 是每次调用的局部参数。Python 传入的是对象引用；由于整数不可变，`current_sum += node.val` 会把本次调用的参数重新绑定到计算结果，不会修改父调用的绑定，也不保证整数对象在返回时立即销毁。C++ 版本则复制整数值到形参。两版都无需手动恢复父调用的累加和[^py-arguments]。
2. 哈希表 `prefix_count` 是跨递归调用共享的可变容器。为了维持**祖先链不变量**——即在访问任意节点 $u$ 时，`prefix_count` 中仅保存从根节点到 $u$ 的当前直系祖先链上的前缀和频次——必须在递归进入左右子树之前将 `current_sum` 的频次加 $1$，并在左右子树探索完毕、即将离开当前节点回退给父节点之前，将 `prefix_count[current_sum]` 减 $1$ 恢复原状。

## Python：先查后记与回溯恢复

在每个节点上，必须遵循与[《和为 K 的子数组：先查前缀，再记录频次》](/posts/algorithm/subarray-sum-equals-k/)一致的更新时序：**先查询 `current_sum - targetSum` 的频次，再将 `current_sum` 计入表中**。若顺序颠倒，当 `targetSum == 0` 时，`current_sum - 0 == current_sum` 会把刚刚写入的当前节点自身算作前驱，从而把长度为 $0$ 的空路径误计入答案。

```python
from typing import Optional


class Solution:
    def pathSum(self, root: Optional[TreeNode], targetSum: int) -> int:
        prefix_count: dict[int, int] = {0: 1}

        def dfs(node: Optional[TreeNode], current_sum: int) -> int:
            if node is None:
                return 0

            current_sum += node.val

            # Query ancestor prefixes before recording `current_sum` so that
            # targetSum == 0 does not match an empty zero-node path at `node`.
            paths = prefix_count.get(current_sum - targetSum, 0)

            prefix_count[current_sum] = prefix_count.get(current_sum, 0) + 1
            paths += dfs(node.left, current_sum)
            paths += dfs(node.right, current_sum)
            # Remove only this node's contribution; keep matching ancestor prefixes.
            prefix_count[current_sum] -= 1
            if prefix_count[current_sum] == 0:
                del prefix_count[current_sum]

            return paths

        return dfs(root, 0)
```

`dict.get` 只读查询，不会为缺失键插入条目[^py-dict]。回溯时先将频次减 $1$，只有归零后才删除键：同一条祖先链上可能因正负抵消而多次出现相同前缀和，必须保留其他祖先贡献的频次，包括初始空前缀。这样表中始终只有当前路径上的活跃前缀。

## C++：64 位前缀和防溢出与只读查找

题目中单个节点值可达 $\pm 10^9$，树高可达 $1000$，沿单链累加时前缀和最大可达 $10^{12}$，超出 32 位有符号整数 `int` 的上限（约 $2.14 \times 10^9$）。Python 的 `int` 支持任意精度整数，而在 C++ 中必须使用 64 位有符号整型（如 `<cstdint>` 的 `std::int64_t` 或 `long long`）[^cpp-int] 存储前缀和与哈希表键类型。此外，查询 `current_sum - target_sum` 时使用 `unordered_map::find`[^cpp-find] 而非 `operator[]`[^cpp-op-at]，可以避免因查询不存在的键而插入冗余条目。回溯时也要在频次归零后 `erase`；注意递归中的插入可能触发重散列，不能跨递归保存迭代器，须在返回后重新 `find`：

以下代码的 `if` 初始化语句需要 C++17 或更新版本。

```cpp
#include <cstdint>
#include <unordered_map>

class Solution {
    int dfs(const TreeNode* node,
            std::int64_t current_sum,
            std::int64_t target_sum,
            std::unordered_map<std::int64_t, int>& prefix_count) const {
        if (node == nullptr) {
            return 0;
        }

        current_sum += node->val;

        int paths = 0;
        // Use `find` instead of `operator[]` to avoid inserting zero-count entries on misses.
        if (auto it = prefix_count.find(current_sum - target_sum);
            it != prefix_count.end()) {
            paths += it->second;
        }

        ++prefix_count[current_sum];
        paths += dfs(node->left, current_sum, target_sum, prefix_count);
        paths += dfs(node->right, current_sum, target_sum, prefix_count);
        // Reacquire after recursion: insertions may have rehashed the map.
        auto current = prefix_count.find(current_sum);
        if (--current->second == 0) {
            prefix_count.erase(current);
        }

        return paths;
    }

public:
    int pathSum(const TreeNode* root, int targetSum) const {
        std::unordered_map<std::int64_t, int> prefix_count{{0, 1}};
        return dfs(root, 0, targetSum, prefix_count);
    }
};
```

## 复杂度与双重递归对比

如果采用朴素的双重递归（外层遍历每个节点作为起点，内层向下遍历子树累加求和），在平衡树上耗时 $O(n \log n)$，而在退化单链上会达到 $O(n^2)$。引入前缀和哈希表与回溯恢复后，每个节点仅被 DFS 访问一次，单节点上的字典/哈希表查找、频次递增与回溯递减均为平均 $O(1)$ 时间开销[^py-complexity][^cpp-find]，总体时间复杂度降至平均 $O(n)$（极端哈希冲突下最坏 $O(n^2)$）。

设按节点层数计的树高为 $h$，回溯归零即删除后，哈希表只保留当前路径的前缀和及空前缀，最多 $h + 1$ 个键；调用栈也占 $O(h)$，在通常哈希表容量与历史最大活跃项数同阶的实现模型下，峰值辅助空间为 $O(h)$，平衡树为 $O(\log n)$，最坏链状树为 $O(n)$。两种实现都不修改输入树，输出是一个计数；深树仍受 Python 递归限制或 C++ 线程栈容量约束。

[^py-arguments]: [Python 文档：定义函数](https://docs.python.org/3/tutorial/controlflow.html#defining-functions)——说明实参以对象引用的值传递，形参绑定于被调用函数的局部符号表；这与复制整个对象不同。

[^py-dict]: [Python 文档：映射类型 `dict`](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——说明 `get(key, default)` 在缺失时返回默认值，以及 `del d[key]` 的删除语义。

[^py-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——说明 Python `dict` 查找与写入操作的平均时间复杂度为 $O(1)$。

[^cpp-int]: [cppreference：定宽整数类型](https://en.cppreference.com/w/cpp/types/integer.html)——说明 `<cstdint>` 中固定 64 位有符号整型 `std::int64_t` 的定义与范围。

[^cpp-find]: [cppreference：`std::unordered_map::find`](https://en.cppreference.com/w/cpp/container/unordered_map/find.html)——说明平均常数时间复杂度的只读键查找接口，未命中时返回 `end()` 而不插入新元素。

[^cpp-op-at]: [cppreference：`std::unordered_map::operator[]`](https://en.cppreference.com/w/cpp/container/unordered_map/operator_at.html)——说明当键不存在时会默认构造并插入新元素。
