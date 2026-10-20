---
title: "LRU 缓存：两次踩坑记录"
publishDate: "2026-10-20T12:00:00+08:00"
description: "LeetCode Hot 100 的 LRU 缓存，用 OrderedDict 实现时我踩过的两个坑。"
---

[LeetCode 146. LRU 缓存](https://leetcode.cn/problems/lru-cache/)（Hot 100）。`OrderedDict` 相当于现成的「哈希表 + 双向链表」：`move_to_end` 挪到尾部表示最近使用，`popitem(last=False)` 从头部弹出最久未使用。

第一版到修正版的完整改动：

```diff lang="python"
  from collections import OrderedDict

  class LRUCache:
      def __init__(self, capacity: int):
          self.cache = OrderedDict()
          self.capacity = capacity

      def get(self, key: int) -> int:
-         if not self.cache.get(key):
+         # 坑1：拿返回值真假当哨兵，没考虑 value 为 0 的边界——Python 过于宽松掩盖了它
+         if key not in self.cache:
              return -1
          self.cache.move_to_end(key)  # get 命中算「使用」
          return self.cache[key]

      def put(self, key: int, value: int) -> None:
+         # 坑2：put 已有 key 也是一次「使用」，忘了挪 LRU 顺序就错了
+         if key in self.cache:
+             self.cache[key] = value
+             self.cache.move_to_end(key)
+             return
          if len(self.cache) >= self.capacity:
              self.cache.popitem(last=False)
          self.cache[key] = value
```

要点就两条：**存在性判断别依赖返回值真假**（value 为 0 时 `.get()` 会误判；`in` 或 `.get(key) is not None` 都行），以及**所有「访问」——get 命中、put 已有 key、put 新 key——都要 `move_to_end`**，只有 put 新 key 且容量满时才从头部淘汰。
