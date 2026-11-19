import { EXECUTION_LEGEND, interaction, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

const atomicity: Scene = {
	title: "原子访问与完整操作",
	section: "单次操作与组合操作",
	description:
		"本图假设：count 是原子整数，初值 0，无溢出。先展示拆开的 load/store 丢失更新，再重置为 0 对照 fetch_add；全部访问都是原子操作，不模拟未定义行为。箭头从共享值指向线程表示读取，反向表示写入；两条高亮不代表同时写入。",
	caption: "单次访问原子，不代表一组操作原子；两次加一要用读改写操作或完整的临界区。",
	frames: [
		interaction(
			"A 读到 0，在自己的局部值上计算 1。它尚未把结果提交给原子 count；单次 load 的原子性不会覆盖之后的计算与 store。",
			["A：load → 0", "局部计算 1"],
			["B", "尚未读取"],
			["共享原子 count", "0"],
			["分开的操作", "load → 本地计算 → store"],
			"left",
		),
		interaction(
			"B 也在 A 写回之前读到 0，计算出 1。这是两个合法原子读取，不存在这里的非原子数据竞争。",
			["A：准备写 1", "保留局部值"],
			["B：load → 0", "局部计算 1"],
			["共享原子 count", "0"],
			["逻辑风险", "两份局部快照相同"],
			"right",
		),
		interaction(
			"A、B 先后各 store(1)，最终 count=1。即使用 SeqCst 把这些独立原子访问排成全序，也不会把两组 load/store 自动合成两个不可分割的加一。",
			["A：store(1)", "已完成"],
			["B：store(1)", "覆盖同一个值"],
			["最终 count", "1 · 丢失一次逻辑更新"],
			["内存访问合法", "业务要求 count=2 未满足"],
		),
		interaction(
			"独立运行：count 重置为 0，A、B 各执行一次 fetch_add(1, Relaxed)。这两次读改写在该原子对象的修改顺序中不可分割，先后把 0 变成 1、1 变成 2；并不发布其他数据。",
			["A：fetch_add", "旧值 0 → 新值 1"],
			["B：fetch_add", "旧值 1 → 新值 2"],
			["最终 count", "2 · 两次更新均保留"],
			["读改写边界", "Relaxed 已足够维护这个计数"],
		),
	].map((frame, index) => ({
		...frame,
		durationMs: 5000,
		edges:
			index < 2
				? [edge("read", index === 0 ? "M86 100 V62" : "M274 100 V62", true)]
				: [edge("write-a", "M86 56 V94", true), edge("write-b", "M274 56 V94", true)],
	})),
};

const publication: Scene = {
	title: "发布与 happens-before",
	section: "release--acquire发布与接收的边界",
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

export const scene: Scene = {
	...atomicity,
	legend: EXECUTION_LEGEND,
	chapters: [atomicity, publication],
};
