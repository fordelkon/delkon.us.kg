import { example, frame, label, line, mark } from "./examples.ts";

const preorder = [4, 2, 1, 3, 5];
const inorder = [1, 2, 3, 4, 5];
const cellWidth = 47;
const origin = 86;

function span(preStart: number, inStart: number, count: number) {
	const root = preorder[preStart];

	if (root === undefined) throw new Error("Missing subtree root");

	const pivot = inorder.indexOf(root);
	const width = pivot - inStart;
	const end = preStart + 1 + width;

	function row(
		id: string,
		sequence: number[],
		y: number,
		start: number,
		rootIndex: number,
		leftStart: number,
	) {
		return sequence.map((value, index) => ({
			...mark(
				`${id}-${index}`,
				origin + index * cellWidth,
				y,
				cellWidth,
				38,
				String(value),
				index >= leftStart && index < leftStart + width ? "water" : "cell",
				index === rootIndex,
			),
			muted: index < start || index >= start + count,
		}));
	}

	function jaw(id: string, first: number, y: number) {
		const x = origin + first * cellWidth;

		return line(id, `M${x} ${y - 8} V${y} H${x + width * cellWidth} V${y - 8}`, true);
	}

	const note = width
		? `根 ${root} 在中序子区间的左边有 ${width} 个节点。把这段宽度放到先序根之后，框内恰好是 ${preorder.slice(preStart + 1, end).join("、")}。`
		: `中序子区间只剩根 ${root}，左边宽度为零。先序的左子树也为空。`;

	return frame(
		note,
		[
			label("inorder", 42, 54, "中序", 64),
			...row("in", inorder, 35, inStart, pivot, inStart),
			label("preorder", 42, 138, "先序", 64),
			...row("pre", preorder, 119, preStart, preStart, preStart + 1),
			label("length", 180, 191, `左子树宽度 = ${width}`, 262),
		],
		[jaw("in-jaw", inStart, 87), jaw("pre-jaw", preStart + 1, 171)],
	);
}

const leftCount = inorder.indexOf(preorder[0] ?? -1);

export const scene = {
	...example(
		"中序量出的宽度怎样划开先序？",
		"粗框标出当前根。中序根左侧的节点在先序中紧跟根出现，两把卡尺量的是同一棵左子树。",
		211,
		span(0, 0, preorder.length),
		span(1, 0, leftCount),
		span(leftCount + 1, leftCount + 1, inorder.length - leftCount - 1),
	),
	control: { label: "当前子树", options: ["整棵树", "左子树", "右子树"] },
};
