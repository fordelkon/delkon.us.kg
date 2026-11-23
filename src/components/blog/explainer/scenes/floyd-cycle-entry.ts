import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 真实带环链表例子: 3 -> 2 -> 0 -> -4 -> (回指节点 2)
const nodes = [
	{ id: "n0", val: "3", idx: "head", x: 8 },
	{ id: "n1", val: "2", idx: "环入口", x: 98 },
	{ id: "n2", val: "0", idx: "环内+1", x: 188 },
	{ id: "n3", val: "-4", idx: "环尾", x: 278 },
] as const;

const steps = [
	{
		sIdx: 0,
		fIdx: 0,
		sLabel: "slow",
		fLabel: "fast",
		note: "初始状态：slow 与 fast 同在 head（节点 3）。入环前距入口 a = 1 步，环长 b = 3。",
	},
	{
		sIdx: 1,
		fIdx: 2,
		sLabel: "slow",
		fLabel: "fast",
		note: "第 1 轮移动：slow 到节点 2，fast 跨两步到节点 0。",
	},
	{
		sIdx: 2,
		fIdx: 1,
		sLabel: "slow",
		fLabel: "fast",
		note: "第 2 轮移动：slow 到节点 0，fast 从 -4 经回环边绕回节点 2。",
	},
	{
		sIdx: 3,
		fIdx: 3,
		sLabel: "slow",
		fLabel: "fast",
		note: "第 3 轮相遇于节点 -4！此时 slow 共走 s = 3 步（恰好是环长 b 的 1 倍）。",
	},
	{
		sIdx: 1,
		fIdx: 1,
		sLabel: "entry",
		fLabel: "slow",
		note: "阶段二：entry 从 head 出发、slow 从 -4 出发各走 a = 1 步，精确在环入口节点 2 相遇！",
	},
] as const;

export const scene: Scene = {
	title: "环形链表：3 -> 2 -> 0 -> -4（回指 2）的追及与定位",
	section: "先判环再找入口",
	legend: EXECUTION_LEGEND,
	caption: "横向为真实链表与回指环边；第一阶段 1:2 追及于 -4，第二阶段同速走 a=1 步汇合于入口 2。",
	description:
		"以链表 3 -> 2 -> 0 -> -4（尾节点指回 2）为例，上方指针框随步骤指向真实链表节点，下方弧线展示从 -4 回到入口 2 的环路。",
	frames: steps.map((step, idx) => ({
		note: step.note,
		boxes: [
			...nodes.map((n, i) =>
				node(
					n.id,
					n.x,
					88,
					74,
					[`val: ${n.val}`, n.idx],
					i === 1 ? "result" : "state",
					step.sIdx === i || step.fIdx === i,
				),
			),
			node(
				"ptr-s",
				nodes[step.sIdx].x,
				12,
				74,
				[step.sLabel, idx === 4 ? "从 head" : "每次 +1"],
				"actor",
				true,
			),
			...(step.sIdx === step.fIdx
				? [
						node(
							"ptr-f",
							nodes[step.fIdx].x,
							184,
							74,
							[step.fLabel, idx === 4 ? "从相遇点" : "每次 +2"],
							"control",
							true,
						),
					]
				: [node("ptr-f", nodes[step.fIdx].x, 12, 74, [step.fLabel, "每次 +2"], "control", true)]),
		],
		edges: [
			edge("e01", "M82 112 H96", idx >= 1),
			edge("e12", "M172 112 H186", idx >= 1),
			edge("e23", "M262 112 H276", idx >= 2),
			// 环尾 -4 弧形回指环入口 2
			edge("cycle", "M315 136 Q225 182 135 138", idx >= 2),
			controlEdge("ps", `M${nodes[step.sIdx].x + 37} 60 V84`, true),
			controlEdge(
				"pf",
				step.sIdx === step.fIdx
					? `M${nodes[step.fIdx].x + 37} 184 V140`
					: `M${nodes[step.fIdx].x + 37} 60 V84`,
				true,
			),
		],
	})),
};
