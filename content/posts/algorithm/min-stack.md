---
title: "最小栈：随入栈记录前缀最小值"
publishDate: "2026-12-05T12:00:00+08:00"
description: "LeetCode 155 最小栈：利用栈仅在顶部增删的特性维护前缀最小值，实现 push、pop、top 与 getMin 全 O(1)，并分析单栈差值编码在 32 位整型下的溢出风险。"
tags: ["algorithm", "stack", "python", "cpp"]
---

[LeetCode 155. 最小栈](https://leetcode.cn/problems/min-stack/)（Hot 100）要求设计一个支持 `push(val)`、`pop()`、`top()` 操作，并能在**常数时间 $O(1)$** 内检索到栈中最小元素 `getMin()` 的栈。题目保证 `val` 在 32 位有符号整数范围内（$[-2^{31}, 2^{31} - 1]$），且 `pop`、`top`、`getMin` 仅在非空栈上调用，总操作次数不超过 $3 \times 10^4$。

## 栈前缀不变式：为什么不需要堆？

如果数据结构支持任意位置删除，动态维护最小值通常需要二叉堆（单次操作 $O(\log n)$）。但栈只允许在**栈顶**做后进先出的压入与弹出——只要一个元素 `x` 还在栈中，位于 `x` 下方的所有历史元素就一定都在栈中，且永远不会比 `x` 更早出栈。

这意味着：**当栈顶停在下标 $k$ 时，当前栈的最小值完全由前缀 `stack[0..k]` 唯一决定**。在压入第 $k$ 个元素 `val` 的瞬间，只要把该时刻对应的前缀最小值

$$
m_k = \min(m_{k - 1}, \text{val})
$$

与 `val` 同步记录下来，弹出栈顶时连同 $m_k$ 一起撤销，新栈顶下方保存的 $m_{k - 1}$ 就立刻恢复为剩余元素的真实最小值。

## Python：同步前缀最小值对

将 `(val, current_min)` 打包成二元组存入单个列表（或维护两个等长列表），所有接口均在常数时间内完成[^python-list-complexity]：

```python
class MinStack:
    def __init__(self) -> None:
        # Each entry stores (value, minimum value across the prefix up to this entry).
        self._stack: list[tuple[int, int]] = []

    def push(self, val: int) -> None:
        # Time complexity: O(1) amortized
        cur_min = val if not self._stack else min(val, self._stack[-1][1])
        self._stack.append((val, cur_min))

    def pop(self) -> None:
        # Time complexity: O(1)
        self._stack.pop()

    def top(self) -> int:
        # Time complexity: O(1)
        return self._stack[-1][0]

    def getMin(self) -> int:
        # Time complexity: O(1)
        return self._stack[-1][1]
```

## C++：压缩辅助最小栈

如果希望在连续压入大量比当前最小值更大的元素时减少冗余存储，可以用两个 `std::vector<int>`：主栈 `data_` 正常存放全部元素，辅助栈 `mins_` **仅在 `mins_.empty() || val <= mins_.back()` 时压入**；弹出时仅当 `data_.back() == mins_.back()` 才同步弹出 `mins_`[^cpp-vector]。

注意判断条件必须是 **`<=`** 而非 `<`：若连续压入两次相同的最小值（例如 `push(0)`、`push(-2)`、`push(-2)`）只记了一次，第一次 `pop()` 就会把 `mins_` 里的 `-2` 弹空，导致 `getMin()` 丢失仍在主栈中的另一个 `-2`。

```cpp
#include <vector>

class MinStack {
    std::vector<int> data_;
    // Stores non-increasing prefix minima; duplicates of the current minimum are retained.
    std::vector<int> mins_;

public:
    MinStack() = default;

    void push(int val) {
        data_.push_back(val);
        if (mins_.empty() || val <= mins_.back()) {
            mins_.push_back(val);
        }
    }

    void pop() {
        if (data_.back() == mins_.back()) {
            mins_.pop_back();
        }
        data_.pop_back();
    }

    int top() const {
        return data_.back();
    }

    int getMin() const {
        return mins_.back();
    }
};
```

## 复杂度分析、单栈差值编码陷阱与专题对照

- **时间复杂度**：`push`（均摊）、`pop`、`top`、`getMin` 均为 $O(1)$。
- **空间复杂度**：设栈内当前元素个数为 $n$，同步二元组写法与压缩辅助栈最坏情况下（严格递减序列入栈）均占 $O(n)$ 辅助空间。

面试中偶尔会出现一种“单栈 $O(1)$ 额外空间”的**差值编码**技巧：栈里只存 `diff = val - min_val`，并用单个变量 `min_val` 记录当前最小值（`diff < 0` 表示刚更新了新最小值，弹栈时通过 `min_val - diff` 反推旧最小值）。这种做法在 C++ 中存在一个隐蔽陷阱：题目允许 `val` 取到整个 32 位 `int` 范围，当 `val = INT_MAX` 且 `min_val = INT_MIN` 时，`val - min_val` 会超出 32 位有符号整型上限触发**有符号溢出未定义行为**[^cpp-overflow]；必须把栈元素类型拓宽到 64 位 `std::int64_t` 才能安全存储差值——而把每个 32 位 `int` 拓宽成 64 位 `int64_t` 实际消耗的内存，与直接存两个 32 位 `int` 的同步最小栈完全相同。因此工程上直接采用同步前缀最小栈或压缩辅助栈更清晰、安全。

| 方案 | 操作时间 | 最坏辅助空间 | C++ 32 位溢出风险 | 工程推荐度 |
| :--- | :------- | :----------- | :---------------- | :--------- |
| 同步前缀最小栈 / `(val, min)` | 全 $O(1)$ | $O(n)$ | 无 | 逻辑最直接，首选 |
| 压缩辅助最小栈（`<=` 入栈） | 全 $O(1)$ | $O(n)$（随机序列远小于 $n$） | 无 | 节省实际内存，首选 |
| 单栈差值编码（64 位 `diff`） | 全 $O(1)$ | $O(n)$（位宽翻倍） | 用 32 位会溢出，需 64 位 | 技巧性强但无真实空间优势 |

在栈专题中，[《有效的括号：把期望的右括号压栈》](/posts/algorithm/valid-parentheses/)利用栈维护嵌套结构，[《每日温度：用单调栈找下一次升温》](/posts/algorithm/daily-temperatures/)与[《滑动窗口最大值：单调双端队列与过期下标》](/posts/algorithm/sliding-window-maximum/)利用单调性淘汰弱候选；本题则展示了栈的另一类核心用法——**将前缀聚合信息绑定到栈帧生命周期上**，实现历史状态的常数时间回滚。

[^python-list-complexity]: [Python Wiki：TimeComplexity](https://wiki.python.org/moin/TimeComplexity)——列表尾部 `append()` 与 `pop()` 均摊时间为 $O(1)$。

[^cpp-vector]: [cppreference：`std::vector`](https://en.cppreference.com/w/cpp/container/vector.html)——连续内存动态数组，支持尾部均摊 $O(1)$ 插入与常数时间弹出、访问末尾元素。

[^cpp-overflow]: [C++ 工作草案：表达式前言](https://eel.is/c++draft/expr.pre)——规定有符号整数算术超出类型可表示范围时触发未定义行为。
