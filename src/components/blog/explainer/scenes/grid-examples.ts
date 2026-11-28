import { cells, example, frame, grid, label, mark } from "./examples.ts";
import { edge } from "./types.ts";

const board = [
	["·", "Q", "·", "·"],
	["·", "·", "·", "Q"],
	["Q", "·", "·", "·"],
	["·", "·", "Q", "·"],
];

export const gridExamples = {
	"n-queens": example(
		"在棋盘上逐行放皇后",
		"每行放一个皇后，同时占用一列和两条斜线。",
		193,
		frame(
			"这是一组 4 皇后解：从上到下的列下标为 1、3、0、2。四个皇后的 c、r-c、r+c 分别互异。",
			grid(board, 8, [[1], [3], [0], [2]], 44),
		),
	),
	"word-search": example(
		"单词在网格里形成一条路径",
		"拼出 CAT 的相邻格子可以转弯。当前路径用过的格子在回退时恢复。",
		145,
		frame(
			"从 C 右移找到 A，再向下找到 T。每步只走上下左右，每格在同一条路径中只用一次。",
			grid(
				[
					["C", "A", "X"],
					["B", "T", "O"],
					["A", "G", "S"],
				],
				8,
				[[0, 1], [1]],
				36,
			).map((cell, index) => ({
				...cell,
				x: cell.x + ((index % 3) - 1) * 14,
				y: cell.y + Math.floor(index / 3) * 14,
			})),
			[edge("ca", "M149 26 H160", true), edge("at", "M180 45 V56", true)],
		),
	),
	"search-a-2d-matrix": example(
		"矩阵的虚拟一维下标",
		"按行阅读矩阵，每个下标 k 对应 (k / 列数, k % 列数)，除法取整。",
		214,
		frame("矩阵有 3 列。二分在虚拟下标 4 比较时，实际读取第 1 行第 1 列的 11。", [
			...grid(
				[
					[1, 3, 5],
					[7, 11, 13],
				],
				8,
				[[], [1]],
				44,
			),
			label("flat", 180, 129, "虚拟下标顺序", 180),
			...cells("flat", [1, 3, 5, 7, 11, 13], 154, [4], 40),
		]),
	),
	"set-matrix-zeroes": example(
		"把清零标记存在首行首列",
		"先在首行与首列记录受影响的行列，最后应用标记。",
		139,
		frame(
			"中间的 0 需要清零第 1 行和第 1 列。用首列 (1,0) 和首行 (0,1) 存标记，同时单独记住首列原本没有 0。",
			grid(
				[
					[1, 2, 3],
					[4, 0, 6],
					[7, 8, 9],
				],
				8,
				[[], [1], []],
			),
		),
		frame(
			"在首行和首列写下两个 0，标出第 1 列和第 1 行。",
			grid(
				[
					[1, 0, 3],
					[0, 0, 6],
					[7, 8, 9],
				],
				8,
				[[1], [0]],
			),
		),
		frame(
			"按标记清零。首行和首列保留标记，其余位置按对应行列的标记清零。",
			grid(
				[
					[1, 0, 3],
					[0, 0, 0],
					[7, 0, 9],
				],
				8,
				[[1], [0, 1, 2], [1]],
			),
		),
	),
	"rotate-array-and-matrix": example(
		"原地轮转与矩阵旋转",
		"一维三次反转，二维先转置再反转每行。",
		208,
		frame("数组向右轮转 2 位：先反转全部，再分别反转前 2 格和后 3 格。", [
			...cells("original", [1, 2, 3, 4, 5], 8),
			...cells("reverse", [5, 4, 3, 2, 1], 74, [0, 1]),
			...cells("result", [4, 5, 1, 2, 3], 140, [0, 1]),
		]),
		frame("矩阵顺时针旋转 90°：先转置，将右上角 2 换到左下，再反转每行，将 2 移到右下。", [
			...[
				[1, 2, 3, 4],
				[1, 3, 2, 4],
				[3, 1, 4, 2],
			].flatMap((values, index) =>
				values.map((value, cell) => {
					return mark(
						`matrix-${index}-${cell}`,
						18 + index * 126 + (cell % 2) * 35,
						60 + Math.floor(cell / 2) * 35,
						35,
						35,
						String(value),
						"cell",
						value === 2,
					);
				}),
			),
			label("original", 53, 41, "原矩阵"),
			label("transpose", 179, 41, "转置"),
			label("reverse-rows", 305, 41, "反转各行"),
		]),
	),
};
