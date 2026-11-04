---
title: "两数相加：统一多指针循环与进位状态"
publishDate: "2026-10-26T12:00:00+08:00"
description: "LeetCode 2 的两数相加：用哨兵节点锚定动态构建的新链表，将多链表长短差异与最高位进位统一收敛进单个循环条件。"
---

[LeetCode 2. 两数相加](https://leetcode.cn/problems/add-two-numbers/)给定两个非空单链表，每个节点保存一位十进制数字，低位在前。例如 `2 -> 4 -> 3` 表示 342，与 `5 -> 6 -> 4` 相加后得到 `7 -> 0 -> 8`，表示 807。按链表顺序逐位相加即可，关键是处理长度不同和最后一位进位；不需要先转换成整数。

## 哨兵节点消除首节点特判

在从无到有构建新链表时，如果不用哨兵节点，第一轮必须区分“这是新链表的第一个节点”还是“追加到已有节点之后”：

```python
# Without a sentinel, appending the first node needs a separate branch.
if not head:
    head = ListNode(digit)
    curr = head
else:
    curr.next = ListNode(digit)
    curr = curr.next
```

使用哨兵节点 `dummy = ListNode(0)` 作为占位头后，每次都向 `curr.next` 追加节点，最后返回 `dummy.next`。哨兵的值不参与求和，它只负责固定结果入口；[《删除链表的倒数第 N 个结点：固定间距定位前驱》](/notes/algorithm/remove-nth-node-from-end/)也用哨兵统一处理头节点边界。

## 统一多指针推进与进位状态

若按照直观思路，代码往往被拆分成三个顺序循环：先同时走 `l1` 和 `l2`，再单独排空较长的那条链表，最后在循环外判断最高位是否有进位 `carry > 0`。这种拆分使状态维护分散在三处，容易遗漏边界。

更紧凑的做法是将两条链表的遍历与进位状态收纳进单一循环条件：`while l1 or l2 or carry`。只要任一链表仍有未处理的高位数字，或者上一轮计算留下了进位，循环就必须继续推进；单步求和的进位与当前位数字可通过内建函数 `divmod` 一步析出[^divmod]：

```python
from typing import Optional


class Solution:
    def addTwoNumbers(
        self, l1: Optional[ListNode], l2: Optional[ListNode]
    ) -> Optional[ListNode]:
        dummy = ListNode(0)
        curr = dummy
        carry = 0

        # Continue if either list has digits or the highest place carries over.
        while l1 or l2 or carry:
            val1 = l1.val if l1 else 0
            val2 = l2.val if l2 else 0
            carry, digit = divmod(val1 + val2 + carry, 10)

            curr.next = ListNode(digit)
            curr = curr.next

            if l1:
                l1 = l1.next
            if l2:
                l2 = l2.next

        return dummy.next
```

两条输入的 `next` 链必须有限且无环，每个节点值在 0 到 9 之间。实现只移动局部引用，不改写输入节点；每一位结果都新建节点，不与输入共用节点。每轮开始时，`curr` 指向结果尾部（初始为哨兵），`l1`、`l2` 指向下一位待处理数字，`carry` 为 0 或 1。

设两条链表长度分别为 $m$ 与 $n$。循环最多执行 $\max(m, n) + 1$ 次。由于每个节点只访问一次，时间复杂度为 $O(\max(m, n))$；除返回的结果链表外，仅使用了有限的指针变量，额外空间为 $O(1)$。

例如 `9 -> 9` 与 `1` 相加：前两轮分别产生数字 0，进位都为 1；第三轮虽然两个输入都已耗尽，`carry` 仍让循环执行一次，补上最高位 1。每轮结束时，结果链表已经保存处理过的所有低位，`carry` 只留给下一位。

## C++：栈上哨兵，按需分配结果节点

C++ 版使用局部哨兵 `ListNode dummy(0)`，省去哨兵本身的一次堆分配。返回的 `dummy.next` 指向另行分配的结果节点，哨兵离开作用域不会销毁这些节点；这里依赖题目提供的节点类型没有递归释放后继的析构函数[^cpp-storage-duration]。正常返回后，结果节点的所有权交给调用方，输入节点仍由原持有者管理。下面按节点分配成功的题解前提编写；若中途 `new` 抛出异常，已建结果不会自动清理，需要调用环境另行处理，不能把这段裸指针示例视为具有异常安全保证的资源封装。

```cpp
class Solution {
public:
    ListNode* addTwoNumbers(ListNode* l1, ListNode* l2) {
        ListNode dummy(0);
        ListNode* curr = &dummy;
        int carry = 0;

        while (l1 != nullptr || l2 != nullptr || carry != 0) {
            const int val1 = (l1 != nullptr) ? l1->val : 0;
            const int val2 = (l2 != nullptr) ? l2->val : 0;
            const int sum = val1 + val2 + carry;
            carry = sum / 10;

            curr->next = new ListNode(sum % 10);
            curr = curr->next;

            if (l1 != nullptr) l1 = l1->next;
            if (l2 != nullptr) l2 = l2->next;
        }

        return dummy.next;
    }
};
```

C++ 与 Python 使用相同的逐位算法，时间复杂度均为 $O(\max(m, n))$。辅助空间为 $O(1)$；若计入必须返回的新链表，总空间为 $O(\max(m, n))$。主要分配开销来自每个结果节点的 `new`，局部哨兵不会改变这一量级，也不能据此推断实际运行速度。

[^divmod]: [Python 文档：内置函数 divmod](https://docs.python.org/3/library/functions.html#divmod)——说明对整数参数返回包含商与余数的元组 (a // b, a % b)。

[^cpp-storage-duration]: [cppreference：存储期与生命周期](https://en.cppreference.com/w/cpp/language/storage_duration.html)——说明具有自动存储期的局部对象在离开声明块作用域时由系统保证自动析构并回收存储空间。
