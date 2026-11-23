import { scene as atomicPublication } from "./atomic-publication.ts";
import { scene as awaitState } from "./await-state.ts";
import { scene as backtrackingState } from "./backtracking-state.ts";
import { scene as binarySearchCut } from "./binary-search-cut.ts";
import { scene as deadlock } from "./deadlock.ts";
import { scene as diagnosticStages } from "./diagnostic-stages.ts";
import { scene as dnsCacheDoh } from "./dns-cache-doh.ts";
import { scene as dualHeapMedian } from "./dual-heap-median.ts";
import { scene as duplicateIndexCycle } from "./duplicate-index-cycle.ts";
import { scene as floydCycleEntry } from "./floyd-cycle-entry.ts";
import { gridExamples } from "./grid-examples.ts";
import { scene as inplaceIndexSwap } from "./inplace-index-swap.ts";
import { scene as lanArpDelivery } from "./lan-arp-delivery.ts";
import { listExamples } from "./list-examples.ts";
import { scene as lruCacheOps } from "./lru-cache-ops.ts";
import { scene as monotonicStackWindow } from "./monotonic-stack-window.ts";
import { scene as multiSourceBfs } from "./multi-source-bfs.ts";
import { scene as mutexCounter } from "./mutex-counter.ts";
import { scene as nextPermutationSteps } from "./next-permutation-steps.ts";
import { scene as packetJourney } from "./packet-journey.ts";
import { scene as proxyTunFakeip } from "./proxy-tun-fakeip.ts";
import { scene as recursionStack } from "./recursion-stack.ts";
import { scene as routingNaptTun } from "./routing-napt-tun.ts";
import { scene as saddleSearch } from "./saddle-search.ts";
import { scene as scheduling } from "./scheduling.ts";
import { searchTreeExamples } from "./search-tree-examples.ts";
import { sequenceExamples } from "./sequence-examples.ts";
import { scene as slidingDequeMax } from "./sliding-deque-max.ts";
import { scene as slidingWindowCover } from "./sliding-window-cover.ts";
import { scene as socketBufferEof } from "./socket-buffer-eof.ts";
import { scene as spiralBounds } from "./spiral-bounds.ts";
import { scene as threeWayPartition } from "./three-way-partition.ts";
import { scene as tlsHandshakeVisibility } from "./tls-handshake-visibility.ts";
import { scene as topologicalCycle } from "./topological-cycle.ts";
import { scene as trappingWaterPointers } from "./trapping-water-pointers.ts";
import { treeExamples } from "./tree-examples.ts";
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, NODE_HEIGHT, type Scene } from "./types.ts";
import { scene as workerPool } from "./worker-pool.ts";

const algorithmExamples = {
	...gridExamples,
	...listExamples,
	...sequenceExamples,
	...treeExamples,
	...searchTreeExamples,
};

const scenes = {
	...algorithmExamples,
	"duplicate-index-cycle": duplicateIndexCycle,
	scheduling,
	"mutex-counter": mutexCounter,
	"atomic-publication": atomicPublication,
	deadlock,
	"worker-pool": workerPool,
	"await-state": awaitState,
	"recursion-stack": recursionStack,
	"backtracking-state": backtrackingState,
	"multi-source-bfs": multiSourceBfs,
	"topological-cycle": topologicalCycle,
	"binary-search-cut": binarySearchCut,
	"monotonic-stack-window": monotonicStackWindow,
	"dual-heap-median": dualHeapMedian,
	"sliding-window-cover": slidingWindowCover,
	"sliding-deque-max": slidingDequeMax,
	"three-way-partition": threeWayPartition,
	"inplace-index-swap": inplaceIndexSwap,
	"next-permutation-steps": nextPermutationSteps,
	"spiral-bounds": spiralBounds,
	"saddle-search": saddleSearch,
	"lru-cache-ops": lruCacheOps,
	"floyd-cycle-entry": floydCycleEntry,
	"trapping-water-pointers": trappingWaterPointers,
	"packet-journey": packetJourney,
	"lan-arp-delivery": lanArpDelivery,
	"routing-napt-tun": routingNaptTun,
	"socket-buffer-eof": socketBufferEof,
	"dns-cache-doh": dnsCacheDoh,
	"tls-handshake-visibility": tlsHandshakeVisibility,
	"proxy-tun-fakeip": proxyTunFakeip,
	"diagnostic-stages": diagnosticStages,
};

export type SceneId = keyof typeof scenes;

function validateScene(scene: Scene, id: string) {
	for (const chapter of scene.chapters ?? []) validateScene(chapter, id);

	if (!scene.frames.length) throw new Error(`Empty scene: ${id}`);

	for (const frame of scene.frames) {
		const ids = frame.boxes.map((node) => node.id);

		if (new Set(ids).size !== ids.length || !frame.note) throw new Error(`Invalid frame: ${id}`);

		for (const node of frame.boxes) {
			if (
				node.x < 0 ||
				node.y < 0 ||
				node.x + node.width > DIAGRAM_WIDTH ||
				node.y + (node.height ?? NODE_HEIGHT) > (scene.diagramHeight ?? DIAGRAM_HEIGHT) ||
				node.lines.length > 2
			)
				throw new Error(`Invalid box ${node.id}: ${id}`);
		}
	}
}

export function getScene(id: SceneId): Scene {
	const scene = scenes[id];
	validateScene(scene, id);

	return scene;
}

function isAlgorithmScene(slug: string): slug is keyof typeof algorithmExamples {
	return Object.hasOwn(algorithmExamples, slug);
}

export function getAlgorithmSceneId(postId: string): SceneId | undefined {
	const slug = postId.slice("algorithm/".length);

	return postId.startsWith("algorithm/") && isAlgorithmScene(slug) ? slug : undefined;
}
