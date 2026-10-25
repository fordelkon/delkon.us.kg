import type { Scene } from "./types.ts";

// Compare independent runs, not a recovery from an already deadlocked state.
const rows = [
	"OPPOSITE ORDER / RUN 1",
	"A holds L1          B holds L2",
	"A ------ waits L2 --------> B",
	"A <----- waits L1 --------- B",
	"          WAIT CYCLE",
	"",
	"SAME ORDER / NEW RUN: L1 -> L2",
	"A: L1 -> L2 -> release",
	"B: wait L1 -> L1 -> L2 -> release",
	"          NO WAIT CYCLE",
	"",
];

const phases = [
	{ active: [1], event: "1. Each holds its first lock" },
	{ active: [2], event: "2. A waits for B's L2" },
	{ active: [3, 4], event: "3. B waits too: neither can finish" },
	{ active: [6], event: "4. Start a new run: same order" },
	{ active: [7], event: "5. B waits with no lock; A finishes" },
	{ active: [8, 9], event: "6. A releases; B can finish" },
	{ active: [4, 9], event: "Lock order breaks circular wait" },
];

export const deadlock: Scene = {
	caption: "各持一锁、互等另一锁，就形成等待环；统一加锁顺序，让持锁者能先完成并释放。",
	description:
		"上下对比两次独立运行，不是从死锁中直接恢复。第一次 A 持 L1 等 B 的 L2，B 持 L2 等 A 的 L1，形成等待环。第二次都先取 L1 再取 L2：B 等 L1 时不持锁，A 可以取 L2、完成并释放，随后 B 依次取锁并完成。统一获取顺序排除这两把独占锁的循环等待。",
	frames: phases.map((phase) => ({
		durationMs: 2200,
		rows: [...rows, phase.event].map((row) => row.padEnd(33)),
		active: phase.active,
	})),
};
