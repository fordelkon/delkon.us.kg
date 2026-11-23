import { dot, example, frame, label, line } from "./examples.ts";
import { edge } from "./types.ts";

const steps = [
	{
		small: [5, 2],
		large: [7, 10],
		transfer: false,
		summary: "中位数 (5 + 7) / 2 = 6",
		note: "两堆各有两个数，读两堆堆顶的平均值。",
	},
	{
		small: [5, 2],
		large: [6, 10, 7],
		transfer: true,
		summary: "插入 6，再把右堆最小值移到左边",
		note: "新值 6 先插入小顶堆，上浮到堆顶。随后弹出 6，转入大顶堆。",
	},
	{
		small: [6, 2, 5],
		large: [7, 10],
		transfer: false,
		summary: "中位数 = 6",
		note: "左堆多一个数。两侧仍然有序，直接读取左堆堆顶 6。",
	},
];

const heap = (id: string, rootX: number, values: number[]) =>
	values.map((value, index) => {
		const x = rootX + (index === 0 ? 0 : (index * 2 - 3) * 41);

		return dot(`${id}-${index}`, x, index === 0 ? 70 : 132, value, index === 0);
	});

export const scene = {
	...example(
		"对顶堆维护中位数",
		"左侧大顶堆保留较小一半，右侧小顶堆保留较大一半。粗框是各自的堆顶。",
		187,
		...steps.map(({ small, large, summary, transfer, note }) =>
			frame(
				note,
				[
					label("small", 88, 22, "大顶堆", 120),
					label("large", 272, 22, "小顶堆", 120),
					...heap("small", 88, small),
					...heap("large", 272, large),
					label("summary", 180, 170, summary, 320),
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
	),
	section: "从静态切分到动态对顶堆",
};
