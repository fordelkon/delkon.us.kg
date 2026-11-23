import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

// 真实搜索树: 根 [] -> 第1层 [1],[2],[3] -> 第2层 [1,2],[1,3] -> 叶子 [1,2,3],[1,3,2]
const steps = [
	{
		activeId: "n123",
		pathIds: ["root", "n1", "n12", "n123"],
		backEdge: false,
		note: "共享 path 顺着左分支推进到叶子 [1,2,3]，收集快照后准备返回上一层。",
	},
	{
		activeId: "n1",
		pathIds: ["root", "n1"],
		backEdge: true,
		note: "虚线回退到节点 [1]，恢复 used 标记后转而向兄弟分支 [1,3] 探索。",
	},
	{
		activeId: "n132",
		pathIds: ["root", "n1", "n13", "n132"],
		backEdge: false,
		note: "因为前一步严格履行了恢复契约，新分支 [1,3,2] 不会残留旧选择 2。",
	},
];

export const scene: Scene = {
	title: "全排列搜索树：沿树枝深入与回退恢复",
	section: "排列搜索树与状态恢复契约",
	legend: EXECUTION_LEGEND,
	caption: "以 [1, 2, 3] 为例，图中展开以 1 开头的分支：实线为向下选择，虚线为返回父层并撤回修改。",
	description:
		"展示真实树形分支结构：从根 [] 走过 [1]、[1,2] 到叶子 [1,2,3]，随后回退撤回至 [1] 再深入 [1,3] 与 [1,3,2]。",
	diagramHeight: 256,
	frames: steps.map((s) => ({
		note: s.note,
		boxes: [
			node("root", 142, 8, 76, ["depth=0", "[]"], "actor", s.activeId === "root"),
			node("n1", 56, 72, 76, ["depth=1", "[1]"], "state", s.activeId === "n1"),
			{ ...node("n2", 150, 72, 76, ["depth=1", "[2]"], "control"), muted: true },
			{ ...node("n3", 244, 72, 76, ["depth=1", "[3]"], "control"), muted: true },
			node("n12", 12, 136, 84, ["depth=2", "[1, 2]"], "state", s.activeId === "n12"),
			node("n13", 112, 136, 84, ["depth=2", "[1, 3]"], "state", s.activeId === "n13"),
			node("n123", 12, 200, 84, ["叶子收集", "[1,2,3]"], "result", s.activeId === "n123"),
			node("n132", 112, 200, 84, ["叶子收集", "[1,3,2]"], "result", s.activeId === "n132"),
		],
		edges: [
			edge("r1", "M166 56 L104 68", s.pathIds.includes("n1")),
			edge("r2", "M180 56 L188 68", false),
			edge("r3", "M196 56 L276 68", false),
			edge("1-12", "M84 120 L58 132", s.pathIds.includes("n12")),
			edge("1-13", "M104 120 L146 132", s.pathIds.includes("n13")),
			edge("12-123", "M54 184 V196", s.pathIds.includes("n123")),
			edge("13-132", "M154 184 V196", s.pathIds.includes("n132")),
			...(s.backEdge ? [controlEdge("bk", "M46 134 Q35 112 54 104", true)] : []),
		],
	})),
};
