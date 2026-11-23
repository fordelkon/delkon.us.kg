---
title: "实现 Trie（前缀树）：共享前缀与连续节点池"
publishDate: "2026-11-29T12:00:00+08:00"
description: "LeetCode 208 实现 Trie（前缀树）：将字符串集合组织为按字符转移的有根树状态机，对比哈希集合在前缀检索上的局限，并用 Python 稀疏字典与 C++ 连续节点池实现。"
tags: ["algorithm", "graph", "python", "cpp"]
---

[LeetCode 208. 实现 Trie（前缀树）](https://leetcode.cn/problems/implement-trie-prefix-tree/)（Hot 100）要求设计并实现一棵**前缀树**（Trie），支持以下三个操作：

- `insert(word)`：向前缀树中插入字符串 `word`；
- `search(word)`：如果字符串 `word` 在前缀树中，返回 `true`，否则返回 `false`；
- `startsWith(prefix)`：如果之前已插入的字符串中存在以 `prefix` 为前缀的词，返回 `true`，否则返回 `false`。

题目保证 `word` 和 `prefix` 仅由小写英文字母组成，长度在 $[1, 2000]$ 之间，三类操作总调用次数不超过 $3 \times 10^4$。

## 为什么哈希集合无法替代前缀树

在[《字母异位词分组：排序签名、频次元组与质数哈希》](/posts/algorithm/group-anagrams/)和[《单词拆分：前缀可行性转移与子串查找成本》](/posts/algorithm/word-break/)中，我们看到哈希表非常擅长**整词精确查找**：给定完整字符串 `word`，平均 $O(\lvert\text{word}\rvert)$ 即可算出哈希并完成比对。

但只要查询需求扩展到**前缀匹配**（`startsWith`）或**逐字符增量匹配**，普通哈希集合就面临两难：要么每次扫描整个字典逐词检查前缀，耗时退化为与字典总字符数成正比；要么把每个单词的所有前缀都塞进另一个哈希集合，导致空间与插入时间膨胀为单词长度的平方级。

**前缀树**（prefix tree / Trie）由 Edward Fredkin 命名[^fredkin-trie]，把单词拆成字符边，本质上是一棵以空串为根的**确定性有限状态机**（树形有向无环图）：

- 从根节点出发，每条有向边标有一个字符 $c \in \Sigma$；
- 具有相同前缀的单词共享从根出发的同一段路径；
- 每个节点额外维护一个布尔标记 `is_end`，用于区分“仅作为其他长词的前缀路过这里”与“此处恰好是一个已插入单词的结尾”。

因此，`search(word)` 与 `startsWith(prefix)` 共享同一套沿字符边向下转移的逻辑 `_find_node(s)`：若中途遇到缺失分支，两者都返回 `false`；若顺利走完全部字符，`startsWith` 直接返回 `true`，而 `search` 还需额外确认落点节点的 `is_end` 为 `true`。

在[《单词拆分：前缀可行性转移与子串查找成本》](/posts/algorithm/word-break/#用前缀树共享字符匹配)中，我们曾把字典单词反序插入前缀树来共享后缀匹配并提前剪枝；而在[《单词搜索：网格路径回溯与原地标记》](/posts/algorithm/word-search/)扩展到多词检索（LeetCode 212）时，前缀树同样用来与网格 DFS 同步推进、在前缀不存在时立刻剪除整片网格分支。

## Python：稀疏字典转移节点

当字符集大小记为 $\Sigma$（本题为 26 个小写字母）时，每个节点有两种表示子边的方式：长度为 $\Sigma$ 的定长数组，或按需分配的哈希字典 `dict[str, _TrieNode]`[^py-dict]。在 Python 中，使用 `dict` 只为实际存在的子字符创建条目，既省去了空槽位初始化开销，又能直接平滑推广到 Unicode 或更大字符集；加上 `__slots__` 可省去每个节点的实例 `__dict__`，显著降低内存占用：

```python
from typing import Optional


class _TrieNode:
    __slots__ = ("children", "is_end")

    def __init__(self) -> None:
        self.children: dict[str, _TrieNode] = {}
        self.is_end: bool = False


class Trie:
    def __init__(self) -> None:
        # Root represents the empty prefix.
        self._root = _TrieNode()

    def insert(self, word: str) -> None:
        # Time complexity: O(L), where L = len(word)
        node = self._root
        for ch in word:
            nxt = node.children.get(ch)
            if nxt is None:
                nxt = _TrieNode()
                node.children[ch] = nxt
            node = nxt
        node.is_end = True

    def _find_node(self, prefix: str) -> Optional[_TrieNode]:
        node = self._root
        for ch in prefix:
            nxt = node.children.get(ch)
            if nxt is None:
                return None
            node = nxt
        return node

    def search(self, word: str) -> bool:
        # Time complexity: O(L)
        node = self._find_node(word)
        return node is not None and node.is_end

    def startsWith(self, prefix: str) -> bool:
        # Time complexity: O(L)
        return self._find_node(prefix) is not None
```

## C++：连续节点池（Arena）与整数下标链接

在 C++ 中，教科书常见写法是用 `new TrieNode()` 为每个节点单独做堆分配，再用裸指针相连；这不仅造成大量细粒度堆碎片和缓存不命中，还必须在析构函数中手写递归释放（否则内存泄漏，且长链析构可能引发栈溢出）。

延续[《单词拆分：前缀可行性转移与子串查找成本》](/posts/algorithm/word-break/#用前缀树共享字符匹配)的工程实践，我们可以把全部节点存放在单个连续的 `std::vector<Node> nodes_` 中作为**节点池**（arena），用整数下标（`-1` 表示空分支）代替指针，并由 `std::vector` 的 RAII 析构自动一次性回收全部内存。

需要注意一个关键细节：调用 `nodes_.emplace_back()` 追加新节点时，如果 `vector` 触发扩容重分配，所有指向旧元素的引用和指针都会失效[^cpp-emplace-back]。因此**绝不能**在 `emplace_back()` 之前把 `nodes_[curr]` 绑定为引用并在之后继续写入，而应先算出 `next_idx = nodes_.size()`、完成 `emplace_back()` 后，再用整数下标 `nodes_[curr].next[idx] = next_idx` 重新索引。查询接口接收只读 `std::string_view`，不复制调用方字符串[^cpp-string-view]：

```mermaid title="C++ 连续节点池版 Trie 类结构" description="Trie 通过 vector<Node> nodes_ 连续存储所有节点（索引 0 为根节点），Node 用定长数组 next 保存子节点下标并以 -1 表示空转移，对外提供 insert、search 与 startsWith，内部统一复用 findNode。"
classDiagram
    class Trie {
        -vector~Node~ nodes_
        +Trie()
        +insert(string_view word) void
        +search(string_view word) bool
        +startsWith(string_view prefix) bool
        -findNode(string_view s) int
    }

    class Node {
        +array~int, 26~ next
        +bool is_end
        +Node()
    }

    Trie "1" *-- "1..*" Node : nodes_ 连续池（0 为根）
    Node ..> Node : next[c] 下标跳转（-1 为空）
```

```cpp
#include <array>
#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

class Trie {
    struct Node {
        // Indices into `nodes_`; -1 denotes an absent character transition.
        std::array<int, 26> next;
        bool is_end = false;

        Node() {
            next.fill(-1);
        }
    };

    std::vector<Node> nodes_;

    int findNode(std::string_view prefix) const {
        int curr = 0;
        for (char ch : prefix) {
            const int idx = ch - 'a';
            const int nxt = nodes_[curr].next[idx];
            if (nxt == -1) {
                return -1;
            }
            curr = nxt;
        }
        return curr;
    }

public:
    Trie() {
        // Node 0 is the root representing the empty prefix.
        nodes_.emplace_back();
    }

    void insert(const std::string& word) {
        // Time complexity: O(L), where L = word.size()
        int curr = 0;
        for (char ch : word) {
            const int idx = ch - 'a';
            if (nodes_[curr].next[idx] == -1) {
                const int next_idx = static_cast<int>(nodes_.size());
                nodes_.emplace_back();
                // Re-index `nodes_[curr]` after emplace_back in case of reallocation.
                nodes_[curr].next[idx] = next_idx;
            }
            curr = nodes_[curr].next[idx];
        }
        nodes_[curr].is_end = true;
    }

    bool search(const std::string& word) const {
        // Time complexity: O(L)
        const int idx = findNode(word);
        return idx != -1 && nodes_[idx].is_end;
    }

    bool startsWith(const std::string& prefix) const {
        // Time complexity: O(L)
        return findNode(prefix) != -1;
    }
};
```

## 复杂度分析与节点表示权衡

设单次查询或插入的字符串长度为 $L$，字母表大小为 $\Sigma$（本题 $\Sigma = 26$），已插入全部单词的总字符数为 $W$，整棵树实际创建的节点数为 $N \le W + 1$。

- **时间复杂度**：定长数组写法下，`insert`、`search`、`startsWith` 每步只做一次下标偏移访问，最坏严格为 $O(L)$；字典写法在平均散列条件下同样为 $O(L)$。两者均与已插入单词总数无关。
- **空间复杂度**：定长数组节点池占用 $O(N \cdot \Sigma)$ 空间（节点密集时缓存局部性好，稀疏长词时存在大量 `-1` 空槽）；稀疏字典写法只存储实际出现的边，空间为 $O(N)$（更准确地说是节点数加边数，均为 $O(W)$），但每条边带有哈希表开销。

| 节点子边实现 | 单次操作时间 | 空间占用 | 字符集扩展性 | 内存管理与局部性 |
| :--- | :----------- | :------- | :----------- | :--------------- |
| 定长数组 + 连续节点池（C++） | 严格 $O(L)$ | $O(N \cdot \Sigma)$ | 适合小固定字符集（如 `'a'..'z'`） | 连续存储缓存友好，RAII 一次性释放 |
| 稀疏哈希字典（Python） | 平均 $O(L)$ | $O(N)$ | 天然支持任意 Unicode 字符集 | 避免空槽浪费，但节点分散分配 |
| 裸指针 `new` / `delete` | 严格 $O(L)$ | $O(N \cdot \Sigma)$ | 适合小固定字符集 | 需手动析构，易碎片化或深链爆栈 |

[^fredkin-trie]: [Edward Fredkin (1960): _Trie Memory_](https://www.semanticscholar.org/paper/Trie-memory-Fredkin/316961b569563051f5bee4bd318e057fadca71b7)（*Communications of the ACM*, 3(9), pp. 490–499）——正式命名 Trie（取自 retrieval 中间音节）并系统阐述按字符逐层分支的检索树结构。

[^py-dict]: [Python 文档：映射类型 `dict`](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)——`dict.get(key)` 在缺失键时返回 `None` 而不插入条目，适合实现稀疏字符转移表。

[^cpp-emplace-back]: [cppreference：`std::vector::emplace_back`](https://en.cppreference.com/w/cpp/container/vector/emplace_back.html)——规定当新容量超出当前 `capacity()` 触发重分配时，所有已有迭代器、指针与引用都会失效。

[^cpp-string-view]: [C++ 工作草案：字符串视图](https://eel.is/c++draft/string.view)——非拥有式只读字符视图，避免查询辅助函数复制输入字符串。
