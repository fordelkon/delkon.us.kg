import { counterFrame } from "./counter-layout.ts";
import type { Scene } from "./types.ts";

const phases = [
	{ owner: "", count: 0, a: "READY", b: "READY", pathA: "|", pathB: "|", active: 6 },
	{ owner: "", count: 0, a: "CALL", b: "READY", pathA: "v", pathB: "x", active: 7 },
	{ owner: "", count: 1, a: "DONE", b: "READY", pathA: "|", pathB: "|", active: 8 },
	{ owner: "", count: 1, a: "DONE", b: "READY", pathA: "|", pathB: "|", active: 6 },
	{ owner: "", count: 1, a: "DONE", b: "CALL", pathA: "x", pathB: "v", active: 7 },
	{ owner: "", count: 2, a: "DONE", b: "DONE", pathA: "|", pathB: "|", active: 8 },
];

export const atomicCounter: Scene = {
	description:
		"两个线程各执行一次不可拆分的 fetch_add(1)，计数从 0 到 1，再到 2。每次从标题、调用到完整结果依次高亮，不展开操作内部的读改写。v 和 x 只在调用帧区分本次原子更新的执行方，不表示获得或等待互斥锁；这只展示计数原子性。",
	frames: phases.map((phase) => counterFrame(phase, "ATOMIC COUNTER", "fetch_add(1)")),
};
