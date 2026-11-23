import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import type { Scene } from "./types.ts";

// 真实 3x3 矩阵: [[1,2,3],[4,5,6],[7,8,9]]
const matrix = [
	[1, 2, 3],
	[4, 5, 6],
	[7, 8, 9],
];

const steps: { visited: number[]; active: number[]; info: string; note: string }[] = [
	{
		visited: [],
		active: [1, 2, 3],
		info: "1. 走顶行 [1,2,3]，top 缩为 1",
		note: "剥掉第 0 行后 top += 1，保证第 0 行后续不再被访问。",
	},
	{
		visited: [1, 2, 3],
		active: [6, 9],
		info: "2. 走右列 [6,9]，right 缩为 1",
		note: "剥掉最右列后 right -= 1，随后检查 top <= bottom 确认底行存在。",
	},
	{
		visited: [1, 2, 3, 6, 9],
		active: [8, 7, 4],
		info: "3. 走底行 [8,7] 与左列 [4]，缩至中心",
		note: "bottom 缩为 1、left 缩为 1，外圈已全部剥离。",
	},
	{
		visited: [1, 2, 3, 6, 9, 8, 7, 4],
		active: [5],
		info: "4. 走中心 [5]，top=2 > bottom=1 结束",
		note: "中心格 5 走完后 top 越过 bottom，螺旋遍历完成，无任何重复。",
	},
];

export const scene: Scene = {
	title: "3x3 矩阵的四边界螺旋剥洋葱",
	section: "四边界收缩为什么不需要-visited-矩阵",
	legend: EXECUTION_LEGEND,
	caption: "直接画出 3x3 真实矩阵：灰色为已剥离外层，绿框高亮本轮读取的一条边或中心格。",
	description:
		"在 3x3 矩阵 [[1,2,3],[4,5,6],[7,8,9]] 上逐轮剥离顶行、右列、底行、左列与中心，直观呈现四边界收缩过程。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			...matrix.flatMap((row, r) =>
				row.map((val, c) => {
					const isActive = s.active.includes(val);
					const isVisited = s.visited.includes(val);

					return {
						...node(
							`m-${r}-${c}`,
							54 + c * 88,
							12 + r * 56,
							76,
							[`(${r},${c})`, `val = ${val}`],
							isActive ? "result" : isVisited ? "control" : "actor",
							isActive,
						),
						muted: isVisited,
					};
				}),
			),
			node("info", 8, 188, 344, ["当前收缩边界", s.info], "state", true),
		],
	})),
};
