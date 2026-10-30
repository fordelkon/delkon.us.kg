---
title: "回文链表：把判定拆成三个指针原语"
publishDate: "2026-10-21T12:30:00+08:00"
description: "LeetCode Hot 100 的回文链表，用 Python 拆解快慢指针、原地反转与链表复原，再用 C++ 在找中点时同步反转前半段。"
---

[LeetCode 234. 回文链表](https://leetcode.cn/problems/palindrome-linked-list/)（Hot 100）。给定单链表，判断它的节点值正读和反读是否一致。难点在于：单链表能向后走，却不能从尾部倒着走。[《相交链表：把状态判定收进循环条件》](/notes/algorithm/linked-list-intersection/) 也用双指针，不过它靠换头补走两条路径，解决的是另一类问题。

## Python 解法：切分、反转、比较并复原

最直观的做法是先把节点值放进列表，再与反向列表比较，但会占用 O(n) 额外空间。题目的进阶要求是 O(n) 时间、O(1) 额外空间：找到中点，反转后半段，让它能与前半段同步比对。这里还约定在返回结果前恢复输入链表；下面的 `ListNode` 和 `Optional` 沿用题目提供的定义。

## 反转：保存后继，再修改指向

反转子步骤对应 [LeetCode 206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/)。三个引用就够了：`prev` 指向已反转部分，`curr` 指向待处理部分，`next_node` 暂存原来的后继。

每轮把 `curr` 从待处理部分移到已反转部分的头部。先保存后继，再改写 `curr.next`，就不会丢失剩余链表的入口；循环结束后，`prev` 是反转后的头节点。完整的 `reverse_linked_list` 函数与回文判定一起放在下方代码中。反转 k 个节点需要 O(k) 时间和 O(1) 额外空间。

## 切分：让 slow.next 指向后半段

快指针每次走两步，慢指针每次走一步，但“找到中点”还不够精确。这份实现需要让 `slow.next` 指向待反转的后半段：代码中的 `while fast.next and fast.next.next` 确保 `slow` 留在后半段的前一个节点。空链表和单节点链表会提前返回，因此这里可以直接检查 `fast.next`。

只有前方还有两个节点时才推进，停止位置如下。节点序号从 1 开始：

| 链表长度                          | slow 停在             | slow.next 指向 | 需比对的节点数 |
| --------------------------------- | --------------------- | -------------- | -------------- |
| 偶数 2k，如 `1 → 2 → 2 → 1`       | 第 k 个节点           | 第 k+1 个节点  | k              |
| 奇数 2k+1，如 `1 → 2 → 3 → 2 → 1` | 第 k+1 个节点，即中心 | 第 k+2 个节点  | k              |

奇数长度的中心节点不需要配对，把它留在 `slow` 处即可。

`while fast and fast.next` 也能用于回文解法，但要搭配另一套后半段起点约定。若只用它替换本实现的循环条件，却仍从 `slow.next` 反转，`[1, 2]` 就会出错：`slow` 走到节点 2，`slow.next` 为空，比对循环一次也不执行，最终误判为回文。**推进条件与切分位置必须一起确定**。

## 比对后，无论结果如何都接回原链表

下面是一份完整的 Python 答案，先定义反转函数，再定义回文判定：

```python
def reverse_linked_list(head: Optional[ListNode]) -> Optional[ListNode]:
    prev, curr = None, head
    while curr:
        # Save the remaining chain before reversing this link.
        next_node = curr.next
        curr.next = prev
        prev, curr = curr, next_node
    return prev

class Solution:
    def isPalindrome(self, head: Optional[ListNode]) -> bool:
        if not head or not head.next:
            return True

        slow, fast = head, head
        # Stop before the second half so slow.next remains its entry point.
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

## C++ 进阶：找中点时反转前半段

Python 版分开找中点、反转和比对，每一步都容易检查。C++ 版可以在快慢指针前进时，同时反转慢指针走过的前半段：快指针每轮走两步，慢指针每轮走一步并把当前节点接到 `reversed` 前面。到达中点后，`reversed` 从中点朝表头排列，后半段从中点朝表尾排列，可以同步比较；比较结束再把前半段接回去。

```cpp
// ListNode is provided by the problem.
class Solution {
public:
    bool isPalindrome(ListNode *head) {
        ListNode *slow = head;
        ListNode *fast = head;
        ListNode *reversed = nullptr;

        while (fast != nullptr && fast->next != nullptr) {
            fast = fast->next->next;
            ListNode *next = slow->next;
            slow->next = reversed;
            reversed = slow;
            slow = next;
        }

        // For odd lengths, slow is the middle node; skip it for comparison.
        ListNode *left = reversed;
        ListNode *right = fast == nullptr ? slow : slow->next;
        bool matches = true;
        while (left != nullptr) {
            if (left->val != right->val) {
                matches = false;
                break;
            }
            left = left->next;
            right = right->next;
        }

        // Reconnect the reversed prefix to the middle or the second half.
        while (reversed != nullptr) {
            ListNode *next = reversed->next;
            reversed->next = slow;
            slow = reversed;
            reversed = next;
        }
        return matches;
    }
};
```

以 `1 → 2 → 3 → 2 → 1` 为例，找中点结束时 `reversed` 是 `2 → 1`，`slow` 指向中心 3，`right` 从中心之后的 2 出发；从 `reversed` 看是 `2, 1`，从后半段看也是 `2, 1`。偶数长度时 `slow` 直接指向后半段起点。`head == nullptr` 和单节点链表的比较循环不执行，均返回 `true`。

这版在找中点时合并了反转扫描，省去单独找中点的一趟；比对和恢复仍需要遍历，时间为 O(n)，额外空间为 O(1)。比较的是节点值，不存在哈希碰撞。遇到第一组不相等的值时虽能提前结束比对，却仍须恢复前半段；执行期间会临时改写链表，不能用于需要并发读取同一链表或只读节点的场景。
