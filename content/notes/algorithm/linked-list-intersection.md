---
title: "相交链表：把状态判定收进循环条件"
publishDate: "2026-10-22T10:00:00+08:00"
description: "LeetCode Hot 100 的相交链表，推导双指针换头的相遇条件，并修正循环中漏检 None 的终止时序。"
---

[LeetCode 160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/)（Hot 100）给定两条无环单链表，要求返回它们的第一个公共节点；没有交点则返回 `None`。这里的“公共”指同一个节点对象，节点值相等并不算相交。

双指针解法的规则很短：`p` 从 A 出发，`q` 从 B 出发；每轮各走一步，遇到 `None` 就换到对方的头节点。**先检查两者是否为同一个对象，再推进指针**，相遇时返回该节点，也可能返回 `None`。[《回文链表：把判定拆成三个指针原语》](/notes/algorithm/palindrome-linked-list/)也用双指针，不过它靠不同步长定位中点，解决的是另一类问题。

## 换头如何抵消长度差

设 A、B 在交点前分别有 `a`、`b` 个节点，公共尾部有 `c` 个节点。换头让两个指针都补走对方的独立部分：

```text
A: a nodes -> shared tail (c nodes) -> None
B: b nodes -> shared tail (c nodes) -> None
```

如果 `a = b`，两个指针不必换头，走 `a` 步就会在交点相遇。若 `a != b`，它们换头后到达交点所需的步数分别为：

- `p`：`a + c + 1 + b`；
- `q`：`b + c + 1 + a`。

两式相等。这里一步指执行一次指针赋值：从尾节点走到 `None` 已计入第一条链表的遍历，从 `None` 换到另一条链表的头还需额外一步，所以有 `+1`。长度差被抵消后，两者会在公共尾部的起点相遇。

若不相交，设两条链表长度分别为 `m`、`n`。两个指针各走完 A、B 并换头一次，都会在 `m + n + 1` 步后到达 `None`，也可能更早同时到达 `None`（例如两条链表等长）。因此，不需要单独给“无交点”设置计数上限。整体时间复杂度为 O(m + n)，额外空间为 O(1)。

## 漏掉 None 的原因是检查顺序

我初版把换头写在判等之前，并且换头后当轮还会再推进一次。以两条互不相交的单节点链表为例，一轮末尾两个指针同时到达 `None`；下一轮却先把它们换成各自的头节点，判等再也看不到刚才的 `None` 状态，最后只能靠额外计数跳出循环。

修正后，每轮先在循环条件里检查两个指针是否相同，再各推进一步；到达 `None` 的指针下一步切换到对方的链表头。`ListNode` 和 `Optional` 沿用题目提供的定义：

```python
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

`is` 比较对象身份，直接表达“是否为同一个节点”，不依赖节点类如何定义 `==`[^identity]。相遇条件也覆盖 `None is None`，所以正常交点和无交点可以共用一个出口。

## 判等和换头各做一件事

循环条件 `p is not q` 负责终止，包括两者同时为 `None` 的无交点情形。两个条件表达式只决定下一步去哪：当前是节点就走向后继，当前是 `None` 就切到对方的头。每轮每个指针只做一次转移，不会在换头后立刻再前进一步；若改用 `while True`，只要仍在轮首判等，语义一样。

这道题适合提炼出的经验是：**把终止条件放在不会漏掉合法结束状态的位置**。可靠性来自检查顺序，而不是某一种语法本身。

## C++ 进阶：同步扫描、尾节点剪枝与长度对齐

换头法适合用几行代码处理所有情况。C++ 版进一步利用两条**无环**链表的结构：如果它们相交，从交点起必然共用同一个尾节点；尾节点不同，就不用再寻找交点。先让两个指针同步前进，保留等长链表早期相遇时立即返回的路径；若一条链先结束，才扫描另一条链的剩余部分，得到长度差并比较尾节点。`ListNode` 沿用题目提供的定义。

```cpp
#include <cstddef>

class Solution {
public:
    ListNode *getIntersectionNode(ListNode *headA, ListNode *headB) {
        ListNode *a = headA;
        ListNode *b = headB;
        ListNode *tailA = nullptr;
        ListNode *tailB = nullptr;

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

扫描和对齐至多进行线性数量的指针移动，总时间 O(m + n)、额外空间 O(1)，且不分配或修改节点。等距交点可以在同步扫描时直接返回，尾节点不同则可省去后续对齐和比较；长度不同且相交时还需要对齐并再次遍历。相较于换头法的实际速度取决于输入分布、分支和内存访问，不能仅凭循环次数断言更快。

## 评测器建链阶段：可提交的分配优化

上面的 `getIntersectionNode` 只读链表，本身不分配节点；如果评测器为每组输入反复执行 `new ListNode(...)` 和 `delete`，节点分配也可能影响整个提交的运行时间。手动封装的 `NodePool::create` 需要调用方主动使用，评测器不会调用它。C++ 允许程序替换全局普通 `operator new/delete`[^global-new][^global-delete]；若评测器确实使用这组分配函数创建和释放节点，下例与上面的 `Solution` 类放在同一个提交文件中，就能参与建链阶段的分配。

```cpp
#include <cstddef>
#include <cstdlib>
#include <functional>
#include <mutex>
#include <new>

namespace NodeAllocation {
constexpr std::size_t BLOCK_COUNT = 1u << 18;

// Scalar new must return default-new-aligned storage for any same-size type.
struct alignas(__STDCPP_DEFAULT_NEW_ALIGNMENT__) Slot {
    std::byte storage[sizeof(ListNode)];
    Slot *next;
};

Slot slots[BLOCK_COUNT];
Slot *free_head = nullptr;
std::size_t used = 0;
std::mutex mutex;

bool owns(const void *pointer) noexcept {
    std::less<const void *> less;
    return !less(pointer, static_cast<const void *>(slots)) &&
           less(pointer, static_cast<const void *>(slots + BLOCK_COUNT));
}
} // namespace NodeAllocation

void *operator new(std::size_t size) {
    if (size == sizeof(ListNode)) {
        std::lock_guard<std::mutex> guard(NodeAllocation::mutex);
        if (NodeAllocation::free_head != nullptr) {
            auto *slot = NodeAllocation::free_head;
            NodeAllocation::free_head = slot->next;
            return slot->storage;
        }
        if (NodeAllocation::used < NodeAllocation::BLOCK_COUNT) {
            return NodeAllocation::slots[NodeAllocation::used++].storage;
        }
    }

    // Fall back for other sizes or an exhausted pool; honor new_handler.
    for (;;) {
        if (void *pointer = std::malloc(size == 0 ? 1 : size)) return pointer;
        if (auto handler = std::get_new_handler()) {
            handler();
        } else {
            throw std::bad_alloc();
        }
    }
}

void operator delete(void *pointer) noexcept {
    if (pointer == nullptr) return;
    if (NodeAllocation::owns(pointer)) {
        auto *slot = reinterpret_cast<NodeAllocation::Slot *>(pointer);
        std::lock_guard<std::mutex> guard(NodeAllocation::mutex);
        slot->next = NodeAllocation::free_head;
        NodeAllocation::free_head = slot;
    } else {
        std::free(pointer);
    }
}

void operator delete(void *pointer, std::size_t) noexcept {
    ::operator delete(pointer);
}

// Keep arrays on the ordinary heap, even if their byte count matches a node.
void *operator new[](std::size_t size) {
    for (;;) {
        if (void *pointer = std::malloc(size == 0 ? 1 : size)) return pointer;
        if (auto handler = std::get_new_handler()) {
            handler();
        } else {
            throw std::bad_alloc();
        }
    }
}

void operator delete[](void *pointer) noexcept {
    std::free(pointer);
}

void operator delete[](void *pointer, std::size_t) noexcept {
    ::operator delete[](pointer);
}
```

`Slot` 按默认 `new` 的对齐要求布置[^global-new]，释放的槽位进入空闲链表，池满后回退到普通分配；`owns` 用 `std::less<const void *>` 判断指针是否落在静态池区间内，避免直接对非同一数组的指针使用内建关系运算符[^std-less]，非池分配则交由 `std::free` 释放[^global-delete]。数组分配与释放单独走普通堆，避免同尺寸数组和节点池混用[^global-new][^global-delete]。普通 `new` 的底层分配失败时先调用已安装的 `new_handler`，若它返回就重试；没有处理器时抛出 `std::bad_alloc`[^global-new]。互斥锁保护槽位分配与归还，因为替换的全局分配和释放函数也必须支持并发调用[^global-new]。`Solution` 仍只通过 `next` 找交点，**不能**把连续分配的地址当作链表连接关系。

这是一种**评测环境定向**的优化：全局 `operator new` 只能看到申请大小，任何恰好与 `ListNode` 同尺寸、通过普通 `new` 分配的对象也会进入池；额外对齐对象的 `new` 会优先选择 C++17 的对齐版本，类专属分配函数也可能接管调用[^new-expression]。固定池会占用常驻内存，锁与所有权检查也有开销；评测器如何创建节点、是否多组输入重用进程，都会影响收益。代码没有修改求交算法的 O(m + n) 时间、O(1) 额外空间；它在提交环境中可能减少节点的底层分配次数，但不能仅凭源码保证更快。

[^identity]: [Python 文档：比较运算](https://docs.python.org/3/library/stdtypes.html#comparisons)——区分对象身份比较 `is` 与可由类自定义的相等比较 `==`。

[^global-new]: [cppreference：`operator new` 的全局替换](https://en.cppreference.com/w/cpp/memory/new/operator_new.html)——说明全局普通分配函数可替换、默认对齐要求、失败时调用 `new_handler`，以及替换函数的线程安全要求。

[^global-delete]: [cppreference：`operator delete` 的全局替换](https://en.cppreference.com/w/cpp/memory/new/operator_delete.html)——说明全局释放函数可替换，编译器可选择 C++14 起提供的带大小释放重载。

[^std-less]: [cppreference：`std::less`](https://en.cppreference.com/w/cpp/utility/functional/less.html)——说明指针特化保证严格全序，即使两个指针并不指向同一个数组，也可安全比较先后顺序。

[^new-expression]: [cppreference：`new` 表达式](https://en.cppreference.com/w/cpp/language/new.html)——说明类专属分配函数的查找，以及 C++17 对超出默认对齐的类型选择对齐版本分配函数。
