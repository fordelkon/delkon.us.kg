import { atomicPublication } from "./atomic-publication.ts";
import { awaitState } from "./await-state.ts";
import { deadlock } from "./deadlock.ts";
import { mutexCounter } from "./mutex-counter.ts";
import { recursionStack } from "./recursion-stack.ts";
import { scheduling } from "./scheduling.ts";
import { workerPool } from "./worker-pool.ts";

const scenes = {
	scheduling: scheduling,
	"mutex-counter": mutexCounter,
	"atomic-publication": atomicPublication,
	deadlock: deadlock,
	"worker-pool": workerPool,
	"await-state": awaitState,
	"recursion-stack": recursionStack,
};

export type SceneId = keyof typeof scenes;

/** Build compact, source-authored diagrams; example code never executes in the player. */
export function getScene(id: SceneId) {
	const scene = scenes[id];
	const height = Math.max(...scene.frames.map((frame) => frame.rows.length));
	const width = Math.max(...scene.frames.flatMap((frame) => frame.rows.map((row) => row.length)));

	if (height > 12) throw new Error(`ASCII scene ${id} exceeds the compact height`);

	return {
		width,
		caption: scene.caption,
		description: scene.description,
		frames: scene.frames.map((frame) => {
			const durationMs = frame.durationMs ?? 2000;

			if (!Number.isFinite(durationMs) || durationMs <= 0)
				throw new Error(`ASCII scene ${id} has an invalid frame duration`);

			if (frame.rows.some((row) => row.length > 35 || /[^\x20-\x7e]/.test(row)))
				throw new Error(`ASCII scene ${id} exceeds its 35-column grid`);

			if (frame.active.some((row) => row < 0 || row >= frame.rows.length))
				throw new Error(`ASCII scene ${id} has an invalid highlight`);

			const emphasis = [...(frame.emphasis ?? [])].sort(
				(a, b) => a.row - b.row || a.start - b.start,
			);

			if (
				emphasis.some((mark, index) => {
					const row = frame.rows[mark.row];
					const previous = emphasis[index - 1];

					return (
						row === undefined ||
						mark.row < 0 ||
						mark.row >= frame.rows.length ||
						mark.start < 0 ||
						mark.end > row.trimEnd().length ||
						mark.start >= mark.end ||
						(previous !== undefined && previous.row === mark.row && previous.end > mark.start)
					);
				})
			)
				throw new Error(`ASCII scene ${id} has an invalid highlight span`);

			const rows = Array.from({ length: height }, (_, index) =>
				(frame.rows[index] ?? "").trimEnd().padEnd(width),
			);

			return { rows, active: frame.active, emphasis, durationMs };
		}),
	};
}
