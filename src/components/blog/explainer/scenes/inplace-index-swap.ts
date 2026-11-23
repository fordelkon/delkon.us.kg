import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 真实 4 元素数组例子: [3, 4, -1, 1]
const steps: { arr: number[]; curr: number; swapPair: [number, number] | null; note: string }[] = [
	{
		arr: [3, 4, -1, 1],
		curr: 0,
		swapPair: [0, 2],
		note: "i=0 处值 3 应回槽位 3-1=2：交换下标 0 与 2。",
	},
	{
		arr: [-1, 4, 3, 1],
		curr: 1,
		swapPair: [1, 3],
		note: "换回的 -1 无效，推进 i=1；值 4 应回槽位 3：交换下标 1 与 3。",
	},
	{
		arr: [-1, 1, 3, 4],
		curr: 1,
		swapPair: [1, 0],
		note: "while 留在 i=1！换回的 1 落在 [1,4] 且 nums[0]!=1，继续交换下标 1 与 0。",
	},
	{
		arr: [1, -1, 3, 4],
		curr: 1,
		swapPair: null,
		note: "全部有效正数均已归位！二趟扫描在 i=1 发现 nums[1]=-1 != 2，返回缺失正数 2。",
	},
];

export const scene: Scene = {
	title: "数组 [3, 4, -1, 1] 的原地归位与缺失定位",
	section: "为什么答案一定在-1n11-n--11n1-内",
	legend: EXECUTION_LEGEND,
	caption: "4 个数组槽位分别期望存放 1、2、3、4；上方弧线表示 while 交换把元素送回目标槽位。",
	description:
		"展示 4 格数组 [3, 4, -1, 1] 如何通过 3 次原地置换让 3、4、1 归位到下标 2、3、0，最终在下标 1 暴露缺失值 2。",
	frames: steps.map((s, idx) => ({
		note: s.note,
		boxes: [
			...s.arr.map((v, i) =>
				node(
					`slot-${i}`,
					16 + i * 86,
					96,
					74,
					[`${i} → ${i + 1}`, `val=${v}`],
					v === i + 1 ? "result" : v >= 1 && v <= 4 ? "actor" : "control",
					i === s.curr,
				),
			),
			node(
				"ptr",
				16 + s.curr * 86,
				184,
				74,
				[idx === 3 ? "命中缺失" : "当前 i", idx === 3 ? "缺 2！" : `idx=${s.curr}`],
				idx === 3 ? "result" : "state",
				true,
			),
			...(s.swapPair
				? [
						node(
							"op",
							8,
							12,
							344,
							[
								`原地交换：下标 ${s.swapPair[0]} <-> 下标 ${s.swapPair[1]}`,
								`把 ${s.arr[s.swapPair[0]]} 送往槽位 ${s.swapPair[1]}`,
							],
							"state",
							true,
						),
					]
				: [
						node(
							"op",
							8,
							12,
							344,
							["二趟扫描检查 nums[i] != i + 1", "i = 1 处发现首个空缺：返回 2"],
							"result",
							true,
						),
					]),
		],
		edges: [
			controlEdge("ep", `M${16 + s.curr * 86 + 37} 184 V148`, true),
			...(s.swapPair
				? [
						edge(
							"sw",
							`M${16 + s.swapPair[0] * 86 + 37} 94 Q180 62 ${16 + s.swapPair[1] * 86 + 37} 94`,
							true,
						),
					]
				: []),
		],
	})),
};
