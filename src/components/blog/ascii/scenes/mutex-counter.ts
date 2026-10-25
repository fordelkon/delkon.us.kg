import { counterFrame } from "./counter-layout.ts";
import type { Scene } from "./types.ts";

const phases = [
	{ owner: "free", count: 0, a: "READY", b: "READY", active: 6 },
	{ owner: "A", count: 0, a: "IN", b: "WAIT", active: 6 },
	{ owner: "A", count: 0, a: "+1", b: "WAIT", active: 7 },
	{ owner: "A", count: 1, a: "+1", b: "WAIT", active: 8 },
	{ owner: "free", count: 1, a: "DONE", b: "READY", active: 6 },
	{ owner: "B", count: 1, a: "DONE", b: "IN", active: 6 },
	{ owner: "B", count: 1, a: "DONE", b: "+1", active: 7 },
	{ owner: "B", count: 2, a: "DONE", b: "+1", active: 8 },
	{ owner: "free", count: 2, a: "DONE", b: "DONE", active: 8 },
];

// Gate symbols follow ownership in every phase, including operation and result frames.
function gate(owner: string, thread: string) {
	return owner === "free" ? "|" : owner === thread ? "v" : "x";
}

export const mutexCounter: Scene = {
	description:
		"两个线程各加一次。A 持锁完成完整更新并释放锁后，B 获得同一把锁并更新，最终计数为 2。",
	frames: phases.map((phase) =>
		counterFrame(
			{ ...phase, pathA: gate(phase.owner, "A"), pathB: gate(phase.owner, "B") },
			`MUTEX: ${phase.owner}`,
			"read / +1 / write",
		),
	),
};
