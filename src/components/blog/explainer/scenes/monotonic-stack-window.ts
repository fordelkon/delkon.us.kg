import { example, label, mark } from "./examples.ts";
import { baseline, columnWidth, columnX, histogram, unitHeight } from "./histogram-layout.ts";

const heights = [2, 1, 5, 6, 2, 3];

const steps = [
	{
		start: 3,
		width: 0,
		height: 0,
		stack: "栈 [1, 2, 3]",
		note: "扫描到下标 3 时，栈中柱高为 1、5、6，等待第一根更矮的柱子。",
	},
	{
		start: 3,
		width: 1,
		height: 6,
		stack: "栈 [1, 2] · 面积 6",
		note: "下标 4 的柱高为 2，弹出下标 3。左右阻挡边界为 2 和 4，能覆盖 1 格，面积为 6。",
	},
	{
		start: 2,
		width: 2,
		height: 5,
		stack: "栈 [1] · 面积 10",
		note: "继续弹出下标 2，左边界退到 1，右边界仍为 4。高 5 的矩形覆盖下标 2 和 3，面积为 10。",
	},
	{
		start: 2,
		width: 2,
		height: 5,
		stack: "最终最大面积 10",
		note: "末尾的虚拟零高柱把剩余柱结算完，最大面积仍为 10。",
	},
];

export const scene = {
	...example(
		"柱状图中最大的矩形",
		"柱高对应输入值。虚线矩形的高由弹出的柱决定，宽由左右阻挡边界决定。",
		209,
		...steps.map(({ start, width, height, stack, note }, index) => {
			const plot = histogram(heights, index === 1 || index === 2 ? [4] : []);

			return {
				...plot,
				note,
				boxes: [
					...plot.boxes,
					...(width
						? [
								mark(
									"area",
									columnX(heights.length, start),
									baseline - height * unitHeight,
									width * columnWidth,
									height * unitHeight,
									"",
									"area",
								),
							]
						: []),
					label("stack", 180, 194, stack, 270),
				],
			};
		}),
	),
	section: "固定高度求最大宽度两侧首个更矮边界",
};
