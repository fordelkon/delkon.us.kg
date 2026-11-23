---
tags: [algorithm]
order:
  # 哈希表与查找
  - post/algorithm/two-sum
  - post/algorithm/group-anagrams
  - post/algorithm/longest-consecutive-sequence
  - post/algorithm/subarray-sum-equals-k
  - post/algorithm/lru
  # 双指针
  - post/algorithm/move-zeroes
  - post/algorithm/container-with-most-water
  - post/algorithm/three-sum
  - post/algorithm/four-sum
  - post/algorithm/trapping-rain-water
  - post/algorithm/longest-palindromic-substring
  # 滑动窗口
  - post/algorithm/longest-substring-without-repeating-characters
  - post/algorithm/find-all-anagrams-in-a-string
  - post/algorithm/minimum-window-substring
  - post/algorithm/sliding-window-maximum
  # 区间
  - post/algorithm/merge-intervals
  - post/algorithm/insert-interval
  - post/algorithm/data-stream-as-disjoint-intervals
  # 链表
  - post/algorithm/linked-list-intersection
  - post/algorithm/palindrome-linked-list
  - post/algorithm/linked-list-cycle-ii
  - post/algorithm/add-two-numbers
  - post/algorithm/remove-nth-node-from-end
  - post/algorithm/copy-list-with-random-pointer
  - post/algorithm/reverse-nodes-in-k-group
  - post/algorithm/sort-list
  - post/algorithm/merge-k-sorted-lists
  # 二叉树
  - post/algorithm/maximum-depth-of-binary-tree
  - post/algorithm/binary-tree-inorder-traversal
  - post/algorithm/binary-tree-level-order-traversal
  - post/algorithm/invert-binary-tree
  - post/algorithm/symmetric-tree
  - post/algorithm/binary-tree-right-side-view
  - post/algorithm/diameter-of-binary-tree
  - post/algorithm/binary-tree-maximum-path-sum
  - post/algorithm/lowest-common-ancestor-of-a-binary-tree
  - post/algorithm/validate-binary-search-tree
  - post/algorithm/kth-smallest-element-in-a-bst
  - post/algorithm/convert-sorted-array-to-binary-search-tree
  - post/algorithm/construct-binary-tree-from-preorder-and-inorder-traversal
  - post/algorithm/flatten-binary-tree-to-linked-list
  - post/algorithm/path-sum-iii
  # 动态规划
  - post/algorithm/climbing-stairs
  - post/algorithm/pascals-triangle
  - post/algorithm/house-robber
  - post/algorithm/maximum-subarray
  - post/algorithm/maximum-product-subarray
  - post/algorithm/coin-change
  - post/algorithm/perfect-squares
  - post/algorithm/partition-equal-subset-sum
  - post/algorithm/word-break
  - post/algorithm/longest-increasing-subsequence
  - post/algorithm/unique-paths
  - post/algorithm/minimum-path-sum
  - post/algorithm/longest-common-subsequence
  - post/algorithm/edit-distance
  - post/algorithm/longest-valid-parentheses
  # 回溯
  - post/algorithm/permutations
  - post/algorithm/subsets
  - post/algorithm/letter-combinations-of-a-phone-number
  - post/algorithm/combination-sum
  - post/algorithm/generate-parentheses
  - post/algorithm/palindrome-partitioning
  - post/algorithm/word-search
  - post/algorithm/n-queens
  # 图论
  - post/algorithm/number-of-islands
  - post/algorithm/rotting-oranges
  - post/algorithm/course-schedule
  - post/algorithm/implement-trie-prefix-tree
  # 二分查找
  - post/algorithm/find-first-and-last-position-of-element-in-sorted-array
  - post/algorithm/search-a-2d-matrix
  - post/algorithm/search-a-2d-matrix-ii
  - post/algorithm/search-in-rotated-sorted-array
  - post/algorithm/median-of-two-sorted-arrays
  # 栈
  - post/algorithm/valid-parentheses
  - post/algorithm/min-stack
  - post/algorithm/decode-string
  - post/algorithm/daily-temperatures
  - post/algorithm/largest-rectangle-in-histogram
  # 堆
  - post/algorithm/top-k-elements
  - post/algorithm/find-median-from-data-stream
  # 贪心
  - post/algorithm/best-time-to-buy-and-sell-stock
  - post/algorithm/jump-game
  - post/algorithm/partition-labels
  # 矩阵与数组
  - post/algorithm/product-of-array-except-self
  - post/algorithm/first-missing-positive
  - post/algorithm/rotate-array-and-matrix
  - post/algorithm/set-matrix-zeroes
  - post/algorithm/spiral-matrix
  # 技巧
  - post/algorithm/linear-cancellation-tricks
  - post/algorithm/sort-colors
  - post/algorithm/next-permutation
  - post/algorithm/find-the-duplicate-number
sections:
  - tag: hash-table
    title: 哈希表与查找
  - tag: two-pointer
    title: 双指针
  - tag: sliding-window
    title: 滑动窗口
  - tag: interval
    title: 区间
  - tag: linked-list
    title: 链表
  - tag: binary-tree
    title: 二叉树
  - tag: dynamic-programming
    title: 动态规划
  - tag: backtracking
    title: 回溯
  - tag: graph
    title: 图论
  - tag: binary-search
    title: 二分查找
  - tag: stack
    title: 栈
  - tag: heap
    title: 堆
  - tag: greedy
    title: 贪心
  - tag: matrix
    title: 矩阵与数组
  - tag: tricks
    title: 技巧
title: "算法题解与思考"
description: "以 LeetCode Hot 100 及相关题目为线索，整理常见数据结构与算法的解题思路、实现方法和复杂度分析。"
---

本系列通过具体题目讨论常见的数据结构与算法，从问题契约、不变式推导到代码实现，比较不同方法的适用条件与时间、空间成本，并梳理题目之间可以复用的核心机制。

内容以 LeetCode Hot 100 及相关题目为主，按数据结构与解题范式组织为 15 个专题，每个专题内部按由浅入深的递进顺序编排。示例主要使用 Python 与 C++；阅读递归、回溯与树图遍历相关解法时，建议先结合[《从调用栈理解递归》](/posts/understanding-recursion/)建立栈帧与状态恢复模型。

### 推荐阅读路线

1. **线性结构与扫描不变式**：从**哈希表与查找**、**双指针**与**滑动窗口**起步，掌握“以空间换查表”“单调排除候选”与“窗口扩张/收缩”，再延伸至**区间**扫描线与**矩阵与数组**中的原地编码和边界收缩。
2. **指针、树与图遍历**：先通过**链表**训练指针不变式与快慢指针（后续直接复用于[《寻找重复数》](/posts/algorithm/find-the-duplicate-number/)），再进入**二叉树**的递归贡献与中序/层序遍历，最后自然过渡到**图论**的连通分量、多源 BFS、拓扑判环与 Trie 状态机。
3. **搜索、剪枝与最优决策**：**回溯**专题围绕共享路径恢复与剪枝展开；**动态规划**按一维滚动、背包、序列对齐与括号结构递进；**贪心**则聚焦局部支配与最远边界，并与[《零钱兑换》](/posts/algorithm/coin-change/)等反例对照适用边界。
4. **单调结构、选择与常数空间技巧**：**二分查找**从边界模板推进到旋转数组与切分点二分；**栈**与**堆**分别处理嵌套上下文、单调边界与流式极值维护；**技巧**专题收束异或/投票对消、荷兰国旗三路划分与字典序后继等 $O(1)$ 空间原语。
