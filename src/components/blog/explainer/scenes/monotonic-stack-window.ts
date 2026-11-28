import { example, frame, label, mark } from "./examples.ts";
import { baseline, columnWidth, columnX, histogram, unitHeight } from "./histogram-layout.ts";

const heights = [2, 1, 5, 6, 2, 3] as const;
const right = 4;

function snapshot(stack: number[], note: string, popped?: 2 | 3) {
	const left = stack[stack.length - 1];

	if (left === undefined) throw new Error("Missing left boundary");

	const plot = histogram(heights, popped === undefined ? [right] : [left, right]);
	const boxes = [...plot.boxes];

	if (popped !== undefined) {
		const height = heights[popped];
		const width = right - left - 1;
		const x = columnX(heights.length, left + 1);

		boxes.push(
			mark(
				"area",
				x,
				baseline - height * unitHeight,
				width * columnWidth,
				height * unitHeight,
				"",
				"area",
			),
			label(
				"area-value",
				x + (width * columnWidth) / 2,
				baseline - (height * unitHeight) / 2,
				String(height * width),
				52,
			),
		);
	}

	boxes.push(
		label("stack-label", 78, 211, "下标栈", 82),
		...stack.map((index, slot) =>
			mark(
				`slot-${slot}`,
				124 + slot * 40,
				192,
				40,
				38,
				String(index),
				"cell",
				slot === stack.length - 1,
			),
		),
	);

	return frame(note, boxes, plot.edges);
}

export const scene = example(
	"同一根矮柱，为什么会结算出两个宽度？",
	"扫描停在下标 4。每弹出一根高柱，新的栈顶就给出它的左边界，两界之间的列数就是矩形宽度。",
	242,
	snapshot(
		[-1, 1, 2, 3],
		"下标 4 的柱高只有 2。栈顶的 3 对应高度 6，矩形遇到了右界。栈底 −1 是哨兵。",
	),
	snapshot([-1, 1, 2], "先弹出下标 3，新栈顶是 2。高度 6 只能覆盖下标 3 这一列，面积是 6。", 3),
	snapshot([-1, 1], "再弹出下标 2，新栈顶是 1。高度 5 可以横跨下标 2、3 两列，面积是 10。", 2),
);
