---
title: "有效的括号：把期望的右括号压栈"
publishDate: "2026-12-04T12:00:00+08:00"
description: "LeetCode 20 有效的括号：用后进先出栈维护最近未闭合的左括号，分析奇数长度快速剪枝与压入期望右括号的简化写法，并串联最长有效括号与括号生成。"
tags: ["algorithm", "stack", "python", "cpp"]
---

[LeetCode 20. 有效的括号](https://leetcode.cn/problems/valid-parentheses/)（Hot 100）给定一个只包含 `'('`、`')'`、`'{'`、`'}'`、`'['`、`']'` 的字符串 `s`，判断字符串是否有效。有效字符串必须满足：左括号必须用相同类型的右括号闭合，且必须以正确的嵌套顺序闭合。题目保证 $1 \le \lvert s\rvert \le 10^4$。

## 为什么计数器不够，必须用后进先出栈

如果字符串中只有一种括号（例如[《括号生成：用左右括号计数剪枝》](/posts/algorithm/generate-parentheses/)与[《最长有效括号：前驱配对回溯、显式栈与双向扫描》](/posts/algorithm/longest-valid-parentheses/)），仅用计数器跟踪“未匹配的左括号数量”就足以判定整串是否合法。

一旦引入三种括号，仅统计各自数量就会在**交叉嵌套**上失效：反例 `"([)]"` 中圆括号与方括号各自平衡，但内层的 `'['` 尚未闭合就先出现了 `')'`，破坏了嵌套结构。任何合法嵌套都遵守**最近打开的左括号必须最先闭合**（Last-In, First-Out, LIFO）原则，因此栈是天然匹配的抽象数据结构[^python-stack]。

### 快速剪枝与压入“期望右括号”

进入扫描前有一个零成本剪枝：有效括号串必然成对出现，若 `len(s)` 为奇数，可直接返回 `False`。

扫描过程中有两种等价的压栈方式：

1. **压入左括号 + 映射查表**：遇到左括号压栈；遇到右括号时检查栈非空且栈顶恰好是对应的左括号。
2. **压入期望右括号**：遇到 `'('` 时直接压入 `')'`，遇到 `'['` 压入 `']'`，遇到 `'{'` 压入 `'}'`。之后遇到任意右括号时，只需检查 `stack` 非空且 `stack.pop() == ch`，省去了右括号分支里的哈希表查找。

扫描结束时，必须检查 `stack` **为空**——否则像 `"((("` 这样残留未闭合左括号的输入会被误判为有效。

## Python：字典映射与单趟校验

```python
class Solution:
    def isValid(self, s: str) -> bool:
        # Time complexity: O(n)
        # Space complexity: O(n) auxiliary space
        if len(s) % 2 == 1:
            return False

        pairs = {")": "(", "]": "[", "}": "{"}
        stack: list[str] = []

        for ch in s:
            if ch in pairs:
                # Right bracket must match the most recently opened left bracket.
                if not stack or stack[-1] != pairs[ch]:
                    return False
                stack.pop()
            else:
                stack.append(ch)

        return not stack
```

## C++：压入期望右括号与 `std::string` 轻量栈

在 C++ 中，用 `std::string`（或 `std::vector<char>`）充当字符栈比默认以 `std::deque` 为底层的 `std::stack<char>` 更紧凑且缓存局部性更好[^cpp-stack]。下面采用压入期望右括号的写法，无需构造任何哈希表：

```cpp
#include <string>
#include <string_view>

class Solution {
public:
    bool isValid(std::string_view s) const {
        // Time complexity: O(n)
        // Space complexity: O(n) auxiliary space
        if (s.size() % 2 == 1) {
            return false;
        }

        std::string expected;
        expected.reserve(s.size() / 2);

        for (char ch : s) {
            if (ch == '(') {
                expected.push_back(')');
            } else if (ch == '[') {
                expected.push_back(']');
            } else if (ch == '{') {
                expected.push_back('}');
            } else {
                if (expected.empty() || expected.back() != ch) {
                    return false;
                }
                expected.pop_back();
            }
        }

        return expected.empty();
    }
};
```

## 复杂度分析与括号家族串联

每个字符至多入栈一次、出栈一次，结合列表或 `std::string` 尾部的均摊 $O(1)$ 追加与弹出[^python-list-complexity]，时间复杂度为 $O(n)$；当输入全为左括号时栈深达 $n$，最坏辅助空间为 $O(n)$。

| 题目 | 括号种类 | 核心问题 | 栈内保存内容 |
| :--- | :------- | :------- | :----------- |
| 有效的括号（本题，LC 20） | 3 种 | 判断整串是否合法 | 未闭合左括号（或期望右括号）字符 |
| [最长有效括号](/posts/algorithm/longest-valid-parentheses/)（LC 32） | 1 种 | 求最长连续有效子串长度 | 哨兵断点与未匹配左括号的**下标** |
| [括号生成](/posts/algorithm/generate-parentheses/)（LC 22） | 1 种 | 枚举全部合法组合 | 隐式调用栈维护前缀计数不变式 |
| [字符串解码](/posts/algorithm/decode-string/)（LC 394） | 方括号嵌套 | 按倍率展开嵌套子串 | 外层上下文 `(prev_str, repeat_count)` |

[^python-stack]: [Python 文档：将列表当作栈使用](https://docs.python.org/3/tutorial/datastructures.html#using-lists-as-stacks)——通过列表末尾的 `append()` 与 `pop()` 实现后进先出栈。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——CPython 列表末尾追加与弹出的均摊时间复杂度为 $O(1)$。

[^cpp-stack]: [cppreference：`std::stack`](https://en.cppreference.com/w/cpp/container/stack.html)——`std::stack` 是容器适配器，默认底层为 `std::deque`；对纯字符栈直接使用连续存储的 `std::string` 或 `std::vector<char>` 可避免分段块分配。
