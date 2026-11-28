import { example, frame, label, line, mark } from "./examples.ts";

const a = [1, 4, 8];
const b = [2, 3, 6, 9];
const leftCount = Math.ceil((a.length + b.length) / 2);

const cuts = [
	{ i: 1, note: "左侧的 6 大于右侧的 4。A 的切口右移一格，B 的切口随之左移一格。" },
	{
		i: 2,
		note: "4 ≤ 6 且 3 ≤ 8，左边所有数都不超过右边最小的数。左边四个数中最大的 4 就是中位数。",
	},
];

function partition(id: string, values: number[], cut: number, y: number) {
	return values.map((value, index) => {
		const x = 180 + (index - cut) * 38 + (index < cut ? -5 : 5);

		return mark(`${id}-${index}`, x, y, 38, 38, String(value), "cell", index < cut);
	});
}

export const scene = example(
	"用两道切口找中位数",
	"七个数分成左四右三。A 的切口右移一格，B 的就左移一格。每行切口左边的数都不超过另一行切口右边的数时，就找到了中位数的分界。",
	155,
	...cuts.map(({ i, note }) => {
		const j = leftCount - i;

		return frame(
			note,
			[
				label("left", 117, 18, "左半 · 4 个", 128),
				label("right", 247, 18, "右半 · 3 个", 128),
				label("a", 26, 60, "A", 36),
				label("b", 26, 123, "B", 36),
				...partition("a", a, i, 41),
				...partition("b", b, j, 104),
			],
			[{ ...line("cut", "M180 33 V149", true), dashed: true }],
		);
	}),
);
