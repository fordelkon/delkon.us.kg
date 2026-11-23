import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 真实 5 元素数组例子: [1, 3, 5, 4, 2]
const steps = [
	{
		arr: [1, 3, 5, 4, 2],
		highlight: [1, 2],
		banner: ["1. 从右向左找拐点", "nums[1]=3 < nums[2]=5"],
		bottom: ["右侧后缀 [5, 4, 2]", "单调不增，需改动下标 1"],
		phase: "pivot" as const,
		note: "从右越过降序后缀 [5, 4, 2]，定位首个相邻升序位置 i = 1（值 3）。",
	},
	{
		arr: [1, 3, 5, 4, 2],
		highlight: [1, 3],
		banner: ["2. 在右侧找首个 > 3 的数", "j = 3 (val=4) 为最小更大值"],
		bottom: ["交换 nums[1] 与 nums[3]", "准备将 3 与 4 互换"],
		phase: "swap" as const,
		note: "由于后缀降序，从右往左碰到的第一个大于 3 的数 4 就是增幅最小的选择。",
	},
	{
		arr: [1, 4, 5, 3, 2],
		highlight: [2, 3, 4],
		banner: ["3. 交换后后缀仍降序", "[5, 3, 2] 保持单调不增"],
		bottom: ["双指针反转 [2..4]", "5 <-> 2 互换即可"],
		phase: "rev" as const,
		note: "交换完成！右侧 [5, 3, 2] 天然维持降序，只需 O(n) 反转就能变成最小升序。",
	},
	{
		arr: [1, 4, 2, 3, 5],
		highlight: [0, 1, 2, 3, 4],
		banner: ["完成下一个排列", "结果为 [1, 4, 2, 3, 5]"],
		bottom: ["高位增幅最小", "低位后缀升序最小"],
		phase: "done" as const,
		note: "三步原地操作全部完成，总时间 O(n)，辅助空间 O(1)。",
	},
] as const;

export const scene: Scene = {
	title: "排列 [1, 3, 5, 4, 2] 的三步原地演进",
	section: "如何精确找出刚好大一点的排列",
	legend: EXECUTION_LEGEND,
	caption: "直接观察 5 个数组元素在找拐点、交换最小更大值、反转降序后缀三步中的就地变化。",
	description: "展示真实排列 [1, 3, 5, 4, 2] 如何依次高亮拐点与目标元素并变为 [1, 4, 2, 3, 5]。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			node("ban", 8, 12, 344, [s.banner[0], s.banner[1]], "actor", true),
			...s.arr.map((v, i) =>
				node(
					`a-${i}`,
					14 + i * 68,
					96,
					60,
					[`[${i}]`, `val=${v}`],
					s.phase === "done"
						? "result"
						: s.highlight.some((index) => i === index)
							? s.phase === "swap"
								? "control"
								: "state"
							: "actor",
					s.highlight.some((index) => i === index),
				),
			),
			node("bot", 8, 184, 344, [s.bottom[0], s.bottom[1]], s.phase === "done" ? "result" : "state"),
		],
		edges: [
			...(s.phase === "swap"
				? [edge("sw", `M${14 + 1 * 68 + 30} 94 Q180 64 ${14 + 3 * 68 + 30} 94`, true)]
				: []),
			...(s.phase === "rev"
				? [controlEdge("rv", `M${14 + 2 * 68 + 30} 148 Q248 178 ${14 + 4 * 68 + 30} 148`, true)]
				: []),
		],
	})),
};
