import { atomicCounter } from "./atomic-counter.ts";
import { awaitState } from "./await-state.ts";
import { deadlock } from "./deadlock.ts";
import { mutexCounter } from "./mutex-counter.ts";
import { scheduling } from "./scheduling.ts";
import type { Scene } from "./types.ts";
import { workerPool } from "./worker-pool.ts";

const scenes = {
	scheduling: scheduling,
	"mutex-counter": mutexCounter,
	"atomic-counter": atomicCounter,
	deadlock: deadlock,
	"worker-pool": workerPool,
	"await-state": awaitState,
};

export type SceneId = keyof typeof scenes;

/** Build compact, source-authored diagrams; no Rust code executes in the player. */
export function getScene(id: SceneId): Scene {
	const scene = scenes[id];
	const height = Math.max(...scene.frames.map((frame) => frame.rows.length));

	if (height > 12) throw new Error(`ASCII scene ${id} exceeds the compact height`);

	return {
		description: scene.description,
		frames: scene.frames.map((frame) => {
			if (frame.rows.some((row) => row.length > 35 || /[^\x20-\x7e]/.test(row)))
				throw new Error(`ASCII scene ${id} exceeds its 35-column grid`);

			if (frame.active.some((row) => row < 0 || row >= frame.rows.length))
				throw new Error(`ASCII scene ${id} has an invalid highlight`);

			const rows = Array.from({ length: height }, (_, index) =>
				(frame.rows[index] ?? "").padEnd(35),
			);

			return { rows, active: frame.active };
		}),
	};
}
