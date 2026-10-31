---
title: "两数之和：先查补数，再记下标"
publishDate: "2026-10-23T12:00:00+08:00"
description: "LeetCode 1 的两数之和，用 Python 哈希表返回原下标，再比较 C++ 标准哈希表与连续存储的开放寻址表。"
---

[LeetCode 1. 两数之和](https://leetcode.cn/problems/two-sum/)给出整数数组和目标和，要求返回一组满足条件的**两个不同下标**；题目保证恰好有一个答案。例如 `[2, 7, 11, 15]`、目标 `9` 返回 `[0, 1]`。这里不需要找出所有数值组合，不能因为两个数相等就把两个位置当成同一个元素。

## Python：哈希表只记录已经走过的位置

遍历到下标 `i`、值为 `num` 时，问题变成：此前是否出现过 `target - num`？先查补数，再把当前值写入表，保证同一个位置不会和自己配对。Python 字典的 `in` 检查键是否存在，下标赋值则记录该键对应的值[^python-dict]。

```python
class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        value_index: dict[int, int] = {}
        for i, num in enumerate(nums):
            complement = target - num
            # Query the complement before recording this value, so an index never pairs with itself.
            if complement in value_index:
                return [value_index[complement], i]
            value_index[num] = i
        return []
```

以 `[3, 3]`、目标 `6` 为例，第一个 `3` 查不到补数，先记录下标 `0`；第二个 `3` 才查到它，返回 `[0, 1]`。如果先写入后查找，第一个 `3` 就可能错误地匹配自己。这里的 `return []` 只是完整函数的兜底，题目输入保证会在循环中找到解。

哈希表查询和写入平均 $O(1)$，总时间平均 $O(n)$、额外空间 $O(n)$。遇到答案时立即退出，因此实际扫描长度取决于答案出现的位置；最坏情况下仍要读到末尾。

## C++：复用一次查找的迭代器

标准容器版仍用值到下标的哈希映射。命中后直接读 `find` 返回的迭代器，不再对同一个键调用 `operator[]`；提前 `reserve` 也能减少插入期间的重新分桶[^unordered-reserve]。

```cpp
#include <limits>
#include <unordered_map>
#include <vector>

class Solution {
public:
    std::vector<int> twoSum(std::vector<int>& nums, int target) {
        std::unordered_map<int, int> seen;
        seen.reserve(nums.size());

        for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
            // The difference can exceed int; only search keys representable as int.
            const long long complement = 1LL * target - nums[i];
            if (complement >= std::numeric_limits<int>::min() &&
                complement <= std::numeric_limits<int>::max()) {
                const auto it = seen.find(static_cast<int>(complement));
                if (it != seen.end()) return {it->second, i};
            }
            // emplace keeps the earliest index when values repeat.
            seen.emplace(nums[i], i);
        }
        return {};
    }
};
```

`target - nums[i]` 可能超出 32 位有符号整数范围，先提升到 `long long`，只在补数可表示为 `int` 时才查表。`emplace` 在键已存在时不会插入新值，因此重复值保留最早记录的下标[^unordered-emplace]；若出现一对有效答案，仍会取到不同位置。相比 `find` 命中后再用 `seen[complement]` 查一次，这版少一次按键查找。预留桶可能增加内存占用，哈希冲突也会影响运行时间；平均 $O(n)$ 时间、$O(n)$ 空间不等于每组数据都比其他方案快。

## C++ 进阶：按输入大小建立连续哈希表

常见的 `unordered_map` 实现逐节点分配，查询时还可能跟随指针访问离散的内存；标准容器只规定按桶组织和平均常数时间操作，并不保证某种节点布局[^unordered-map]。如果这部分开销成了瓶颈，可以让键和下标放进 `std::vector` 的连续槽位[^vector]，用线性探测处理碰撞。表的容量按**输入元素数**确定，而非按数值范围确定；这也适用于正负值分布很宽的数组。下面混合函数中的两个乘数取自 `lowbias32`[^hash-mix]。

```cpp
#include <cstddef>
#include <cstdint>
#include <limits>
#include <vector>

class Solution {
    struct Slot {
        int value = 0;
        int index = -1;  // -1 marks an empty slot; real indices start at 0.
    };

    static std::size_t bucket(int value) {
        std::uint32_t bits = static_cast<std::uint32_t>(value);
        bits ^= bits >> 16;
        bits *= 0x7feb352dU;
        bits ^= bits >> 15;
        bits *= 0x846ca68bU;
        bits ^= bits >> 16;
        return bits;
    }

public:
    std::vector<int> twoSum(std::vector<int>& nums, int target) {
        std::size_t capacity = 1;
        // Keep load factor <= 0.5 with a power-of-two capacity so linear probing always terminates.
        while (capacity < nums.size() * 2) capacity *= 2;
        std::vector<Slot> table(capacity);
        const std::size_t mask = capacity - 1;

        for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
            const long long complement = 1LL * target - nums[i];
            if (complement >= std::numeric_limits<int>::min() &&
                complement <= std::numeric_limits<int>::max()) {
                const int wanted = static_cast<int>(complement);
                std::size_t pos = bucket(wanted) & mask;
                while (table[pos].index != -1) {
                    if (table[pos].value == wanted) return {table[pos].index, i};
                    pos = (pos + 1) & mask;
                }
            }

            std::size_t pos = bucket(nums[i]) & mask;
            // Stop at an empty slot or an existing duplicate so the earliest index is preserved.
            while (table[pos].index != -1 && table[pos].value != nums[i])
                pos = (pos + 1) & mask;
            if (table[pos].index == -1) table[pos] = {nums[i], i};
        }
        return {};
    }
};
```

`index == -1` 标记空槽，因合法下标从零开始，不会误把值为 `0` 的元素当成空槽。容量为不小于 `2n` 的二次幂，表中最多写入 `n` 个不同键，因此至少一半槽位为空；查找和插入的探测都能终止。用 `uint32_t` 做混合时无符号溢出是预期的，查询和插入使用同一函数。它没有依赖题目规定的数值界限，但和 `int` 下标、`2 * nums.size()` 一样，仍假定输入长度在这些运算的可表示范围内。

这一版把散落的节点换成连续槽位，代价是每次都要分配并初始化约 $2n$ 至 $4n$ 个槽位。小数组或很早命中的输入可能因此更慢；重复值多时也未必能抵消清表成本。平均时间 $O(n)$、空间 $O(n)$，碰撞极端密集时最坏时间可能达到 $O(n^2)$。要判断值不值得换，需在目标环境里对**完整函数**测试不同长度、重复率和命中位置，而不能只比较一次哈希查找。

同样是边扫描边在哈希表里查找差值，[《和为 K 的子数组：先查前缀，再记录频次》](/notes/algorithm/subarray-sum-equals-k/)要统计所有满足条件的前缀起点，因此表中记录的是出现频次而非单个下标。而[《三数之和：排序去重与频次压缩》](/notes/algorithm/three-sum/)与[《四数之和：两层固定与双指针的剪枝边界》](/notes/algorithm/four-sum/)的目标是返回所有不重复的数值元组，会先排序，再在有序后缀内用双指针；两数之和的哈希表解法负责返回原始下标，不应直接拿来替换那个双指针子问题。

[^python-dict]: [Python 文档：字典映射类型](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——说明成员检查按键判断，下标赋值写入对应值。

[^unordered-reserve]: [cppreference：`unordered_map::reserve`](https://en.cppreference.com/w/cpp/container/unordered_map/reserve.html)——说明按预期元素数调整桶数及负载因子，不保证无碰撞。

[^unordered-emplace]: [cppreference：`unordered_map::emplace`](https://en.cppreference.com/w/cpp/container/unordered_map/emplace.html)——说明键已存在时不插入，原映射值保持不变。

[^unordered-map]: [cppreference：`std::unordered_map`](https://en.cppreference.com/w/cpp/container/unordered_map.html)——说明元素按桶组织，查找与插入平均为常数时间；不规定逐节点分配的内存布局。

[^vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——说明普通 `vector` 的元素连续存储；这里槽位类型为 `Slot`，不是特化的 `vector<bool>`。

[^hash-mix]: [hash-prospector：`lowbias32`](https://github.com/skeeto/hash-prospector)——列出用于 32 位整数混合的移位步骤与乘数；它不是通用哈希表性能保证。
