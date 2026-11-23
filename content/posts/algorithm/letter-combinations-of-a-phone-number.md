---
title: "电话号码的字母组合：按数字位回溯"
publishDate: "2026-11-20T12:00:00+08:00"
description: "LeetCode 17 电话号码的字母组合：将按键映射建模为多集合笛卡尔积，解析空输入边界、定深字符缓冲区回溯与迭代逐层展开，对比 Python 与 C++ 实现。"
tags: ["algorithm", "backtracking", "python", "cpp"]
---

[LeetCode 17. 电话号码的字母组合](https://leetcode.cn/problems/letter-combinations-of-a-phone-number/)（Hot 100）给定一个仅包含数字 `2` 到 `9` 的字符串 `digits`，要求返回所有它能表示的字母组合，顺序任意。数字到字母的映射与传统九宫格电话按键一致：`2` 对应 `"abc"`，`3` 对应 `"def"`，`4` 对应 `"ghi"`，`5` 对应 `"jkl"`，`6` 对应 `"mno"`，`7` 对应 `"pqrs"`，`8` 对应 `"tuv"`，`9` 对应 `"wxyz"`。题目保证 $0 \le \lvert\text{digits}\rvert \le 4$。

## 从单数组子集到多集合笛卡尔积

在[《子集：递增下标回溯与位掩码枚举》](/posts/algorithm/subsets/)和[《全排列：访问标记数组与原地交换分区》](/posts/algorithm/permutations/)中，每一层递归都是从**同一个输入数组**里挑选元素，因此需要用 `start` 下标或 `used` 数组来避免重复选用同一位置。

本题的搜索结构更为规整：第 `index` 层递归只负责为 `digits[index]` 挑选一个对应字母，不同层面对的是各自独立的字符集合 $S_{\text{index}}$。所有可能结果正是这些字符集合的**笛卡尔积**：

$$
S_0 \times S_1 \times \cdots \times S_{n-1}.
$$

因此递归不需要 `used` 数组，也不需要考虑同层或跨层的去重；只需要一个层号 `index`，当 `index == n` 时，把长度为 $n$ 的字符缓冲区拼接成字符串加入结果即可。

### 空输入的边界处理

题目明确允许 `digits` 为空字符串 `""`，此时应返回空列表 `[]`，而不是 `[""]`。如果直接从 `index = 0` 启动回溯且不做前置拦截，`0 == len("")` 会立即触发叶子收集，错误地把空串 `""` 放进结果集。因此在入口处必须单独判断 `if not digits: return []`。

## Python：共享字符列表与定深回溯

Python 字符串是不可变对象[^python-str]，如果在递归参数中不断写 `prefix + ch`，每次递归都会新建字符串对象。更规范的做法是维护一个共享的 `list[str]` 缓冲区 `path`，进入下一层前 `append(ch)`、返回后 `pop()`，仅在到达叶子节点时执行一次 `"".join(path)` 生成结果字符串：

```python
class Solution:
    _PHONE_MAP: dict[str, str] = {
        "2": "abc",
        "3": "def",
        "4": "ghi",
        "5": "jkl",
        "6": "mno",
        "7": "pqrs",
        "8": "tuv",
        "9": "wxyz",
    }

    def letterCombinations(self, digits: str) -> list[str]:
        # Time complexity: O((m + k) * 3^m * 4^k)
        # Space complexity: O(m + k) auxiliary space (excluding output)
        if not digits:
            return []

        n = len(digits)
        result: list[str] = []
        path: list[str] = []

        def backtrack(index: int) -> None:
            if index == n:
                result.append("".join(path))
                return

            for ch in self._PHONE_MAP[digits[index]]:
                path.append(ch)
                backtrack(index + 1)
                path.pop()

        backtrack(0)
        return result
```

## C++：查表数组与定长字符串缓冲区

在 C++ 中，`std::string` 是可变的连续字符序列[^cpp-string]，不需要额外的 `std::vector<char>`，甚至连 `push_back` / `pop_back` 都可以省略——因为结果字符串的长度固定为 $n = \lvert\text{digits}\rvert$，预先构造长度为 $n$ 的缓冲区 `path(n, '\0')`，在第 `index` 层直接覆写 `path[index] = ch` 即可。

数字 `'2'` 到 `'9'` 连续分布，用 `std::array<std::string_view, 8>` 按 `digits[index] - '2'` 直接索引，比哈希表查找更轻量[^cpp-array]：

```cpp
#include <array>
#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

class Solution {
    static constexpr std::array<std::string_view, 8> kPhoneMap = {
        "abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"
    };

    void backtrack(std::string_view digits,
                   std::size_t index,
                   std::string& path,
                   std::vector<std::string>& result) const {
        if (index == digits.size()) {
            result.push_back(path);
            return;
        }

        const std::string_view letters = kPhoneMap[digits[index] - '2'];
        for (char ch : letters) {
            // Fixed-length buffer: overwriting path[index] avoids push_back/pop_back.
            path[index] = ch;
            backtrack(digits, index + 1, path, result);
        }
    }

public:
    std::vector<std::string> letterCombinations(const std::string& digits) const {
        // Time complexity: O((m + k) * 3^m * 4^k)
        // Space complexity: O(m + k) auxiliary space (excluding output)
        if (digits.empty()) {
            return {};
        }

        std::size_t total = 1;
        for (char d : digits) {
            total *= kPhoneMap[d - '2'].size();
        }

        std::vector<std::string> result;
        result.reserve(total);
        std::string path(digits.size(), '\0');
        backtrack(digits, 0, path, result);
        return result;
    }
};
```

这里为什么不需要手动恢复 `path[index]`？因为每次循环都会立即把 `path[index]` 覆盖为当前分支的新字母，而父层只会读取或收集下标 `[0, index - 1]` 之前已经定好的字符，不会依赖尚未写入的后缀槽位。这种“定长缓冲区按位覆写”的技巧在深度固定的回溯题里非常干净，能少做一半边界操作。

## 复杂度分析与迭代展开对比

设 `digits` 中对应 3 个字母的数字（`2, 3, 4, 5, 6, 8`）出现 $m$ 次，对应 4 个字母的数字（`7, 9`）出现 $k$ 次，总长度 $n = m + k$。合法组合的总数为：

$$
T = 3^m \cdot 4^k.
$$

- **时间复杂度**：共有 $T$ 个长度为 $n$ 的结果字符串需要构造并写入输出数组，内部节点数不超过 $T$，总时间为 $O(n \cdot 3^m \cdot 4^k)$（按最坏每键 4 个字母可粗略写作 $O(n \cdot 4^n)$）。
- **辅助空间复杂度**：回溯只维护深度为 $n$ 的调用栈与长度为 $n$ 的共享路径缓冲区，不含输出时为 $O(n) = O(m + k)$。

本题也可以用**迭代逐层展开**（广度优先）完成：初始令队列 `queue = [""]`，每读入一个数字，就把当前队列里的所有前缀分别拼上该数字对应的 3 或 4 个字母生成下一层。两者时间复杂度同阶，但迭代展开需要同时在内存中保存整一层中间前缀，最后一层之前的中间列表会占用 $O(3^m \cdot 4^k)$ 级别的额外空间，而深度优先回溯只在栈上保留一条路径，辅助空间仅为 $O(m + k)$。

| 方案 | 时间复杂度 | 辅助空间（不含输出） | 核心机制 |
| :--- | :--------- | :------------------- | :------- |
| 深度优先回溯 | $O((m + k) \cdot 3^m \cdot 4^k)$ | $O(m + k)$ | 单路径缓冲区沿深度推进，叶子处一次性生成结果 |
| 迭代逐层展开（BFS） | $O((m + k) \cdot 3^m \cdot 4^k)$ | $O((m + k) \cdot 3^m \cdot 4^k)$ | 逐个数字对已有前缀做笛卡尔积扩张 |

[^python-str]: [Python 文档：Text Sequence Type — `str`](https://docs.python.org/3/library/stdtypes.html#text-sequence-type-str)——字符串不可变，循环拼接会反复分配新对象；用列表收集字符后调用 `str.join` 可避免中间拷贝。

[^cpp-string]: [cppreference：`std::basic_string`](https://en.cppreference.com/w/cpp/string/basic_string.html)——连续可变字符序列，支持按索引常数时间覆写。

[^cpp-array]: [cppreference：`std::array`](https://en.cppreference.com/w/cpp/container/array.html)——编译期固定长度数组，配合 `std::string_view` 实现零堆分配静态映射表。
