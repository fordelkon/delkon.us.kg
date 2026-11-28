import { controlEdge } from "./diagram-layout.ts";
import { cells, label, mark } from "./examples.ts";
import { edge, type Frame, type Scene } from "./types.ts";

const indexLabels = [0, 1, 2, 3, 4].map((index) =>
	label(`idx-${index}`, 84 + index * 48, 128, String(index), 40),
);

const frames: Frame[] = [
	{
		note: "从右越过降序后缀 [5, 4, 2]：该后缀内部已达字典序最大，只能改动左侧首个相邻升序位置 3 < 5。",
		boxes: [
			label("top", 180, 20, "右侧后缀 [5, 4, 2] 降序已到顶", 260),
			mark("wall", 154, 62, 148, 56, "", "area"),
			...cells("arr", [1, 3, 5, 4, 2], 66, [1, 2, 3, 4], 48),
			...indexLabels,
			label("pivot", 132, 156, "拐点 3 < 5", 96),
			label("suffix", 228, 156, "降序后缀", 96),
		],
	},
	{
		note: "在降序后缀 [5, 4, 2] 中从右往左找第一个大于 3 的数，即最小更大值 4。",
		boxes: [
			label("top", 180, 20, "在后缀中选出最小大于 3 的数：4", 280),
			mark("wall", 154, 62, 148, 56, "", "area"),
			...cells("arr", [1, 3, 5, 4, 2], 66, [1, 3], 48),
			...indexLabels,
			label("pivot", 132, 156, "拐点 3", 80),
			label("cand", 228, 156, "最小更大值 4", 112),
		],
		edges: [edge("pick", "M132 62 Q180 34 228 62", true)],
	},
	{
		note: "交换 3 与 4 得到 [1, 4, 5, 3, 2]。由于 4 原先是大于 3 的最小值，换入 3 后右侧 [5, 3, 2] 仍保持降序。",
		boxes: [
			label("top", 180, 20, "交换 3 ↔ 4 后，后缀 [5, 3, 2] 仍降序", 300),
			mark("wall", 154, 62, 148, 56, "", "area"),
			...cells("arr", [1, 4, 5, 3, 2], 66, [1, 3], 48),
			...indexLabels,
			label("rev-lbl", 228, 174, "双指针原地反转 [2..4]", 176),
		],
		edges: [
			edge("swapped", "M132 62 Q180 34 228 62", true),
			controlEdge("rev", "M180 140 Q228 164 276 140", true),
		],
	},
	{
		note: "把降序后缀 [5, 3, 2] 原地反转为最小升序 [2, 3, 5]，即得下一个最小排列 [1, 4, 2, 3, 5]。",
		boxes: [
			label("top", 180, 20, "反转后缀得 [2, 3, 5]：完成最小增量", 300),
			...cells("arr", [1, 4, 2, 3, 5], 66, [1, 2, 3, 4], 48),
			...indexLabels,
			label("head", 108, 156, "高位增幅最小", 116),
			label("tail", 240, 156, "后缀升序最小", 116),
		],
	},
];

export const scene: Scene = {
	title: "排列 [1, 3, 5, 4, 2] 的后缀壁垒与最小重排",
	section: "如何精确找出刚好大一点的排列",
	diagramHeight: 192,
	caption: "越过单调不增的后缀壁垒定位拐点，换入最小更大值后，原后缀仍降序，反转即最小。",
	description:
		"用数组 [1, 3, 5, 4, 2] 演示下一个排列的空间不变量：框出降序后缀壁垒、选中拐点 3 与后缀中最小更大值 4、交换后观察后缀仍保持降序、最后原地反转为 [1, 4, 2, 3, 5]。",
	frames,
};
