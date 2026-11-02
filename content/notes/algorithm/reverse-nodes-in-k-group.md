---
title: "K 个一组翻转链表：确认边界后再反转"
publishDate: "2026-10-29T12:00:00+08:00"
description: "LeetCode 25：从整链反转理解组内指针变化，用 Python 断链复用反转函数，再用 C++ 直接反转半开区间，保持不足 k 个的尾部不变。"
---

[LeetCode 25. K 个一组翻转链表](https://leetcode.cn/problems/reverse-nodes-in-k-group/)要求每 $k$ 个节点反转一次，不足一组的尾部保持原样。例如 `1 -> 2 -> 3 -> 4 -> 5`，`k = 2` 时得到 `2 -> 1 -> 4 -> 3 -> 5`，`k = 3` 时得到 `3 -> 2 -> 1 -> 4 -> 5`。必须调整节点链接，不能只交换节点值；题目保证 $1 \le k \le n$，其中 $n$ 是节点数。

## 整链反转与分组边界

[LeetCode 206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/)的迭代过程维护两段（局部三指针翻转机制在[《回文链表：把判定拆成三个指针原语》](/notes/algorithm/palindrome-linked-list/)中也有详细推导）：`prev` 指向已反转的前缀，`curr` 指向尚未处理的后缀。每轮先用 `next_node` 保存 `curr.next`，再将 `curr.next` 改为 `prev`，最后推进两个指针。保存后继的顺序不能颠倒，否则会丢失未处理部分的入口。

分组反转还需要记录组外的连接点：

```text
group_prev -> [group_start -> ... -> group_end] -> next_group
```

反转后，`group_end` 成为新组头，`group_start` 成为新组尾。因此要把 `group_prev` 接到新组头，再把新组尾接到 `next_group`。操作前先向后探测 $k$ 个节点，确认本组完整，便无需在尾部不足时回滚。

`k = 1` 时，每组只有一个节点，无需反转，直接返回原链表。

## Python：断开当前组，复用整链反转

```python
from typing import Optional


class Solution:
    def reverseKGroup(
        self, head: Optional[ListNode], k: int
    ) -> Optional[ListNode]:
        if k == 1:
            return head

        dummy = ListNode(0, head)
        group_prev = dummy

        while True:
            group_end = group_prev
            for _ in range(k):
                group_end = group_end.next
                if group_end is None:
                    return dummy.next

            group_start = group_prev.next
            next_group = group_end.next
            # Isolate a complete group before using whole-list reversal.
            group_end.next = None
            group_prev.next = self._reverse(group_start)
            group_start.next = next_group
            group_prev = group_start

    def _reverse(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev, curr = None, head
        while curr is not None:
            # Save the remaining chain before reversing this link.
            next_node = curr.next
            curr.next = prev
            prev, curr = curr, next_node
        return prev
```

`_reverse` 中通过 `prev, curr = curr, next_node` 同步推进两个引用，Python 会先求值右侧元组再按序绑定左侧目标[^python-assign]。每轮开始时，`group_prev` 是已处理部分的末尾，它之前的组已经完成反转；它后面的节点仍保持原顺序。探测失败就返回，因而不足 $k$ 个的尾部不会被改动。

## C++：直接反转到下一组入口

C++ 可以直接处理从 `group_start` 到 `next_group` 之前的半开区间。把反转时的 `prev` 初始化为 `next_group`，第一次改写就让原组头连上下一组，省去临时置空和单独接回组尾的操作。

```cpp
class Solution {
public:
    ListNode* reverseKGroup(ListNode* head, int k) {
        if (k == 1) {
            return head;
        }

        ListNode dummy(0, head);
        ListNode* group_prev = &dummy;
        while (true) {
            ListNode* group_end = group_prev;
            for (int i = 0; i < k; ++i) {
                group_end = group_end->next;
                if (group_end == nullptr) {
                    return dummy.next;
                }
            }

            ListNode* group_start = group_prev->next;
            ListNode* next_group = group_end->next;
            ListNode* prev = next_group;
            ListNode* curr = group_start;
            // Reverse [group_start, next_group), keeping the next group reachable.
            while (curr != next_group) {
                ListNode* next_node = curr->next;
                curr->next = prev;
                prev = curr;
                curr = next_node;
            }
            group_prev->next = group_end;
            group_prev = group_start;
        }
    }
};
```

两版中每个完整组都经过一次探测和一次反转，不完整的尾部只探测一次，所以时间复杂度为 $O(n)$，辅助空间为 $O(1)$。C++ 版使用栈上自动存储期的局部哨兵并减少了每组的连接写入，两版的渐近复杂度相同[^cpp-storage-duration]；具体运行时间仍需测量。

[LeetCode 24. 两两交换链表中的节点](https://leetcode.cn/problems/swap-nodes-in-pairs/)就是 $k = 2$ 的特例，可以直接使用同一套边界处理。若采用递归实现，每组翻转后将当前组尾部递归连向下一组结果，属于单分支深入的典型**线性递归**：每一层递归都需要在调用栈上保存当前组的上下文与返回地址，导致调用栈积压 $O(n/k)$ 层栈帧（关于线性递归的入栈开销与栈帧保存，参见[《从调用栈理解递归》中的线性递归分析](/posts/understanding-recursion/#线性递归一个子问题进入与返回)）。相比之下，这里利用哨兵哑节点（哑节点用法亦见[《两数相加：统一多指针循环与进位状态》](/notes/algorithm/add-two-numbers/)）配合迭代局部翻转，消除了全部调用栈开销，保证了严格的 $O(1)$ 辅助空间。

[^python-assign]: [Python 文档：赋值语句](https://docs.python.org/3/reference/simple_stmts.html#assignment-statements)——说明赋值语句会先对右侧表达式列表完整求值，再从左到右依次绑定给目标变量。

[^cpp-storage-duration]: [cppreference：存储期与生命周期](https://en.cppreference.com/w/cpp/language/storage_duration.html)——说明自动存储期的局部对象随块作用域创建和销毁，无需动态分配。
