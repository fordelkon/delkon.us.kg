import { example, frame, grid } from "./examples.ts";

const matrix = [
	[1, 4, 11],
	[2, 5, 16],
	[3, 9, 17],
] satisfies [number[], number[], number[]];

const comparisons = [
	{ row: 0, column: 2, reason: "11 > 5，整列都太大" },
	{ row: 0, column: 1, reason: "4 < 5，剩下的这一行都太小" },
	{ row: 1, column: 1, reason: "5 = 5，在剩余区域找到目标" },
];

export const scene = example(
	"从右上角缩小候选矩形",
	"候选区域的右上角是本行最大值、也是本列最小值。和目标 5 比较一次，就能确定该删去哪一行或哪一列。",
	167,
	...comparisons.map(({ row, column, reason }) =>
		frame(reason, [
			...grid(matrix, 10, [], 49).map((cell, index) => {
				const r = Math.floor(index / matrix[0].length);
				const c = index % matrix[0].length;

				return { ...cell, active: r === row && c === column, muted: r < row || c > column };
			}),
		]),
	),
);
