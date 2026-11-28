import { dot, example, frame } from "./examples.ts";
import { type Edge, edge } from "./types.ts";

const x = (slot: number) => 38 + slot * 56;

function next(from: number, to: number, y: number) {
	return edge(`next-${from}-${to}`, `M${x(from) + 18} ${y} H${x(to) - 20}`);
}

function random(from: number, to: number, y: number, below = false) {
	const side = below ? 1 : -1;
	const endY = y + side * 19;
	const bendY = endY + side * 32;

	return {
		...edge(
			`random-${from}-${to}`,
			`M${x(from)} ${endY} C${x(from)} ${bendY}, ${x(to)} ${bendY}, ${x(to)} ${endY}`,
			true,
		),
		dashed: true,
	};
}

const original = ["A", "B", "C"];
const copies = original.map((name) => `${name}′`);
const originalY = 68;

function snapshot(stage: "original" | "woven" | "linked" | "separate", note: string) {
	const separated = stage === "separate";
	const copyY = separated ? 134 : originalY;
	const nodes = original.map((name, i) => dot(name, x(i * 2), originalY, name));
	const edges: Edge[] = [random(0, 4, originalY)];

	if (stage !== "original") {
		nodes.push(...copies.map((name, i) => dot(name, x(i * 2 + 1), copyY, name, true)));
	}

	if (stage === "woven" || stage === "linked") {
		for (let slot = 0; slot < 5; slot++) edges.push(next(slot, slot + 1, originalY));
	} else {
		edges.push(next(0, 2, originalY), next(2, 4, originalY));
	}

	if (stage === "linked" || separated) edges.push(random(1, 5, copyY, true));

	if (separated) edges.push(next(1, 3, copyY), next(3, 5, copyY));

	return frame(note, nodes, edges);
}

export const scene = example(
	"借用相邻位置找到随机指针的副本",
	"实线是 next，虚线是 random。交织期间，每个原节点的下一格就是它的副本，所以知道随机指针的目标就能找到目标的副本。",
	186,
	snapshot("original", "原链沿 next 从 A 走到 B、C。A 的 random 越过 B，直接指向 C。"),
	snapshot(
		"woven",
		"把 A′、B′、C′ 分别插到原节点后面。A 的 random 仍指向 C，此时 C.next 恰好是 C′。",
	),
	snapshot("linked", "让 A′.random 指向 C.next。上下两条虚线现在分别连接 A 与 C、A′ 与 C′。"),
	snapshot("separate", "分开两排，恢复原链并串起副本的 next。A′ 的 random 仍落在副本 C′ 上。"),
);
