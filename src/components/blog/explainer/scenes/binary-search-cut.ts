import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 上排短数组 A = [1, 3]，下排长数组 B = [2, 4, 5]
const framesData = [
	{
		i: 1,
		j: 2,
		msg: "B 左侧的 4 > A 右侧的 3",
		status: "left" as const,
		note: "左半切太少，B 的 4 比 A 的 3 还要大，说明 i 必须向右移动：lo = i + 1 = 2。",
	},
	{
		i: 2,
		j: 1,
		msg: "3 ≤ 4 且 2 ≤ +∞",
		status: "hit" as const,
		note: "i=2 使得 A 全部划入左半，右端补正无穷哨兵，交叉有序条件完美成立！",
	},
	{
		i: 2,
		j: 1,
		msg: "左半最大值 max(3, 2) = 3",
		status: "done" as const,
		note: "左半共有 [1, 3] 与 [2] 共 3 个元素，最大值为 3.0，即合并后中位数。",
	},
];

export const scene: Scene = {
	title: "双数组 A=[1,3] 与 B=[2,4,5] 的切分点二分",
	section: "中位数的切分等价定义",
	legend: EXECUTION_LEGEND,
	caption: "上排为短数组 A，下排为长数组 B；格内注明元素所属的半区。+∞ 只表示 A 已切到末尾。",
	description:
		"直接画出两个有序数组 A=[1,3] 和 B=[2,4,5]（含 +inf 哨兵），观察切分点 i 从 1 右移到 2 时左右两半元素的划分。",
	frames: framesData.map((f) => ({
		note: f.note,
		boxes: [
			// 上排 A = [1, 3, +inf]
			node(
				"a0",
				8,
				12,
				108,
				["A[0] = 1", f.i >= 1 ? "左半" : "右半"],
				f.i >= 1 ? "actor" : "control",
				f.i === 1,
			),
			node(
				"a1",
				126,
				12,
				108,
				["A[1] = 3", f.i >= 2 ? "左半" : "右半"],
				f.i >= 2 ? "actor" : "control",
				f.i === 2,
			),
			node("a2", 244, 12, 108, ["+∞", "右哨兵"], "control", f.i === 2),
			// 下排 B = [2, 4, 5]
			node(
				"b0",
				8,
				96,
				108,
				["B[0] = 2", f.j >= 1 ? "左半" : "右半"],
				f.j >= 1 ? "actor" : "control",
				f.j === 1,
			),
			node(
				"b1",
				126,
				96,
				108,
				["B[1] = 4", f.j >= 2 ? "左半" : "右半"],
				f.j >= 2 ? "actor" : "control",
				f.j === 2,
			),
			node(
				"b2",
				244,
				96,
				108,
				["B[2] = 5", f.j >= 3 ? "左半" : "右半"],
				f.j >= 3 ? "actor" : "control",
			),
			// 底部结果状态
			node(
				"msg",
				8,
				184,
				344,
				[`切分结果 (i=${f.i}, j=${f.j})`, f.msg],
				f.status === "done" ? "result" : "state",
				f.status !== "left",
			),
		],
		edges: [
			// 连接切分边界处的交叉比较
			{ ...edge("cut-a", `M${8 + f.i * 118 - 5} 7 V65`, true), undirected: true, dashed: true },
			{ ...edge("cut-b", `M${8 + f.j * 118 - 5} 91 V149`, true), undirected: true, dashed: true },
			controlEdge("cross", `M${126 + 54} 60 L${126 + 54} 92`, f.status === "left"),
		],
	})),
};
