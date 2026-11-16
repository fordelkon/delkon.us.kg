import { box, edge, type Scene } from "./types.ts";

const notes = [
	"A 先写入原子 payload=42（Relaxed）。",
	"A 以 Release 写入 ready=true。",
	"B 以 Acquire 读取 ready，观察到这一次 true。",
	"虚线是 Release → Acquire 同步边，成立条件是读到对应的发布写入。",
	"线程内顺序与同步边共同建立 happens-before，B 后续读取 payload 必须得到 42。",
	"仅用 Relaxed 标志无法建立这条发布链；这里的数据发布后不再改写。",
];

const highlights = [
	["write"],
	["release"],
	["acquire"],
	["release", "acquire"],
	["write", "read"],
	["release", "acquire", "read"],
];

const links = [[], [0], [], [2], [0, 1, 2], []];

const frames = notes.map((note, step) => ({
	note,
	boxes: [
		box(
			"write",
			84,
			8,
			192,
			["A：payload = 42", "Relaxed 写入"],
			highlights[step]?.includes("write"),
		),
		box(
			"release",
			84,
			92,
			192,
			["A：ready = true", "Release 发布"],
			highlights[step]?.includes("release"),
		),
		box(
			"acquire",
			84,
			176,
			192,
			["B：读取 ready", "Acquire 读到 true"],
			highlights[step]?.includes("acquire"),
		),
		box(
			"read",
			84,
			260,
			192,
			["B：读取 payload", "Relaxed 得到 42"],
			highlights[step]?.includes("read"),
		),
	],
	edges: [
		edge("writer-order", "M180 56 V86", links[step]?.includes(0)),
		{ ...edge("synchronize", "M180 140 V170", links[step]?.includes(2)), dashed: true },
		edge("reader-order", "M180 224 V254", links[step]?.includes(1)),
	],
}));

export const scene: Scene = {
	diagramHeight: 316,
	title: "一次性发布：先写入，再观察",
	caption: "先写数据，再用 Release 发布；Acquire 读到该发布值后，后续读取得到 42。",
	description:
		"一次性发布且不再改写数据：A 先以 Relaxed 写入原子 payload=42，再以 Release 写 ready=true；B 的 Acquire 读取观察到这次 true 后，后续以 Relaxed 读取 payload 必须得到 42。虚线表示有条件的 Release → Acquire 同步边，实线表示线程内顺序，共同建立 happens-before；只用 Relaxed 标志不能建立这条发布链。",
	frames,
};
