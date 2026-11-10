---
title: "零钱兑换：完全背包自底向上与不可达哨兵"
publishDate: "2026-11-04T18:00:00+08:00"
description: "LeetCode 322 零钱兑换：从较小金额推导最少硬币数，选择安全的不可达哨兵，并解释一维正序更新为什么允许重复使用同一面额。"
tags: ["algorithm", "dynamic-programming", "python", "cpp"]
---

[LeetCode 322. 零钱兑换](https://leetcode.cn/problems/coin-change/)（Hot 100）给定不同面额的整数硬币数组 `coins` 和一个整数总金额 `amount`，要求计算凑成总金额所需的最少硬币个数；如果没有任何一种硬币组合能够拼出该金额，返回 `-1`。题目保证每种面额的硬币数量无限，且所有硬币面值均为严格正整数（$c \ge 1$），$0 \le \textit{amount} \le 10^4$。金额为 0 时返回 0；下列两版实现均只读输入，不修改原数组。

[《爬楼梯：状态转移矩阵与一维滚动变量》](/posts/algorithm/climbing-stairs/)从固定步长（1 阶或 2 阶）累加所有合法到达路径的方案数，而零钱兑换则是在动态面额集合上寻找能凑出目标金额的极小代价；相比[《分割等和子集：0-1 背包可行性与一维倒序压缩》](/posts/algorithm/partition-equal-subset-sum/)中每个元素至多选用一次的约束，本题每种硬币均可无限制重复选用，构成了经典的完全背包最值模型。

## 贪心策略的失效与 DAG 拓扑无环性

面对找零问题，直觉常倾向于优先选用大面额硬币的贪心策略，然而局部最优并不保证全局最优。例如，当面额集合为 `coins = [1, 3, 4]`、目标金额为 `amount = 6` 时：贪心策略选取最大面额 4 后，剩余金额 2 只能由两枚 1 组成，总共需要 $1 + 2 = 3$ 枚硬币；但全局最优解是选取两枚 3，仅需 2 枚硬币。这个反例只说明“优先取最大面额”并不适用于任意面额集合，不能据此推断所有不满足整除关系的面额都会失败。下面通过复用较小金额的最优解求解，无须枚举所有硬币组合。

若直接采用递归穷举，由于每个金额分支均会尝试所有硬币，会产生高度重叠的子问题。正如[《从调用栈理解递归》中关于状态依赖无环性的讨论](/posts/understanding-recursion/#缓存结果与标记访问的区别)所揭示的：访问标记与结果缓存承担不同职责。对零钱兑换而言，由于所有硬币面值满足 $c \ge 1$，自顶向下分解时金额严格递减，自底向上构建时子状态的金额严格满足 $j - c < j$。

因此，状态与转移边构成**有向无环图**（DAG）。按金额从 $0$ 到 $amount$ 递增计算时，每个前驱金额都已求出，无需另做拓扑排序或环检测。

## 状态定义与不可达哨兵的选取

我们将问题形式化为**完全背包问题**的求极值变种：总金额 $amount$ 为背包总容量，每种硬币面额 $c \in coins$ 为物品体积，且每种硬币均可无限制重复选用，物品代价统一记为 1（代表 1 枚硬币），目标是使得恰好装满背包时的总代价最小[^clrs-dp]。

定义状态 $dp[j]$ 表示凑齐金额 $j$ 所需的最少硬币数。根据最优子结构，状态转移方程为：

$$
dp[j] = \min_{\substack{c \in \textit{coins} \\ c \le j}} \big( dp[j - c] + 1 \big)
$$

### 边界条件与防溢出哨兵

- **基本情况**（base case）：凑齐金额 0 所需的硬币数确定为 0，即 $dp[0] = 0$。
- **不可达哨兵值**：对于 $j > 0$，在尚未计算或无法凑齐时，逻辑上应初始化为无穷大 $\infty$。在 C++ 等静态类型语言中，若直接使用 `std::numeric_limits<int>::max()`（即 `INT_MAX`）代表 $\infty$，在计算 `dp[j - c] + 1` 时会导致 32 位有符号整数上溢，从而触发未定义行为（Undefined Behavior）[^cpp-overflow]。
- **安全上界**：由于输入硬币的最小面值为正整数（$c \ge 1$），在最极端情况下（全部使用面额为 1 的硬币），凑出金额 $amount$ 最多只需要 $amount$ 枚硬币。因此，对每个可达金额 $j$，其最优解满足：

$$
dp[j] \le j \le amount
$$

故将哨兵值选取为 $amount + 1$ 是完全充足且安全的：它严格大于任何可能的最坏合法解，既能明确表征“不可达”，又使得 `dp[j - c] + 1` 最大仅为 $amount + 2$，在题目 $amount \le 10^4$ 的限制下不会溢出 32 位 `int`；若推广到任意非负整数，仍需先检查这个加法的范围。计算完成后，只需判断 $dp[amount] > amount$ 是否成立；若成立则说明该金额不可达，返回 `-1`。

## 完全背包的一维正序遍历

在 0-1 背包中，为了防止同一物品被重复计入，空间压缩到一维时必须倒序遍历容量；但在完全背包中，每种硬币可以无限制使用。

当我们将外层设为硬币 $c$、内层设为金额 $j$ 时，容量必须**正序**（升序）从 $c$ 推进到 $amount$：

```text
dp[j] = min(dp[j], dp[j - c] + 1)
```

更新 $dp[j]$ 时，若 $j-c\ge c$，较小的 $dp[j-c]$ 已在本轮更新，可以包含当前面额；若 $j-c<c$，它无需当前面额也可作为前驱。无论哪种情况，转移都能再追加一枚 $c$，因此允许重复使用同一面额。

这两种循环顺序都可行，但依据是各自的状态不变式，不能仅用 $\min$ 的交换律解释：

- 无论是“外层遍历硬币、内层升序遍历金额”；
- 还是“外层升序遍历金额、内层遍历所有硬币”；

前者在处理完一种硬币后，得到“只使用已处理面额”的最优解；后者在处理金额 $j$ 时，所有更小金额已经是“使用全部面额”的最优解。两者最终都覆盖全部面额和金额，因此答案相同。将求最小值改为计数后，重复统计的语义会改变，不能直接照搬这一结论。

## Python：易读自底向上实现

Python 实现采用外层枚举金额、内层枚举硬币的自底向上转移结构，初始化哨兵为 `amount + 1`：

```python
class Solution:
    def coinChange(self, coins: list[int], amount: int) -> int:
        # Every reachable amount uses at most amount coins; amount + 1 serves as an unreachable sentinel.
        unreachable = amount + 1
        dp = [0] + [unreachable] * amount

        for j in range(1, amount + 1):
            for c in coins:
                if c <= j:
                    dp[j] = min(dp[j], dp[j - c] + 1)

        return dp[amount] if dp[amount] <= amount else -1
```

以 `coins = [1, 2, 5]`、$amount = 11$ 为例，外层金额从 1 推进到 11。当 $j = 11$ 时，$11 - 5 = 6$、$dp[6] = 2$（由 $5 + 1$ 得到），转移得出 $dp[11] = \min(\dots, dp[6] + 1) = 3$。

### 复杂度分析

- **时间复杂度**：设 $n=\text{len}(coins)$，每个正金额遍历全部面额，时间为 $O(n\cdot\textit{amount}+1)$；加一项覆盖 `amount = 0` 时的初始化与返回。
- **空间复杂度**：状态数组长度为 $amount+1$，辅助空间为 $O(\textit{amount}+1)$；返回整数占 $O(1)$ 空间。

## C++：外层硬币与升序金额更新

C++ 版本采用外层遍历硬币、内层正序推进金额的布局。通过标准容器 `std::vector<int>` 在连续内存中维护状态[^cpp-vector]，并以 `amount + 1` 初始化不可达哨兵，在紧凑存储的同时消除了整数上溢风险：

```cpp
#include <algorithm>
#include <vector>

class Solution {
public:
    int coinChange(const std::vector<int>& coins, int amount) {
        // Positive denominations bound every feasible coin count by amount.
        // With amount <= 10000, unreachable + 1 = amount + 2 will never overflow 32-bit signed int.
        const int unreachable = amount + 1;
        std::vector<int> dp(amount + 1, unreachable);
        dp[0] = 0;

        for (int c : coins) {
            // Ascending order allows unbounded reuse of coin c (complete knapsack invariant).
            for (int j = c; j <= amount; ++j) {
                dp[j] = std::min(dp[j], dp[j - c] + 1);
            }
        }

        return dp[amount] > amount ? -1 : dp[amount];
    }
};
```

内层从 $j=c$ 开始，无须再判断 $c\le j$。一次遍历按金额顺序访问数组，连同外层面额遍历，时间上界为 $O(n(\textit{amount}+1))$，辅助空间为 $O(\textit{amount}+1)$；这不构成具体运行速度的保证。

与后续[《完全平方数：完全背包最值与图广度优先》](/posts/algorithm/perfect-squares/)相比，两题均属于无限次选取的完全背包最值模型；但完全平方数题中因天然存在面额为 $1^2 = 1$ 的基本元，解必然存在而无需哨兵判断。而与[《分割等和子集：0-1 背包可行性与一维倒序压缩》](/posts/algorithm/partition-equal-subset-sum/)及[《单词拆分：前缀可行性转移与子串查找成本》](/posts/algorithm/word-break/)对照，各背包变体在物品复用、遍历时序与状态依赖上的差异如下：

| 题目 / 模型                                                                    | 物品复用限制  | 一维容量遍历方向                           | 转移依赖来源                        | 哨兵 / 边界处理                                     |
| :----------------------------------------------------------------------------- | :------------ | :----------------------------------------- | :---------------------------------- | :-------------------------------------------------- |
| [零钱兑换](/posts/algorithm/coin-change/)（完全背包最值）                      | 无限次选用    | 正序（$c \to \textit{amount}$）            | 允许复用当前轮已更新状态            | 设为 $\textit{amount} + 1$，规避 `INT_MAX` 加法上溢 |
| [完全平方数](/posts/algorithm/perfect-squares/)（完全背包最值）                | 无限次选用    | 正序（$1 \to n$）                          | 必然有解（含 $1^2$），状态天然有界  | 初值设为最差界 $dp[j] = j$，无需哨兵                |
| [分割等和子集](/posts/algorithm/partition-equal-subset-sum/)（0-1 背包可行性） | 每件至多 1 次 | 倒序（$\textit{target} \to \textit{num}$） | 严格只读上一轮历史状态，防重复选用  | 布尔类型，初始仅 $dp[0] = \text{true}$              |
| [单词拆分](/posts/algorithm/word-break/)（按前缀切分）                         | 单词无限复用  | 前缀正序（$1 \to \lvert s \rvert$）        | 依赖合法前驱前缀 $dp[j]$ 与子串匹配 | 词长窗口 $[\max(0, i-L_{\max}), i-L_{\min}]$ 剪枝   |

[^clrs-dp]: [_Introduction to Algorithms_ (4th ed., Chapter 14)](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/)——动态规划的最优子结构与无后效性；最少硬币找零模型另见 [MIT 6.046J Recitation 5](https://ocw.mit.edu/courses/6-046j-design-and-analysis-of-algorithms-spring-2015/d187472426117c2ebec700a22c209b3f_MIT6_046JS15_Recitation5.pdf) 第 3 页的状态转移与伪多项式时间分析。

[^cpp-overflow]: [C++ 工作草案：表达式前言](https://eel.is/c++draft/expr.pre)——规定算术表达式的结果超出类型可表示范围时的未定义行为；此处针对有符号整数加法。

[^cpp-vector]: [cppreference：std::vector](https://en.cppreference.com/w/cpp/container/vector.html)——说明普通 vector 的连续存储内存布局与基于初始大小的构造语义。
