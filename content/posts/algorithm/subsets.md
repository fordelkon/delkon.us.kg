---
title: "子集：递增下标回溯与位掩码枚举"
publishDate: "2026-11-19T12:00:00+08:00"
description: "LeetCode 78 子集：用单调起始下标避免顺序重复，在搜索树每个节点即时收集子集，并与逐元素选或不选、位掩码迭代枚举做复杂度与结构对比。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 78. 子集](https://leetcode.cn/problems/subsets/)（Hot 100）给定一个元素互不相同的整数数组 `nums`，要求返回该数组所有可能的子集（幂集）。解集不能包含重复子集，顺序任意。例如 `nums = [1, 2, 3]` 共有 $2^3 = 8$ 个子集：`[]`、`[1]`、`[2]`、`[3]`、`[1, 2]`、`[1, 3]`、`[2, 3]`、`[1, 2, 3]`。题目保证 $n \in [1, 10]$，元素范围在 $[-10, 10]$ 之间。

## 为什么用起始下标而不是访问标记

与[《全排列：访问标记数组与原地交换分区》](/posts/algorithm/permutations/)不同，子集**不区分元素顺序**：`[1, 2]` 与 `[2, 1]` 是同一个子集。如果每层都从下标 `0` 重新扫描未选元素，就会在选了 `2` 之后再回头选 `1`，产生重复。

消除顺序重复的标准约定是强制**按原数组下标严格递增**选取元素：递归参数传入 `start`，表示本层只能从 `nums[start:]` 中选择下一个元素；一旦选中下标 `i`，下一层就从 `i + 1` 开始。这样任意子集都只有唯一一条按原下标升序生成的路径。

另一个关键区别在于**收集结果的时机**：全排列只在叶子节点（路径长度达到 $n$）收集答案，而子集允许任意长度（从 $0$ 到 $n$），因此搜索树上的**每一个节点**本身就是一个合法子集：

```mermaid title="子集搜索树（nums = [1, 2]）" description="以 1、2 为例，每个节点都是一个合法子集，同时标注下一层可选的起始下标 start。选择 1 后 start=1 仍可向右选 2；直接选择 2 后 start=2 已到达末尾，不再回头选 1。"
flowchart TB
 root["空集 · start=0"] -->|"选 1"| a["1 · start=1"]
 root -->|"选 2"| b["2 · start=2"]
 a -->|"选 2"| ab["1, 2 · start=2"]
 class root actor
 class a,b,ab result
```

整棵树恰好有 $2^n$ 个节点，每个节点对应一个互不相同的子集，既不会遗漏空集，也不存在无效分支。

## 方案一：起始下标回溯（Python）

进入 `backtrack(start)` 时，先将当前 `path` 的副本加入结果集，再循环枚举 `start` 到 `n - 1` 的元素：

```python
class Solution:
    def subsets(self, nums: list[int]) -> list[list[int]]:
        # Time complexity: O(n * 2^n)
        # Space complexity: O(n) auxiliary space (excluding output)
        n = len(nums)
        result: list[list[int]] = []
        path: list[int] = []

        def backtrack(start: int) -> None:
            # Every recursion tree node represents a distinct valid subset.
            result.append(path.copy())

            for i in range(start, n):
                path.append(nums[i])
                backtrack(i + 1)
                path.pop()

        backtrack(0)
        return result
```

当 `start == n` 时，`range(n, n)` 为空，循环自然结束并返回，无需额外写终止判断。递归深度最大为 $n$（全选所有元素时），共享缓冲区 `path` 最多容纳 $n$ 个元素，回溯时遵循[《从调用栈理解递归》](/posts/understanding-recursion/#哪些状态需要显式恢复)中的状态恢复契约，每次返回后立即 `pop()`。

另一种等价的递归视角是**逐元素二选一**：在第 `idx` 层对 `nums[idx]` 分别尝试“跳过”和“选入”两个分支，只在 `idx == n` 的叶子收集结果。两种写法生成的子集完全相同，但前者的 $k$ 叉树共 $2^n$ 个节点，后者的满二叉树共 $2^{n+1} - 1$ 个节点（调用次数约多一倍），且前者的 `start` 模板更容易直接推广到[《组合总和：候选值重复选取与排序剪枝》](/posts/algorithm/combination-sum/)与[《分割回文串：预计算回文与逐段回溯》](/posts/algorithm/palindrome-partitioning/)。

## 方案二：二进制位掩码枚举（C++）

对含 $n$ 个元素的集合，每个元素只有“在子集中（1）”或“不在子集中（0）”两种状态。因此 $2^n$ 个子集与区间 $[0, 2^n - 1]$ 内的 $n$ 位二进制整数构成一一对应[^clrs-combinatorics]。

本题 $n \le 10$，$2^n \le 1024$，完全可以用普通整型 `mask` 的第 `i` 个二进制位直接指示是否选取 `nums[i]`，省去递归调用栈：

```cpp
#include <cstddef>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> subsets(const std::vector<int>& nums) const {
        // Time complexity: O(n * 2^n)
        // Space complexity: O(1) auxiliary space (excluding output)
        const int n = static_cast<int>(nums.size());
        const std::size_t total = std::size_t{1} << n;

        std::vector<std::vector<int>> result;
        result.reserve(total);

        for (std::size_t mask = 0; mask < total; ++mask) {
            std::vector<int> subset;
            for (int i = 0; i < n; ++i) {
                if ((mask & (std::size_t{1} << i)) != 0) {
                    subset.push_back(nums[i]);
                }
            }
            result.push_back(std::move(subset));
        }

        return result;
    }
};
```

这里用 `std::size_t{1} << n` 计算总规模并调用 `result.reserve(total)`[^cpp-reserve]，构造好单个子集后用 `std::move` 移入结果数组[^cpp-move]，避免多余的堆内存复制。函数以 `const` 引用接收输入，不修改原数组。

## 复杂度分析与方案对比

$n$ 个元素的幂集共有 $2^n$ 个子集，所有子集的元素总数之和为：

$$
\sum_{k=0}^{n} k \binom{n}{k} = n \cdot 2^{n - 1}.
$$

因此仅构造并输出全部子集就需要 $\Theta(n \cdot 2^n)$ 的时间与输出空间。

- **起始下标回溯**：每次进入节点复制当前 `path`，所有拷贝的元素总数为 $n \cdot 2^{n-1}$，总时间为 $O(n \cdot 2^n)$；除返回结果外，递归栈与 `path` 共占 $O(n)$ 辅助空间[^python-list-complexity]。
- **二进制位掩码**：外层循环 $2^n$ 次，内层固定检查 $n$ 个比特位，总时间为 $O(n \cdot 2^n)$；不含输出时仅使用常数个循环变量，辅助空间为 $O(1)$。但位掩码方式局限于元素个数不超过机器字长（通常 $n \le 63$），且难以像回溯那样在搜索中途根据业务约束（如总和上限、重复元素去重）提前剪枝。

| 方案 | 时间复杂度 | 辅助空间（不含输出） | 适用边界与扩展性 |
| :--- | :--------- | :------------------- | :--------------- |
| 起始下标回溯 | $O(n \cdot 2^n)$ | $O(n)$ | 通用模板，易于扩展为带剪枝或去重的组合问题 |
| 逐元素选/不选回溯 | $O(n \cdot 2^n)$ | $O(n)$ | 决策树为满二叉树，叶子统一收集结果 |
| 二进制位掩码迭代 | $O(n \cdot 2^n)$ | $O(1)$ | 无递归栈开销，但受限于整型位宽且不便中途剪枝 |

[^clrs-combinatorics]: [_Introduction to Algorithms_ (4th ed., Appendix C.1)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——Appendix C.1 讨论集合的幂集规模 $2^n$ 及二项式系数计数恒等式。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——列表 `append()`、`pop()` 均摊为 $O(1)$，`copy()` 随当前路径长度线性增长。

[^cpp-reserve]: [cppreference：`std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve.html)——预先为已知规模的 $2^n$ 个子集分配外层容量。

[^cpp-move]: [cppreference：`std::move`](https://en.cppreference.com/w/cpp/utility/move.html)——将局部构造的 `subset` 转为右值以触发移动语义，避免深拷贝。
