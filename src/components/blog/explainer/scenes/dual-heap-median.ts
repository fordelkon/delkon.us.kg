import { dot, example, frame, label, line } from "./examples.ts";
import { edge } from "./types.ts";

const steps = [
	{
		small: [5, 2],
		large: [7, 10],
		transfer: false,
		note: "两堆各有两个数，中位数是两个堆顶的平均值 (5 + 7) / 2 = 6。",
	},
	{
		small: [5, 2],
		large: [7, 10, 8],
		transfer: true,
		note: "新值 8 进入右堆。右堆选出最小的 7 交给左堆，8 留在右边。",
	},
	{
		small: [7, 2, 5],
		large: [8, 10],
		transfer: false,
		note: "左堆多出一个数，堆顶 7 正好排在五个数的中央。",
	},
];

const heap = (id: string, rootX: number, values: number[]) =>
	values.map((value, index) => {
		const x = rootX + (index === 0 ? 0 : (index * 2 - 3) * 41);

		return dot(`${id}-${index}`, x, index === 0 ? 70 : 132, value, index === 0);
	});

export const scene = example(
	"对顶堆维护中位数",
	"粗框中的堆顶分别是左半最大值和右半最小值。插入时从堆顶转移一个数，就能调整两边的数量并保持左右有序。",
	155,
	...steps.map(({ small, large, transfer, note }) =>
		frame(
			note,
			[
				label("small", 88, 22, "大顶堆", 120),
				label("large", 272, 22, "小顶堆", 120),
				...heap("small", 88, small),
				...heap("large", 272, large),
			],
			[
				line("small-left", "M78 85 L56 117"),
				line("large-left", "M262 85 L240 117"),
				...(small.length === 3 ? [line("small-right", "M98 85 L120 117")] : []),
				...(large.length === 3 ? [line("large-right", "M282 85 L304 117")] : []),
				...(transfer ? [edge("move", "M249 70 H111", true)] : []),
			],
		),
	),
);
