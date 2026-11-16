import { scene as atomicPublication } from "./atomic-publication.ts";
import { scene as awaitState } from "./await-state.ts";
import { scene as deadlock } from "./deadlock.ts";
import { scene as mutexCounter } from "./mutex-counter.ts";
import { scene as recursionStack } from "./recursion-stack.ts";
import { scene as scheduling } from "./scheduling.ts";
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, NODE_HEIGHT } from "./types.ts";
import { scene as workerPool } from "./worker-pool.ts";

const scenes = {
	scheduling,
	"mutex-counter": mutexCounter,
	"atomic-publication": atomicPublication,
	deadlock,
	"worker-pool": workerPool,
	"await-state": awaitState,
	"recursion-stack": recursionStack,
};

export type SceneId = keyof typeof scenes;

export function getScene(id: SceneId) {
	const scene = scenes[id];

	if (!scene.frames.length) throw new Error(`Empty scene: ${id}`);

	for (const frame of scene.frames) {
		const ids = frame.boxes.map((node) => node.id);

		if (new Set(ids).size !== ids.length || !frame.note) throw new Error(`Invalid frame: ${id}`);

		if (!Number.isFinite(frame.durationMs ?? 2200) || (frame.durationMs ?? 2200) <= 0)
			throw new Error(`Invalid duration: ${id}`);

		for (const node of frame.boxes) {
			if (
				node.x < 0 ||
				node.y < 0 ||
				node.x + node.width > DIAGRAM_WIDTH ||
				node.y + NODE_HEIGHT > (scene.diagramHeight ?? DIAGRAM_HEIGHT) ||
				node.lines.length !== 2
			)
				throw new Error(`Invalid box ${node.id}: ${id}`);
		}
	}

	return scene;
}
