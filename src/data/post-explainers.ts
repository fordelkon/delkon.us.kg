import type { SceneId } from "../components/blog/ascii/scenes/index.ts";

/** Select a post's opening scene without exposing scene details to the layout. */
export function getPostExplainer(postId: string): SceneId | undefined {
	switch (postId) {
		case "understanding-recursion":
			return "recursion-stack";
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
		default:
			return undefined;
	}
}
