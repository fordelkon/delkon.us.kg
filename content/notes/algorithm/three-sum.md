---
title: "三数之和：排序去重与频次压缩"
publishDate: "2026-10-24T13:00:00+08:00"
description: "LeetCode 15 的三数之和：用 Python 排序和双指针找出所有不重复的三元组，再用 C++ 压缩重复值，比较扫描与输出的成本。"
---

`[-1, 0, 1, 2, -1, -4]` 中有两组和为零的数：`[-1, -1, 2]` 和 `[-1, 0, 1]`。[LeetCode 15. 三数之和](https://leetcode.cn/problems/3sum/)要求返回所有**数值互不重复的三元组**，每组三个数来自三个不同下标。[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)只要找到一对下标，哈希表命中就能返回；本题需要列出全部结果，去重成为实现的核心。

## Python：固定一个数，在右侧找另外两个

先排序，固定首项 `values[i]`，在它后方的有序区间用 `left`、`right` 找和为 `-values[i]` 的数对。和偏小就右移 `left`，偏大就左移 `right`。命中后两端都前进，并跨过刚才的重复数值；同一层固定首项时也只试一个相同数值。

```python
class Solution:
    def threeSum(self, nums: list[int]) -> list[list[int]]:
        values = sorted(nums)
        result: list[list[int]] = []

        for i in range(len(values) - 2):
            # Skip a repeated anchor; duplicate pairs inside the window are skipped after a hit.
            if i > 0 and values[i] == values[i - 1]:
                continue

            left, right = i + 1, len(values) - 1
            while left < right:
                total = values[i] + values[left] + values[right]
                if total < 0:
                    left += 1
                elif total > 0:
                    right -= 1
                else:
                    result.append([values[i], values[left], values[right]])
                    left += 1
                    right -= 1
                    while left < right and values[left] == values[left - 1]:
                        left += 1
                    while left < right and values[right] == values[right + 1]:
                        right -= 1
        return result
```

这里跳过的是**重复结果**，不是禁止两个相同值参与一组解：`[0, 0, 0]` 会产生一组 `[0, 0, 0]`，因为三个零占据不同位置。`[-2, 0, 0, 2, 2]` 则只会产生一组 `[-2, 0, 2]`。每轮固定的位置与双指针的位置满足 $i < \mathrm{left} < \mathrm{right}$，不会反复使用一个下标。

排序耗时 $O(n \log n)$，最多固定 $O(n)$ 次、每次双指针扫描 $O(n)$，总时间 $O(n^2)$。`sorted(nums)` 返回新的有序列表，保留原数组，除返回结果外额外占用 $O(n)$ 空间[^python-sorted]；若允许修改输入，可改为原地排序，省去这份副本。

## C++：把重复数值压成频次

原数组有 $n$ 项，却可能只有 $u$ 个不同数。排序之后把相邻的相同值压成连续排列的 `(value, count)`：双指针只访问这 $u$ 个值，`count` 则保证 `[a, a, c]`、`[a, b, b]` 和 `[0, 0, 0]` 仍使用足够多的原始位置。这种结构随输入增长，不需要预设数值范围，也不依赖全局或线程局部的计数数组。

```cpp
#include <algorithm>
#include <utility>
#include <vector>

class Solution {
public:
    std::vector<std::vector<int>> threeSum(std::vector<int>& nums) {
        std::sort(nums.begin(), nums.end());
        std::vector<std::pair<int, int>> distinct;
        for (int value : nums) {
            if (distinct.empty() || distinct.back().first != value)
                distinct.emplace_back(value, 1);
            else
                ++distinct.back().second;
        }

        std::vector<std::vector<int>> result;
        const int size = static_cast<int>(distinct.size());
        for (int i = 0; i < size; ++i) {
            if (distinct[i].first > 0) break;
            // Start left at i so triplets reusing distinct[i] (such as [a, a, c] or [0, 0, 0]) are considered.
            int left = i;
            int right = size - 1;
            while (left <= right) {
                const long long sum = 1LL * distinct[i].first +
                                      distinct[left].first + distinct[right].first;
                if (sum < 0) {
                    ++left;
                } else if (sum > 0) {
                    --right;
                } else {
                    // Equal indices reuse one distinct value, so its count must cover the repeats.
                    const bool enough = i == left && left == right
                                            ? distinct[i].second >= 3
                                            : i == left ? distinct[i].second >= 2
                                            : left == right ? distinct[left].second >= 2
                                                            : true;
                    if (enough)
                        result.push_back({distinct[i].first,
                                          distinct[left].first,
                                          distinct[right].first});
                    ++left;
                    --right;
                }
            }
        }
        return result;
    }
};
```

三个索引相等时，原数组中需要三个该值；只有 `i == left` 或 `left == right` 时，出现两次即可；全不相等时各一个就够。按 $i \le \mathrm{left} \le \mathrm{right}$ 递进，一旦 `distinct[i].first > 0` 就可直接结束外层循环；即使某次因频次不够而不输出，下一组数值组合也不会因此重复。第一次加法前的 `1LL *` 把整个和提升到 64 位，在 `int` 极值输入下避免中间和有符号溢出[^cpp-promotion]。排序会修改 `nums`，这一点与上面的 Python 版不同。

`std::sort` 保证最坏 $O(n \log n)$ 次比较[^cpp-sort]；压缩 $O(n)$，双指针最多 $O(u^2)$。除结果外，频次数组占 $O(u)$；排序栈的空间取决于标准库实现，常见的内省排序实现通常需要 $O(\log n)$ 栈空间，不能把它当作 `std::sort` 的标准保证。重复值多时，$u$ 远小于 $n$，后续扫描会减少；全是不同值时，压缩和额外内存可能让它慢于直接在原数组上双指针。`vector<vector<int>>` 还要为每组三元组存储结果；结果数为 $R$ 时，这部分至少要写出 $O(R)$ 个定长三元组。是否更快取决于重复率、输出规模和实际测量，不由渐进复杂度单独决定。

到[《四数之和：两层固定与双指针的剪枝边界》](/notes/algorithm/four-sum/)时，再多固定一个位置，剩余两数仍可用排序双指针；题目仍是列出不重复的数值组合，不会变成“和为目标值的连续子数组”计数。

[^python-sorted]: [Python 文档：`sorted`](https://docs.python.org/3/library/functions.html#sorted)——说明它从可迭代对象返回一个新的有序列表。

[^cpp-promotion]: [cppreference：算术运算符与常用算术转换](https://en.cppreference.com/w/cpp/language/operator_arithmetic.html)——说明有符号整数溢出属于未定义行为；先与 `1LL` 相乘可将后续加法的操作数提升为 `long long`。

[^cpp-sort]: [cppreference：`std::sort`](https://en.cppreference.com/w/cpp/algorithm/sort.html)——说明对给定范围排序并要求最坏 $O(n \log n)$ 次比较；未规定排序栈空间。
