import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

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

export const scene: Scene = {
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
