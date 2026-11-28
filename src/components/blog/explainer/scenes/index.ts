import { scene as binarySearchCut } from "./binary-search-cut.ts";
import { scene as containerShortWall } from "./container-short-wall.ts";
import { scene as cumulativeAckGap } from "./cumulative-ack-gap.ts";
import { scene as dualHeapMedian } from "./dual-heap-median.ts";
import { scene as duplicateIndexCycle } from "./duplicate-index-cycle.ts";
import { scene as monotonicStackWindow } from "./monotonic-stack-window.ts";
import { scene as multiSourceBfs } from "./multi-source-bfs.ts";
import { scene as packetJourney } from "./packet-journey.ts";
import { scene as recursionStack } from "./recursion-stack.ts";
import { scene as saddleSearch } from "./saddle-search.ts";
import { scene as scheduling } from "./scheduling.ts";
import { scene as subsetUpdateOrder } from "./subset-update-order.ts";
import { scene as threeWayPartition } from "./three-way-partition.ts";
import { scene as trappingWaterPointers } from "./trapping-water-pointers.ts";
import { scene as traversalRootSpan } from "./traversal-root-span.ts";
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, NODE_HEIGHT, type Scene } from "./types.ts";
import { scene as windowDominance } from "./window-dominance.ts";
import { scene as workerPool } from "./worker-pool.ts";

const scenes = {
	"binary-search-cut": binarySearchCut,
	"container-short-wall": containerShortWall,
	"cumulative-ack-gap": cumulativeAckGap,
	"dual-heap-median": dualHeapMedian,
	"duplicate-index-cycle": duplicateIndexCycle,
	"monotonic-stack-window": monotonicStackWindow,
	"multi-source-bfs": multiSourceBfs,
	"packet-journey": packetJourney,
	"recursion-stack": recursionStack,
	"saddle-search": saddleSearch,
	scheduling,
	"subset-update-order": subsetUpdateOrder,
	"three-way-partition": threeWayPartition,
	"trapping-water-pointers": trappingWaterPointers,
	"traversal-root-span": traversalRootSpan,
	"window-dominance": windowDominance,
	"worker-pool": workerPool,
};

export type SceneId = keyof typeof scenes;

function validateScene(scene: Scene, id: string) {
	const options = scene.control?.options;

	if (
		options &&
		(options.length < 2 ||
			new Set(options).size !== options.length ||
			scene.frames.length % options.length !== 0)
	) {
		throw new Error(`Invalid control options: ${id}`);
	}

	if (!scene.frames.length) throw new Error(`Empty scene: ${id}`);

	for (const frame of scene.frames) {
		if (scene.control?.stepLabel && !frame.readout) throw new Error(`Missing step readout: ${id}`);
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
