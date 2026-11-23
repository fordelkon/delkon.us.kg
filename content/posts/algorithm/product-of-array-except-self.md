---
title: "除自身以外数组的乘积：左侧积乘以右侧积"
publishDate: "2026-12-22T12:00:00+08:00"
description: "LeetCode 238 除自身以外数组的乘积：禁止使用除法时将结果拆解为左侧前缀积与右侧后缀积的乘积，并直接复用输出数组把额外空间压至常数 O(1)。"
tags: ["algorithm", "matrix", "python", "cpp"]
---

[LeetCode 238. 除自身以外数组的乘积](https://leetcode.cn/problems/product-of-array-except-self/)（Hot 100）给定整数数组 `nums`，要求返回一个新数组 `answer`，其中 `answer[i]` 等于 `nums` 中除 `nums[i]` 之外其余各元素的乘积。题目**禁止使用除法**，要求在 $O(n)$ 时间内完成，并进一步在 $O(1)$ 额外空间（输出数组不计入）内实现。题目保证 $2 \le n \le 10^5$，且任意前缀与后缀乘积均在 32 位有符号整数范围内，不会触发有符号整数溢出[^cpp-overflow]。下列实现均只读输入数组，不修改 `nums`。

## 为什么不能用总乘积除以当前元素

用全部元素的乘积除以 `nums[i]` 不仅违反题目约束，而且面对零元素会直接失效：

- **反例（含零数组）**：当 `nums = [1, 0, 3]` 时，总乘积为 `0`，计算 `answer[1]` 会触发除零错误；即便改为统计 `0` 的个数再分 0 个、1 个、$\ge 2$ 个三种分支处理，逻辑也比前后缀拆解更易出错，且仍依赖除法。

将 `answer[i]` 拆成左侧全部元素与右侧全部元素的乘积（空乘积定义为乘法单位元 `1`），即可彻底摆脱除法：

$$
\text{answer}[i] = \underbrace{\left(\prod_{j = 0}^{i - 1} \text{nums}[j]\right)}_{\text{左侧前缀积 } L[i]} \times \underbrace{\left(\prod_{j = i + 1}^{n - 1} \text{nums}[j]\right)}_{\text{右侧后缀积 } R[i]}.
$$

以 `[1, 2, 3, 4]` 为例，每一列的最后一行都是它上方两个乘积的积：

<div class="algorithm-table">

| 下标 | 0 | 1 | 2 | 3 |
| --- | ---: | ---: | ---: | ---: |
| 原数组 | 1 | 2 | 3 | 4 |
| 左侧积 | 1 | **1** | 2 | 6 |
| 右侧积 | 24 | **12** | 4 | 1 |
| 最终值 | 24 | **12** | 8 | 6 |

</div>

下标 1 左边只有 1，右边有 3、4，答案是 12。实现把第一趟的左侧积直接写入输出数组，第二趟再乘上滚动维护的右侧积。

循环不变式清晰对称：第一趟扫描到下标 `i` 前，`left_prod` 始终等于 $\prod_{j = 0}^{i - 1} \text{nums}[j]$，因此**必须先写入 `answer[i]` 再把 `nums[i]` 乘入 `left_prod`**，确保自身不被计入；第二趟逆序扫描到下标 `i` 前，`right_prod` 始终等于 $\prod_{j = i + 1}^{n - 1} \text{nums}[j]$，同样**先乘入 `answer[i]` 再更新 `right_prod`**。因为每一步写入都不依赖尚未读取的旧值，直接复用输出数组 `answer` 暂存 $L[i]$ 即可省去两份 $O(n)$ 辅助数组。

## Python & C++：常数额外空间两趟扫描

```python
class Solution:
    def productExceptSelf(self, nums: list[int]) -> list[int]:
        n = len(nums)
        answer = [1] * n

        # Invariant: before step i, left_prod holds the product of nums[0..i-1].
        # Write answer[i] before folding nums[i] so nums[i] itself is excluded.
        left_prod = 1
        for i in range(n):
            answer[i] = left_prod
            left_prod *= nums[i]

        # Invariant: before step i, right_prod holds the product of nums[i+1..n-1].
        right_prod = 1
        for i in range(n - 1, -1, -1):
            answer[i] *= right_prod
            right_prod *= nums[i]

        return answer
```

C++ 版本按 `const` 引用接收输入，一次性按长度 `n` 构造连续内存容器 `std::vector<int>` 作为输出缓冲[^cpp-vector]：

```cpp
#include <cstddef>
#include <vector>

class Solution {
public:
    std::vector<int> productExceptSelf(const std::vector<int>& nums) const {
        const std::size_t n = nums.size();
        std::vector<int> answer(n, 1);

        // Pass 1: answer[i] receives product of nums[0..i-1] before nums[i] is folded in.
        int left_prod = 1;
        for (std::size_t i = 0; i < n; ++i) {
            answer[i] = left_prod;
            left_prod *= nums[i];
        }

        // Pass 2: fold suffix product of nums[i+1..n-1] into answer[i] in reverse order.
        int right_prod = 1;
        for (std::size_t i = n; i-- > 0;) {
            answer[i] *= right_prod;
            right_prod *= nums[i];
        }

        return answer;
    }
};
```

注意 C++ 逆序循环使用 `for (std::size_t i = n; i-- > 0;)`，既避免了无符号整数递减下溢成回绕大数，又免去有符号/无符号转换。

## 复杂度分析与前后缀范式对照

- **时间复杂度**：正反两趟各遍历 $n$ 个元素，总时间复杂度为 $O(n)$。
- **空间复杂度**：输出数组 `answer` 占 $O(n)$ 存储空间；不计输出数组时，仅使用 `left_prod`、`right_prod` 等标量变量，额外辅助空间复杂度为 $O(1)$。

这种“把对全局除自身外元素的聚合拆成前缀与后缀两个单向扫描”的技巧，与[《接雨水：按列结算与单调栈分层》](/posts/algorithm/trapping-rain-water/)预处理每列左右最高柱子、[《和为 K 的子数组：先查前缀，再记录频次》](/posts/algorithm/subarray-sum-equals-k/)利用前缀和消除重复区间累加属于同一脉络——本质都是把二次嵌套聚合降维成线性前缀/后缀状态。

[^cpp-overflow]: [C++ 工作草案：表达式前言](https://eel.is/c++draft/expr.pre)——规定有符号整数算术结果超出类型可表示范围时属于未定义行为；本题输入契约保证各前后缀乘积落在 32 位 `int` 内。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——提供连续内存存储与指定大小的常数初始化构造，避免逐次扩容。
