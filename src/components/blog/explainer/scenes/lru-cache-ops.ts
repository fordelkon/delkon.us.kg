import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

const pitfalls: Scene = {
	title: "OrderedDict 两次踩坑：假值与更新时序",
	section: "值为-0-不代表没有这个键",
	legend: EXECUTION_LEGEND,
	caption:
		"把「键是否存在」与「值是否为真」分开判断，把「更新已有键」与「插入新键」的容量和顺序更新分开处理。",
	description:
		"对照 OrderedDict 实现 LRU 时的两个典型错误：值 0 被布尔求值误判为未命中，以及更新已有键时未刷新使用顺序或误触发淘汰。",
	frames: [
		{
			note: "踩坑一（假值陷阱）：put(1, 0) 存入合法值 0。若用 `if not cache.get(1)` 判空，0 会被当成假值，get(1) 误返回 -1。",
			boxes: [
				node(
					"op",
					8,
					8,
					344,
					["错误写法：if not cache.get(1)", "get(1) 返回 0 → 布尔求值为 False"],
					"control",
					true,
				),
				node("kv", 8, 96, 164, ["cache 内部条目", "key=1, val=0"], "state", true),
				node(
					"fix",
					188,
					96,
					164,
					["正确写法：key not in cache", "成员检查 → 命中返回 0"],
					"result",
					true,
				),
				node("rule", 8, 184, 344, ["核心原则", "成员存在性与值真假严格分离"], "actor"),
			],
			edges: [edge("e1", "M90 56 V92", true), edge("e2", "M270 56 V92", true)],
		},
		{
			note: "踩坑二前提（容量已满）：容量为 2，依次 put(1, 10) 与 put(2, 20)。OrderedDict 从左到右为最久到最近：[1, 2]。",
			boxes: [
				node("op", 8, 8, 344, ["前置状态：容量 = 2", "依次 put(1, 10)、put(2, 20)"], "actor", true),
				node("old", 8, 96, 164, ["最久未使用（队首）", "key=1, val=10"], "state"),
				node("new", 188, 96, 164, ["最近使用（队尾）", "key=2, val=20"], "state", true),
				node("rule", 8, 184, 344, ["顺序约定", "[1, 2]：队首淘汰，队尾最新"], "control"),
			],
			edges: [edge("e12", "M172 120 H184", true)],
		},
		{
			note: "踩坑二（更新不扩容、且须刷新位置）：put(1, 100) 更新已有键 1。不会占用新槽位，也不能淘汰键 2；同时必须显式 move_to_end(1)。",
			boxes: [
				node(
					"op",
					8,
					8,
					344,
					["操作：put(1, 100) 更新已有键", "不触发淘汰，且 move_to_end(1)"],
					"actor",
					true,
				),
				node("old", 8, 96, 164, ["退居最久（队首）", "key=2, val=20"], "state"),
				node("new", 188, 96, 164, ["刷新到最新（队尾）", "key=1, val=100"], "result", true),
				node(
					"rule",
					8,
					184,
					344,
					["若漏掉 move_to_end", "顺序仍停在 [1, 2]，下次将误删 1"],
					"control",
				),
			],
			edges: [edge("e21", "M172 120 H184", true)],
		},
		{
			note: "验证时序结果：接着 put(3, 30) 新增键 3。因前一步已将键 1 移到队尾，popitem(last=False) 正确淘汰最久未用的键 2，留下 [1, 3]。",
			boxes: [
				node(
					"op",
					8,
					8,
					344,
					["操作：put(3, 30) 插入新键", "超容触发 popitem(last=False)"],
					"actor",
					true,
				),
				node("old", 8, 96, 164, ["留在缓存（队首）", "key=1, val=100"], "state"),
				node("new", 188, 96, 164, ["新插入（队尾）", "key=3, val=30"], "result", true),
				node("rule", 8, 184, 344, ["已淘汰键 2", "顺序变为 [1, 3]，容量维持 2"], "control", true),
			],
			edges: [edge("e13", "M172 120 H184", true)],
		},
	],
};

const linkedListFrames = [
	{
		op: "容量=2：依次 put(1,10)、put(2,20)",
		nodes: [
			{ id: "n2", label: "k=2", val: "v=20" },
			{ id: "n1", label: "k=1", val: "v=10" },
		],
		hash: "map: 1 → 节点 1，2 → 节点 2",
		note: "双向链表从左到右按最近使用排到最久未使用：最新节点 2 紧挨 dummy_head。",
	},
	{
		op: "put(2, 200)：更新键 2",
		nodes: [
			{ id: "n2", label: "k=2", val: "v=200" },
			{ id: "n1", label: "k=1", val: "v=10" },
		],
		hash: "map: 1 → 节点 1，2 → 节点 2",
		note: "键 2 已在哈希表中：直接改值并保持在最新端，绝不淘汰节点 1。",
	},
	{
		op: "get(1)：节点 1 移到表头",
		nodes: [
			{ id: "n1", label: "k=1", val: "v=10" },
			{ id: "n2", label: "k=2", val: "v=200" },
		],
		hash: "map: 1 → 节点 1，2 → 节点 2",
		note: "get(1) 通过 map 常数时间找到节点 1，原地改指针把它摘到表头，节点 2 退居表尾。",
	},
	{
		op: "put(3, 30)：淘汰键 2",
		nodes: [
			{ id: "n3", label: "k=3", val: "v=30" },
			{ id: "n1", label: "k=1", val: "v=10" },
		],
		hash: "map: 1 → 节点 1，3 → 节点 3",
		note: "新节点 3 插入表头后超容，直接摘除并释放表尾最旧节点 2，同步从 map 抹去键 2。",
	},
] as const;

const linkedList: Scene = {
	title: "双向链表与哈希索引：原地摘插与淘汰",
	section: "将两条规则落实到实现",
	legend: EXECUTION_LEGEND,
	caption:
		"展示容量为 2 的双向链表实例：头部为最新使用，尾部为最久未使用，哈希表平均 O(1) 直达节点。",
	description:
		"以容量 2 的缓存依次执行 put(1,10)、put(2,20)、put(2,200)、get(1)、put(3,30)，展示双向链表节点重排与尾部淘汰。",
	frames: linkedListFrames.map((item) => ({
		note: item.note,
		boxes: [
			node("op", 8, 8, 344, ["当前操作", item.op], "actor", true),
			node("head", 8, 96, 68, ["哨兵", "head"], "control"),
			node("slot0", 90, 96, 84, [item.nodes[0].label, item.nodes[0].val], "state", true),
			node("slot1", 188, 96, 84, [item.nodes[1].label, item.nodes[1].val], "state"),
			node("tail", 284, 96, 68, ["哨兵", "tail"], "control"),
			node("hash", 8, 184, 344, ["哈希索引", item.hash], "result"),
		],
		edges: [
			edge("h0", "M76 116 H88", true),
			edge("01", "M174 116 H186", true),
			edge("10", "M186 126 H174", true),
			edge("1t", "M272 116 H282", true),
			edge("0h", "M88 126 H78"),
			edge("t1", "M282 126 H274"),
		],
	})),
};

export const scene: Scene = {
	...pitfalls,
	legend: EXECUTION_LEGEND,
	chapters: [pitfalls, linkedList],
};
