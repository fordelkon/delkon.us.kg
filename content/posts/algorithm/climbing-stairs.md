---
title: "爬楼梯：状态转移矩阵与一维滚动变量"
publishDate: "2026-11-04T10:00:00+08:00"
description: "LeetCode 70 爬楼梯：按最后一步推导线性递推，比较记忆化与双变量滚动，再用转移矩阵计算快速幂，并说明数值范围。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 70. 爬楼梯](https://leetcode.cn/problems/climbing-stairs/)要求计算登上具有 $n$ 阶台阶（$1 \le n \le 45$）的楼梯有多少种互不相同的走法；每次只允许向上跨越 1 阶或 2 阶。例如 $n = 3$ 时，有 $1+1+1$、$1+2$、$2+1$ 共 3 种方案。本题在组合数学上对应正整数的**有序拆分**（compositions），先跨 1 阶再跨 2 阶与先 2 后 1 属于不同方案。下面先按最后一步推导递推式，再比较记忆化、滚动变量和矩阵快速幂的计算方式。

## 状态空间拓扑与无后效性

设到达第 $i$ 阶台阶的不同走法总数为 $dp[i]$。由于每一步的最大跨度为 2，到达第 $i$ 阶台阶的最后一步只能且必然来自两个互斥的前驱位置：

1. 从第 $i - 1$ 阶台阶迈上 1 阶到达；
2. 从第 $i - 2$ 阶台阶跨越 2 阶到达。

因为这两类最后一步的决策互斥且穷尽了到达第 $i$ 阶的所有可能，根据加法原理，到达第 $i$ 阶的方案总数严格等于两者之和：

$$
dp[i] = dp[i - 1] + dp[i - 2], \qquad i \ge 3.
$$

边界条件由物理定义直接给出：$dp[1] = 1$（仅能迈 1 步），$dp[2] = 2$（迈两次 1 步或一次 2 步）。若虚拟引入 $dp[0] = 1$，则该数列恰好对应平移一阶的斐波那契序列。

与后续探讨带权最优化的[《打家劫舍：互斥状态机与双变量滚动轮转》](/posts/algorithm/house-robber/)不同，本题属于计数问题，不涉及最值选取，无需套用“最优子结构”。可复用的是**重叠子问题**（overlapping subproblems）与充分的状态描述：后续合法走法只取决于当前台阶，过去的走法通过计数汇总即可。动态规划的一般背景可参见 CLRS 的相应章节[^clrs-dp]；上面的互斥分类给出了本题递推的直接证明。

## 从记忆化递归到自底向上拓扑序

求解该递推式有两种常见的求值顺序：

1. **自顶向下带记忆递归**：从目标 $n$ 出发反向递归展开子问题 $n - 1$ 与 $n - 2$。正如[《从调用栈理解递归》中的记忆化复用重复子问题分析](/posts/understanding-recursion/#记忆化复用重复子问题的结果)所述，纯递归会导致相同子问题被反复计算指数次（复杂度高达 $O(2^n)$）；引入**备忘录**（memoization）缓存已求得的中间状态后，每个状态仅计算一次，时间复杂度降至 $O(n)$，辅助空间为递归深度与缓存数组占用的 $O(n)$。
2. **自底向上递推**：沿[《从调用栈理解递归》中的递推思路](/posts/understanding-recursion/#从记忆化到自底向上递推)，按 $i = 3, 4, \dots, n$ 升序计算，省去递归调用栈。计算 $dp[i]$ 只需 $dp[i - 1]$ 与 $dp[i - 2]$，更早的历史值不再参与后续转移。

因此无需保留完整数组，两个滚动变量即可保存下一步需要的状态，辅助空间为 $O(1)$。

## Python：双变量滚动实现

Python 多重赋值会先求出右侧两个表达式，再依次绑定左侧变量，因此加法读到的都是更新前的值[^python-assignment]：

```python
class Solution:
    def climbStairs(self, n: int) -> int:
        if n <= 2:
            return n

        prev, curr = 1, 2
        for _ in range(3, n + 1):
            # Loop invariant: at the start of iteration for step i,
            # prev == dp[i - 2] and curr == dp[i - 1].
            prev, curr = curr, prev + curr

        return curr
```

设台阶总数为 $n$。循环体执行 $n - 2$ 次，每次仅涉及标量加法与赋值，总时间复杂度为 $O(n)$；除常量局部引用外不分配任何额外容器，辅助空间为 $O(1)$。

## C++：双变量轮转与矩阵快速幂

在 C++ 中，滚动轮转可使用基础局部变量完成。对于 $n \le 45$，第 45 阶的结果 $dp[45] = 1\,836\,311\,903$，严格处于 32 位有符号整型上限 $2^{31} - 1 = 2\,147\,483\,647$ 范围内，运算过程无溢出风险。

### 滚动轮转实现

```cpp
class Solution {
public:
    int climbStairs(int n) {
        if (n <= 2) {
            return n;
        }

        // Base cases: dp[1] = 1, dp[2] = 2.
        int prev = 1;
        int curr = 2;

        for (int i = 3; i <= n; ++i) {
            // Loop invariant: prev == dp[i - 2] and curr == dp[i - 1].
            // For n <= 45, dp[45] = 1,836,311,903, which safely fits in a 32-bit signed int.
            int next = prev + curr;
            prev = curr;
            curr = next;
        }

        return curr;
    }
};
```

该算法同样以 $O(n)$ 时间和 $O(1)$ 辅助空间完成计算，无任何动态内存分配。

### 矩阵快速幂加速至对数时间

如果输入规模 $n$ 进一步扩大（例如 $n \le 10^9$ 且答案对固定整数取模），线性递推的操作次数可能过多。由于转移方程属于常系数线性齐次递推，可以将其改写为状态转移矩阵相乘的形式：

$$
\begin{bmatrix}
dp[i] \\
dp[i - 1]
\end{bmatrix}
=
\begin{bmatrix}
1 & 1 \\
1 & 0
\end{bmatrix}
\begin{bmatrix}
dp[i - 1] \\
dp[i - 2]
\end{bmatrix}.
$$

以此类推，展开 $n - 2$ 次矩阵乘法可得：

$$
\begin{bmatrix}
dp[n] \\
dp[n - 1]
\end{bmatrix}
=
\begin{bmatrix}
1 & 1 \\
1 & 0
\end{bmatrix}^{n - 2}
\begin{bmatrix}
dp[2] \\
dp[1]
\end{bmatrix}
=
\begin{bmatrix}
1 & 1 \\
1 & 0
\end{bmatrix}^{n - 2}
\begin{bmatrix}
2 \\
1
\end{bmatrix}.
$$

定义转移矩阵 $M = \begin{bmatrix} 1 & 1 \\ 1 & 0 \end{bmatrix}$。借助**快速幂算法**（binary exponentiation），计算 $M^{n - 2}$ 仅需将指数按二进制拆分，进行 $O(\log n)$ 次 $2 \times 2$ 矩阵乘法，每次乘法仅花费常数时间，从而将渐进时间复杂度从 $O(n)$ 压缩至 $O(\log n)$，辅助空间维持在 $O(1)$。

下面仍实现原题 $1 \le n \le 45$ 的精确答案；它没有取模，不能直接用于前述大规模扩展。复杂度按固定宽度算术计；若计算不受限的精确大整数，需另计整数位数。

```cpp
#include <array>

class Solution {
private:
    using Matrix2x2 = std::array<std::array<long long, 2>, 2>;

    // Multiplies two 2x2 matrices: c = a * b.
    static Matrix2x2 multiply(const Matrix2x2& a, const Matrix2x2& b) {
        Matrix2x2 c{{{0, 0}, {0, 0}}};
        for (int i = 0; i < 2; ++i) {
            for (int k = 0; k < 2; ++k) {
                for (int j = 0; j < 2; ++j) {
                    c[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return c;
    }

    // Computes base^exp in O(log exp) time via binary exponentiation.
    static Matrix2x2 matrixPower(Matrix2x2 base, int exp) {
        Matrix2x2 result{{{1, 0}, {0, 1}}}; // 2x2 identity matrix I_2
        while (exp > 0) {
            if (exp & 1) {
                result = multiply(result, base);
            }
            exp >>= 1;
            // Avoid redundant squaring on the final iteration when exp reaches 0.
            if (exp > 0) {
                base = multiply(base, base);
            }
        }
        return result;
    }

public:
    int climbStairs(int n) {
        if (n <= 2) {
            return n;
        }

        Matrix2x2 m{{{1, 1}, {1, 0}}};
        Matrix2x2 power = matrixPower(m, n - 2);

        // [dp[n], dp[n-1]]^T = M^(n-2) * [dp[2], dp[1]]^T
        long long ans = power[0][0] * 2 + power[0][1] * 1;
        return static_cast<int>(ans);
    }
};
```

矩阵法减少了递推所需的算术操作次数，但每次矩阵乘法的工作更多；本题不需要据此宣称它比双变量循环更快。两种实现均只返回计数，不修改外部输入。

| 求解策略             | 时间复杂度  | 额外空间复杂度 | 核心机制与代价权衡                                                                 |
| :------------------- | :---------- | :------------- | :--------------------------------------------------------------------------------- |
| **自顶向下记忆化**   | $O(n)$      | $O(n)$         | 状态展开直观，但受限于递归调用栈深度与哈希/数组缓存开销                            |
| **自底向上滚动变量** | $O(n)$      | $O(1)$         | 按递推顺序迭代，只保留相邻两项                                                     |
| **矩阵快速幂加速**   | $O(\log n)$ | $O(1)$         | 基于齐次线性递推矩阵形式，在大规模 $n$（如 $n \le 10^9$ 且取模）下操作数降为对数级 |

[^clrs-dp]: [CLRS 4th ed. Chapter 14: Dynamic Programming](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——介绍动态规划的重叠子问题与自底向上求值；本题的计数递推和矩阵形式由正文直接推导。

[^python-assignment]: [Python 语言参考：赋值语句](https://docs.python.org/3/reference/simple_stmts.html#assignment-statements)——说明先求右侧表达式，再从左到右对目标赋值；不提供并发原子性保证。
