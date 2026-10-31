---
title: "四数之和：两层固定与双指针的剪枝边界"
publishDate: "2026-10-25T14:00:00+08:00"
description: "LeetCode 18 的四数之和，先用 Python 明确逐层去重，再用 C++ 精确上下界剪枝和 64 位求和减少无效扫描。"
---

[LeetCode 18. 四数之和](https://leetcode.cn/problems/4sum/)要求从一个数组选出四个**不同位置**，返回所有和为 `target` 的**不重复数值四元组**。以 `[-2, -1, 0, 0, 1, 2]`、目标 0 为例，答案包括 `[-2, -1, 1, 2]`、`[-2, 0, 0, 2]`、`[-1, 0, 0, 1]`：两个 `0` 来自不同位置，可以同时使用；只是不允许把同一组数值返回两次。

[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)只需返回一组**原数组下标**，适合扫描时用哈希表查补数。[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)需要列出全部去重的**数值组合**，因而先排序、固定一个数，再用双指针找剩下两个。四数之和沿用后者的返回约定：排序后固定 `i`、再固定 `j`，只在 `j` 右侧的区间搜索最后两个数。

## Python：每层只跳过本层的重复首项

排序使相同数值相邻。第一层仅在 `i > 0` 且当前值和前一个相同时跳过；第二层仅在 `j > i + 1` 时检查重复。命中一个四元组后，双指针同时向内移动，并跳过两端刚用过的值。这样 `[2, 2, 2, 2]` 仍可得到 `[2, 2, 2, 2]`：下一层的第一个 `2` 不会因为上一层已经选了 `2` 而被丢弃。

```python
class Solution:
    def fourSum(self, nums: list[int], target: int) -> list[list[int]]:
        values = sorted(nums)
        results: list[list[int]] = []
        n = len(values)

        for i in range(n - 3):
            if i > 0 and values[i] == values[i - 1]:
                continue
            for j in range(i + 1, n - 2):
                # Only j > i + 1 skips a duplicate here, so the first 2 after i
                # survives and [2, 2, 2, 2] still yields one result.
                if j > i + 1 and values[j] == values[j - 1]:
                    continue

                left, right = j + 1, n - 1
                while left < right:
                    total = values[i] + values[j] + values[left] + values[right]
                    if total < target:
                        left += 1
                    elif total > target:
                        right -= 1
                    else:
                        results.append([values[i], values[j], values[left], values[right]])
                        left += 1
                        right -= 1
                        while left < right and values[left] == values[left - 1]:
                            left += 1
                        while left < right and values[right] == values[right + 1]:
                            right -= 1
        return results
```

每选定一对 `(i, j)`，双指针最多线性扫描一次，时间为 O(n³)，另有 O(n log n) 排序。`sorted` 返回新列表，保留输入，额外占 O(n) 空间[^python-sorted]；如果有 `R` 组结果，返回值还需 O(R) 个定长四元组。这里没有用 `set` 事后去重：每层跳过同值，命中后跳过同值，直接保证输出唯一。

## C++：用确切上下界提前结束扫描

原地排序后，可以用**不同位置**算出当前 `i` 所能达到的最小、最大四数和。最小值已超过目标时，继续增大 `i` 只会更大，可以 `break`；最大值仍小于目标时，只能 `continue`，让下一次选择更大的首项。固定 `(i, j)` 后也做同样判断。这些界限准确反映可选位置，比把单个端点乘以剩余个数得到的宽松界限更紧。

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> fourSum(std::vector<int>& nums, int target) {
        std::sort(nums.begin(), nums.end());
        std::vector<std::vector<int>> results;
        const int n = static_cast<int>(nums.size());
        const long long goal = target;

        for (int i = 0; i < n - 3; ++i) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;

            const long long smallest = 1LL * nums[i] + nums[i + 1]
                                     + nums[i + 2] + nums[i + 3];
            // The smallest sum reachable from this anchor already exceeds the goal.
            if (smallest > goal) break;
            const long long largest = 1LL * nums[i] + nums[n - 3]
                                    + nums[n - 2] + nums[n - 1];
            // The largest sum still falls short; a larger anchor may reach the goal.
            if (largest < goal) continue;

            for (int j = i + 1; j < n - 2; ++j) {
                if (j > i + 1 && nums[j] == nums[j - 1]) continue;

                const long long localMin = 1LL * nums[i] + nums[j]
                                      + nums[j + 1] + nums[j + 2];
                if (localMin > goal) break;
                const long long localMax = 1LL * nums[i] + nums[j]
                                      + nums[n - 2] + nums[n - 1];
                if (localMax < goal) continue;

                int left = j + 1;
                int right = n - 1;
                while (left < right) {
                    const long long sum = 1LL * nums[i] + nums[j]
                                        + nums[left] + nums[right];
                    if (sum < goal) {
                        ++left;
                    } else if (sum > goal) {
                        --right;
                    } else {
                        results.push_back({nums[i], nums[j], nums[left], nums[right]});
                        ++left;
                        --right;
                        while (left < right && nums[left] == nums[left - 1]) ++left;
                        while (left < right && nums[right] == nums[right + 1]) --right;
                    }
                }
            }
        }
        return results;
    }
};
```

四项相加可能超出 32 位 `int` 的范围；`1LL * nums[i]` 在**第一次加法之前**就提升运算类型，不能等到四项都加完再转换。原地排序省去 Python 版的数组副本，但会改变输入；`std::sort` 的比较次数保证为最坏 O(n log n)，但辅助栈空间取决于实现[^cpp-sort]；输出仍要占 O(R) 空间。即使用了上下界剪枝，最坏仍是 O(n³) 时间；遇到很快就能排除的区间，才可能减少实际双指针扫描。是否比无剪枝版更快，要在相同数据和编译条件下测量，不能从代码长度直接推断。

四数之和的关键不是记住四层循环，而是让**位置约束与去重层级**配套：固定项只在自己的层内去重，双指针只在命中后跳过已输出的数值对。剪枝再利用排序后的最左、最右可选位置，不改变这套正确性条件。

[^python-sorted]: [Python 文档：`sorted`](https://docs.python.org/3/library/functions.html#sorted)——说明它返回新列表，不修改传入的数组。

[^cpp-sort]: [cppreference：`std::sort`](https://en.cppreference.com/w/cpp/algorithm/sort.html)——说明对原范围排序，最坏 O(n log n) 次比较；未规定辅助栈空间。
