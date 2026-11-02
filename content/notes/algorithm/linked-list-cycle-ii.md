---
title: "环形链表 II：快慢指针相遇后为什么能找到入口"
publishDate: "2026-10-27T12:00:00+08:00"
description: "LeetCode 142：先用快慢指针判环，再推导从头节点和相遇点同速出发能在入口相遇的原因，给出 Python 与 C++ 常数空间实现。"
---

[LeetCode 142. 环形链表 II](https://leetcode.cn/problems/linked-list-cycle-ii/)要求返回环入口节点，无环时返回空指针。例如 `3 -> 2 -> 0 -> -4` 的尾节点若指回节点 2，答案就是该节点对象，而不是数值 2。不同节点可以有相同的值，因此判断相遇必须比较节点身份。

## 先判环，再找入口

Floyd 判圈算法让 `slow` 每轮走 1 步，`fast` 每轮走 2 步[^floyd-cycle]。无环时，快指针会到达链表末尾；有环时，两个指针最终都会进入环。

设环长为 $b \ge 1$。两者进入环后，快指针每轮相对慢指针多走 1 步，环内偏移每轮加 1 并对 $b$ 取模，因此至多再经过 $b$ 轮就会相遇。代码应先移动、再比较，避免把起始时两者都指向 `head` 当成有环的证据。

相遇后，把一个指针移回 `head`，另一个留在相遇点，让它们每轮各走 1 步；下一次相遇的位置就是入口。

## Python：把两个阶段写清楚

```python
from typing import Optional


class Solution:
    def detectCycle(self, head: Optional[ListNode]) -> Optional[ListNode]:
        slow = head
        fast = head

        while fast is not None and fast.next is not None:
            slow = slow.next
            fast = fast.next.next
            if slow is fast:
                break
        else:
            return None

        entry = head
        # Equal speeds meet at the entry, even when head is already in the cycle.
        while entry is not slow:
            entry = entry.next
            slow = slow.next
        return entry
```

`while` 的 `else` 只在循环没有通过 `break` 退出时执行，表示快指针走到了末尾[^python-while-else]。`is` 比较对象身份，不依赖节点类是否自定义了值相等规则[^identity]。

## 为什么同速推进会在入口相遇

设头节点到入口需要走 $a \ge 0$ 步，相遇时慢指针一共走了 $s$ 步。快指针走了 $2s$ 步，两者在同一个环内节点相遇，所以路程差必为环长的正整数倍：

$$
2s - s = qb, \qquad s = qb, \quad q \ge 1
$$

慢指针在环内的偏移为 $(s - a) \bmod b$。从相遇点再走 $a$ 步后，偏移变成：

$$
(s - a + a) \bmod b = s \bmod b = 0
$$

因此，相遇点出发的指针走 $a$ 步会到入口，头节点出发的指针也恰好在此时到入口。在此之前，头节点出发的指针还位于非环部分，另一个始终在环内，无法提前相遇。若 $a = 0$，首次相遇点就是 `head`，第二阶段无需移动。

这里的推导依赖快慢速度比为 2。把快指针改为每轮走 3 步时，从同一个头节点出发仍能判环：慢指针入环后，总步数达到环长的倍数时，两者一定重合。但相遇时只能推出 $2s = qb$，不能推出 $s$ 是环长的倍数，直接重置一个指针的入口定位法便可能失效。例如长度为 2 的纯环中，第一轮相遇在另一个节点，重置后同速移动将始终错开。

## C++：同样的两阶段，常数辅助空间

```cpp
class Solution {
public:
    ListNode* detectCycle(ListNode* head) {
        ListNode* slow = head;
        ListNode* fast = head;

        while (fast != nullptr && fast->next != nullptr) {
            slow = slow->next;
            fast = fast->next->next;
            if (slow != fast) {
                continue;
            }

            ListNode* entry = head;
            while (entry != slow) {
                entry = entry->next;
                slow = slow->next;
            }
            return entry;
        }
        return nullptr;
    }
};
```

设可达的不同节点共有 $n$ 个。有环时第一阶段耗时 $O(a + b)$，第二阶段耗时 $O(a)$；无环时最多扫描到末尾。两版的总时间均为 $O(n)$，辅助空间为 $O(1)$，且不修改链表。

[《相交链表：把状态判定收进循环条件》](/notes/algorithm/linked-list-intersection/)也通过调整路程让指针对齐，但它依赖两条无环路径的长度相等；这里依赖环长整倍数的同余关系。理解各自的对齐条件，比把两者概括成同一种技巧更有助于判断何时可以复用。

[^floyd-cycle]: [Robert W. Floyd：*Nondeterministic Algorithms* (JACM, 1967)](https://doi.org/10.1145/321420.321422)——提出双指针倍速判圈思想（亦见 Donald E. Knuth *The Art of Computer Programming, Vol. 2*，3.1 节习题 6）。

[^python-while-else]: [Python 文档：`while` 语句](https://docs.python.org/3/reference/compound_stmts.html#the-while-statement)——说明循环条件变为假时执行 `else` 子句，而通过 `break` 提前跳出循环则会跳过 `else` 子句。

[^identity]: [Python 文档：身份比较](https://docs.python.org/3/reference/expressions.html#is-not)——`is` 与 `is not` 判断两个引用是否指向同一对象。
