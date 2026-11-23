import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import type { Scene } from "./types.ts";

const arr = [1, 3, -1, -3, 5];

const steps = [
	{
		win: [0, 2] as const,
		dq: [1, 2],
		ans: "队首下标 1，最大值 3",
		note: "i=0..2 扫描后，3 淘汰了 1，-1 留在队尾：dq 仅剩下标 [1, 2]（值 [3, -1]）。",
	},
	{
		win: [1, 3] as const,
		dq: [1, 2, 3],
		ans: "队首下标 1，最大值 3",
		note: "i=3 (-3) 比 -1 更小直接入尾；队首 1 仍在窗口 [1, 3] 内未过期，输出 3。",
	},
	{
		win: [2, 4] as const,
		dq: [4],
		ans: "队首下标 4，最大值 5",
		note: "i=4 (5) 到达，从队尾连续弹出 -3、-1、3。其中下标 1 已越过窗口左界，但在正文的实现里先执行队尾淘汰，最终输出 5。",
	},
];

export const scene: Scene = {
	title: "数组 [1, 3, -1, -3, 5] 的窗口与单调队列对照",
	section: "为什么需要双端队列deque而不是堆或单调栈",
	legend: EXECUTION_LEGEND,
	caption: "上排为原数组（高亮当前 k=3 窗口），下排为单调双端队列 dq 内留存的下标与对应值。",
	description:
		"宽度为 3 的窗口向右移动两次。沿连线从下排队首找到上排元素，三个窗口依次输出 3、3、5。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			...arr.map((v, i) => {
				const inWin = i >= s.win[0] && i <= s.win[1];

				return {
					...node(
						`arr-${i}`,
						14 + i * 68,
						12,
						60,
						[`[${i}]`, `${v}`],
						inWin ? "actor" : "control",
						i === s.win[1],
					),
					muted: !inWin,
				};
			}),
			...s.dq.map((idx, pos) =>
				node(
					`dq-${pos}`,
					14 + pos * 84,
					96,
					74,
					[pos === 0 ? "队首" : `队列[${pos}]`, `${idx}:${arr[idx]}`],
					pos === 0 ? "result" : "state",
					pos === 0,
				),
			),
			node("ans", 8, 184, 344, ["当前窗口最大值", s.ans], "result", true),
		],
		edges: s.dq.map((idx, pos) =>
			controlEdge(`map-${pos}`, `M${14 + idx * 68 + 30} 60 L${14 + pos * 84 + 37} 92`, pos === 0),
		),
	})),
};
