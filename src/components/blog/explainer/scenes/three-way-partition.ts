import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { label } from "./examples.ts";
import type { Scene } from "./types.ts";

// 真实 5 元素数组例子: [2, 0, 2, 1, 0]
const steps = [
	{
		arr: [2, 0, 2, 1, 0],
		p0: 0,
		curr: 0,
		p2: 4,
		note: "初始：p0=0, curr=0, p2=4。nums[curr]=2，与 p2(4) 交换并令 p2 退至 3，curr 停在原地。",
	},
	{
		arr: [0, 0, 2, 1, 2],
		p0: 0,
		curr: 0,
		p2: 3,
		note: "换回的 0 未检查！nums[curr]=0，与 p0(0) 交换后 p0 与 curr 同步右移至 1。",
	},
	{
		arr: [0, 0, 2, 1, 2],
		p0: 1,
		curr: 1,
		p2: 3,
		note: "nums[1]=0，与 p0(1) 交换后 p0 与 curr 同步右移至 2。",
	},
	{
		arr: [0, 0, 2, 1, 2],
		p0: 2,
		curr: 2,
		p2: 3,
		note: "nums[2]=2，与 p2(3) 交换并令 p2 退至 2，curr 仍停在下标 2 检查换回的 1。",
	},
	{
		arr: [0, 0, 1, 2, 2],
		p0: 2,
		curr: 3,
		p2: 2,
		note: "nums[2]=1 跳过使 curr 增至 3 > p2(2)，循环结束！单趟完成 [0,0 | 1 | 2,2]。",
	},
];

export const scene: Scene = {
	title: "数组 [2, 0, 2, 1, 0] 的三指针原地划分",
	section: "荷兰国旗三路划分不变式",
	legend: EXECUTION_LEGEND,
	caption: "p0 在左侧守卫 0 区边界，p2 在右侧守卫 2 区边界。",
	description: "展示 5 个连续数组格子在每一步交换后的真实变化，以及p0、curr 和 p2 指针的移动轨迹。",
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			...s.arr.map((v, i) =>
				node(
					`cell-${i}`,
					14 + i * 68,
					96,
					60,
					[`[${i}]`, `val=${v}`],
					v === 0 ? "actor" : v === 1 ? "state" : "control",
					i === s.curr,
				),
			),
			node("p0", 14 + s.p0 * 68, 12, 60, ["p0", `idx=${s.p0}`], "actor", true),
			node(
				"curr",
				14 + Math.min(s.curr, 4) * 68,
				184,
				60,
				[s.curr > s.p2 ? "结束" : "curr", `idx=${s.curr}`],
				"result",
				true,
			),
			label("p2", 44 + s.p2 * 68, 82, "p2", 40),
		],
		edges: [
			controlEdge("ep0", `M${14 + s.p0 * 68 + 30} 60 V92`, true),
			controlEdge("ecurr", `M${14 + Math.min(s.curr, 4) * 68 + 30} 184 V148`, true),
		],
	})),
};
