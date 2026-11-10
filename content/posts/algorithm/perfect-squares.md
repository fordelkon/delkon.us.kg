---
title: "完全平方数：完全背包最值与图广度优先"
publishDate: "2026-11-04T20:00:00+08:00"
description: "LeetCode 279 完全平方数：用动态规划和 BFS 求最少平方数数量，再结合四平方和、三平方和定理逐项判断答案，比较计算与存储成本。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 279. 完全平方数](https://leetcode.cn/problems/perfect-squares/)（Hot 100）给定一个正整数 $n$（$1 \le n \le 10^4$），要求找出若干个完全平方数（$1, 4, 9, 16, \dots$），使其相加之和等于 $n$，并返回所需完全平方数的最少数量。例如 $12=4+4+4$，答案为 3；$13=4+9$，答案为 2。

在[《零钱兑换：完全背包自底向上与不可达哨兵》](/posts/algorithm/coin-change/)中，任意给定的硬币面值可能无法拼出目标金额，必须借助不可达哨兵判定无解；而在本题中，由于 $1^2 = 1$ 天然是合法的完全平方数，任何正整数 $n$ 均可由至多 $n$ 个 1 累加而成。解空间始终非空，且最优解的上界严格受控于 $n$ 本身（$1 \le \text{ans} \le n$），因此无需引入不可达标记。

## 完全背包动态规划：以平方数自底向上递推

把平方数看作可重复选取的物品，就得到完全背包模型：

- **背包容量**：目标正整数 $n$；
- **候选物品**：所有满足 $i^2 \le n$ 的完全平方数，即物品体积为 $v_i = i^2$（$i \ge 1$）；
- **物品供应**：每个完全平方数可以无限次重复选取；
- **优化目标**：使得放入物品体积和恰好为 $n$ 的前提下，所用物品总数最少。

定义状态 $dp[j]$ 表示和为 $j$ 的最少完全平方数个数。

### 状态转移与不变式

- **基本情况**（base case）：$dp[0] = 0$，表示凑成和为 0 需要 0 个平方数。
- **初始上界**：对于所有 $1 \le j \le n$，由最坏情况（全部由 1 组成）初始化 $dp[j] = j$。这自然提供了一个紧凑的初值，规避了 `INT_MAX` 带来的溢出风险。
- **转移方程**：

$$
dp[j] = \min_{1 \le i \le \lfloor\sqrt{j}\rfloor} \big( dp[j - i^2] + 1 \big)
$$

对任意候选平方数都有 $j - i^2 < j$，所以按金额升序计算时，所有前驱的最优值已经确定。任意最优分解去掉最后一个平方数，就留下一个更小金额的最优分解；反过来，每个转移都构造出合法分解。这给出递推式的正确性，也对应最少硬币模型[^clrs-dp]。

### 复杂度分析

计算 $dp[j]$ 时内层循环迭代 $\lfloor\sqrt{j}\rfloor$ 次。上界可用 $n$ 项各至多 $\sqrt{n}$ 得到；下界只取后半段的 $\Theta(n)$ 项，每项仍为 $\Theta(\sqrt{n})$，因此：

$$
\sum_{j=1}^n \lfloor\sqrt{j}\rfloor = \Theta(n\sqrt{n})
$$

对于 $n = 10^4$，$n\sqrt{n} = 10^6$ 是内层更新次数的上界，具体耗时需在目标环境测量。辅助空间仅需一维长度为 $n + 1$ 的连续数组，为 $O(n)$；输出空间为 $O(1)$。

## 图论建模：剩余和转移图上的广度优先搜索

除了动态规划，我们亦可将问题映射为**单源最短路径**（single-source shortest path）问题：

- **节点**：代表从 $n$ 逐步递减所产生的剩余目标值，节点集合为 $\{0, 1, 2, \dots, n\}$；
- **有向边**：从节点 $u$ 向节点 $v$ 连有一条有向边，当且仅当存在正整数 $i$ 使得 $v = u - i^2 \ge 0$；
- **边权**：所有边的权重均为 1（代表消耗了 1 个完全平方数）；
- **起点与终点**：起点为 $n$，目标节点为 0。

因为所有边的权重均为 1，BFS 按离起点的边数逐层扩展。根据无权图的最短路径性质，首次访问到节点 0 时的搜索层数即为最短路径长度（对应最少平方数数量）[^clrs-bfs]。

利用一个布尔数组 `visited` 进行入队剪枝，防止相同剩余值被重复推入队列，保证每个节点至多入队一次。找到 0 后可以提前退出，但未规定输入分布时不能据此声称平均复杂度。枚举每个已访问状态的所有平方数给出 $O(n\sqrt{n})$ 时间上界；队列和标记数组共需 $O(n)$ 辅助空间，输出为 $O(1)$。

## 数论对偶：拉格朗日四平方和与勒让德三平方和判据

数论定理可以进一步限制答案的范围：

> **拉格朗日四平方和定理**（Lagrange's Four-Square Theorem）[^lagrange-squares]：
> 每一个正整数都可以表示为至多四个整数的平方和。

该定理直接指出：本题的输出答案只可能是 1、2、3 或 4 四种取值之一。

进一步，根据**勒让德三平方和定理**（Legendre's Three-Square Theorem）[^lagrange-squares]，一个正整数 $n$ 不能写成三个整数平方和的充要条件是：$n$ 可以表示为如下形式：

$$
n = 4^k (8m + 7), \qquad k, m \in \mathbb{Z}_{\ge 0}
$$

基于此，无需复杂的动态规划或图搜索，仅凭数论分支判定即可在 $O(\sqrt{n})$ 时间内得出答案：

1. **答案为 1**：若 $n$ 本身即为完全平方数（即 $(\lfloor\sqrt{n}\rfloor)^2 = n$），返回 1；
2. **答案为 4**：复制 $n$ 为 $t$，不断执行 $t \gets t/4$ 直至不再被 4 整除。若最终 $t \equiv 7 \pmod 8$，则由勒让德定理可知原数 $n$ 无法拆分为至多三个平方和，结合四平方和定理，答案必为 4。这里保留原始 $n$ 供后续步骤使用；
3. **答案为 2**：枚举正整数 $a \in [1, \lfloor\sqrt{n}\rfloor]$（满足 $a^2 < n$），检查差值 $b^2 = n - a^2$ 是否为非零完全平方数。若存在，则 $n = a^2 + b^2$，返回 2；
4. **答案为 3**：四平方和定理把答案限制在 $\{1,2,3,4\}$ 内。第 1、3 步排除了 1 和 2，第 2 步已用勒让德定理排除 4，因此答案为 3。

## Python：完全背包与逐层 BFS 队列

下面两种方法均接受题目范围内的正整数并返回计数。BFS 在入队时标记，避免同层或后续层重复入队：

```python
from collections import deque


class Solution:
    def numSquares(self, n: int) -> int:
        # dp[j] stores the minimum number of squares summing to j.
        # Initializing dp[j] = j reflects using all 1s (worst-case bound).
        dp = list(range(n + 1))

        for j in range(1, n + 1):
            i = 1
            while i * i <= j:
                dp[j] = min(dp[j], dp[j - i * i] + 1)
                i += 1

        return dp[n]

    def numSquaresBFS(self, n: int) -> int:
        queue: deque[int] = deque([n])
        visited = [False] * (n + 1)
        visited[n] = True
        step = 0

        while queue:
            step += 1
            # Layer invariant: 'step' records the exact distance from root n.
            for _ in range(len(queue)):
                curr = queue.popleft()
                i = 1
                while i * i <= curr:
                    remainder = curr - i * i
                    if remainder == 0:
                        return step
                    if not visited[remainder]:
                        visited[remainder] = True
                        queue.append(remainder)
                    i += 1

        raise AssertionError("Positive n is reachable by subtracting 1 repeatedly")
```

## C++：一维压缩与数论常数空间判定

在 C++ 实现中，我们一方面提供紧凑的完全背包一维压缩，另一方面提供利用数论定理的常数空间判定实现：

```cpp
#include <algorithm>
#include <cmath>
#include <numeric>
#include <vector>

class Solution {
    static bool isSquare(int x) {
        int r = static_cast<int>(std::round(std::sqrt(x)));
        return r * r == x;
    }

public:
    // Dynamic programming approach: O(n * sqrt(n)) time, O(n) auxiliary space.
    int numSquares(int n) {
        // State invariant: dp[j] stores the minimum square count to form sum j.
        // The upper bound achieved by all 1s is initialized via std::iota.
        std::vector<int> dp(n + 1);
        std::iota(dp.begin(), dp.end(), 0);

        for (int j = 1; j <= n; ++j) {
            for (int i = 1; i * i <= j; ++i) {
                dp[j] = std::min(dp[j], dp[j - i * i] + 1);
            }
        }
        return dp[n];
    }

    // Number-theoretic approach via Legendre's theorem: O(sqrt(n)) time, O(1) auxiliary space.
    int numSquaresMath(int n) {
        // Condition 1: n is a perfect square.
        if (isSquare(n)) return 1;

        // Condition 4: n = 4^k * (8m + 7) iff n cannot be represented as sum of <= 3 squares.
        int temp = n;
        while (temp % 4 == 0) temp /= 4;
        if (temp % 8 == 7) return 4;

        // Condition 2: sum of two non-zero perfect squares (a^2 + b^2 = n, with a^2 < n).
        for (int a = 1; a * a < n; ++a) {
            if (isSquare(n - a * a)) return 2;
        }

        // Earlier checks exclude 1, 2 and 4; the four-square bound leaves 3.
        return 3;
    }
};
```

动态规划版本空间开销为平铺的连续内存 `std::vector<int>`[^cpp-vector]；而 `numSquaresMath` 方法将计算时间压缩至仅需枚举 $a \le \sqrt{n}$，在 $n = 10^4$ 时最多仅循环 100 次，且只使用常数个局部变量，达到 $O(1)$ 辅助空间。整数乘法和平方根判断在这里按题目固定数值范围计为常数成本。

例如 12 的最优分解为 $4+4+4$，答案为 3；13 为 $4+9$，答案为 2；28 除去因子 4 后得到 7，答案为 4。定理允许平方项为 0；去掉这些零项后，才得到题目所求的正平方数数量。三种解法展现了不同建模视角下的权衡：

- **完全背包 DP**：自底向上递推结构最通用，不仅求得 $n$ 的解，还顺带计算了 $1 \dots n$ 全部的最优解，时间复杂度为 $O(n\sqrt{n})$，辅助空间为 $O(n)$；
- **逐层 BFS 最短路**：答案为 1 或 2 时，分别在第 1、2 层找到 0 后退出；给出的 DP 实现则会填完全部状态。这说明退出时机，不代表给定输入分布下的平均耗时；队列和标记数组共占 $O(n)$ 辅助空间；
- **数论判定**：逐项检查答案是否为 1、4、2，否则返回 3。时间为 $O(\sqrt{n})$，辅助空间为 $O(1)$，依据是平方和定理，不能直接推广到任意候选数集合。

[^clrs-dp]: [_Introduction to Algorithms_ (4th ed., Chapter 14)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——动态规划的最优子结构与无后效性；最少基元找零模型另见 [MIT 6.046J Recitation 5](https://ocw.mit.edu/courses/6-046j-design-and-analysis-of-algorithms-spring-2015/d187472426117c2ebec700a22c209b3f_MIT6_046JS15_Recitation5.pdf) 第 3 页分析。

[^clrs-bfs]: [_Introduction to Algorithms_ (4th ed., Section 20.2)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——无权图广度优先搜索的分层性质与单源最短路径引理；另见 [MIT 6.006 Lecture 9](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/196a95604877d326c6586e60477b59d4_MIT6_006S20_lec9.pdf)。

[^lagrange-squares]: [Three Squares Theorem](https://isa-afp.org/entries/Three_Squares.html)——Archive of Formal Proofs (2023) 对勒让德三平方和判据及拉格朗日四平方和推论的形式化机器证明。

[^cpp-vector]: [cppreference：std::vector](https://en.cppreference.com/w/cpp/container/vector.html)——说明元素在连续空间线性排布的容器保证与访问语义。
