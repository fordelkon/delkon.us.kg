import { counterFrame } from "./counter-layout.ts";
import type { Scene } from "./types.ts";

const phases = [
	{ owner: "", count: 0, a: "READY", b: "READY", pathA: "|", pathB: "|", active: 6 },
	{ owner: "", count: 1, a: "+1", b: "READY", pathA: "v", pathB: "|", active: 7 },
	{ owner: "", count: 1, a: "DONE", b: "READY", pathA: "|", pathB: "|", active: 8 },
	{ owner: "", count: 2, a: "DONE", b: "+1", pathA: "|", pathB: "v", active: 7 },
	{ owner: "", count: 2, a: "DONE", b: "DONE", pathA: "|", pathB: "|", active: 7 },
];

export const atomicCounter: Scene = {
	description:
		"两个线程各执行一次不可拆分的 fetch_add(1)，计数从 0 到 1，再到 2；这只展示计数原子性。",
	frames: phases.map((phase) => counterFrame(phase, "ATOMIC COUNTER", "fetch_add(1)")),
};
