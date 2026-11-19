import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from "d3-force";
import type { PostNeighborhood } from "@/data/post-links";

interface LayoutNode extends SimulationNodeDatum {
	id: string;
}

export function layoutPostGraph(postId: string, graph: PostNeighborhood) {
	const nodes: LayoutNode[] = [
		{ id: postId, fx: 0, fy: 0 },
		...graph.neighbors.map(({ id }) => ({ id })),
	];

	const links = graph.edges.map(({ source, target }) => ({ source, target }));

	const link = forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links)
		.id((node) => node.id)
		.distance(44)
		.strength((edge) => (edge.source === nodes[0] ? 0.6 : 0.08));

	forceSimulation(nodes)
		.stop()
		.force("links", link)
		.force("charge", forceManyBody().strength(-35))
		.force("collision", forceCollide(10))
		.tick(140);

	let extent = 44;

	for (const { x = 0, y = 0 } of nodes) {
		extent = Math.max(extent, Math.abs(x), Math.abs(y));
	}

	const scale = 67 / extent;

	return new Map(
		nodes.map(({ id, x = 0, y = 0 }) => [id, { x: 80 + x * scale, y: 80 + y * scale }]),
	);
}
