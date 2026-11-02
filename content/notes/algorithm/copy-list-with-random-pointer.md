---
title: "随机链表的复制：哈希表与交织节点"
publishDate: "2026-10-31T12:00:00+08:00"
description: "LeetCode 138：用 Python 两趟哈希映射完成深拷贝，用 C++ 三趟交织复制降低辅助空间，并恢复原链表。"
---

[LeetCode 138. 随机链表的复制](https://leetcode.cn/problems/copy-list-with-random-pointer/)（Hot 100）为每个节点增加了 `random` 指针，它可以指向链表中的任意节点，也可以为空。深拷贝要求新节点与原节点彼此独立，复制后的 `next` 和 `random` 都应指向新链表中的对应节点。

困难在于：顺着 `next` 访问一个节点时，它的 `random` 可能指向前面、后面，甚至它自己。若将每个节点看作有向图中的顶点（出度至多为 2），链表深拷贝在本质上就是有向图的遍历克隆。标准的递归 DFS 解法必须依赖哈希表记录已克隆节点：此时哈希表兼具防止图环路陷入无限递归的 `visited` 访问标记与跨分支复用新节点的注册表双重语义（关于图递归中访问标记的深入探讨，参见[《从调用栈理解递归》中关于图标记的讨论](/posts/understanding-recursion/#从树扩展到图时标记代表什么)）。

## Python：两趟扫描建立映射

迭代哈希表法将上述图克隆平铺为两趟线性扫描：第一趟只创建节点并记录对应关系，第二趟再连接指针。这样无论 `random` 指向前面还是后面，目标节点的副本都已经存在，且无需承担递归栈帧开销。

```python
from typing import Optional


class Solution:
    def copyRandomList(self, head: Optional[Node]) -> Optional[Node]:
        copies = {None: None}

        current = head
        while current is not None:
            copies[current] = Node(current.val)
            current = current.next

        current = head
        while current is not None:
            copied = copies[current]
            copied.next = copies[current.next]
            copied.random = copies[current.random]
            current = current.next

        return copies[head]
```

`copies` 使用原节点对象作为键，而不是节点值，因为不同节点的值可能相同。LeetCode 提供的节点类使用默认的对象身份比较与哈希行为，可以直接作为字典键；自定义节点类时，如果重写了相等性或哈希规则，需要重新确认这一点[^python-hash]。

预先放入 `{None: None}`，就能统一处理空链表、末尾的 `next` 和空的 `random`。后续使用下标访问：在题目的输入约束下，每个目标都应已有映射；如果遗漏了映射，会抛出 `KeyError`，而不会像 `dict.get` 那样把缺失目标默认为 `None`[^python-dict]。

在字典操作平均为 $O(1)$ 的前提下，总时间为 $O(n)$。输出链表占用 $O(n)$ 空间，字典另外占用 $O(n)$ 辅助空间。这个版本不会修改原链表，通常也更容易检查连接是否正确。

## C++：把对应关系放在相邻节点之间

如果允许临时修改原链表，可以把每个新节点插到对应原节点的后面。原节点的 `next` 就能直接指向它的副本，不再需要外部映射表。原链表本身在此充当了隐式的映射标记，将辅助空间由哈希表的 $O(n)$ 彻底压缩为 $O(1)$。

```text
原始: A -> B -> C -> nullptr
交织: A -> A' -> B -> B' -> C -> C' -> nullptr
```

整个过程分三趟：

1. **插入副本**：把每个新节点放到原节点后面，并让新节点暂时指向下一个原节点。
2. **连接 random**：如果 `A.random` 指向 `C`，那么 `A'` 的 `random` 就指向 `C.next`，也就是 `C'`。
3. **拆开两条链表**：恢复原节点之间的 `next`，同时连接副本节点之间的 `next`。

```cpp
class Solution {
public:
    Node* copyRandomList(Node* head) {
        if (head == nullptr) {
            return nullptr;
        }

        Node* current = head;
        while (current != nullptr) {
            Node* copied = new Node(current->val);
            copied->next = current->next;
            current->next = copied;
            current = copied->next;
        }

        // Every random target now has its copy immediately at target->next.
        current = head;
        while (current != nullptr) {
            Node* copied = current->next;
            copied->random = current->random != nullptr
                ? current->random->next
                : nullptr;
            current = copied->next;
        }

        // Unweave both lists only after all random links are set.
        Node* copied_head = head->next;
        current = head;
        while (current != nullptr) {
            Node* copied = current->next;
            Node* next_original = copied->next;
            current->next = next_original;
            copied->next = next_original != nullptr
                ? next_original->next
                : nullptr;
            current = next_original;
        }
        return copied_head;
    }
};
```

必须先完成全部 `random` 连接，再拆开链表。否则某个 `random` 指向已经恢复的原节点时，该节点的 `next` 就不再指向它的副本。第三趟通过 `next_original` 保存下一个原节点，重连两侧指针后再推进，避免丢失后续入口。原节点的 `random` 从未被修改，`next` 则在正常返回前恢复。

三趟扫描的总时间为 $O(n)$。新建的 $n$ 个节点属于输出，占用 $O(n)$ 空间；除输出外只使用固定数量的指针，因此辅助空间为 $O(1)$。这并不表示复制整条链表只占常数总空间。

交织期间，其他代码不能同时遍历或修改这条链表，调用方需要保证对其修改的独占访问。这里的简洁实现按节点分配成功的情况编写：如果中途 `new` 抛出 `std::bad_alloc`，不会自动清理已插入的副本或恢复原链表，因此不提供强异常保证[^cpp-new][^cpp-exception-safety]。需要处理分配失败的工程代码应另行实现回滚与清理。

Python 哈希表版本用显式映射换取清晰的控制流程；C++ 交织版本利用临时连接节省辅助空间，并承担恢复原结构的责任。与[《排序链表：递归归并与自底向上归并》](/notes/algorithm/sort-list/)一样，分析指针算法时，应同时确认节点如何连接、何时可以改写，以及函数结束后调用方能观察到什么。

[^python-hash]: [Python 文档：`object.__hash__`](https://docs.python.org/3/reference/datamodel.html#object.__hash__)——说明用户自定义类默认提供基于对象身份的相等性与哈希实现；若仅重写 `__eq__` 而未定义 `__hash__`，实例将变为不可哈希。

[^python-dict]: [Python 文档：字典映射类型](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——说明 `d[key]` 在键缺失时抛出 `KeyError`，而 `get(key)` 默认返回 `None`。

[^cpp-new]: [cppreference：`operator new`](https://en.cppreference.com/w/cpp/memory/new/operator_new.html)——说明默认分配函数在内存分配失败时抛出 `std::bad_alloc` 异常。

[^cpp-exception-safety]: [cppreference：异常安全保证](https://en.cppreference.com/w/cpp/language/exceptions.html#Exception_safety)——说明强异常保证要求操作失败时状态完全回滚到调用前，中途改写原链表且未回滚已分配节点不属于强异常保证。
