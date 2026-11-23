import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 真实 4 节点 DAG 例子: 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3
const steps: {
	indeg: [number, number, number, number];
	done: number[];
	curr: number;
	info: string;
	note: string;
}[] = [
	{
		indeg: [0, 1, 1, 2],
		done: [],
		curr: 0,
		info: "队列 [0]",
		note: "在真实先修依赖图 0->1, 0->2, 1->3, 2->3 中，只有课程 0 初始入度为 0。",
	},
	{
		indeg: [0, 0, 0, 2],
		done: [0],
		curr: 1,
		info: "队列 [1, 2]",
		note: "删去 0->1 与 0->2 后，课程 1 和课程 2 的先修条件全部满足；课程 3 仍为入度 2。",
	},
	{
		indeg: [0, 0, 0, 0],
		done: [0, 1, 2],
		curr: 3,
		info: "队列 [3]",
		note: "注意课程 3 必须等两条前驱边 1->3 和 2->3 都剥离后才入队。",
	},
	{
		indeg: [0, 0, 0, 0],
		done: [0, 1, 2, 3],
		curr: -1,
		info: "队列为空，已修 4 门课",
		note: "全图剥离完成；若存在有向环，环上节点入度永远 >= 1 而无法入队。",
	},
];

export const scene: Scene = {
	title: "4 课程先修依赖图（菱形 DAG）的拓扑剥离",
	section: "方案一kahn-算法与入度多源队列python",
	legend: EXECUTION_LEGEND,
	caption:
		"展示真实菱形有向图 0->1->3 与 0->2->3；出队后移除该节点的出边，入度归零的邻居进入队列。",
	description:
		"在 4 节点菱形依赖图上演示 Kahn 算法如何逐层删边、将入度从 [0,1,1,2] 依次降为 0，并最终完成全部 4 门课。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			node(
				"c0",
				136,
				12,
				88,
				["课程 0", `in=${s.indeg[0]}`],
				s.done.includes(0) ? "result" : "actor",
				s.curr === 0,
			),
			node(
				"c1",
				36,
				98,
				88,
				["课程 1", `in=${s.indeg[1]}`],
				s.done.includes(1) ? "result" : "state",
				s.curr === 1,
			),
			node(
				"c2",
				236,
				98,
				88,
				["课程 2", `in=${s.indeg[2]}`],
				s.done.includes(2) ? "result" : "state",
				s.curr === 2,
			),
			node(
				"c3",
				136,
				184,
				88,
				["课程 3", `in=${s.indeg[3]}`],
				s.done.includes(3) ? "result" : "control",
				s.curr === 3,
			),
			node("msg", 8, 244, 344, ["拓扑队列状态", s.info], "actor", s.curr === -1),
		],
		edges: [
			...(!s.done.includes(0)
				? [edge("e01", "M160 60 L88 94"), edge("e02", "M200 60 L272 94")]
				: []),
			...(!s.done.includes(1)
				? [edge("e13", "M88 146 L160 180"), edge("e23", "M272 146 L200 180")]
				: []),
		],
	})),
	diagramHeight: 300,
};
