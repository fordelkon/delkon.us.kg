---
title: "分割等和子集：0-1 背包可行性与一维倒序压缩"
publishDate: "2026-11-05T08:00:00+08:00"
description: "LeetCode 416 分割等和子集：把等和划分转成目标和可达性，用倒序更新保证每个元素至多使用一次，再比较布尔数组与位集的状态表示。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 416. 分割等和子集](https://leetcode.cn/problems/partition-equal-subset-sum/)给定非空正整数数组 `nums`，要求判断能否把所有元素分到两个和相等的子集中。例如 `[1, 5, 11, 5]` 可以分为 `[11]` 与 `[1, 5, 5]`，而 `[1, 2, 3, 5]` 不行。每个位置上的元素只能使用一次，数值相同的元素仍是不同的可选项。题目保证数组长度 $1\le n\le200$，每个元素至多为 100。

[《两数之和：先查补数，再记下标》](/posts/algorithm/two-sum/)只选两个位置，本题则允许任意数量的元素。设总和为 $S$，若能均分，每个子集的和都必须是 $\text{target}=S/2$。因此问题转化为经典的**子集和问题**（subset sum problem）：能否挑出一个和为目标值的子集；剩余元素自动构成另一半[^clrs-knapsack]。

## 先检查总和与最大值

状态计算前可以排除几种情况：

- 若 $S$ 为奇数，两个整数和不可能相等，直接返回 `false`。
- 若最大元素 $M>\text{target}$，无论把它放在哪一边，该边都已超出目标；其余元素都是正数，无法抵消，返回 `false`。
- 若 $M=\text{target}$，让它单独成组，剩余元素之和也是目标，返回 `true`。

其余情况需要判断目标和是否可达。暴力方法为每个元素选择“取”或“不取”，形成[《从调用栈理解递归》中的回溯决策树](/posts/understanding-recursion/#回溯选择探索与恢复)，枚举数量为 $O(2^n)$。但处理相同的一批元素后，只要选取的总和相同，后续可作的选择就相同；没有必要分别保存这些组合。

## 状态记录选了多少项、当前和是多少

定义 $dp[i][j]$：从前 $i$ 个元素中能否选出和为 $j$ 的子集，其中 $0\le i\le n$，$0\le j\le\text{target}$。

空子集的和为 0，所以 $dp[i][0]=\text{true}$。没有元素时，所有正数和都不可达，即 $dp[0][j]=\text{false}$（$j>0$）。

处理当前值 $\textit{num}=nums[i-1]$ 时，可以不选它，沿用 $dp[i-1][j]$；也可以选它，但必须先用前面的元素凑出 $j-\textit{num}$：

$$
dp[i][j]=
\begin{cases}
dp[i-1][j], & j<\textit{num},\\
dp[i-1][j]\lor dp[i-1][j-\textit{num}], & j\ge\textit{num}.
\end{cases}
$$

两种来源都只使用前 $i-1$ 个元素，因此不会重复选取当前元素。逐项计算后，$dp[n][\text{target}]$ 就回答了原问题。

## 压缩成一维后，为什么必须倒序更新

转移只依赖上一轮，可以把状态压缩成长度为 $\text{target}+1$ 的数组。但必须保护上一轮的值：

- 若从小到大更新 `dp[j]`，较小的 `dp[j - num]` 可能已在本轮使用过当前元素，继续转移就可能再次使用它。
- 若从大到小更新，`dp[j - num]` 尚未被本轮修改，仍只包含此前元素的选择。

例如 `nums = [2, 2, 3, 5]`，目标为 6，前面的剪枝不会返回。若升序处理第一个 2，会把 2、4、6 依次标为可达，相当于把一个元素用了三次；实际没有和为 6 的子集。

因此，对这里的同一数组递推式，要按容量降序更新。这个方向与[《零钱兑换：完全背包自底向上与不可达哨兵》](/posts/algorithm/coin-change/)不同：零钱可以重复使用，而本题必须让每轮读取到未使用当前元素的旧状态。

## Python：倒序更新，目标可达就返回

代码只读 `nums`，依赖题目保证的非空输入。使用负步长 `range` 遍历容量，不创建切片：

```python
class Solution:
    def canPartition(self, nums: list[int]) -> bool:
        total_sum = sum(nums)
        if total_sum % 2 != 0:
            return False

        target = total_sum // 2
        max_num = max(nums)
        if max_num > target:
            return False
        if max_num == target:
            return True

        dp = [False] * (target + 1)
        dp[0] = True

        for num in nums:
            # Descending order keeps dp[j - num] in the previous item layer,
            # preventing the current element from being reused in the same subset.
            for j in range(target, num - 1, -1):
                dp[j] = dp[j] or dp[j - num]
            if dp[target]:
                return True

        return dp[target]
```

每轮结束时，`dp[j]` 表示已处理元素能否凑出和 `j`。一旦目标可达，未处理元素全部归入另一组即可，因为总和始终是目标的两倍，无须继续枚举。

时间上界为 $O(n\cdot\text{target})$。这属于**伪多项式时间**（pseudo-polynomial time）：成本依赖目标和的数值，而不只是表示该数值需要的二进制位数。题目范围内 $\text{target}\le10000$，更新次数至多 $2\times10^6$，这不是固定运行耗时。辅助空间为 $O(\text{target})$，布尔返回值占 $O(1)$ 空间。

## C++：同样保留上一轮状态

`std::vector<bool>` 是标准库特化，实现通常按位压缩，但标准不保证每项恰占 1 位，元素访问也不是普通 `bool&`[^cpp-vector-bool]。这不改变倒序读取旧状态的要求：

```cpp
#include <algorithm>
#include <numeric>
#include <vector>

class Solution {
public:
    bool canPartition(const std::vector<int>& nums) {
        const int total_sum = std::accumulate(nums.begin(), nums.end(), 0);
        // An odd sum cannot be divided into two equal integer subsets.
        if (total_sum % 2 != 0) {
            return false;
        }

        const int target = total_sum / 2;
        const int max_val = *std::max_element(nums.begin(), nums.end());
        // If the maximum element exceeds half the sum, no valid partition exists.
        if (max_val > target) {
            return false;
        }
        if (max_val == target) {
            return true;
        }

        std::vector<bool> dp(target + 1, false);
        dp[0] = true;

        for (int num : nums) {
            // Descending order prevents reusing the current element within the same iteration.
            for (int j = target; j >= num; --j) {
                if (dp[j - num]) {
                    dp[j] = true;
                }
            }
            // Early return once the target sum becomes reachable.
            if (dp[target]) {
                return true;
            }
        }

        return dp[target];
    }
};
```

实现只读输入，总和至多为 20000，`int` 足够。时间与空间界同 Python 版。

## 用位集同时更新一批可达和

最大目标为 10000，因此还可以用 `std::bitset<10001>` 表示可达和[^cpp-bitset]。第 $j$ 位为 1 表示和 $j$ 可达。引入值 `num` 后，左移 `num` 位得到选取它后的所有新状态，再与旧状态合并：

```cpp
#include <algorithm>
#include <bitset>
#include <numeric>
#include <vector>

class Solution {
public:
    bool canPartition(const std::vector<int>& nums) {
        const int total_sum = std::accumulate(nums.begin(), nums.end(), 0);
        // An odd sum cannot be divided into two equal integer subsets.
        if (total_sum % 2 != 0) {
            return false;
        }

        const int target = total_sum / 2;
        const int max_val = *std::max_element(nums.begin(), nums.end());
        // If the maximum element exceeds half the sum, no valid partition exists.
        if (max_val > target) {
            return false;
        }
        if (max_val == target) {
            return true;
        }

        // Under problem constraints (n <= 200, nums[i] <= 100), max target is 10000.
        // Bit j is set to 1 if and only if a subset sum of j is reachable.
        std::bitset<10001> dp;
        dp[0] = 1; // Base case: subset sum 0 is always achievable with empty set.

        for (int num : nums) {
            // Left shift simulates adding num to all currently reachable sums.
            // Bitwise OR merges new sums with existing reachable sums in bulk.
            dp |= (dp << num);
            if (dp[target]) {
                return true;
            }
        }

        return dp[target];
    }
};
```

在完整实现中，保留前置的总和奇偶性与最大值剪枝，核心转移由 `dp |= (dp << num)` 替代内层循环。`dp << num` 先从旧位集生成结果，再执行按位或合并，因此每个元素仅被选用一次。所有数均为正数，超过位集上限的高位溢出舍弃不会影响目标值判定。

这是一条 C++ 表达式，不是一条固定耗时的 CPU 指令。若实现以宽度为 $w$ 的机器字处理 $B=10001$ 个位，一轮移位与或运算通常需要 $O(\lceil B/w\rceil)$ 次字操作，总时间为 $O(n\lceil B/w\rceil)$，存储为 $O(\lceil B/w\rceil)$ 个机器字。标准不保证 SIMD 或固定倍数的加速。

本题把不同选取组合合并为同一个“元素范围与累加和”状态。[《单词拆分：前缀可行性转移与子串查找成本》](/posts/algorithm/word-break/)也只记录可行性，但那里还要保留字符顺序，状态必须对应字符串的特定前缀，不能只考虑单词长度之和。

[^clrs-knapsack]: [Introduction to Algorithms (4th ed., Section 34.5.5)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——讨论子集和问题的 NP 完全性；[MIT 6.006 Lecture 18](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/resources/lecture-18-dynamic-programming-part-4-rods-subset-sum-pseudopolynomial/)讲解子集和动态规划及伪多项式复杂度。

[^cpp-vector-bool]: [C++ 工作草案：`vector<bool>`](https://eel.is/c++draft/vector.bool)——规定布尔空间优化的特化行为及代理引用，不能按普通 `bool` 数组推断布局。

[^cpp-bitset]: [C++ 工作草案：位集成员操作](https://eel.is/c++draft/bitset.members)——定义定长位集的左移与按位或语义，不规定本文讨论的机器字实现方式。
