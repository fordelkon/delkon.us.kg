import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

export const scene: Scene = {
	title: "发布与 happens-before",
	section: "release--acquire发布与接收的边界",
	legend: EXECUTION_LEGEND,
	diagramHeight: 336,
	description:
		"本图假设：payload 与 ready 都是原子变量，初值 0 / false，只发布一次，之后不再改写。纵向实线是 sequenced-before；横向虚线仅在读到本次发布时表示 synchronizes-with。沿三条边推导出 happens-before。最后一帧是独立的弱序对照。",
	caption:
		"Acquire 必须读到对应发布，才能把线程内顺序接成 happens-before；原子标志本身不自动发布其他数据。",
	frames: [
		"A 以 Relaxed 写入原子 payload=42。此时还没有通过 ready 发布，B 不能仅凭执行时间推断这份数据已被接收。",
		"A 以 Release 写入 ready=true，为此前的数据写入建立发布的一端。Release 不发布发生在它之后的写入。",
		"B 的 Acquire 读取观察到 A 这次 true，虚线同步边才成立；若读到初始 false，本协议应继续等待，不能走到读取数据的分支。",
		"沿 A 的线程内顺序、发布到接收的同步边、B 的线程内顺序，得到写 payload 到读 payload 的 happens-before。本例没有后续改写，最终 Relaxed 读取必须得到 42。",
		"独立对照：ready 的读写也都使用 Relaxed。即使 B 读到 true，也没有这条跨变量发布链，原子 payload 的读取可能为 0 或 42。这里是允许结果的对照，不是上一帧完成后把值倒退。",
	].map((note, index) => ({
		note,
		boxes: [
			node(
				"write",
				8,
				8,
				156,
				["A：payload = 42", "Relaxed 写入"],
				"actor",
				index === 0 || index === 3,
			),
			node(
				"release",
				8,
				96,
				156,
				["A：ready = true", index === 4 ? "Relaxed 写入" : "Release 发布"],
				"state",
				index === 1 || index === 2 || index === 4,
			),
			node(
				"acquire",
				196,
				96,
				156,
				[
					"B：读取 ready",
					index < 2 ? "尚未接收发布" : index === 4 ? "Relaxed 得 true" : "Acquire 得 true",
				],
				"state",
				index >= 2,
			),
			node(
				"read",
				196,
				184,
				156,
				[
					"B：读取 payload",
					index < 3 ? "等待条件成立" : index === 4 ? "允许 0 或 42" : "必须得到 42",
				],
				index === 4 ? "control" : "result",
				index >= 3,
			),
			node(
				"boundary",
				8,
				280,
				344,
				[
					index === 4 ? "弱序对照：无同步边" : "一次性数据发布",
					index < 2
						? "等待对应的读取"
						: index === 4
							? "无数据竞争 ≠ 已建立发布链"
							: "读到本次 Release → 同步成立",
				],
				"control",
				true,
			),
		],
		edges: [
			edge("writer", "M86 56 V90", index >= 1),
			...(index >= 2 && index < 4
				? [{ ...edge("sync", "M164 120 H190", true), dashed: true }]
				: []),
			edge("reader", "M274 144 V178", index >= 3),
		],
	})),
};
