import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Frame, type Scene } from "./types.ts";

const frames: Frame[] = [
	{
		note: "无锁交错（1）：A 与 B 同时从共享 count 读取到 0，各自在局部变量算出 1。",
		boxes: [
			node("a", 8, 8, 156, ["线程 A", "load → 0 · 算得 1"], "actor", true),
			node("b", 196, 8, 156, ["线程 B", "load → 0 · 算得 1"], "actor", true),
			node("shared", 70, 96, 220, ["无锁保护 · count = 0", "两线程读到同一旧值"], "control", true),
			node("rule", 8, 176, 344, ["读-改-写被交错拆开", "A 尚未写回，B 已读取 0"], "state"),
		],
		edges: [edge("read-a", "M140 96 L86 60", true), edge("read-b", "M220 96 L274 60", true)],
	},
	{
		note: "无锁交错（2）：A、B 依次把各自算出的 1 写回 count，最终结果是 1，丢失了一次加一更新。",
		boxes: [
			node("a", 8, 8, 156, ["线程 A", "store(1) 完成"], "actor", true),
			node("b", 196, 8, 156, ["线程 B", "store(1) 覆盖写回"], "actor", true),
			node("shared", 70, 96, 220, ["无锁结果 · count = 1", "丢失一次 +1 更新"], "control", true),
			node("rule", 8, 176, 344, ["只锁单次写仍不够", "两份局部结果都是 0 + 1"], "control"),
		],
		edges: [edge("write-a", "M86 56 L140 92", true), edge("write-b", "M274 56 L220 92", true)],
	},
	{
		note: "改用 Mutex 保护完整临界区：A 取得锁后独自完成 0 → 1，B 只能停在 lock() 门外等待。",
		boxes: [
			node("a", 8, 8, 156, ["线程 A（持锁）", "读 0 → 写回 1"], "actor", true),
			node("b", 196, 8, 156, ["线程 B（等待）", "停在 lock() 门外"], "control"),
			node("lock", 8, 96, 164, ["Mutex 锁", "归属：线程 A"], "state", true),
			node("shared", 188, 96, 164, ["受保护 count", "0 → 1"], "state", true),
			node("rule", 8, 176, 344, ["完整临界区：读 → 改 → 写 → 解锁", "释放前 B 无法进入"], "state"),
		],
		edges: [
			edge("a-lock", "M86 56 V92", true),
			controlEdge("b-wait", "M274 56 L145 94"),
			edge("a-count", "M172 120 H184", true),
		],
	},
	{
		note: "A 解锁后，B 获得同一把锁并从 1 改写为 2。互斥保护了整个读-改-写，两次更新均被保留。",
		boxes: [
			node("a", 8, 8, 156, ["线程 A（已解锁）", "已完成本轮 +1"], "actor"),
			node("b", 196, 8, 156, ["线程 B（持锁）", "读 1 → 写回 2"], "actor", true),
			node("lock", 8, 96, 164, ["Mutex 锁", "归属：线程 B → 释放"], "state", true),
			node("shared", 188, 96, 164, ["受保护 count", "1 → 2 · 更新保留"], "result", true),
			node(
				"rule",
				8,
				176,
				344,
				["互斥串行化读-改-写", "两次加一按序落盘，count = 2"],
				"result",
				true,
			),
		],
		edges: [edge("b-lock", "M274 56 L130 94", true), edge("b-count", "M172 120 H184", true)],
	},
];

export const scene: Scene = {
	title: "无锁交错丢更新 vs Mutex 守护完整临界区",
	section: "mutex独占访问",
	legend: EXECUTION_LEGEND,
	caption: "互斥的不是某一次写入，而是“读旧值 → 计算 → 写新值”这整段读-改-写临界区。",
	description:
		"前两帧展示无锁保护时两线程同时读到 0 并先后写回 1，导致更新丢失；后两帧展示 Mutex 把完整读-改-写串行化，使两次加一按序把 count 从 0 推到 2。",
	frames,
};
