import { scene as binarySearchCut } from "./binary-search-cut.ts";
import { scene as cancellationOwnership } from "./cancellation-ownership.ts";
import { scene as containerShortWall } from "./container-short-wall.ts";
import { scene as cumulativeAckGap } from "./cumulative-ack-gap.ts";
import { scene as dualHeapMedian } from "./dual-heap-median.ts";
import { scene as duplicateIndexCycle } from "./duplicate-index-cycle.ts";
import { gridExamples } from "./grid-examples.ts";
import { scene as longestPrefixRoute } from "./longest-prefix-route.ts";
import { scene as monotonicStackWindow } from "./monotonic-stack-window.ts";
import { scene as multiSourceBfs } from "./multi-source-bfs.ts";
import { scene as packetJourney } from "./packet-journey.ts";
import { scene as randomListWeave } from "./random-list-weave.ts";
import { scene as recursionStack } from "./recursion-stack.ts";
import { scene as saddleSearch } from "./saddle-search.ts";
import { scene as scheduling } from "./scheduling.ts";
import { sequenceExamples } from "./sequence-examples.ts";
import { scene as subsetUpdateOrder } from "./subset-update-order.ts";
import { scene as threeWayPartition } from "./three-way-partition.ts";
import { scene as trappingWaterPointers } from "./trapping-water-pointers.ts";
import { treeExamples } from "./tree-examples.ts";
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, NODE_HEIGHT, type Scene } from "./types.ts";
import { scene as workerPool } from "./worker-pool.ts";

const scenes = {
	...gridExamples,
	...sequenceExamples,
	...treeExamples,
	"binary-search-cut": binarySearchCut,
	"cancellation-ownership": cancellationOwnership,
	"container-short-wall": containerShortWall,
	"cumulative-ack-gap": cumulativeAckGap,
	"dual-heap-median": dualHeapMedian,
	"duplicate-index-cycle": duplicateIndexCycle,
	"longest-prefix-route": longestPrefixRoute,
	"monotonic-stack-window": monotonicStackWindow,
	"multi-source-bfs": multiSourceBfs,
	"packet-journey": packetJourney,
	"random-list-weave": randomListWeave,
	"recursion-stack": recursionStack,
	"saddle-search": saddleSearch,
	scheduling,
	"subset-update-order": subsetUpdateOrder,
	"three-way-partition": threeWayPartition,
	"trapping-water-pointers": trappingWaterPointers,
	"worker-pool": workerPool,
};

export type SceneId = keyof typeof scenes;

function validateScene(scene: Scene, id: string) {
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
