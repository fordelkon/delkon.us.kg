import type { SceneId } from "../components/blog/explainer/scenes/index.ts";

const figures = new Map<string, SceneId>([
	["algorithm/construct-binary-tree-from-preorder-and-inorder-traversal", "traversal-root-span"],
	["algorithm/container-with-most-water", "container-short-wall"],
	["algorithm/find-median-from-data-stream", "dual-heap-median"],
	["algorithm/find-the-duplicate-number", "duplicate-index-cycle"],
	["algorithm/largest-rectangle-in-histogram", "monotonic-stack-window"],
	["algorithm/median-of-two-sorted-arrays", "binary-search-cut"],
	["algorithm/partition-equal-subset-sum", "subset-update-order"],
	["algorithm/rotting-oranges", "multi-source-bfs"],
	["algorithm/search-a-2d-matrix-ii", "saddle-search"],
	["algorithm/sliding-window-maximum", "window-dominance"],
	["algorithm/sort-colors", "three-way-partition"],
	["algorithm/trapping-rain-water", "trapping-water-pointers"],
	["concurrency/message-passing-workers-backpressure", "worker-pool"],
	["concurrency/parallelism-execution-units", "scheduling"],
	["networking/layered-architecture-packet-journey", "packet-journey"],
	["networking/transport-tcp-udp-socket-quic", "cumulative-ack-gap"],
	["understanding-recursion", "recursion-stack"],
]);

export function getPostExplainer(postId: string): SceneId | undefined {
	return figures.get(postId);
}
