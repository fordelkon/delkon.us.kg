---
title: "LRU 缓存：OrderedDict 的两次踩坑与时序语义"
publishDate: "2026-10-20T12:00:00+08:00"
description: "LeetCode Hot 100 的 LRU 缓存，用 OrderedDict 实现时关于假值陷阱与时序更新的踩坑记录。"
---

[LeetCode 146. LRU 缓存](https://leetcode.cn/problems/lru-cache/)（Hot 100）。缓存满了以后，应该淘汰哪一项？LRU（Least Recently Used，最近最少使用）的规则是淘汰最久未使用的键：`get` 命中、`put` 更新和 `put` 新增都算一次使用，未命中的查询不改变顺序。题目要求两个操作的平均时间复杂度均为 O(1)，并保证容量为正整数。

经典做法是「哈希表 + 双向链表」：哈希表按键找到节点，双向链表维护使用顺序，拿到节点后就能在 O(1) 时间内摘下并接到末尾。这里用 Python 的 `collections.OrderedDict` 表达同样的顺序约定：从头到尾，由最久未使用排到最近使用。

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

保留原来的淘汰写法，只为已有键增加一条提前返回的路径：

```diff lang="python" title="LRU 缓存修正"
  from collections import OrderedDict

  class LRUCache:
      def __init__(self, capacity: int):
          self.cache = OrderedDict()
          self.capacity = capacity

      def get(self, key: int) -> int:
-         if not self.cache.get(key):
+         # Check membership independently of the stored value.
+         if key not in self.cache:
              return -1
          self.cache.move_to_end(key)
          return self.cache[key]

      def put(self, key: int, value: int) -> None:
+         # Updating a key refreshes recency without increasing size.
+         if key in self.cache:
+             self.cache[key] = value
+             self.cache.move_to_end(key)
+             return
          if len(self.cache) >= self.capacity:
              self.cache.popitem(last=False)
          self.cache[key] = value
```

新键插入时本来就在末尾，无需再移动；已有键则要显式刷新位置。每次操作后，缓存都保持两个约束：键的数量不超过容量，键的排列反映最近一次使用的先后。按哈希表操作的平均 O(1) 代价计算，`get` 和 `put` 的平均时间复杂度均为 O(1)，空间复杂度为 O(capacity)。

这次踩坑提醒我：**键的存在性与值的真假分开判断，使用顺序与键的数量分开维护**。把这两组状态分清楚，未命中、更新和新增就各有明确的处理路径。

[^ordered-dict]: [Python 文档：OrderedDict](https://docs.python.org/3/library/collections.html#ordereddict-objects)——说明端点移动、按顺序弹出，以及保留或调整已有键位置的行为。

[^truth-value]: [Python 文档：真值检测与字典操作](https://docs.python.org/3/library/stdtypes.html#truth-value-testing)——说明 `0`、`None` 的真值；同页字典章节说明 `get` 的默认返回值与成员检查。
