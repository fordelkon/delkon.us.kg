import { counterFrame } from "./counter-layout.ts";
import type { Scene } from "./types.ts";

const phases = [
	{ owner: "free", count: 0, a: "READY", b: "READY", pathA: "|", pathB: "|", active: 6 },
	{ owner: "A", count: 0, a: "IN", b: "WAIT", pathA: "v", pathB: "x", active: 6 },
	{ owner: "A", count: 1, a: "+1", b: "WAIT", pathA: "v", pathB: "x", active: 7 },
	{ owner: "free", count: 1, a: "DONE", b: "READY", pathA: "|", pathB: "|", active: 6 },
	{ owner: "B", count: 1, a: "DONE", b: "IN", pathA: "|", pathB: "v", active: 6 },
	{ owner: "B", count: 2, a: "DONE", b: "+1", pathA: "|", pathB: "v", active: 7 },
	{ owner: "free", count: 2, a: "DONE", b: "DONE", pathA: "|", pathB: "|", active: 7 },
];

export const mutexCounter: Scene = {
	description:
		"两个线程各加一次。A 持锁完成完整更新并释放锁后，B 获得同一把锁并更新，最终计数为 2。",
	frames: phases.map((phase) => counterFrame(phase, `MUTEX: ${phase.owner}`, "read / +1 / write")),
};
