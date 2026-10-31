---
title: "LRU 缓存：OrderedDict 的两次踩坑与时序语义"
publishDate: "2026-10-20T12:00:00+08:00"
description: "LeetCode Hot 100 的 LRU 缓存，用 OrderedDict 实现时关于假值陷阱与时序更新的踩坑记录。"
---

[LeetCode 146. LRU 缓存](https://leetcode.cn/problems/lru-cache/)（Hot 100）要求实现固定容量的缓存：缓存满了以后，淘汰**最近最少使用**（LRU, Least Recently Used）的键，`get` 命中、`put` 更新和 `put` 新增都算一次使用，未命中的查询不改变顺序。题目要求两个操作的平均时间复杂度均为 O(1)，并保证容量为正整数。

经典做法是「哈希表 + 双向链表」：哈希表像[《两数之和：先查补数，再记下标》](/notes/algorithm/two-sum/)那样按键做平均 O(1) 定位，双向链表维护使用顺序；拿到节点后就能在 O(1) 时间内原地改写前后指针，把节点摘下并接到表头，而不必像[《回文链表：把判定拆成三个指针原语》](/notes/algorithm/palindrome-linked-list/)中的单链表那样只能顺着 `next` 单向推进。这里先用 Python 的 `collections.OrderedDict` 表达同样的顺序约定：从头到尾，由最久未使用排到最近使用。

- `move_to_end(key)`：把已有键移到末尾，记录刚发生的访问。
- `popitem(last=False)`：移除并返回最前面的键值对，用于淘汰[^ordered-dict]。

这让实现很短，但仍有两件事需要自己判断：键是否存在，以及这次写入是否增加了键的数量。

## 值为 0，不代表没有这个键

初版用 `if not self.cache.get(key)` 判断未命中。存入 `key = 1, value = 0` 后，`get(1)` 得到的却是 `-1`：`dict.get` 在键缺失时默认返回 `None`，而 `None` 和整数 `0` 都会被真值判断归为假[^truth-value]。

这里要问的是“键在不在”，所以直接用 `key not in self.cache`。本题的值只能是非负整数，`self.cache.get(key) is None` 也能区分缺失；但如果以后允许缓存 `None`，这种写法就不再可靠。成员检查不依赖值域，更贴合问题本身。

## 更新已有键，也要刷新使用顺序

`OrderedDict` 对已有键赋值时会保留其原来的位置；更新值之后，还需要显式调用 `move_to_end`[^ordered-dict]。而且更新不会增加键的数量，不能因为缓存已满就先淘汰。

用容量为 2 的缓存走一遍，方括号表示从最久未使用到最近使用的键顺序：

| 操作          | 操作后的顺序 | 结果                     |
| ------------- | ------------ | ------------------------ |
| `put(1, 10)`  | `[1]`        | 新增键 1                 |
| `put(2, 20)`  | `[1, 2]`     | 新增键 2，容量已满       |
| `put(2, 200)` | `[1, 2]`     | 只更新值，不能淘汰键 1   |
| `put(1, 100)` | `[2, 1]`     | 更新键 1，并将它移到末尾 |
| `put(3, 30)`  | `[1, 3]`     | 淘汰键 2                 |

第三步检查“更新不扩容”，第四、五步检查“更新也算使用”。如果把更新当成新增，第三步就会误删键 1；如果只更新值、不移动位置，第五步就会淘汰错误的键。

## 将两条规则落实到实现

先判断键是否存在：命中时更新使用顺序，`put` 更新已有键后直接返回；只有插入新键且容量已满时才淘汰最旧的键。

```python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key: int) -> int:
        # A cached value of 0 is still a hit.
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key: int, value: int) -> None:
        # Updating an existing key does not consume another slot.
        if key in self.cache:
            self.cache[key] = value
            self.cache.move_to_end(key)
            return
        if len(self.cache) >= self.capacity:
            self.cache.popitem(last=False)
        self.cache[key] = value
```

新键插入时本来就在末尾，无需再移动；已有键则要显式刷新位置。每次操作后，缓存都保持两个约束：键的数量不超过容量，键的排列反映最近一次使用的先后。按哈希表操作的平均 O(1) 代价计算，`get` 和 `put` 的平均时间复杂度均为 O(1)，空间复杂度为 O(capacity)。

这次踩坑提醒我：**键的存在性与值的真假分开判断，使用顺序与键的数量分开维护**。把这两组状态分清楚，未命中、更新和新增就各有明确的处理路径。

## C++ 进阶：哈希定位与循环哨兵

Python 版的 `OrderedDict` 隐藏了节点操作；在 C++ 中，可以用 `unordered_map<int, Node*>` 按键定位节点，再用双向链表维护使用顺序。这样不依赖题目给出的键值范围，任意 `int` 键都能走同一套逻辑。

把一个**循环哨兵节点**（sentinel node）放在链表首尾之间：`dummy.next` 指向最新使用的节点，`dummy.prev` 指向最久未使用的节点。空链表时两者都指向 `dummy`。命中时先摘下节点，再放回头部；未命中且已满时，淘汰 `dummy.prev`。哨兵让这两项指针操作不必分别处理空链表、头节点和尾节点。

```cpp
#include <memory>
#include <unordered_map>

class LRUCache {
    struct Node {
        int key;
        int value;
        Node *prev = nullptr;
        Node *next = nullptr;

        Node(int key, int value) : key(key), value(value) {}
    };

    int capacity_;
    // Circular sentinel: dummy_.next is most recent, dummy_.prev is least recent.
    Node dummy_{0, 0};
    std::unordered_map<int, Node *> key_to_node_;

    void detach(Node *node) {
        node->prev->next = node->next;
        node->next->prev = node->prev;
    }

    void attach_front(Node *node) {
        node->prev = &dummy_;
        node->next = dummy_.next;
        dummy_.next->prev = node;
        dummy_.next = node;
    }

    Node *touch(int key) {
        auto it = key_to_node_.find(key);
        if (it == key_to_node_.end()) return nullptr;
        Node *node = it->second;
        detach(node);
        attach_front(node);
        return node;
    }

public:
    explicit LRUCache(int capacity) : capacity_(capacity) {
        dummy_.prev = &dummy_;
        dummy_.next = &dummy_;
    }

    ~LRUCache() {
        Node *node = dummy_.next;
        while (node != &dummy_) {
            Node *next = node->next;
            delete node;
            node = next;
        }
    }

    LRUCache(const LRUCache &) = delete;
    LRUCache &operator=(const LRUCache &) = delete;

    int get(int key) {
        Node *node = touch(key);
        return node == nullptr ? -1 : node->value;
    }

    void put(int key, int value) {
        if (Node *node = touch(key)) {
            node->value = value;
            return;
        }

        auto fresh = std::make_unique<Node>(key, value);
        // Retain ownership until insertion succeeds; the cache then owns the node.
        key_to_node_.emplace(key, fresh.get());
        attach_front(fresh.release());
        if (key_to_node_.size() > static_cast<std::size_t>(capacity_)) {
            Node *oldest = dummy_.prev;
            key_to_node_.erase(oldest->key);
            detach(oldest);
            delete oldest;
        }
    }
};
```

沿用上面的容量 2 示例：`put(2, 200)` 命中时只更新值并把节点移到最新端，不会误删键 1；`put(1, 100)` 使键 2 成为最久未使用；随后 `put(3, 30)` 新增节点，淘汰尾部的键 2。`touch` 同时服务于 `get` 命中和 `put` 更新，两条路径不会遗漏顺序刷新。

链表摘除与插入都是 O(1)，哈希表查找、插入和删除平均 O(1)，所以两种操作平均 O(1)，额外空间 O(capacity)；哈希冲突严重时不保证最坏 O(1)。新增节点与哈希表可能分配内存，淘汰节点会释放内存。插入哈希表前用 `std::make_unique` 临时持有新节点，`emplace` 失败时也不会泄漏[^make-unique][^unordered-emplace]；析构函数释放仍在缓存中的节点，禁止复制以免两个缓存共同持有同一批裸指针。相比限制键范围的数组直索引，这份实现保留了通用性，并没有声称在所有负载下都更快。

[^ordered-dict]: [Python 文档：OrderedDict](https://docs.python.org/3/library/collections.html#ordereddict-objects)——说明端点移动、按顺序弹出，以及保留或调整已有键位置的行为。

[^truth-value]: [Python 文档：真值检测与字典操作](https://docs.python.org/3/library/stdtypes.html#truth-value-testing)——说明 `0`、`None` 的真值；同页字典章节说明 `get` 的默认返回值与成员检查。

[^make-unique]: [cppreference：`std::make_unique`](https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique.html)——说明用独占智能指针包装动态分配，在调用 `release()` 移交所有权前若发生异常会自动释放节点。

[^unordered-emplace]: [cppreference：`unordered_map::emplace`](https://en.cppreference.com/w/cpp/container/unordered_map/emplace.html)——说明原位插入键值对，若插入期间抛出异常则容器保持原状。
