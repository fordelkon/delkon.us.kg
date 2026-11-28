import { example, frame, grid, label } from "./examples.ts";

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

const rowCase = [
	[1, 5],
	[3, 8],
];

const columnCase = [
	[1, 3],
	[5, 8],
];

function counterexample(id: string, data: number[][], x: number, focus: number) {
	return grid(data, 55, [], 46).map((cell, index) => ({
		...cell,
		id: `${id}-${cell.id}`,
		x: cell.x + x,
		active: index === focus,
	}));
}

const figure = example(
	"从哪个角可以排除整行或整列",
	"右上角同时是本行最大值和本列最小值。左上角只给出两个方向的下界。",
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
	...[
		{ rowFocus: 0, columnFocus: 0, note: "两个独立输入都从左上角开始，比较结果相同：1 < 5。" },
		{ rowFocus: 1, columnFocus: 0, note: "矩阵 A 的 5 在起点右边，删掉第一行会漏解。" },
		{ rowFocus: 1, columnFocus: 2, note: "矩阵 B 的 5 在起点下方，删掉第一列也会漏解。" },
	].map(({ rowFocus, columnFocus, note }) =>
		frame(note, [
			label("a", 96, 29, "矩阵 A", 116),
			label("b", 264, 29, "矩阵 B", 116),
			...counterexample("a", rowCase, -84, rowFocus),
			...counterexample("b", columnCase, 84, columnFocus),
		]),
	),
);

export const scene = { ...figure, control: { label: "起点", options: ["右上角", "左上角"] } };
