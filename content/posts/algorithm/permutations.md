---
title: "全排列：访问标记数组与原地交换分区"
publishDate: "2026-11-18T12:00:00+08:00"
description: "LeetCode 46 全排列：将路径与候选集解耦，对比布尔访问标记数组与原地交换分区两种回溯写法，分析状态恢复契约、顺序保持与空间复杂度差异。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 46. 全排列](https://leetcode.cn/problems/permutations/)（Hot 100）给定一个**不含重复数字**的整数数组 `nums`，要求按任意顺序返回其所有可能的全排列。例如 `nums = [1, 2, 3]` 有 $3! = 6$ 种排列。题目保证数组长度 $n \in [1, 6]$，元素范围在 $[-10, 10]$ 之间。

在[《从调用栈理解递归》](/posts/understanding-recursion/#回溯选择探索与恢复)中，我们曾用每次复制剩余元素 `remaining` 的方式演示回溯的“选择、探索、恢复”节奏。那种教学写法在每层都构造新数组，导致除结果集外的辅助空间达到 $O(n^2)$。在工程实现中，消除这份冗余复制有两种标准手段：维护共享的布尔访问标记数组 `used`，或者直接在工作数组上做原地交换分区。

## 排列搜索树与状态恢复契约

全排列的每个位置都要从尚未使用的元素中挑一个填入。设数组长度为 $n$，第 0 层有 $n$ 个可选分支，第 1 层剩 $n - 1$ 个，依此类推，到达深度 $n$ 时形成一个完整排列：

```mermaid title="全排列搜索树（nums = [1, 2, 3]）" description="根为空排列，第一层选择首项。这里展开以 1 开头的分支：选过 1 后还可选 2 或 3，最后补上剩余的一项。以 2 或 3 开头的分支以同样方式展开。"
flowchart TB
 root["空排列"] --> a["1"]
 root --> rest["2 或 3<br/>同理展开"]
 a --> ab["1, 2"] --> abc["1, 2, 3"]
 a --> ac["1, 3"] --> acb["1, 3, 2"]
 class root actor
 class a,rest,ab,ac state
 class abc,acb result
```

为了避免在递归中反复切片复制候选集，可以让所有分支共享同一份当前路径 `path` 与状态标记，并严格遵守**回溯恢复契约**：进入子调用前将选中的元素纳入当前状态；子调用返回后，必须把修改原样撤回，使共享容器恢复到进入该分支前的状态，再尝试同一层的下一个候选[^understanding-recursion]。

当 `len(path) == n` 时收集结果，注意必须将 `path` 的**快照副本**加入答案（如 Python 的 `path.copy()` 或 C++ 的 `result.push_back(path)`），而不能直接存入对 `path` 的引用——否则后续回溯弹出元素会连带修改已收集的结果。

## 方案一：访问标记数组（Python）

用长度与 `nums` 相同的布尔数组 `used` 记录每个下标是否已在当前路径中。每层循环都从下标 `0` 扫到 `n - 1`，跳过 `used[i]` 为 `True` 的位置：

```python
class Solution:
    def permute(self, nums: list[int]) -> list[list[int]]:
        # Time complexity: O(n * n!)
        # Space complexity: O(n) auxiliary space (excluding output)
        n = len(nums)
        result: list[list[int]] = []
        path: list[int] = []
        used = [False] * n

        def backtrack() -> None:
            if len(path) == n:
                # Copy the shared path buffer before subsequent pops mutate it.
                result.append(path.copy())
                return

            for i in range(n):
                if used[i]:
                    continue
                used[i] = True
                path.append(nums[i])
                backtrack()
                # Restore both shared containers before trying the next sibling.
                path.pop()
                used[i] = False

        backtrack()
        return result
```

这种写法有两个明显优点：其一，完全不修改输入数组 `nums`；其二，若输入数组有序，输出的排列严格按字典序生成。CPython 列表末尾的 `append()` 与 `pop()` 均摊成本为 $O(1)$[^python-list-complexity]，叶子节点复制长度为 $n$ 的路径消耗 $O(n)$。

## 方案二：原地交换分区（C++）

如果不要求输出保持字典序，可以把候选集与已选路径合并到同一个工作数组 `current` 中，用下标 `first` 将其逻辑划分为两段：

- `[0, first)`：已经确定位置的排列前缀；
- `[first, n)`：尚未使用的剩余候选元素。

在深度 `first` 上，依次将下标 `i`（`first <= i < n`）处的元素与 `current[first]` 交换，相当于把 `current[i]` 选为第 `first` 个位置的值，然后递归处理 `first + 1`；返回后再次交换两者，恢复分区边界与元素位置。

```cpp
#include <utility>
#include <vector>

class Solution {
    void backtrack(int first,
                   std::vector<int>& current,
                   std::vector<std::vector<int>>& result) const {
        const int n = static_cast<int>(current.size());
        if (first == n) {
            result.push_back(current);
            return;
        }

        // Invariant: current[0..first-1] holds the chosen prefix;
        // current[first..n-1] holds the remaining unused candidates.
        for (int i = first; i < n; ++i) {
            std::swap(current[first], current[i]);
            backtrack(first + 1, current, result);
            std::swap(current[first], current[i]);
        }
    }

public:
    std::vector<std::vector<int>> permute(std::vector<int>& nums) const {
        // Time complexity: O(n * n!)
        // Space complexity: O(n) auxiliary space (recursion stack)
        int total = 1;
        for (int i = 2; i <= static_cast<int>(nums.size()); ++i) {
            total *= i;
        }

        std::vector<std::vector<int>> result;
        result.reserve(static_cast<std::size_t>(total));
        backtrack(0, nums, result);
        return result;
    }
};
```

预先计算 $n!$ 并调用 `result.reserve(total)`[^cpp-reserve]，可以避免收集排列过程中外层 `std::vector` 反复扩容搬移。当 `i == first` 时 `std::swap` 与自身交换，统一了“保留原位元素”与“换入后续元素”两种分支，代码更简洁[^cpp-swap]。由于回溯在每次返回后都执行配对交换，函数结束时 `nums` 会恢复到调用前的原始顺序。

需要注意的是，原地交换虽然省去了 `used` 数组与独立的 `path` 容器，但会打乱未选区间 `[first, n)` 的相对顺序，因此生成结果不再保证按字典序排列；若题目扩展到**含重复数字的全排列**（LeetCode 47），用排序加 `used` 标记去重通常比原地交换更直观。

## 复杂度分析与方案对比

排列搜索树共有 $n!$ 个叶子节点，在每个叶子处复制长度为 $n$ 的排列需要 $O(n)$ 时间。非叶节点的分支总数为：

$$
\sum_{k=1}^{n-1} P(n, k) = \sum_{k=1}^{n-1} \frac{n!}{(n - k)!} < e \cdot n!
$$

在 `used` 数组写法中，每个非叶节点还要扫描长度为 $n$ 的数组；原地交换写法在深度 `first` 只迭代 `n - first` 次。无论哪种实现，叶子节点的拷贝成本与内部节点的枚举成本合起来均为 $O(n \cdot n!)$。

辅助空间（不含容纳 $n!$ 个排列的返回结果）由最大递归深度 $n$ 及共享辅助数组决定，均为 $O(n)$；若计入输出，总空间为 $O(n \cdot n!)$。

| 方案 | 时间复杂度 | 辅助空间（不含输出） | 保持字典序 | 是否临时改写输入 |
| :--- | :--------- | :------------------- | :--------- | :--------------- |
| 布尔标记 `used` + `path` | $O(n \cdot n!)$ | $O(n)$ | 是（输入有序时） | 否 |
| 原地交换分区 | $O(n \cdot n!)$ | $O(n)$ | 否 | 是（返回前恢复） |
| 逐层复制剩余数组 | $O(n \cdot n!)$ | $O(n^2)$ | 是（输入有序时） | 否 |

全排列强调**顺序敏感**（`[1, 2]` 与 `[2, 1]` 算两种答案），因此每层都要考虑所有尚未用过的元素；如果问题改为**顺序无关**的组合或子集，则不再需要 `used` 数组，只需通过单调递增的起始下标 `start` 限制后续选择，详见[《子集：递增下标回溯与位掩码枚举》](/posts/algorithm/subsets/)；若只需在 $O(1)$ 额外空间下原地求单个排列的直接字典序后继，则可参见[《下一个排列：找拐点、交换与反转后缀》](/posts/algorithm/next-permutation/)。

[^understanding-recursion]: [从调用栈理解递归：哪些状态需要显式恢复](/posts/understanding-recursion/#哪些状态需要显式恢复)——区分栈帧私有局部变量与跨层共享容器的恢复责任。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——列表末尾 `append()` 与 `pop()` 均摊时间复杂度为 $O(1)$，浅拷贝 `copy()` 为 $O(n)$。

[^cpp-reserve]: [cppreference：`std::vector::reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve.html)——预分配容量以消除已知结果规模时的多次扩容重分配。

[^cpp-swap]: [cppreference：`std::swap`](https://en.cppreference.com/w/cpp/algorithm/swap.html)——交换两个对象的值，用于原地维护已选前缀与未选后缀的分区边界。
