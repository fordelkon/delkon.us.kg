import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import type { Scene } from "./types.ts";

// 真实 6 字符例子: "A B A C B A", 目标 t = "ABC"
const chars = ["A", "B", "A", "C", "B", "A"];

const steps = [
	{
		l: 0,
		r: 2,
		formed: "2/3 (缺 C)",
		best: "尚无",
		phase: "expand" as const,
		note: '窗口 [0..2] "ABA" 含 A、B，但缺 C，formed=2/3，继续右移 right。',
	},
	{
		l: 0,
		r: 3,
		formed: "3/3 (覆盖!)",
		best: '"ABAC" (len=4)',
		phase: "hit" as const,
		note: "right=3 纳入 'C' 后首次达标！记录候选 \"ABAC\"，进入内层 left 收缩。",
	},
	{
		l: 1,
		r: 3,
		formed: "3/3 (仍覆盖!)",
		best: '"BAC" (len=3)',
		phase: "shrink" as const,
		note: "踢出下标 0 的 'A' 后，窗口 [1..3] \"BAC\" 里仍有下标 2 的 'A'，刷新最短为 3！",
	},
	{
		l: 2,
		r: 3,
		formed: "2/3 (缺 B)",
		best: '"BAC" (len=3)',
		phase: "done" as const,
		note: "踢出下标 1 的 'B' 后窗口失效，停止收缩；后续再扫已无法更短，最终返回 \"BAC\"。",
	},
];

export const scene: Scene = {
	title: '字符串 "ABACBA" 覆盖 "ABC" 的滑窗收缩',
	section: "为什么必须用-formed-计数器而不是每步比对字典",
	legend: EXECUTION_LEGEND,
	caption: "横排展示 6 个字符格子；左右标记定位当前窗口，达标计数与已知最短解显示在上方。",
	description:
		'以 s = "ABACBA"、t = "ABC" 为例，展示 left 与 right 指针在字符序列上先扩到 "ABAC"、再收缩掉多余 \'A\' 得到最短 "BAC" 的过程。',
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			node(
				"status",
				8,
				12,
				344,
				[`达标种类 formed = ${s.formed}`, `当前最优解：${s.best}`],
				s.phase === "shrink" || s.phase === "hit" ? "result" : "actor",
				true,
			),
			...chars.map((ch, i) => {
				const inWin = i >= s.l && i <= s.r;

				return {
					...node(
						`ch-${i}`,
						12 + i * 57,
						96,
						51,
						[`[${i}]`, ch],
						inWin ? (s.phase === "shrink" ? "result" : "actor") : "control",
						i === s.l || i === s.r,
					),
					muted: !inWin,
				};
			}),
			node("pl", 12 + s.l * 57, 184, 51, ["left", `${s.l}`], "state", true),
			node("pr", 12 + s.r * 57, 184, 51, ["right", `${s.r}`], "control", true),
		],
		edges: [
			controlEdge("el", `M${12 + s.l * 57 + 25} 184 V148`, true),
			controlEdge("er", `M${12 + s.r * 57 + 25} 184 V148`, true),
		],
	})),
};
