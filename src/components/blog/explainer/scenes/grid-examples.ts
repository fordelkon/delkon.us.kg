import { example, frame, grid } from "./examples.ts";

const original = [
	[1, 2, 3],
	[4, 0, 6],
	[7, 8, 9],
];

const marked = original.map((row, r) =>
	row.map((value, c) => ((r === 0 && c === 1) || (c === 0 && r === 1) ? 0 : value)),
);

const cleared = marked.map((row, r) => row.map((value, c) => (r === 1 || c === 1 ? 0 : value)));

export const gridExamples = {
	"set-matrix-zeroes": example(
		"首行、首列记录清零范围",
		"中心的零在行首和列首各留下一个标记。第二遍沿标记清零，后来写下的零不会继续向外扩散。",
		160,
		frame(
			"中心格原本为零，需要清空它所在的行和列。首行和首列原本都没有零。",
			grid(original, 8, [[], [1]], 48),
		),
		frame(
			"在中间一行的最左格和中间一列的最上格各写一个 0。这两个标记记住了稍后要清空的行和列。",
			grid(marked, 8, [[1], [0]], 48),
		),
		frame(
			"沿两个标记清空中间这一行和这一列。四角所在的行列都没有标记，四个角各自保留原值。",
			grid(cleared, 8, [[1], [0, 1, 2], [1]], 48),
		),
	),
};
