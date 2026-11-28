import { getAlgorithmSceneId, type SceneId } from "../components/blog/explainer/scenes/index.ts";

/** Select a post's opening scene without exposing scene details to the layout. */
export function getPostExplainer(postId: string): SceneId | undefined {
	switch (postId) {
		case "understanding-recursion":
			return "recursion-stack";
		case "algorithm/permutations":
			return "backtracking-state";
		case "algorithm/rotting-oranges":
			return "multi-source-bfs";
		case "algorithm/course-schedule":
			return "topological-cycle";
		case "algorithm/median-of-two-sorted-arrays":
			return "binary-search-cut";
		case "algorithm/largest-rectangle-in-histogram":
			return "monotonic-stack-window";
		case "algorithm/find-median-from-data-stream":
			return "dual-heap-median";
		case "algorithm/minimum-window-substring":
			return "sliding-window-cover";
		case "algorithm/sliding-window-maximum":
			return "sliding-deque-max";
		case "algorithm/sort-colors":
			return "three-way-partition";
		case "algorithm/first-missing-positive":
			return "inplace-index-swap";
		case "algorithm/next-permutation":
			return "next-permutation-steps";
		case "algorithm/spiral-matrix":
			return "spiral-bounds";
		case "algorithm/search-a-2d-matrix-ii":
			return "saddle-search";
		case "algorithm/lru":
			return "lru-cache-ops";
		case "algorithm/find-the-duplicate-number":
			return "duplicate-index-cycle";
		case "algorithm/linked-list-cycle-ii":
			return "floyd-cycle-entry";
		case "algorithm/trapping-rain-water":
			return "trapping-water-pointers";
		case "concurrency/parallelism-execution-units":
			return "scheduling";
		case "concurrency/locks-condvars-shared-memory-sync":
			return "mutex-counter";
		case "concurrency/atomics-memory-model":
			return "atomic-publication";
		case "concurrency/deadlock-livelock-correctness":
			return "deadlock";
		case "concurrency/message-passing-workers-backpressure":
			return "worker-pool";
		case "concurrency/async-concurrency-task-lifecycle":
			return "await-state";
		case "networking/layered-architecture-packet-journey":
			return "packet-journey";
		case "networking/transport-tcp-udp-socket-quic":
			return "socket-buffer-eof";
		case "networking/http-evolution-tls-handshake-https":
			return "tls-handshake-visibility";
		default:
			return getAlgorithmSceneId(postId);
	}
}
