import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import type { Scene } from "./types.ts";

// 真实 3x3 橘子网格: [[2,1,1],[1,1,0],[0,1,1]] -> 多源 / 单源扩散
const steps = [
	{
		grid: [
			[2, 1, 1],
			[1, 1, 0],
			[0, 1, 2],
		],
		newly: [
			[0, 0],
			[2, 2],
		],
		info: "第 0 分钟 · 剩余 5 个新鲜橘子",
		note: "把 (0,0) 与 (2,2) 两个腐烂橘子同时入队作为第 0 层前沿，空格 (1,2)/(2,0) 保持 0。",
	},
	{
		grid: [
			[2, 2, 1],
			[2, 1, 0],
			[0, 2, 2],
		],
		newly: [
			[0, 1],
			[1, 0],
			[2, 1],
		],
		info: "第 1 分钟 · 剩余 2 个新鲜橘子",
		note: "两个源各自同步向四邻域扩散 1 步，入队瞬间将 1 改为 2 防止重复入队。",
	},
	{
		grid: [
			[2, 2, 2],
			[2, 2, 0],
			[0, 2, 2],
		],
		newly: [
			[0, 2],
			[1, 1],
		],
		info: "第 2 分钟 · 全部扩散完成",
		note: "fresh == 0 立即退出循环，避免把第 2 分钟刚入队的橘子再出队多算 1 分钟。",
	},
];

export const scene: Scene = {
	title: "3x3 橘子网格的双源同步 BFS 扩散",
	section: "从单源遍历到多源同步扩散",
	legend: EXECUTION_LEGEND,
	caption: "展示真实 3x3 网格（含两个初始腐烂源 2 与两个空格 0）；粗框高亮每分钟新感染的橘子。",
	description:
		"在 3x3 网格上演示两个初始腐烂源 (0,0) 与 (2,2) 如何在第 1、2 分钟同步吞没全部 5 个新鲜橘子并在 fresh 归零时立即停止。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			...s.grid.flatMap((row, r) =>
				row.map((val, c) => {
					const isNew = s.newly.some(([nr, nc]) => nr === r && nc === c);

					return {
						...node(
							`o-${r}-${c}`,
							54 + c * 88,
							12 + r * 56,
							76,
							[`(${r},${c})`, val === 0 ? "0 (空)" : val === 1 ? "1 (鲜)" : "2 (烂)"],
							val === 0 ? "control" : val === 1 ? "result" : "state",
							isNew,
						),
						muted: val === 0,
					};
				}),
			),
			node("info", 8, 188, 344, ["多源扩散进度", s.info], "actor", true),
		],
	})),
};
