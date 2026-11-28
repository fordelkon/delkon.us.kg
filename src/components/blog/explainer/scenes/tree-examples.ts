import { dot, example, frame, label, line } from "./examples.ts";
import { type Box, type Edge, edge } from "./types.ts";

type TreeNode = [id: string, value: string | number, x: number, y: number];

type Branch = [parent: string, child: string];

export function topology(
	nodes: TreeNode[],
	branches: Branch[],
	active: string[] = [],
	directed = false,
): [Box[], Edge[]] {
	const boxes = nodes.map(([id, value, x, y]) => dot(id, x, y, value, active.includes(id)));
	const points = new Map(nodes.map(([id, , x, y]) => [id, { x, y }]));

	const edges = branches.map(([parent, child]) => {
		const from = points.get(parent);
		const to = points.get(child);

		if (!from || !to) throw new Error(`Unknown diagram node: ${parent}, ${child}`);

		const length = Math.hypot(to.x - from.x, to.y - from.y);
		const dx = (18 * (to.x - from.x)) / length;
		const dy = (18 * (to.y - from.y)) / length;
		const path = `M${from.x + dx} ${from.y + dy} L${to.x - dx} ${to.y - dy}`;

		return (directed ? edge : line)(
			`${parent}-${child}`,
			path,
			active.includes(parent) && active.includes(child),
		);
	});

	return [boxes, edges];
}

const [bst, branches] = topology(
	[
		["root", 5, 100, 28],
		["right", 6, 182, 87],
		["left", 3, 100, 146],
	],
	[
		["root", "right"],
		["right", "left"],
	],
	["left"],
);

export const treeExamples = {
	"validate-binary-search-tree": example(
		"祖先给子树留下的边界",
		"3 虽然小于父节点 6，却落在根节点 5 的右子树中，仍须大于 5。",
		178,
		frame(
			"从根 5 向右走得到下界 5，从 6 向左走再得到上界 6。节点 3 超出了继承的开区间 (5, 6)。",
			[
				...bst,
				label("lower", 246, 55, "右子树：x > 5", 166),
				label("bounds", 226, 147, "应满足 5 < x < 6", 193),
			],
			branches,
		),
	),
	"implement-trie-prefix-tree": example(
		"两个单词共用一个前缀",
		"cat 和 car 共用到 ca 的路径。粗框标出单词终点，走到 ca 只能确认这个前缀存在。",
		177,
		frame(
			"根节点表示空前缀，往下依次是 c 和 ca，随后分成 cat 和 car 两个单词终点。ca 自身未标记。",
			...topology(
				[
					["root", "ε", 180, 20],
					["c", "c", 180, 63],
					["ca", "ca", 180, 106],
					["cat", "cat", 125, 153],
					["car", "car", 235, 153],
				],
				[
					["root", "c"],
					["c", "ca"],
					["ca", "cat"],
					["ca", "car"],
				],
				["cat", "car"],
			),
		),
	),
};
