import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 真实 3x3 局部有序矩阵: [[1, 4, 11], [2, 5, 16], [3, 9, 17]]
const matrix = [
	[1, 4, 11],
	[2, 5, 16],
	[3, 9, 17],
];

const steps: {
	r: number;
	c: number;
	elimCols: number[];
	elimRows: number[];
	info: string;
	note: string;
}[] = [
	{
		r: 0,
		c: 2,
		elimCols: [],
		elimRows: [],
		info: "11 > 5，排除第 2 列",
		note: "11 是第 2 列最小值，下方 16、17 必然更大，直接 c-- 排除整列。",
	},
	{
		r: 0,
		c: 1,
		elimCols: [2],
		elimRows: [],
		info: "4 < 5，排除第 0 行",
		note: "4 是第 0 行剩余最大值，左侧 1 必然更小，直接 r++ 排除整行。",
	},
	{
		r: 1,
		c: 1,
		elimCols: [2],
		elimRows: [0],
		info: "在 (1,1) 找到 5",
		note: "在偏序矩阵上仅用 3 步 Z 字移动就定位目标 5，最坏步数 <= m + n。",
	},
];

export const scene: Scene = {
	title: "3x3 矩阵的右上角 Z 字形阶梯搜索（target = 5）",
	section: "为什么必须从右上角或左下角出发",
	legend: EXECUTION_LEGEND,
	caption: "灰色为已被整行或整列排除的格子，箭头标出从右上角 11 到目标 5 的阶梯路径。",
	description:
		"在 3x3 矩阵 [[1,4,11],[2,5,16],[3,9,17]] 中查找 5：先在右上角 11 排除第 2 列，再在 4 排除第 0 行，下移命中 5。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			...matrix.flatMap((row, r) =>
				row.map((val, c) => {
					const isCurr = r === s.r && c === s.c;
					const isMuted = !isCurr && (s.elimCols.includes(c) || s.elimRows.includes(r));

					return {
						...node(
							`g-${r}-${c}`,
							54 + c * 88,
							12 + r * 56,
							76,
							[`(${r},${c})`, String(val)],
							isCurr && val === 5 ? "result" : isCurr ? "state" : "actor",
							isCurr,
						),
						muted: isMuted,
					};
				}),
			),
			node("info", 8, 188, 344, ["鞍点决策", s.info], s.r === 1 ? "result" : "control", true),
		],
		edges:
			s.r === 1
				? [edge("move", "M180 61 V68", true)]
				: s.c === 1
					? [edge("move", "M228 36 H220", true)]
					: [],
	})),
};
