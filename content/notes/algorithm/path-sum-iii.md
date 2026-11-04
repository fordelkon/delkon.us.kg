---
title: "路径总和 III：树上前缀和与回溯状态恢复"
publishDate: "2026-11-17T12:00:00+08:00"
description: "LeetCode 437：将一维连续子数组前缀和移植到树形路径，分析路径单向性与前缀和溢出风险，阐明回溯离开节点时从全局哈希表中撤销频次的不变式与生命周期契约。"
---

[LeetCode 437. 路径总和 III](https://leetcode.cn/problems/path-sum-iii/)（Hot 100）要求计算二叉树中路径和等于目标值 `targetSum` 的路径数量。路径不需要从根节点开始，也不需要在叶子节点结束，但必须**从父节点向下延伸至子节点**（即只能沿单向祖先到后代路径移动）。

这一方向约束非常关键：它排除了经过最近公共祖先向上折返再向下的两翼路径（那种模式属于最大路径和等跨子树问题），限定了任意合法路径本质上就是某条从根到叶的单向直链上的**一段连续子段**。

## 树上前缀和与差值转换

既然合法路径是根到当前节点直链上的连续节点段，我们便能将连续区间和的差值思想移植到树上。

设树的根节点到当前节点 $u$ 的路径节点值之和为前缀和 $P_u$。若 $a$ 是 $u$ 的某一个祖先节点，其对应的前缀和为 $P_a$。那么，从 $a$ 的子节点沿着树枝单向延伸至 $u$ 的这段连续树上路径的和恰好为两前缀和之差：

$$
P_u - P_a = \text{targetSum} \iff P_a = P_u - \text{targetSum}
$$

当扫描到节点 $u$ 时，只要知道在其**所有合法祖先节点**中，前缀和为 $P_u - \text{targetSum}$ 的节点出现过多少次，就能直接求出以 $u$ 为终点且和为 `targetSum` 的路径总数。为了涵盖整条路径恰好以根节点为起点的边界情况（即 $P_u = \text{targetSum}$），算法开始前需预设一个虚拟空前缀 $P_0 = 0$ 且频次为 1。

## 一维线性滑动 vs 树形多分支回溯

在[《和为 K 的子数组：先查前缀，再记录频次》](/notes/algorithm/subarray-sum-equals-k/)中，我们在连续数组上一维单向扫描。一维数组是一条单一的时间线，先前访问过的所有前缀和天然就是后续所有位置的合法前驱，哈希表只需单调写入频次，永不撤销。

但二叉树的拓扑结构不同：深度优先搜索（DFS）会在每个分叉点进入平行的左右子树。当递归探索完左子树的所有节点、返回到当前节点并准备转向右子树时，**左子树内部所产生的所有节点前缀和，绝不是右子树节点的祖先**！

如果任由左子树的前缀和留在全局哈希表中，右子树中的节点在查询时就会误把左侧堂兄弟或侄子节点的前缀和当作自己的祖先，从而错误匹配出横跨两棵不连通子树的非法“飞线”路径。

因此，树上前缀和算法必须维持严格的**路径状态不变量**：

> 在 DFS 访问任意节点 $u$ 的生命周期内，全局哈希表 `prefix_count` 中有且仅有从根节点到节点 $u$ 的当前祖先链条上的前缀和频次。

[《从调用栈理解递归》中“哪些状态需要显式恢复”的讨论](/posts/understanding-recursion/#哪些状态需要显式恢复)区分了栈帧私有状态与跨层共享状态：
- 像累加前缀和 `current_sum` 这样的参数是**每层栈帧私有的局部值**，随着递归调用的深入与返回，调用栈会自动将其保留与恢复；
- 而哈希表 `prefix_count` 属于**跨层共享的可变状态**。谁在当前栈帧向共享表登记了状态，谁就必须在当前帧即将退栈前履行回溯契约——显式执行 `--prefix_count[current_sum]`，将当前节点产生的影响彻底抹除，恢复共享容器给父节点与其他兄弟分支。

## 64 位整数防溢出

根据题目约束，二叉树的节点值范围为 $[-10^9, 10^9]$，树节点数最多可达 $1000$。在最坏情况下（例如整棵树退化为单链且节点值全为 $10^9$），累加的前缀和可以达到 $10^{12}$，远超 32 位有符号整型上限 `INT_MAX`（$\approx 2.14 \times 10^9$）[^cpp-limits]。因此，在 C++ 实现中，必须将累加前缀和变量、差值查找以及哈希表的键类型显式提升为 64 位的 `long long`。

## Python：闭包字典与回溯对称

在 Python 中，通过在进入左右子树前计数并注册当前节点、在遍历结束后将当前前缀和频次减 1，形成完美对称的回溯节奏：

```python
from typing import Optional


class Solution:
    def pathSum(self, root: Optional[TreeNode], targetSum: int) -> int:
        prefix_count: dict[int, int] = {0: 1}

        def dfs(node: Optional[TreeNode], current_sum: int) -> int:
            if node is None:
                return 0

            current_sum += node.val

            # Query matching ancestor prefix sum before registering current node.
            paths = prefix_count.get(current_sum - targetSum, 0)

            # Register current prefix sum into shared table for child calls.
            prefix_count[current_sum] = prefix_count.get(current_sum, 0) + 1

            # Recurse into left and right subtrees.
            paths += dfs(node.left, current_sum)
            paths += dfs(node.right, current_sum)

            # Backtrack: restore shared frequency table before returning to parent.
            prefix_count[current_sum] -= 1

            return paths

        return dfs(root, 0)
```

## C++：防溢出键与迭代器精细查找

C++ 实现中，哈希表的键为 `long long`，避免数值越界。查询时使用 `find` 取得迭代器，避免使用 `operator[]` 导致不存在的键被意外插入[^cpp-unordered-find]：

```cpp
#include <unordered_map>

// Definition for a binary tree node.
class Solution {
    int dfs(TreeNode* node,
            long long current_sum,
            long long target_sum,
            std::unordered_map<long long, int>& prefix_count) {
        if (node == nullptr) {
            return 0;
        }

        current_sum += node->val;

        // Query the number of valid ancestor prefixes that yield target_sum.
        int total_paths = 0;
        const auto it = prefix_count.find(current_sum - target_sum);
        if (it != prefix_count.end()) {
            total_paths += it->second;
        }

        // Register current prefix sum for children.
        ++prefix_count[current_sum];

        // Search both child branches.
        total_paths += dfs(node->left, current_sum, target_sum, prefix_count);
        total_paths += dfs(node->right, current_sum, target_sum, prefix_count);

        // Backtrack: strictly restore shared frequency table.
        --prefix_count[current_sum];

        return total_paths;
    }

public:
    int pathSum(TreeNode* root, int targetSum) {
        std::unordered_map<long long, int> prefix_count;
        // Base case: an empty path has sum 0 with frequency 1.
        prefix_count.emplace(0LL, 1);
        return dfs(root, 0LL, targetSum, prefix_count);
    }
};
```

## 复杂度与双重递归对比

传统的暴力做法是**双重递归**：外层递归遍历每个节点作为路径起点，内层递归向下求和搜索满足条件的路径。在外层每个节点处都需要遍历其整个子树，在退化链表上总时间高达 $O(n^2)$，在平衡二叉树上也需要 $O(n \log n)$。

相比之下，树上前缀和结合回溯恢复将多分支搜索剪裁为单次遍历：
- **时间复杂度**：二叉树中的每个节点恰好被访问一次。在每个节点上的哈希查找、递增与递减回溯均为平均 $O(1)$ 操作[^sicp-tree]，整体时间复杂度为平均 $O(n)$。在极端哈希碰撞的最坏情况下为 $O(n^2)$。
- **空间复杂度**：由于回溯机制在离开节点时严格撤销了当前前缀，哈希表中同时存在的条目数**永远不会超过当前递归深度加 1**，即不超过树的高度 $h$；系统调用栈的深度同样为 $O(h)$。对于高度平衡二叉树，空间复杂度为 $O(\log n)$；对于退化单链，最坏空间复杂度为 $O(n)$。

[^cpp-limits]: [cppreference：`std::numeric_limits`](https://en.cppreference.com/w/cpp/types/numeric_limits.html)——说明算术类型的极值边界，提示在累加极端节点值时预防 32 位有符号整型溢出。

[^cpp-unordered-find]: [cppreference：`std::unordered_map::find`](https://en.cppreference.com/w/cpp/container/unordered_map/find.html)——说明使用迭代器查找避免使用 `operator[]` 时对缺失键产生无意的默认值插入。

[^sicp-tree]: [SICP Section 2.3.3: Representing Sets](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html)——阐述树形递归过程中的状态累加与子树遍历的不变量保持。
