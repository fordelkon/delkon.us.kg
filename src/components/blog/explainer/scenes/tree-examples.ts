import { cells, dot, example, frame, label, line } from "./examples.ts";
import { type Box, type Edge, edge } from "./types.ts";

type TreeNode = [id: string, value: string | number, x: number, y: number];

type Branch = [parent: string, child: string];

const treeNodes: TreeNode[] = [
	["a", 4, 180, 26],
	["b", 2, 106, 84],
	["c", 7, 254, 84],
	["d", 1, 62, 142],
	["e", 3, 150, 142],
	["f", 6, 210, 142],
	["g", 9, 298, 142],
];

const mirrorValues = new Map([
	["c", 2],
	["f", 3],
	["g", 1],
]);

const branches: Branch[] = [
	["a", "b"],
	["a", "c"],
	["b", "d"],
	["b", "e"],
	["c", "f"],
	["c", "g"],
];

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

function tree(note: string, active: string[], output?: (string | number)[]) {
	const [nodes, edges] = topology(treeNodes, branches, active);

	return frame(note, [...nodes, ...(output ? cells("output", output, 183, [], 34) : [])], edges);
}

export const treeExamples = {
	"binary-tree-level-order-traversal": example(
		"层序遍历",
		"队列按层处理节点，下一层从左到右入队。",
		224,
		tree("第一层只有根节点 4，它将 2 和 7 依次入队。", ["a"], [4]),
		tree("处理第二层的 2 和 7 时，依次把 1、3、6、9 放入下一批。", ["b", "c"], [2, 7]),
		tree("第三层全是叶子，处理后队列为空。", ["d", "e", "f", "g"], [1, 3, 6, 9]),
	),
	"diameter-of-binary-tree": example(
		"二叉树直径",
		"粗边给出一条最长路径，直径按边计数。",
		171,
		tree("一条最长路径是 1 → 2 → 4 → 7 → 9，长度为 4 条边。", ["d", "b", "a", "c", "g"]),
	),
	"lowest-common-ancestor-of-a-binary-tree": example(
		"最近公共祖先",
		"查询节点 1 和 3，找它们向上的首个汇合点。",
		171,
		tree("1 和 3 分别位于 2 的左右子树，因此最近公共祖先是 2。", ["d", "b", "e"]),
	),
	"convert-sorted-array-to-binary-search-tree": example(
		"有序数组构建 BST",
		"取区间中点为根，再用左右子区间递归构建左右子树。",
		224,
		tree(
			"数组 [1, 2, 3, 4, 6, 7, 9] 的中点 4 成为根，左右两段分别以 2、7 为根。",
			["a", "b", "c"],
			[1, 2, 3, 4, 6, 7, 9],
		),
	),
	"construct-binary-tree-from-preorder-and-inorder-traversal": example(
		"前序和中序重建树",
		"用前序首值找根，用根在中序中的位置切分子树。",
		224,
		tree(
			"前序 [4, 2, 1, 3, 7, 6, 9] 以 4 开头。图下中序数组在 4 处切开，左段 [1, 2, 3] 分配给左子树，右段 [6, 7, 9] 给右子树。",
			["a"],
			[1, 2, 3, 4, 6, 7, 9],
		),
	),
	"binary-tree-maximum-path-sum": example(
		"二叉树最大路径和",
		"粗边标出使节点值之和最大的路径。",
		171,
		tree(
			"路径 3 → 2 → 4 → 7 → 9 的节点和为 25。更新全局答案时可以合并两条支路，向父节点只返回一条支路。",
			["e", "b", "a", "c", "g"],
		),
	),
	"path-sum-iii": example(
		"向下路径与前缀和",
		"路径可从任意节点开始，沿父节点向孩子走。",
		171,
		tree(
			"目标和取 5，路径 2 → 3 满足。到节点 3 的根路径前缀和为 9，减去节点 4 处的前缀和 4，余下 5。",
			["b", "e"],
		),
	),
	"symmetric-tree": example(
		"对称二叉树",
		"比较镜像位置的节点值。",
		171,
		frame(
			"左外侧的 1 对应右外侧的 1，左内侧的 3 对应右内侧的 3，两侧互为镜像。",
			...topology(
				treeNodes.map(([id, value, x, y]) => [id, mirrorValues.get(id) ?? value, x, y]),
				branches,
				["d", "g"],
			),
		),
	),
	"validate-binary-search-tree": example(
		"BST 的祖先边界",
		"每个节点都须同时满足沿途祖先施加的上下界。",
		171,
		frame(
			"节点 5 大于自己的父节点 2，符合右孩子的局部约束；它也在根 4 的左子树中，因此还必须小于 4。这棵树无效。",
			...topology(
				treeNodes.map(([id, value, x, y]) => [id, id === "e" ? 5 : value, x, y]),
				branches,
				["a", "b", "e"],
			),
		),
	),
	"invert-binary-tree": example(
		"翻转二叉树",
		"每个节点交换自己的左右孩子。",
		171,
		tree("原树的根 4 左接 2，右接 7。", ["a", "b", "c"]),
		frame(
			"交换每一层的左右引用后，根左接 7，右接 2；原最右叶子 9 成为最左叶子。",
			...topology(
				treeNodes.map(([id, value, x, y]) => [id, value, 360 - x, y]),
				branches,
				["a", "b", "c"],
			),
		),
	),
	"implement-trie-prefix-tree": example(
		"Trie 共享前缀",
		"节点表示已读前缀，粗框表示单词终点。",
		178,
		frame(
			"插入 cat 和 car 时复用 c、ca 两个前缀节点，在 ca 下分别建立 cat 和 car 的终点。",
			...topology(
				[
					["r", "ε", 180, 22],
					["c", "c", 180, 65],
					["a", "ca", 180, 108],
					["t", "cat", 130, 152],
					["e", "car", 230, 152],
				],
				[
					["r", "c"],
					["c", "a"],
					["a", "t"],
					["a", "e"],
				],
				["t", "e"],
			),
		),
	),
	"flatten-binary-tree-to-linked-list": example(
		"先序展开二叉树",
		"沿右指针串起原树的先序访问顺序，左指针清空。",
		224,
		tree("从根 4 开始，先走完它的左子树，再走右子树。", ["a", "b", "c"]),
		frame(
			"展开后依次是 4 → 2 → 1 → 3 → 7 → 6 → 9，每个节点只保留右指针。",
			...topology(
				[4, 2, 1, 3, 7, 6, 9].map((value, index) => [String(index), value, 36 + index * 48, 100]),
				[0, 1, 2, 3, 4, 5].map((index) => [String(index), String(index + 1)]),
				[],
				true,
			),
		),
	),
};

export function searchTree(
	title: string,
	caption: string,
	note: string,
	nodes: TreeNode[],
	branches: Branch[],
	active: string[],
) {
	const [boxes, edges] = topology(nodes, branches, active);

	return example(
		title,
		caption,
		171,
		frame(note, [label("prefix", 45, 24, "根 → 叶"), ...boxes], edges),
	);
}
