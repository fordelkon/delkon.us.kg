---
title: "组合总和：候选值重复选取与排序剪枝"
publishDate: "2026-11-21T12:00:00+08:00"
description: "LeetCode 39 组合总和：通过不递减起始下标实现元素无限复用且不产生排列重复，结合排序后的剩余目标值剪枝提前终止无效分支，对比 Python 与 C++ 实现。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 39. 组合总和](https://leetcode.cn/problems/combination-sum/)（Hot 100）给定一个**无重复正整数**数组 `candidates` 和目标整数 `target`，要求找出所有可以使数字和为 `target` 的不同组合。`candidates` 中的同一个数字可以**无限制重复选取**；如果至少一个数字的被选数量不同，则两种组合视为不同。例如 `candidates = [2, 3, 6, 7]`、`target = 7` 时，返回 `[[2, 2, 3], [7]]`。

题目保证 $1 \le \lvert\text{candidates}\rvert \le 30$，$2 \le \text{candidates}[i] \le 40$，$1 \le \text{target} \le 40$，且合法组合总数少于 150 个。由于所有候选均为正整数，每多选一个数，剩余目标值严格减小，递归必然在有限步内终止。

## 可重复选取下的去重与剪枝

本题与[《零钱兑换：完全背包自底向上与不可达哨兵》](/posts/algorithm/coin-change/)共享同一个“元素可无限复用、凑成目标和”的模型；区别在于零钱兑换只需返回一个最值（最少硬币数），适合用动态规划压缩状态，而本题要求**枚举所有具体组合**，需要回溯展开搜索树。

在设计递归分支时，有两个核心约束需要同时处理：

1. **允许复用，但禁止回头**：与[《子集：递增下标回溯与位掩码枚举》](/posts/algorithm/subsets/)一样，组合不区分顺序——`[2, 2, 3]` 与 `[2, 3, 2]` 算同一种组合。如果每层都从下标 `0` 开始枚举，就会重复生成不同排列。解决办法仍是传入起始下标 `start`，只允许从 `candidates[start:]` 中选取；但因为当前元素 `candidates[i]` 可以被重复使用，进入下一层时传入的是 **`i` 而非 `i + 1`**。这意味着“可以继续选自己，也可以往后选更大的下标，但绝不再回头选 `0..i-1`”。
2. **排序后的整段剪枝**：若先将 `candidates` 按升序排列，在当前剩余目标值为 `remaining` 时，一旦遇到 `candidates[i] > remaining`，由于后续所有候选 `candidates[i + 1], ...` 都更大，它们也都不可能满足要求，此时可以直接 `break` 终止整轮循环，而不是仅 `continue` 跳过当前项。

以 `candidates = [2, 3, 6, 7]`、`target = 7` 为例，从 `remaining = 7` 出发：

- 选 `2` 后剩余 `5`，可继续从下标 `0` 选 `2`（剩余 `3`），再选 `3` 时剩余 `0`，收集 `[2, 2, 3]`；若在剩余 `3` 时再选 `2`，剩余 `1` 小于最小候选 `2`，循环直接 `break` 剪枝。
- 选 `3` 后剩余 `4`，只能从下标 `1` 起选（禁止回头再选 `2`），选 `3` 后剩余 `1 < 3`，剪枝返回。
- 选 `6` 后剩余 `1 < 6`，剪枝返回；选 `7` 后剩余 `0`，收集 `[7]`。

## Python：升序排序与剩余值剪枝

使用 `sorted(candidates)` 生成有序副本，避免修改调用方传入的原列表[^python-sorted]：

```python
class Solution:
    def combinationSum(self, candidates: list[int], target: int) -> list[list[int]]:
        # Time complexity: O(S), where S is the sum of lengths of all feasible combinations
        # Space complexity: O(n + target / min(candidates)) auxiliary space (excluding output)
        ordered = sorted(candidates)
        n = len(ordered)
        result: list[list[int]] = []
        path: list[int] = []

        def backtrack(start: int, remaining: int) -> None:
            if remaining == 0:
                result.append(path.copy())
                return

            for i in range(start, n):
                val = ordered[i]
                # Candidates are sorted ascending; any later element also exceeds remaining.
                if val > remaining:
                    break
                path.append(val)
                # Pass `i` (not `i + 1`) because `val` may be reused arbitrarily many times.
                backtrack(i, remaining - val)
                path.pop()

        backtrack(0, target)
        return result
```

## C++：原地排序与紧凑回溯

C++ 版本先对 `candidates` 执行 `std::sort`（若不想改动调用方数组，可先拷贝一份），随后用 `remaining` 驱动剪枝：

```cpp
#include <algorithm>
#include <vector>

class Solution {
    void backtrack(const std::vector<int>& candidates,
                   int start,
                   int remaining,
                   std::vector<int>& path,
                   std::vector<std::vector<int>>& result) const {
        if (remaining == 0) {
            result.push_back(path);
            return;
        }

        const int n = static_cast<int>(candidates.size());
        for (int i = start; i < n; ++i) {
            const int val = candidates[i];
            if (val > remaining) {
                // Sorted ascending: prune the rest of this level immediately.
                break;
            }
            path.push_back(val);
            backtrack(candidates, i, remaining - val, path, result);
            path.pop_back();
        }
    }

public:
    std::vector<std::vector<int>> combinationSum(std::vector<int>& candidates,
                                                 int target) const {
        // Time complexity: O(S), where S is the sum of lengths of all feasible combinations
        // Space complexity: O(log n + target / min(candidates)) auxiliary space (excluding output)
        std::sort(candidates.begin(), candidates.end());
        std::vector<std::vector<int>> result;
        std::vector<int> path;
        backtrack(candidates, 0, target, path, result);
        return result;
    }
};
```

## 复杂度分析与变体对比

设最小候选值为 $m = \min(\text{candidates})$，目标值为 $T = \text{target}$，数组长度为 $n$。

- **递归深度与辅助空间**：一条路径最多连续选取 $\lfloor T / m \rfloor$ 个最小元素，因此调用栈深度和 `path` 长度的上界均为 $O(T / m)$。在 Python 中排序副本另占 $O(n)$，总辅助空间（不含输出）为 $O(n + T / m)$；C++ 原地排序栈空间为 $O(\log n)$，总辅助空间为 $O(\log n + T / m)$。
- **时间复杂度**：组合总和的精确时间复杂度高度依赖输入分布与剪枝效果。一个宽松的上界是 $O(n^{T / m + 1})$（每个位置最多分叉 $n$ 次、深度至多 $T / m$）；而在实际剪枝后，时间与有效搜索树节点数及所有合法组合的总长度 $S$ 同阶（预处理排序耗时 $O(n \log n)$ 在本题数据规模下可忽略）。

将本题放回整个回溯家族中对比，可以清晰看到 `start` 参数的微小变化如何精确刻画不同组合约束：

| 问题 | 元素能否复用 | 下一层起始下标 | 同层去重需求 | 典型剪枝条件 |
| :--- | :----------- | :------------- | :----------- | :----------- |
| [全排列](/posts/algorithm/permutations/) | 否（顺序敏感） | 无（用 `used` 从 0 扫） | 否（元素互异） | 无 |
| [子集](/posts/algorithm/subsets/) | 否（顺序无关） | `i + 1` | 否（元素互异） | 无 |
| 组合总和（本题） | 是（顺序无关） | `i` | 否（元素互异） | 排序后 `val > remaining` 即 `break` |
| 组合总和 II（含重复元素） | 否（每个用一次） | `i + 1` | 是（`i > start` 且与前项相等时跳过） | 排序后 `val > remaining` 即 `break` |

[^python-sorted]: [Python 文档：Sorting Techniques](https://docs.python.org/3/howto/sorting.html)——说明 `sorted()` 返回新的升序列表而不就地修改输入，且 Timsort 最坏时间复杂度为 $O(n \log n)$。
