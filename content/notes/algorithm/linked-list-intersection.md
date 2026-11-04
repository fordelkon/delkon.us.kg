---
title: "相交链表：把状态判定收进循环条件"
publishDate: "2026-10-25T12:00:00+08:00"
description: "LeetCode Hot 100 的相交链表，推导双指针换头的相遇条件，并修正循环中漏检 None 的终止时序。"
---

[LeetCode 160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/)（Hot 100）给定两条无环单链表，要求返回它们的第一个公共节点；没有交点则返回 `None`。这里的“公共”指同一个节点对象，节点值相等并不算相交。

双指针解法的规则很短：`p` 从 A 出发，`q` 从 B 出发；每轮各走一步，遇到 `None` 就换到对方的头节点。**先检查两者是否为同一个对象，再推进指针**，相遇时返回该节点，也可能返回 `None`。[《回文链表：把判定拆成三个指针原语》](/notes/algorithm/palindrome-linked-list/)也用双指针，不过它靠不同步长定位中点，解决的是另一类问题。

## 换头如何抵消长度差

设 A、B 在交点前分别有 $a$、$b$ 个节点，公共尾部有 $c$ 个节点。换头让两个指针都补走对方的独立部分：

```text
A: a nodes -> shared tail (c nodes) -> None
B: b nodes -> shared tail (c nodes) -> None
```

如果 $a = b$，两个指针不必换头，走 $a$ 步就会在交点相遇。若 $a \ne b$，它们换头后到达交点所需的步数分别为：

- `p`：$a + c + 1 + b$；
- `q`：$b + c + 1 + a$。

两式相等。这里一步指执行一次指针赋值：从尾节点走到 `None` 已计入第一条链表的遍历，从 `None` 换到另一条链表的头还需额外一步，所以有 $+1$。长度差被抵消后，两者会在公共尾部的起点相遇。

若不相交，设两条链表长度分别为 $m$、$n$。两个指针各走完 A、B 并换头一次，都会在 $m + n + 1$ 步后到达 `None`，也可能更早同时到达 `None`（例如两条链表等长）。因此，不需要单独给“无交点”设置计数上限。整体时间复杂度为 $O(m + n)$，额外空间为 $O(1)$。

## 漏掉 None 的原因是检查顺序

我初版把换头写在判等之前，并且换头后当轮还会再推进一次。以两条互不相交的单节点链表为例，一轮末尾两个指针同时到达 `None`；下一轮却先把它们换成各自的头节点，判等再也看不到刚才的 `None` 状态，最后只能靠额外计数跳出循环。

修正后，每轮先在循环条件里检查两个指针是否相同，再各推进一步；到达 `None` 的指针下一步切换到对方的链表头。对应的 Python 实现如下：

```python
from typing import Optional


class Solution:
    def getIntersectionNode(
        self, headA: Optional[ListNode], headB: Optional[ListNode]
    ) -> Optional[ListNode]:
        p, q = headA, headB
        # Check for a shared node or two None pointers before switching heads.
        while p is not q:
            p = headB if p is None else p.next
            q = headA if q is None else q.next
        return p
```

`is` 比较对象身份，直接表达“是否为同一个节点”，不依赖节点类如何定义 `==`[^identity]。相遇条件也覆盖 `None is None`，所以正常交点和无交点可以共用一个出口。两版都只读取输入，不分配、释放或改写节点；返回的是输入中已有节点的引用，C++ 调用方仍负责其生命周期。

## 判等和换头各做一件事

循环条件 `p is not q` 负责终止，包括两者同时为 `None` 的无交点情形。两个条件表达式只决定下一步去哪：当前是节点就走向后继，当前是 `None` 就切到对方的头。每轮每个指针只做一次转移，不会在换头后立刻再前进一步；若改用 `while True`，只要仍在轮首判等，语义一样。

这道题适合提炼出的经验是：**把终止条件放在不会漏掉合法结束状态的位置**。可靠性来自检查顺序，而不是某一种语法本身。

## C++ 进阶：同步扫描、尾节点剪枝与长度对齐

换头法适合用几行代码处理所有情况。C++ 版进一步利用两条无环链表的结构：如果它们相交，从交点起必然共用同一个尾节点；尾节点不同，就不用再寻找交点。先让两个指针同步前进，保留等长链表早期相遇时立即返回的路径；若一条链先结束，才扫描另一条链的剩余部分，得到长度差并比较尾节点。若输入可能含环，可先用[快慢指针判环](/notes/algorithm/linked-list-cycle-ii/)，但还需另行分析环内相交，不能直接套用这里的尾节点判据。

```cpp
#include <cstddef>

class Solution {
public:
    ListNode* getIntersectionNode(ListNode* headA, ListNode* headB) {
        ListNode* a = headA;
        ListNode* b = headB;
        ListNode* tailA = nullptr;
        ListNode* tailB = nullptr;

        while (a != nullptr && b != nullptr) {
            if (a == b) return a;
            tailA = a;
            tailB = b;
            a = a->next;
            b = b->next;
        }

        // Only one list can have remaining nodes after the paired walk.
        const bool longerA = a != nullptr;
        std::size_t difference = 0;
        while (a != nullptr) {
            tailA = a;
            a = a->next;
            ++difference;
        }
        while (b != nullptr) {
            tailB = b;
            b = b->next;
            ++difference;
        }
        // Intersecting lists must share a tail; this also handles an empty list.
        if (tailA == nullptr || tailA != tailB) return nullptr;

        a = headA;
        b = headB;
        if (longerA) {
            while (difference > 0) {
                a = a->next;
                --difference;
            }
        } else {
            while (difference > 0) {
                b = b->next;
                --difference;
            }
        }
        while (a != b) {
            a = a->next;
            b = b->next;
        }
        return a;
    }
};
```

例如两条互不相交的链表，第一次扫描就能看到不同的尾节点，直接返回 `nullptr`；两条等长且相交的链表则会在第一轮同步扫描中返回交点。长度不同时，先让较长链走过多出的节点，再同步比较地址，首次相同的节点就是交点。

扫描和对齐至多进行线性数量的指针移动，总时间 $O(m + n)$、额外空间 $O(1)$，且不分配或修改节点。等距交点可以在同步扫描时直接返回，尾节点不同则可省去后续对齐和比较；长度不同且相交时还需要对齐并再次遍历。相较于换头法的实际速度取决于输入分布、分支和内存访问，不能仅凭循环次数断言更快。

## 附录：评测器建链与分配实验

`getIntersectionNode` 本身不分配节点。若评测器把建链、释放也计入运行时间，节点池可能改变整次提交的测量结果；它优化的是评测器的内存分配过程，不是求交过程。求交仍为 $O(m + n)$ 时间、$O(1)$ 辅助空间，节点池自身占用的内存需另计。

这类实验依赖评测器实际使用的分配入口，手动封装的池不会自动接管评测器建链。替换全局分配函数还会影响同尺寸的其他对象，必须正确处理对齐、配对释放、池耗尽和并发；固定池的常驻内存与同步开销也可能抵消收益。因此这里只保留实验边界，不把分配器实现作为求交答案的一部分，也不能用地址连续性代替 `next` 连接关系。

[^identity]: [Python 文档：比较运算](https://docs.python.org/3/library/stdtypes.html#comparisons)——区分对象身份比较 `is` 与可由类自定义的相等比较 `==`。
