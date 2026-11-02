---
title: "删除链表的倒数第 N 个结点：固定间距定位前驱"
publishDate: "2026-10-26T20:00:00+08:00"
description: "LeetCode 19：用哨兵统一头节点删除，让双指针保持 n + 1 步间距，在一趟扫描中找到待删节点的前驱，并说明 C++ 节点释放的所有权条件。"
---

[LeetCode 19. 删除链表的倒数第 N 个结点](https://leetcode.cn/problems/remove-nth-node-from-end-of-list/)要求删除倒数第 $n$ 个节点并返回头节点。例如 `1 -> 2 -> 3 -> 4 -> 5`，当 `n = 2` 时得到 `1 -> 2 -> 3 -> 5`。题目保证链表非空，且 $1 \le n \le L$，其中 $L$ 是链表长度；下面的实现依赖这一输入约束。

## 为什么要停在前驱

单链表只能沿 `next` 前进。要移除目标节点，先找到它的前驱 `slow`，再令 `slow.next` 指向目标的后继。若目标是头节点，它本来没有前驱；在 `head` 前添加 `dummy` 后，删除任何位置都能用同一条赋值处理。

给位置编号：`dummy` 为 0，原节点依次为 1 到 $L$，末尾的空指针为 $L + 1$。倒数第 $n$ 个节点的位置为 $L - n + 1$，所以需要把 `slow` 停在 $L - n$。

让 `fast` 和 `slow` 都从 `dummy` 出发，先让 `fast` 走 $n + 1$ 步，再同步前进。等 `fast` 到达空指针，`slow` 的位置就是：

$$
(L + 1) - (n + 1) = L - n
$$

```text
n = 2，fast 先走 3 步：
dummy -> 1 -> 2 -> 3 -> 4 -> 5 -> None
  |               |
 slow            fast

再同步走 3 步：
dummy -> 1 -> 2 -> 3 -> 4 -> 5 -> None
                  |               |
                 slow            fast
```

固定的是两者之间的步数差；同步阶段每轮都走 1 步，并不是快指针始终走得更快。

## Python：先拉开间距，再同步推进

```python
from typing import Optional


class Solution:
    def removeNthFromEnd(
        self, head: Optional[ListNode], n: int
    ) -> Optional[ListNode]:
        dummy = ListNode(0, head)
        fast = dummy
        slow = dummy

        # The input contract guarantees these n + 1 moves are valid.
        for _ in range(n + 1):
            fast = fast.next

        while fast is not None:
            fast = fast.next
            slow = slow.next

        # Pointer slow is the predecessor, including when the target is head.
        slow.next = slow.next.next
        return dummy.next
```

单节点且 `n = 1` 时，`fast` 先到空指针，`slow` 留在 `dummy`；删除后返回 `None`。当 `n = L` 时同样无需额外分支。

## C++：栈上哨兵与节点所有权

C++ 使用相同的扫描过程，哨兵是自动存储期的局部对象，无需为它单独进行堆分配[^cpp-storage-duration]。下面仅修改链接，节点生命周期由调用方或评测框架管理。

```cpp
class Solution {
public:
    ListNode* removeNthFromEnd(ListNode* head, int n) {
        ListNode dummy(0, head);
        ListNode* fast = &dummy;
        ListNode* slow = &dummy;

        for (int i = 0; i <= n; ++i) {
            fast = fast->next;
        }
        while (fast != nullptr) {
            fast = fast->next;
            slow = slow->next;
        }

        ListNode* removed = slow->next;
        slow->next = removed->next;
        return dummy.next;
    }
};
```

**断开链接与释放内存是两个操作。** 裸指针参数本身不能说明函数拥有节点。只有当接口约定由此函数负责销毁、节点由匹配的 `new` 分配且没有其他使用者时，才应在断链后执行 `delete removed`[^delete]；若调用方保留了各节点并统一释放，函数内删除反而会造成悬空指针或重复释放。拥有节点的程序若采用本例的断链写法，需要另行回收被移除的节点。

两版中 `fast` 都只向前扫描一次，`slow` 不会回退。时间复杂度为 $O(L)$，辅助空间为 $O(1)$。与[环形链表的倍速推进](/notes/algorithm/linked-list-cycle-ii/)相比，本题用固定间距把“距离尾部的位置”转化为“前驱的位置”，不需要先求出总长度。

[^cpp-storage-duration]: [cppreference：存储期与生命周期](https://en.cppreference.com/w/cpp/language/storage_duration.html)——说明自动存储期的局部对象在进入块作用域时创建，并在离开作用域时自动销毁。

[^delete]: [cppreference：delete 表达式](https://en.cppreference.com/w/cpp/language/delete.html)——说明可删除指针的来源限制，以及对象销毁和存储释放的行为。
