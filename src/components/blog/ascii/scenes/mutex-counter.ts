import { center, type Scene } from "./types.ts";

const phases = [
	{ a: "lock", b: "ready", owner: "A", count: 0, actor: "A", operation: "lock" },
	{ a: "read 0", b: "wait", owner: "A", count: 0, actor: "A", operation: "read" },
	{ a: "write 1", b: "wait", owner: "A", count: 1, actor: "A", operation: "write" },
	{ a: "unlock", b: "wait", owner: "-", count: 1, actor: "A", operation: "unlock" },
	{ a: "done", b: "lock", owner: "B", count: 1, actor: "B", operation: "lock" },
	{ a: "done", b: "read 1", owner: "B", count: 1, actor: "B", operation: "read" },
	{ a: "done", b: "write 2", owner: "B", count: 2, actor: "B", operation: "write" },
	{ a: "done", b: "unlock", owner: "-", count: 2, actor: "B", operation: "unlock" },
	{ a: "done", b: "done", owner: "-", count: 2, actor: "both", operation: "done" },
];

export const mutexCounter: Scene = {
	caption: "同一把锁覆盖完整的“读—改—写”，另一线程等到解锁后才能进入。",
	description:
		"A、B 各加一。A 持锁读到 0、写入 1，B 在锁外等待；A 解锁后 B 取得同一把锁，读到 1、写入 2，再解锁。高亮分别标出加锁、读取、计算写回与解锁，临界区保护整次更新，而非只保护最后一次写入。此处只示意互斥，不承诺锁的公平性。",
	frames: phases.map((phase) => {
		const stateRow = `${center(`A: ${phase.a}`, 13)}     ${center(`B: ${phase.b}`, 13)}`;
		const lockRow = center("| lock                    |", 31);
		const updateRow = center("| read -> add 1 -> write  |", 31);
		const unlockRow = center("| unlock                  |", 31);

		const rows = [
			center("ONE LOCK / TWO THREADS", 31),
			stateRow,
			center(`owner: ${phase.owner}`, 31),
			"",
			center("+-- critical section -----+", 31),
			lockRow,
			updateRow,
			unlockRow,
			center("+-------------------------+", 31),
			center(`shared count: ${phase.count}`, 31),
			"0 --[A: +1]--> 1 --[B: +1]--> 2",
			center(
				phase.operation === "done"
					? "Both updates are preserved"
					: "Only the lock owner may update",
				31,
			),
		];

		const emphasis = [];

		if (phase.actor !== "both") {
			const state = phase.actor === "A" ? phase.a : phase.b;
			const start = stateRow.indexOf(`${phase.actor}: `) + 3;
			emphasis.push({ row: 1, start, end: start + state.length });
		}

		if (phase.b === "wait") {
			const start = stateRow.indexOf("wait");
			emphasis.push({ row: 1, start, end: start + 4 });
		}

		const operationRow = phase.operation === "lock" ? 5 : phase.operation === "unlock" ? 7 : 6;

		const operationText =
			phase.operation === "lock" ? lockRow : phase.operation === "unlock" ? unlockRow : updateRow;

		const operation = phase.operation === "write" ? "add 1 -> write" : phase.operation;

		if (phase.operation !== "done") {
			const start = operationText.indexOf(operation);
			emphasis.push({ row: operationRow, start, end: start + operation.length });
		}

		return {
			durationMs: phase.operation === "done" ? 2400 : 1600,
			rows,
			active: phase.operation === "done" ? [9, 10, 11] : phase.operation === "write" ? [9] : [2],
			emphasis,
		};
	}),
};
