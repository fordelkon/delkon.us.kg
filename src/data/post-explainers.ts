import type { SceneId } from "../components/blog/explainer/scenes/index.ts";

const openings = new Map<string, SceneId>([
	["algorithm/container-with-most-water", "container-short-wall"],
	["algorithm/copy-list-with-random-pointer", "random-list-weave"],
	["algorithm/find-median-from-data-stream", "dual-heap-median"],
	["algorithm/find-the-duplicate-number", "duplicate-index-cycle"],
	["algorithm/implement-trie-prefix-tree", "implement-trie-prefix-tree"],
	["algorithm/largest-rectangle-in-histogram", "monotonic-stack-window"],
	["algorithm/median-of-two-sorted-arrays", "binary-search-cut"],
	["algorithm/min-stack", "min-stack"],
	["algorithm/partition-equal-subset-sum", "subset-update-order"],
	["algorithm/rotting-oranges", "multi-source-bfs"],
	["algorithm/search-a-2d-matrix-ii", "saddle-search"],
	["algorithm/set-matrix-zeroes", "set-matrix-zeroes"],
	["algorithm/sort-colors", "three-way-partition"],
	["algorithm/trapping-rain-water", "trapping-water-pointers"],
	["algorithm/validate-binary-search-tree", "validate-binary-search-tree"],
	["concurrency/async-concurrency-task-lifecycle", "cancellation-ownership"],
	["concurrency/message-passing-workers-backpressure", "worker-pool"],
	["concurrency/parallelism-execution-units", "scheduling"],
	["networking/layered-architecture-packet-journey", "packet-journey"],
	["networking/routing-forwarding-nat-virtual-interfaces", "longest-prefix-route"],
	["networking/transport-tcp-udp-socket-quic", "cumulative-ack-gap"],
	["understanding-recursion", "recursion-stack"],
]);

export function getPostExplainer(postId: string): SceneId | undefined {
	return openings.get(postId);
}
