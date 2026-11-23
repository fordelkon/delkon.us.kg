import { example, label, mark } from "./examples.ts";
import { baseline, columnX, histogram, unitHeight } from "./histogram-layout.ts";

const heights = [2, 0, 3, 1, 2];

const steps = [
	{ left: 0, right: 4, water: [], total: 0, note: "两侧最高都为 2，先结算最右柱，水深是 0。" },
	{ left: 0, right: 3, water: [3], total: 1, note: "右侧高度上限为 2，当前柱高 1，接水 1 格。" },
	{
		left: 1,
		right: 2,
		water: [1, 3],
		total: 3,
		note: "右侧遇到高度 3 的柱子，转而向内处理左边。第 0 列水深为 0，第 1 列水深为 2。",
	},
	{ left: 2, right: 2, water: [1, 3], total: 3, note: "双指针在最高柱相遇，总水量为 3。" },
];

export const scene = {
	...example(
		"双指针逐列结算雨水",
		"填色区域是已经结算的水。纵向高度对应柱高与水深，横轴是下标。",
		228,
		...steps.map(({ left, right, water, total, note }) => {
			const plot = histogram(heights, [left, right]);

			const waterBoxes = water.map((index) =>
				mark(
					`water-${index}`,
					columnX(heights.length, index) + 2,
					baseline - 2 * unitHeight,
					40,
					(index === 1 ? 2 : 1) * unitHeight,
					"",
					"water",
				),
			);

			const pointers =
				left === right
					? [label("meet", columnX(5, left) + 22, 190, "L = R")]
					: [
							label("left", columnX(5, left) + 22, 190, "L", 40),
							label("right", columnX(5, right) + 22, 190, "R", 40),
						];

			return {
				...plot,
				note,
				boxes: [
					...waterBoxes,
					...plot.boxes,
					...pointers,
					label("total", 180, 212, `水量 ${total}`, 145),
				],
			};
		}),
	),
	section: "c用双指针省去极值数组",
};
