---
title: "缺失的第一个正数：把正数放回对应下标"
publishDate: "2026-12-23T12:00:00+08:00"
description: "LeetCode 41 缺失的第一个正数：利用答案必落在 [1, n + 1] 的抽屉原理，通过 while 原地交换将每个有效正数 x 送回下标 x - 1，实现 O(n) 时间与 O(1) 空间。"
tags: ["algorithm", "matrix", "python", "cpp"]
---

[LeetCode 41. 缺失的第一个正数](https://leetcode.cn/problems/first-missing-positive/)（Hot 100，困难）给定未排序的整数数组 `nums`（长度 $n$），要求找出其中没有出现的**最小正整数**，且时间复杂度必须为 $O(n)$、只能使用常数级别 $O(1)$ 的额外空间。题目保证 $1 \le n \le 10^5$，元素范围覆盖 $[-2^{31}, 2^{31} - 1]$。**副作用说明**：为达到 $O(1)$ 额外空间，下列实现会原地重排输入数组 `nums`。

## 为什么答案一定在 $[1, n + 1]$ 内

根据**鸽巢原理**（pigeonhole principle）[^pigeonhole]，长度为 $n$ 的数组最多只能容纳 $n$ 个互不相同的正整数：

- 若数组恰好包含 `1, 2, ..., n` 全部 $n$ 个正整数，则缺失的最小正整数是 $n + 1$；
- 否则区间 $[1, n]$ 中至少有一个整数未出现，答案必落在 $[1, n]$ 内。

因此**所有 $\le 0$ 或 $> n$ 的元素都绝不可能是答案**，数组自身的 $n$ 个槽位 `0..n - 1` 恰好能充当值域 $[1, n]$ 的原地哈希表：目标是将每个满足 $1 \le x \le n$ 的元素 `x` 交换到下标 `x - 1` 处。

以 `[3, 4, -1, 1]` 为例。表头是下标，值 `x` 应放到下标 `x - 1`：

<div class="algorithm-table">

| 状态 | 0 | 1 | 2 | 3 |
| --- | ---: | ---: | ---: | ---: |
| 初始 | 3 | 4 | −1 | 1 |
| 放好 3 | −1 | 4 | **3** | 1 |
| 放好 4 | −1 | 1 | 3 | **4** |
| 放好 1 | **1** | −1 | 3 | 4 |

</div>

放好 4 后，下标 1 换回来的值 1 还没归位，所以马上重查同一格。第二趟扫描在下标 1 看到的值是 −1，首先缺少的正数就是 2。

两个关键陷阱都有直观反例：

1. **不能把内层 `while` 写成 `if`**：在 `[3, 4, -1, 1]` 中处理 `i = 1` 把 `4` 换到下标 `3` 时会换回 `1`，若只用 `if` 不继续处理，`1` 就滞留在下标 `1` 而错过归位到下标 `0`，最终误判缺失 `1`。
2. **必须检查 `nums[x - 1] != x` 而不是 `nums[i] != i + 1`**：在含重复值的 `[1, 1]` 中，处理 `i = 1` 时 `nums[1] == 1 != 2`，但目标槽位 `nums[0]` 已经是 `1`；若只检查 `nums[i] != i + 1`，两个 `1` 会无限互换导致死循环。

## Python & C++：原地置换实现

Python 中交换 `nums[i]` 与 `nums[nums[i] - 1]` 时，必须先把目标下标存入局部变量 `target = nums[i] - 1`。如果直接写 `nums[i], nums[nums[i] - 1] = nums[nums[i] - 1], nums[i]`，Python 按从左到右顺序对赋值目标求值[^python-assign]：先覆写 `nums[i]` 后再计算 `nums[nums[i] - 1]`，导致写入错误下标。

```python
class Solution:
    def firstMissingPositive(self, nums: list[int]) -> int:
        n = len(nums)

        for i in range(n):
            # Keep swapping while nums[i] is in [1, n] and its target slot does not
            # already hold the same value (guards against infinite loops on duplicates).
            while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
                target = nums[i] - 1
                # Bind `target` before tuple unpacking mutates nums[i].
                nums[i], nums[target] = nums[target], nums[i]

        # After partitioning, every present value x in [1, n] sits at index x - 1.
        for i in range(n):
            if nums[i] != i + 1:
                return i + 1

        return n + 1
```

C++ 版本中短路与 `nums[i] >= 1 && nums[i] <= n` 保证了 `nums[i] - 1` 一定落在 `[0, n - 1]`，不会对 `INT_MIN` 执行减 1 触发有符号整数下溢[^cpp-swap]：

```cpp
#include <utility>
#include <vector>

class Solution {
public:
    int firstMissingPositive(std::vector<int>& nums) const {
        const int n = static_cast<int>(nums.size());

        for (int i = 0; i < n; ++i) {
            // Range check runs first so `nums[i] - 1` never underflows on INT_MIN
            // or indexes out of bounds; equality check prevents duplicate swap loops.
            while (nums[i] >= 1 && nums[i] <= n && nums[nums[i] - 1] != nums[i]) {
                std::swap(nums[i], nums[nums[i] - 1]);
            }
        }

        // First index violating nums[i] == i + 1 reveals the smallest missing positive.
        for (int i = 0; i < n; ++i) {
            if (nums[i] != i + 1) {
                return i + 1;
            }
        }

        return n + 1;
    }
};
```

## 复杂度分析与关联题对比

- **时间复杂度（聚合分析）**：虽然 `for` 内嵌套了 `while`，但每次交换都严格使**至少一个**尚未归位的元素永久落入其正确槽位 `x - 1`；一旦归位，守卫条件 `nums[x - 1] != x` 会阻止它被再次换走。因此整个执行过程中交换总数至多为 $n$ 次，总时间复杂度为 $O(n)$[^clrs-amortized]。
- **辅助空间复杂度**：所有置换均在输入数组原地完成，额外空间为 $O(1)$。

本题与[《寻找重复数：下标映射与环入口》](/posts/algorithm/find-the-duplicate-number/)都利用了数组下标与值域 $[1, n]$ 的映射关系：区别在于本题允许原地修改数组，因而可以直接做置换归位；而 287 题要求只读数组，只能把 `i -> nums[i]` 视为隐式函数图并借助[《环形链表 II：快慢指针相遇后为什么能找到入口》](/posts/algorithm/linked-list-cycle-ii/)的快慢指针定位环入口。

[^pigeonhole]: [Wikipedia：Pigeonhole principle](https://en.wikipedia.org/wiki/Pigeonhole_principle)——鸽巢原理：将多于 $n$ 个元素放入 $n$ 个槽位必有碰撞，反之 $n$ 个槽位至多覆盖 $1 \dots n$ 中的 $n$ 个不同正整数。

[^python-assign]: [Python 文档：7. Simple statements（Assignment statements）](https://docs.python.org/3/reference/simple_stmts.html)——规定赋值语句先求值右侧表达式，再按从左到右顺序绑定左侧目标。

[^cpp-swap]: [cppreference：`std::swap`](https://en.cppreference.com/w/cpp/algorithm/swap.html)——常数时间交换两个内置整数对象的值。

[^clrs-amortized]: [_Introduction to Algorithms_ (4th ed., Section 16.1: Aggregate analysis)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——聚合分析方法：通过统计全局操作总数上界证明带嵌套循环的算法仍为线性时间 $O(n)$。
