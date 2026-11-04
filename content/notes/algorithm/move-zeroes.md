---
title: "移动零：读写双指针与稳定前缀"
publishDate: "2026-10-22T12:00:00+08:00"
description: "LeetCode 283 的移动零：用读写双指针保持非零元素的相对顺序，证明原地交换与覆写补零的安全性，并比较两种方法的数组写入次数。"
---

[LeetCode 283. 移动零](https://leetcode.cn/problems/move-zeroes/)要求在原数组上操作，将所有 `0` 移到末尾，同时保持非零元素的相对顺序；例如 `[0, 1, 0, 3, 12]` 移动后应得到 `[1, 3, 12, 0, 0]`。这里用两个同向推进的指针分别承担读取与写入：读指针按序扫描输入，写指针维护已经就位的非零前缀。若直接从两端交换零与非零元素，可能打乱非零元素的相对顺序；例如 `[0, 1, 2]` 交换首尾后会变成 `[2, 1, 0]`。

## Python：用交换维护非零前缀与零区

下面的函数直接修改传入的 `nums`，不创建结果数组，返回 `None`。读指针 `fast` 依次访问原数组，写指针 `slow` 指向下一个非零元素应放置的位置。遇到非零元素，就将它与 `slow` 处的元素交换，再推进写指针。

```python
class Solution:
    def moveZeroes(self, nums: list[int]) -> None:
        slow = 0
        for fast in range(len(nums)):
            if nums[fast] != 0:
                # [slow, fast) contains only zeroes, so swapping preserves non-zero order.
                nums[slow], nums[fast] = nums[fast], nums[slow]
                slow += 1
```

设数组长度为 $n$。每轮开始时，以代码中的 `slow`、`fast` 为边界（满足 $0 \le \mathrm{slow} \le \mathrm{fast} \le n$），维护三个半开区间：

- $[0, \mathrm{slow})$：已按原相对顺序就位的非零元素；
- $[\mathrm{slow}, \mathrm{fast})$：已经扫描过的零；
- $[\mathrm{fast}, n)$：尚未处理的元素。

若当前元素为零，只推进读指针，零区扩大。若当前元素非零，它就是原数组中下一个应当保留的元素：当 `slow < fast` 时，`nums[slow]` 必为零，交换将当前非零元素追加到非零前缀末尾，并把零移到 `fast` 处；当 `slow == fast` 时，中间零区为空，自身交换后直接扩大非零前缀。两种情况都保持非零元素的相对顺序。

例如 `[0, 1, 0, 3]` 中，处理 `1` 后得到 `[1, 0, 0, 3]`，此时写指针停在下标 1；继续处理 `3` 后得到 `[1, 3, 0, 0]`。循环结束时未处理区为空，后缀 $[\mathrm{slow}, n)$ 自然全部为零，无须另行填充。

每个元素读取一次，时间复杂度为 $O(n)$，额外空间为 $O(1)$。全非零前缀会发生自身交换；可以增加 `if slow != fast` 跳过它们，但这是否缩短实际耗时需要结合分支与写入成本测量，不能仅凭写入次数判断。

## C++：跳过已有前缀，再覆写补零

Python 版直接交换，便于观察三个区间的变化。C++ 版进一步减少不必要的写入：先找到第一个零，跳过已经就位的非零前缀；若没有零，直接返回。之后将非零元素依次覆写到前面，最后用 `std::fill` 补零[^cpp-fill]。前两步与 `std::remove` 的一种典型实现相同：先找首个待移除元素，再稳定地向前覆写保留元素。区别在于，`std::remove` 只返回新的逻辑尾部，不负责补零，也不会缩短容器[^cpp-remove]：

```cpp
#include <algorithm>
#include <cstddef>
#include <vector>

class Solution {
public:
    void moveZeroes(std::vector<int>& nums) {
        const std::size_t n = nums.size();
        std::size_t slow = 0;

        // Skip the leading non-zero prefix that is already in its final position.
        while (slow < n && nums[slow] != 0) {
            ++slow;
        }
        if (slow == n) return;

        for (std::size_t fast = slow + 1; fast < n; ++fast) {
            if (nums[fast] != 0) {
                // The condition slow < fast holds throughout this loop, preserving unread values.
                nums[slow++] = nums[fast];
            }
        }

        // Zero out the logical tail [slow, n) left behind after compaction.
        std::fill(nums.begin() + slow, nums.end(), 0);
    }
};
```

进入第二段循环时 `fast` 从 `slow + 1` 起步，写指针始终严格小于读指针，因此覆写只改写已读位置，不会破坏后续输入。非零元素按读取顺序写入，相对顺序得以保留。不过，写指针之后可能残留旧值：`[0, 1, 0, 3]` 完成非零覆写后是 `[1, 3, 0, 3]`，还需将尾部填零。

设非零元素有 $m$ 个，第一个零之前有 $p$ 个非零元素；全非零时令 $p = n$。只统计源码对数组位置的写入，包括自身赋值：

| 方法                   | 数组写入次数 | 特点                   |
| ---------------------- | ------------ | ---------------------- |
| Python 无条件交换      | $2m$         | 每个非零元素都触发交换 |
| 从头覆写再补零         | $n$          | 非零前缀也会被重新写入 |
| C++ 跳过前缀后覆写补零 | $n - p$      | 全非零时无数组写入     |

C++ 版只覆写第一个零之后的 $m - p$ 个非零元素，再填充 $n - m$ 个零，合计 $n - p$ 次写入。它省去了已有前缀的写入，但不能保证对所有输入都少于交换法：若在交换法中也先跳过非零前缀（或判断 `slow != fast`），交换法只需写入 $2(m - p)$ 次；当首个零之后的非零元素极少（$2m - p < n$）时，交换法反而比尾部批量补零更省写入。两种语言的主解都需要 $O(n)$ 时间、$O(1)$ 额外空间，具体取舍取决于输入中零的密度。

两种方法都让**读指针遍历输入，写指针维护有效前缀**。交换法始终保证已读间隙全为零，覆写法则在扫描结束后统一清理尾部。

迁移到 [LeetCode 27. 移除元素](https://leetcode.cn/problems/remove-element/) 时，可复用“按条件稳定覆写”的骨架：保留不等于目标值的元素，返回写指针表示的有效长度，无须处理尾部。迁移到 [LeetCode 26. 删除有序数组中的重复项](https://leetcode.cn/problems/remove-duplicates-from-sorted-array/) 时，利用相等元素相邻的条件，在 `slow == 0` 或当前值不同于 `nums[slow - 1]` 时保留元素；先判断前缀为空，才能安全读取其末尾。两题都要按新的保留条件重新初始化扫描边界，不应沿用本题“先找第一个零”的代码。

同向快慢指针适用于单趟前缀维护；而当求解目标转向元素对或多元素组合时，指针走向变为从两端相向收缩——[《盛最多水的容器：短板内移与候选排除》](/notes/algorithm/container-with-most-water/)与[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)通过每一步排除整组不可能成为最优解或目标和的候选缩小范围。不同于这里的读写分工，相向双指针需要基于单调性或几何上界单独证明移动哪一侧是安全的。

[^cpp-fill]: [cppreference：`std::fill`](https://en.cppreference.com/w/cpp/algorithm/fill.html)——说明算法对指定范围内的每个元素赋予给定值。

[^cpp-remove]: [cppreference：`std::remove`](https://en.cppreference.com/w/cpp/algorithm/remove.html)——说明算法保持保留元素的相对顺序、返回新的逻辑尾部，并使其后的元素保持有效但处于未指定状态。
