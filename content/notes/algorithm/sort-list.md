---
title: "排序链表：递归归并与自底向上归并"
publishDate: "2026-10-30T20:00:00+08:00"
description: "LeetCode 148：用 Python 递归归并理解链表排序，再用 C++ 自底向上归并实现 O(n log n) 时间与 O(1) 辅助空间。"
---

[LeetCode 148. 排序链表](https://leetcode.cn/problems/sort-list/)（Hot 100）要求将链表按升序排列，进阶要求是 $O(n \log n)$ 时间和 $O(1)$ 辅助空间。归并排序适合这道题：切分链表只需断开指针，合并时可以复用节点，无需为节点值准备额外数组。

## Python：先切分，再递归合并

自顶向下的分治递归遵循标准的**分解与合并**模式：先把大链表平分为两个独立子链表分别递归排序，再将有序子链表组合为全局有序链表（详见[《从调用栈理解递归》中的分解与合并](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)）。具体步骤比较直接：

1. 用快慢指针找到前半段的末尾，保存后半段入口，再断开连接。
2. 分别排序左右两段。
3. 用[《合并 K 个升序链表：小顶堆与两两归并》](/notes/algorithm/merge-k-sorted-lists/)中的双路归并合并两条有序链表。

让 `fast` 从 `head.next` 出发，可以保证长度为 2 时，`slow` 停在第一个节点。断链后两个子问题都比原问题短，递归才能结束。

```python
from typing import Optional


class Solution:
    def sortList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if head is None or head.next is None:
            return head

        slow = head
        fast = head.next
        while fast is not None and fast.next is not None:
            slow = slow.next
            fast = fast.next.next

        right_head = slow.next
        slow.next = None

        left = self.sortList(head)
        right = self.sortList(right_head)
        return self._merge(left, right)

    def _merge(
        self, left: Optional[ListNode], right: Optional[ListNode]
    ) -> Optional[ListNode]:
        dummy = ListNode(0)
        tail = dummy

        while left is not None and right is not None:
            if left.val <= right.val:
                tail.next = left
                left = left.next
            else:
                tail.next = right
                right = right.next
            tail = tail.next

        tail.next = left if left is not None else right
        return dummy.next
```

每层递归中，切分与合并的总耗时为 $O(n)$，递归深度为 $O(\log n)$，因此总时间为 $O(n \log n)$。合并函数是迭代实现，辅助空间为 $O(1)$；整个排序还要计入递归栈，辅助空间为 $O(\log n)$，没有满足进阶要求。

合并时遇到相等值优先选左侧节点，能保持相同值节点的原始相对顺序，因此排序是稳定的[^stable-sort]。

## C++：按段长翻倍，省去递归栈

自底向上版本从长度为 1 的有序段开始，每轮合并相邻两段，段长依次为 $1, 2, 4, 8, \dots$。先扫描一次得到链表长度，就能确定何时结束。这种通过自底向上迭代规约来模拟递归树执行、消除函数调用栈的思路，在[《从调用栈理解递归》](/posts/understanding-recursion/#从递归改写为迭代)中有系统阐述。

```text
原始:   4 -> 2 -> 1 -> 3
段长 1: [4] + [2] -> [2 -> 4]; [1] + [3] -> [1 -> 3]
段长 2: [2 -> 4] + [1 -> 3] -> [1 -> 2 -> 3 -> 4]
```

`split` 从入口切出至多 `width` 个节点，并返回下一段入口。内层循环先保存尚未处理的部分，再合并当前两段，避免重连指针时丢失后续节点。

```cpp
#include <cstddef>

class Solution {
public:
    ListNode* sortList(ListNode* head) {
        std::size_t length = 0;
        for (ListNode* node = head; node != nullptr; node = node->next) {
            ++length;
        }

        ListNode dummy(0);
        dummy.next = head;

        for (std::size_t width = 1; width < length; width *= 2) {
            ListNode* tail = &dummy;
            ListNode* current = dummy.next;

            while (current != nullptr) {
                ListNode* left = current;
                ListNode* right = split(left, width);
                current = split(right, width);
                tail = mergeAfter(tail, left, right);
            }
        }
        return dummy.next;
    }

private:
    static ListNode* split(ListNode* head, std::size_t width) {
        if (head == nullptr) {
            return nullptr;
        }
        for (std::size_t i = 1; i < width && head->next != nullptr; ++i) {
            head = head->next;
        }
        ListNode* next = head->next;
        head->next = nullptr;
        return next;
    }

    static ListNode* mergeAfter(
        ListNode* tail, ListNode* left, ListNode* right
    ) {
        while (left != nullptr && right != nullptr) {
            if (left->val <= right->val) {
                tail->next = left;
                left = left->next;
            } else {
                tail->next = right;
                right = right->next;
            }
            tail = tail->next;
        }
        tail->next = left != nullptr ? left : right;

        // Find the tail so the next merged pair can be appended.
        while (tail->next != nullptr) {
            tail = tail->next;
        }
        return tail;
    }
};
```

一轮中，`split` 扫描各段，`mergeAfter` 合并并找到结果尾部。虽然部分节点会被再次访问，但每个节点每轮只被访问常数次，因此每轮仍为 $O(n)$，总时间为 $O(n \log n)$。最后不足 `width` 个节点的一段也能正常处理；如果没有右段，就直接接回左段。

实现只维护固定数量的指针、计数器和一个栈上的哨兵，不使用递归，也不在每次合并时堆分配哨兵，辅助空间为 $O(1)$[^cpp-storage-duration]。它同样在值相等时优先选择左段，保持稳定性[^stable-sort]。

这两种写法的主要取舍是控制流程：递归便于理解拆分与合并，自底向上迭代则通过显式管理段长省去调用栈。[《随机链表的复制：哈希表与交织节点》](/notes/algorithm/copy-list-with-random-pointer/)也会利用指针重连节省辅助空间，但复制完成后还需要恢复原链表。

[^stable-sort]: [cppreference：`std::stable_sort`](https://en.cppreference.com/w/cpp/algorithm/stable_sort.html)——说明稳定排序要求等价元素在排序后保持原有的相对次序。

[^cpp-storage-duration]: [cppreference：存储期与生命周期](https://en.cppreference.com/w/cpp/language/storage_duration.html)——说明自动存储期的局部对象在函数作用域内分配并在返回时自动销毁，不产生动态堆分配。
