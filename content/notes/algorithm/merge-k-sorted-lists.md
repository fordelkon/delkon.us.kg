---
title: "合并 K 个升序链表：小顶堆与两两归并"
publishDate: "2026-10-30T12:00:00+08:00"
description: "LeetCode 23 与合并两个有序链表：用 Python 小顶堆维护当前候选节点，用 C++ 迭代分治复用已有节点，并说明时间、空间与输入修改。"
---

[LeetCode 23. 合并 K 个升序链表](https://leetcode.cn/problems/merge-k-sorted-lists/)（Hot 100）要求将多条升序链表合并为一条升序链表。设链表条数为 $k$，所有节点的总数为 $n$。每条链表已经有序，因此只需比较各条链表尚未处理的头节点，或者先两两合并，再继续合并结果。

合并时可以直接重连已有节点，无需复制节点值。这里的输入是彼此独立的无环链表；若两条链表共享尾部，同一个节点就可能被重复接入结果。

## 基础：合并两个有序链表

[LeetCode 21. 合并两个有序链表](https://leetcode.cn/problems/merge-two-sorted-lists/) 是多路归并的基础。用哨兵节点记录结果入口（参见[《两数相加：统一多指针循环与进位状态》](/notes/algorithm/add-two-numbers/)），每次将较小的头节点接到末尾，再推进对应的指针。一条链表耗尽后，直接接上另一条链表的剩余部分。

最后的挂接只需修改一次指针，耗时 $O(1)$；整个合并过程仍然需要 $O(a + b)$ 时间，其中 $a$、$b$ 是两条链表的长度。后面的 C++ 实现包含完整的双路合并函数。

如果把第 1 条与第 2 条合并，再把结果与第 3 条合并，较早进入结果的节点可能被反复扫描。在各条链表等长的情况下，总耗时可达 $O(nk)$。小顶堆与两两归并都能减少这种重复处理。

## Python：用小顶堆维护候选节点

堆中只保留每条非空链表当前的一个候选节点。因为各条链表有序，堆顶就是下一次应接入结果的节点。

每个堆元素为 `(node.val, index, node)`。当值相同时，Python 会继续比较链表下标 `index`。同一条链表在堆中最多出现一次，因此下标能区分堆内的元素，不会继续比较 `ListNode` 对象[^python-compare]。

```python
import heapq
from typing import Optional


class Solution:
    def mergeKLists(
        self, lists: list[Optional[ListNode]]
    ) -> Optional[ListNode]:
        heap = [
            (node.val, index, node)
            for index, node in enumerate(lists)
            if node is not None
        ]
        heapq.heapify(heap)

        dummy = ListNode(0)
        tail = dummy

        while heap:
            _, index, node = heap[0]
            next_node = node.next

            # Replace this list's candidate, or remove an exhausted list.
            if next_node is not None:
                heapq.heapreplace(heap, (next_node.val, index, next_node))
            else:
                heapq.heappop(heap)

            tail.next = node
            tail = node

        tail.next = None
        return dummy.next
```

先收集头节点再调用 `heapify`，建堆本身为 $O(k)$[^heapq]。取出堆顶后，如果该节点有后继，`heapreplace` 将堆顶替换为同一条链表的后继，并调整堆；如果没有后继，就用 `heappop` 移除该条链表的候选[^heapq]。这里始终维持“每条链表至多一个候选”的条件。

设初始非空链表数为 $m$。扫描输入列表需要 $O(k)$，每个节点对应一次堆操作，总时间可写为 $O(k + n \log(m + 1))$，辅助空间为 $O(m)$。通常将其概括为 $O(n \log k)$ 时间、$O(k)$ 辅助空间，但空链表和只有一条链表时仍有扫描成本。此实现不改写 `lists` 中保存的头指针，但会改变这些节点之间的连接。

## C++：自底向上的两两归并

两两归并在逻辑上构成一棵树高为 $O(\log k)$ 的归并树。无论是自顶向下递归二分，还是迭代自底向上步长翻倍，本质都是利用**分解与合并**的思想，将大规模合并问题分治为对等规模的独立子合并（关于递归树分解、子问题合并及调用栈帧的详细分析，参见[《从调用栈理解递归》中的分解与合并分析](/posts/understanding-recursion/#分解与合并用子问题结果求当前答案)）。

第一轮合并相邻的两条链表，第二轮合并相邻的两组结果，依次将步长翻倍。不足一对的最后一组留到下一轮。每轮中，一个节点至多参与一次双路合并，共有 $\lceil\log_2 k\rceil$ 轮。

```cpp
#include <cstddef>
#include <vector>

class Solution {
public:
    ListNode* mergeKLists(std::vector<ListNode*>& lists) {
        const std::size_t count = lists.size();
        if (count == 0) {
            return nullptr;
        }

        for (std::size_t width = 1; width < count; width *= 2) {
            for (std::size_t i = 0; i + width < count; i += 2 * width) {
                lists[i] = mergeTwo(lists[i], lists[i + width]);
            }
        }
        return lists[0];
    }

private:
    static ListNode* mergeTwo(ListNode* left, ListNode* right) {
        ListNode dummy(0);
        ListNode* tail = &dummy;

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
        return dummy.next;
    }
};
```

这个版本直接把每组合并后的头指针写回 `lists[i]`，所以会修改输入 `vector` 的元素。它也会重连原链表节点；执行后，不能再把原来的各条链表当作独立链表使用。若需要保留 `vector` 中的头指针，可先复制这个容器，代价是 $O(k)$ 辅助空间；这并不能保留原节点的连接关系。

总时间为 $O(k + n \log(k + 1))$：$O(k)$ 用于各轮的配对，节点扫描至多发生 $O(\log k)$ 轮。实现不使用递归，哨兵作为自动存储期的局部对象在栈上创建，不为结果分配新节点，辅助空间为 $O(1)$[^cpp-storage-duration]。

[《排序链表：递归归并与自底向上归并》](/notes/algorithm/sort-list/)会继续使用双路归并，区别在于需要先把一条无序链表切成若干段。

[^python-compare]: [Python 文档：值比较](https://docs.python.org/3/reference/expressions.html#value-comparisons)——说明元组按位置字典序依次比较，一旦某一项分出大小便直接决定结果，不再比较后续元素。

[^heapq]: [Python 文档：`heapq` — 堆队列算法](https://docs.python.org/3/library/heapq.html)——说明 `heapify` 在线性时间内原地建堆，以及 `heapreplace` 与 `heappop` 在弹出并维护固定大小堆时的行为差异。

[^cpp-storage-duration]: [cppreference：存储期与生命周期](https://en.cppreference.com/w/cpp/language/storage_duration.html)——说明自动存储期的局部对象在进入块时分配、离开块作用域时自动销毁，无需堆分配。
