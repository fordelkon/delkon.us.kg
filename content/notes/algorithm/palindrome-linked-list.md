---
title: "回文链表：把判定拆成三个指针原语"
publishDate: "2026-10-22T12:30:00+08:00"
description: "LeetCode Hot 100 的回文链表，从数组复制到快慢指针加原地反转的记录，顺带介绍充当子步骤的反转链表。"
---

[LeetCode 234. 回文链表](https://leetcode.cn/problems/palindrome-linked-list/)（Hot 100）。给定单链表，判断它的节点值正读和反读是否一致。难点在于：单链表能向后走，却不能从尾部倒着走。

## 先用数组完成比对

把节点值复制到 Python 列表，就能直接与逆序副本比较。下面的 `ListNode` 和 `Optional` 沿用题目提供的定义：

```python
class Solution:
    def isPalindrome(self, head: Optional[ListNode]) -> bool:
        vals = []
        curr = head
        while curr:
            vals.append(curr.val)
            curr = curr.next

        return vals == vals[::-1]
```

遍历、切片和比较都只需线性时间，总时间复杂度为 O(n)；`vals` 和逆序副本各占 O(n) 空间，额外空间复杂度仍为 O(n)。这个版本容易检查，也不修改链表。

题目的进阶要求是 O(n) 时间、O(1) 额外空间。要省掉数组，就得让后半段链表本身能倒着走：找到切分点，反转后半段，再与前半段同步比对。这里额外保留一个约定：返回结果前恢复输入链表。

## 反转：保存后继，再修改指向

反转子步骤对应 [LeetCode 206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/)。三个引用就够了：`prev` 指向已反转部分，`curr` 指向待处理部分，`next_node` 暂存原来的后继。

```python
def reverse_linked_list(head: Optional[ListNode]) -> Optional[ListNode]:
    prev, curr = None, head
    while curr:
        # Preserve the remaining chain before redirecting the link.
        next_node = curr.next
        curr.next = prev
        prev, curr = curr, next_node
    return prev
```

每轮把 `curr` 从待处理部分移到已反转部分的头部。先保存后继，再改写 `curr.next`，就不会丢失剩余链表的入口；循环结束后，`prev` 是反转后的头节点。反转 k 个节点需要 O(k) 时间和 O(1) 额外空间。

## 切分：让 slow.next 指向后半段

快指针每次走两步，慢指针每次走一步，但“找到中点”还不够精确。这份实现需要让 `slow.next` 指向待反转的后半段，所以非空链表使用下面的推进条件：

```diff lang="python"
-         while fast and fast.next:
+         # Keep slow at the node just before the second half.
+         while fast.next and fast.next.next:
              slow = slow.next
              fast = fast.next.next
```

只有前方还有两个节点时才推进，停止位置如下。节点序号从 1 开始：

| 链表长度                          | slow 停在             | slow.next 指向 | 需比对的节点数 |
| --------------------------------- | --------------------- | -------------- | -------------- |
| 偶数 2k，如 `1 → 2 → 2 → 1`       | 第 k 个节点           | 第 k+1 个节点  | k              |
| 奇数 2k+1，如 `1 → 2 → 3 → 2 → 1` | 第 k+1 个节点，即中心 | 第 k+2 个节点  | k              |

奇数长度的中心节点不需要配对，把它留在 `slow` 处即可。

`while fast and fast.next` 也能用于回文解法，但要搭配另一套后半段起点约定。若只替换本实现的循环条件，却仍从 `slow.next` 反转，`[1, 2]` 就会出错：`slow` 走到节点 2，`slow.next` 为空，比对循环一次也不执行，最终误判为回文。**推进条件与切分位置必须一起确定**。

## 比对后，无论结果如何都接回原链表

把上面的 `reverse_linked_list` 与下面的类放在同一份 Python 答案中：

```python
class Solution:
    def isPalindrome(self, head: Optional[ListNode]) -> bool:
        if not head or not head.next:
            return True

        slow, fast = head, head
        while fast.next and fast.next.next:
            slow = slow.next
            fast = fast.next.next

        second_half = reverse_linked_list(slow.next)

        is_palin = True
        p1, p2 = head, second_half
        while p2:
            if p1.val != p2.val:
                is_palin = False
                # Leave the comparison loop, but still restore the links.
                break
            p1 = p1.next
            p2 = p2.next

        slow.next = reverse_linked_list(second_half)
        return is_palin
```

以 `1 → 2 → 3 → 2 → 1` 为例，`slow` 停在 3，后半段的 `2 → 1` 被反转成 `1 → 2`。从原链表头和反转后的头同时出发，依次比较 `1 == 1`、`2 == 2`；`p2` 到达末尾时，所有对称位置都已比过，中心的 3 无需参与。

这里有两个边界约定：

- 比对以 `p2` 为界。后半段恰好有 k 个节点，走完它就完成 k 组比较，不必让两个指针同时到达末尾。
- 不匹配时用 `break`，而非直接 `return False`。后半段已经被修改，仍需再反转一次，并通过 `slow.next` 接回原处。

恢复输入是这份实现主动提供的行为，不是回文判定算法成立的前提，也不等同于纯函数：运行过程中仍会临时修改节点的 `next`。在题目的单线程调用和整数比较条件下，无论比较成功还是失败，正常返回后都能得到原来的节点连接关系。

找切分点、反转、比较和再次反转都只扫描线性数量的节点，因此总时间复杂度仍为 O(n)；全程只维护固定数量的引用，额外空间为 O(1)。这道题里需要一起想清楚的是：后半段从哪里开始、比较到哪里结束，以及退出前如何恢复被修改的连接。
