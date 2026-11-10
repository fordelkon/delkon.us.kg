---
title: "最长有效括号：前驱配对回溯、显式栈与双向扫描"
publishDate: "2026-11-05T14:00:00+08:00"
description: "LeetCode 32 的最长有效括号：用结尾状态连接已匹配的括号段，用哨兵栈统一长度计算，再解释双向计数如何补足单向扫描的盲区。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 32. 最长有效括号](https://leetcode.cn/problems/longest-valid-parentheses/)（Hot 100）给定只含 `'('` 和 `')'` 的字符串 `s`，要求返回最长有效括号子串的长度。子串必须连续。例如 `"(()"` 的答案是 2，`")()())"` 的答案是 4；空串或全为同一种括号时返回 0。设字符串长度为 $n$。

有效括号串需要同时满足两个条件：任意前缀的左括号数不少于右括号数，整段的左右括号总数相等。只有总数相等还不够，例如 `")("` 就不是有效括号串。

## 动态规划：跨越已匹配段与前缀缝合

括号可以嵌套，如 `(())`，也可以并置，如 `()()`。定义 $dp[i]$ 为**以 `s[i]` 结尾**的最长有效括号子串长度，便于同时处理这两种结构。

左括号不可能结束一个有效串，因此 `s[i] == '('` 时 $dp[i]=0$。对 $i\ge1$ 且 `s[i] == ')'` 的位置，分两种情况：

1. 前一项是 `'('`，两项直接配对，再接上以 $i-2$ 结尾的有效段：

$$
dp[i]=(dp[i-2]\text{ 若 }i\ge2\text{ 否则 }0)+2.
$$

2. 前一项是 `')'`。先跨过以 $i-1$ 结尾、长度为 $dp[i-1]$ 的已匹配段，候选左括号在：

$$
p=i-dp[i-1]-1.
$$

若 $p\ge0$ 且 `s[p] == '('`，它就能与当前右括号包住中间的有效段；再把紧邻 $p$ 左侧的有效段接上：

$$
dp[i]=dp[i-1]+2+(dp[p-1]\text{ 若 }p\ge1\text{ 否则 }0).
$$

否则保持 0。这里两个查找各有作用：`dp[i - 1]` 让我们越过内部已匹配段，`dp[p - 1]` 则连接外层括号之前的有效前缀。例如 `"()(())"` 的最后一项需要接上最前面的 `"()"`，不能只算中间包裹得到的 4。

最终答案取所有结尾状态的最大值；空串返回 0。

## Python：动态规划与前缀缝合

```python
class Solution:
    def longestValidParentheses(self, s: str) -> int:
        n = len(s)
        if n < 2:
            return 0

        # dp[i] is the longest valid substring length ending at s[i].
        dp = [0] * n
        max_len = 0
        for i in range(1, n):
            if s[i] == ')':
                if s[i - 1] == '(':
                    dp[i] = (dp[i - 2] if i >= 2 else 0) + 2
                else:
                    # Skip the matched suffix before checking its preceding character.
                    prev_match = i - dp[i - 1] - 1
                    if prev_match >= 0 and s[prev_match] == '(':
                        preceding = dp[prev_match - 1] if prev_match >= 1 else 0
                        dp[i] = dp[i - 1] + 2 + preceding

                max_len = max(max_len, dp[i])

        return max_len
```

每个位置只做常数次数组访问和运算，总时间为 $O(n)$，`dp` 占 $O(n)$ 辅助空间。

## 与接雨水比较：栈顶边界的几何含义

[《接雨水：按列结算与单调栈分层》](/posts/algorithm/trapping-rain-water/)在弹出槽底后，用新栈顶和当前柱子作为两侧边界。括号匹配也能在弹栈后计算跨度，但栈内含义不同：接雨水维护高度单调性，这里维护尚未匹配的位置。

| 操作           | 接雨水               | 最长有效括号             |
| :------------- | :------------------- | :----------------------- |
| 触发弹栈       | 更高的右柱到达       | 右括号到达               |
| 弹出项         | 槽底                 | 待匹配的左括号，或旧边界 |
| 弹出后的新栈顶 | 左侧挡水柱下标 $l$   | 最近未匹配位置 $l$       |
| 跨度           | 两柱之间宽度 $i-l-1$ | 有效括号长度 $i-l$       |

括号栈保存下标，而非字符。栈底是最近一个未匹配的右括号下标，或初始哨兵 `-1`；其上依次是尚未匹配的左括号下标。

## 显式栈模拟：哨兵断点与下标跨度

用列表末尾的 `append()` 和 `pop()` 可以实现后进先出的栈[^python-stack]。先压入 `-1`，再扫描：

1. 遇到 `'('`，压入下标。
2. 遇到 `')'`，先弹出栈顶。
   - 若栈空了，刚才弹出的是旧边界，当前右括号没有可匹配的左括号。压入当前下标，建立新边界。
   - 若栈非空，刚才弹出的是匹配的左括号。新栈顶是最近未匹配位置，右侧到当前下标之间都已匹配，长度为 $i-\text{stack.top()}$。

例如 `"()"` 扫到下标 1，弹出下标 0 后栈顶为 `-1`，长度为 $1-(-1)=2$。哨兵把从下标 0 开始的有效段也纳入了同一公式。

## Python：显式栈实现

```python
class Solution:
    def longestValidParentheses(self, s: str) -> int:
        # Bottom: unmatched right boundary (initially -1); above it: unmatched '(' indices.
        stack: list[int] = [-1]
        max_len = 0
        for i, char in enumerate(s):
            if char == '(':
                stack.append(i)
            else:
                # Pop a matching '(' or the previous boundary.
                stack.pop()
                if not stack:
                    stack.append(i)
                else:
                    max_len = max(max_len, i - stack[-1])

        return max_len
```

每个下标至多入栈一次、出栈一次。CPython 列表末尾 `append()`、`pop()` 的均摊成本为 $O(1)$[^python-list-complexity]，总时间为 $O(n)$。全为 `'('` 时栈里有 $n+1$ 项，辅助空间为 $O(n)$。

## 双向扫描：镜像计数与常数辅助空间

只求最大长度，还可以不保存下标，用两个计数器 `left` 和 `right` 分别记录当前扫描段的左右括号数。

从左向右扫描：

- 遇到 `'('` 增加 `left`，遇到 `')'` 增加 `right`。
- 两者相等时，当前段满足前缀条件且总数平衡，长度为 $2\times\mathrm{right}$。
- `right > left` 时，当前右括号成为无法跨越的断点。计数清零，下一字符作为新段起点。

正向扫描会漏掉左括号较多时的内部答案。例如 `"(()"` 从未达到计数相等，但后两项是有效串。为此再从右向左扫描：

- 仍按字符增加对应计数。
- 两者相等时，更新长度 $2\times\mathrm{left}$。
- `left > right` 时清零，下一次向左扫描从新段开始。

### 覆盖完整性证明

可以借助前面的栈匹配来说明两趟为何足够；实现本身不需要建立这个栈。将能配对的括号匹配完，剩余未匹配字符一定是若干 `')'` 在前、若干 `'('` 在后。否则若有未匹配的左括号先于未匹配的右括号，后者到达时就会弹出一个左括号，两者不可能都留下。

未匹配位置把字符串分成若干有效段，空段也允许。匹配对不会跨过未匹配位置：未匹配左括号若位于一对括号内部，会先被右端弹出；未匹配右括号到达时栈中又不可能留有能跨过它的左端。故这些有效段内部的括号都配对，任何有效子串也不能跨越未匹配位置。

取其中任意一个非空段：

1. 若其左边界是未匹配右括号或字符串开头，正向扫描就在该段开头计数为 0。段内不触发重置，到末尾两计数相等，能捕获整段。
2. 若其左边界是未匹配左括号，由于未匹配右括号都在未匹配左括号之前，右边界只能是另一个未匹配左括号或字符串末尾。反向扫描在该段右侧边界清零，从段末开始计数，到段首恰好平衡，也能捕获整段。

因此每个候选最大有效段至少被一趟扫描覆盖。两趟是互补覆盖，不是互斥划分；例如 `"()"` 两个方向都会识别。

## C++：双向扫描实现

下面要求 C++17，使用只读 `std::string_view` 视图，不复制输入字符[^cpp-string-view]。三份实现都只读输入并返回长度。

```cpp
#include <algorithm>
#include <string>
#include <string_view>

class Solution {
public:
    int longestValidParentheses(const std::string& s) {
        std::string_view sv = s;
        const int n = static_cast<int>(sv.size());
        int left = 0;
        int right = 0;
        int max_len = 0;

        // Forward: an excess ')' starts a new segment after the current position.
        for (int i = 0; i < n; ++i) {
            if (sv[i] == '(') {
                ++left;
            } else {
                ++right;
            }

            if (left == right) {
                max_len = std::max(max_len, 2 * right);
            } else if (right > left) {
                left = 0;
                right = 0;
            }
        }

        left = 0;
        right = 0;

        // Backward: reset on an excess '(' to catch segments missed by the forward scan.
        for (int i = n - 1; i >= 0; --i) {
            if (sv[i] == '(') {
                ++left;
            } else {
                ++right;
            }

            if (left == right) {
                max_len = std::max(max_len, 2 * left);
            } else if (left > right) {
                left = 0;
                right = 0;
            }
        }

        return max_len;
    }
};
```

两次扫描共访问 $2n$ 个位置，每次为常数开销，总时间为 $O(n)$。只使用视图、下标和计数器，不分配随输入增长的容器，辅助空间为 $O(1)$。

## 方案对比

| 方案     | 时间复杂度 | 辅助空间复杂度 | 核心机制                                         |
| :------- | :--------- | :------------- | :----------------------------------------------- |
| 动态规划 | $O(n)$     | $O(n)$         | 记录每个结尾的最长长度，跨过已匹配段后连接前缀   |
| 显式栈   | $O(n)$     | $O(n)$         | 哨兵统一边界，弹栈后用下标差计算长度             |
| 双向扫描 | $O(n)$     | $O(1)$         | 正向排除多余右括号，反向补足多余左括号造成的盲区 |

[^python-stack]: [Python 文档：将列表当作栈使用](https://docs.python.org/3/tutorial/datastructures.html#using-lists-as-stacks)——说明如何通过列表末尾的 `append()` 和 `pop()` 实现后进先出栈。

[^python-list-complexity]: [Python 文档：Time complexity of operations on built-in types](https://docs.python.org/3/library/time-complexity.html#time-complexity)——记录 CPython 内置类型的操作成本，列表 `append()` 和末尾 `pop()` 均摊为 $O(1)$；这一性能说明不是所有 Python 实现的语言规范保证。

[^cpp-string-view]: [C++ 标准草案：string view](https://eel.is/c++draft/string.view)——只读视图引用原字符序列而不拥有它，本文视图只在输入存活的函数调用期间使用。
