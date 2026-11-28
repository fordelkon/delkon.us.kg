---
title: "字符串解码：用显式栈保存外层上下文"
publishDate: "2026-12-06T12:00:00+08:00"
description: "LeetCode 394 字符串解码：把形如 k[encoded_string] 的嵌套重复文法映射为显式栈帧，解析遇到左括号保存外层上下文、遇到右括号回退拼接的执行流程。"
tags: ["algorithm", "stack", "python", "cpp"]
---

[LeetCode 394. 字符串解码](https://leetcode.cn/problems/decode-string/)（Hot 100）给定一个经过编码的字符串 `s`，编码规则为 `k[encoded_string]`，表示方括号内部的 `encoded_string` 正好重复 `k` 次（$k$ 为正整数），且允许任意层嵌套，例如 `"3[a2[c]]"` 解码为 `"accaccacc"`，`"2[abc]3[cd]ef"` 解码为 `"abcabccdcdcdef"`。题目保证输入始终有效，原始数据不含数字，且编码后的串长不超过 30，输出长度不超过 $10^5$。

## 为什么本题是“显式栈模拟调用栈”的教科书范例

在[《从调用栈理解递归》](/posts/understanding-recursion/#显式栈与继续执行的位置)中我们总结过：当一个嵌套结构需要“先暂停外层工作、进入内层求值、返回后再把内层结果拼回外层”时，递归调用栈隐式保存的正是**暂停前的外层局部状态**。

观察 `"a3[b2[c]d]"` 的解码过程：

1. 读到 `'a'`，外层已累积前缀 `curr = "a"`；
2. 读到数字 `3` 和 `'['`——此时必须暂停外层拼接，先去解方括号内部的子串；暂停前需要保存两项外层上下文：**已拼好的外层前缀 `"a"`** 与 **待应用的重复次数 `3`**；
3. 进入内层后，将当前缓冲清空（`curr = ""`、`num = 0`），继续按完全相同的规则解码；
4. 遇到 `']'` 时，内层子串已经完整落在 `curr` 中。弹出栈顶保存的 `(prev_str, repeat_count)`，将当前内层结果重复 `repeat_count` 次拼到 `prev_str` 后面，即 `curr = prev_str + curr * repeat_count`，恢复为外层当前前缀。

与[《有效的括号：把期望的右括号压栈》](/posts/algorithm/valid-parentheses/)相比，括号匹配只需要在栈里记住“尚未闭合的括号符号”，而字符串解码把外层尚未完成的字符串前缀与倍率一并压入栈帧，完整演示了栈如何保存挂起的计算上下文。

### 多位数字的累积

重复次数 `k` 可以是多位数（如 `"100[leetcode]"`），因此遇到数字字符 `'0'..'9'` 时，不能只取单个字符，而要按十进制进位累积：`num = num * 10 + (ch - '0')`。遇到 `'['` 将 `num` 压栈后，必须立刻将其重置为 `0`。

## Python：上下文元组栈与列表拼接

在 Python 中，用 `list[str]` 作为当前层的字符片段缓冲区（而非在循环里反复执行 `curr += ch` 复制不可变字符串），在遇到 `'['` 时将 `(curr_chars, num)` 压栈；遇到 `']'` 时用 `"".join(curr_chars)` 拼出内层子串，重复 `repeat` 次后追加回外层列表[^python-str]：

```python
class Solution:
    def decodeString(self, s: str) -> str:
        # Time complexity: O(L_out), where L_out is the decoded string length
        # Space complexity: O(L_out) auxiliary space for stacked prefix fragments
        stack: list[tuple[list[str], int]] = []
        curr: list[str] = []
        num = 0

        for ch in s:
            if ch.isdigit():
                num = num * 10 + int(ch)
            elif ch == "[":
                # Suspend outer context before entering the nested bracket scope.
                stack.append((curr, num))
                curr = []
                num = 0
            elif ch == "]":
                prev_chars, repeat = stack.pop()
                segment = "".join(curr)
                prev_chars.append(segment * repeat)
                curr = prev_chars
            else:
                curr.append(ch)

        return "".join(curr)
```

## C++：双栈分离上下文与预留容量拼接

C++ 的 `std::string` 是可变连续缓冲区[^cpp-string]，可以在遇到 `']'` 时预先 `prev.reserve(prev.size() + curr.size() * repeat)`，避免循环追加重复片段时触发多次扩容，随后用 `std::move` 接管 `prev` 回到 `curr`：

```cpp
#include <cctype>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

class Solution {
public:
    std::string decodeString(std::string_view s) const {
        // Time complexity: O(L_out), where L_out is the decoded string length
        // Space complexity: O(L_out) auxiliary space
        std::vector<std::pair<std::string, int>> stack;
        std::string curr;
        int num = 0;

        for (char ch : s) {
            if (std::isdigit(static_cast<unsigned char>(ch))) {
                num = num * 10 + (ch - '0');
            } else if (ch == '[') {
                stack.emplace_back(std::move(curr), num);
                curr.clear();
                num = 0;
            } else if (ch == ']') {
                auto [prev, repeat] = std::move(stack.back());
                stack.pop_back();
                prev.reserve(prev.size() + curr.size() * static_cast<std::size_t>(repeat));
                for (int i = 0; i < repeat; ++i) {
                    prev.append(curr);
                }
                curr = std::move(prev);
            } else {
                curr.push_back(ch);
            }
        }

        return curr;
    }
};
```

注意在 C++ 中对 `std::isdigit` 传入 `char` 之前应先转换为 `unsigned char`，防止在 `char` 为有符号类型的平台上遇到负值字节引发未定义行为[^cpp-isdigit]。`std::move(curr)` 后调用 `curr.clear()` 可明确将其重置为空串以便内层复用[^cpp-move]。

## 复杂度分析与递归下降对比

设输入长度为 $n$，解码后的最终输出长度为 $L_{\text{out}}$。

- **时间复杂度**：扫描输入字符串耗时 $O(n)$；每次 `']'` 处把当前子串按倍率展开，嵌套展开生成的字符都会成为最终输出的一部分（题目保证 $k \ge 1$，不存在 `0[...]` 丢弃大量中间工作的情况），总写入字符数与 $L_{\text{out}}$ 同阶，时间复杂度为 $O(n + L_{\text{out}})$。
- **辅助空间复杂度**：栈中各层暂存的已解码前缀片段总字符数不超过 $L_{\text{out}}$，辅助空间为 $O(L_{\text{out}})$。

本题也可以用**递归下降解析**（recursive descent）实现：维护共享扫描下标 `idx`，每遇到 `'['` 就递归调用自身解析到配对的 `']'` 并返回内层子串。递归下降与本文显式栈时间、空间复杂度完全相同；区别在于显式栈把挂起的上下文保存在堆内存中，即使嵌套深度极大也不会耗尽线程调用栈。

[^python-str]: [Python 文档：Text Sequence Type — `str`](https://docs.python.org/3/library/stdtypes.html#text-sequence-type-str)——用列表暂存片段并在闭合处调用 `str.join`，避免逐字符拼接不可变字符串带来的二次拷贝。

[^cpp-string]: [cppreference：`std::basic_string`](https://en.cppreference.com/w/cpp/string/basic_string.html)——支持 `reserve()` 与 `append()`，在已知重复次数时可一次预留目标长度。

[^cpp-isdigit]: [cppreference：`std::isdigit`](https://en.cppreference.com/w/cpp/string/byte/isdigit.html)——要求实参可表示为 `unsigned char` 或等于 `EOF`，否则行为未定义。

[^cpp-move]: [cppreference：`std::move`](https://en.cppreference.com/w/cpp/utility/move.html)——移动后对象处于有效但未指定状态，复用前调用 `clear()` 保证回到确定的空串状态。
