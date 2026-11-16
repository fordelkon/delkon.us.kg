import type { Scene } from "./types.ts";

const phases = [
	["持锁", "就绪", "A", "0", "加锁"],
	["读取 0", "等待锁", "A", "0", "读取"],
	["写入 1", "等待锁", "A", "1", "计算并写回"],
	["解锁", "等待锁", "无", "1", "解锁"],
	["完成", "持锁", "B", "1", "加锁"],
	["完成", "读取 1", "B", "1", "读取"],
	["完成", "写入 2", "B", "2", "计算并写回"],
	["完成", "解锁", "无", "2", "解锁"],
	["完成", "完成", "无", "2", "两次更新均保留"],
] as const;

const frames = phases.map(([a, b, owner, count, operation]) => ({
	note: `A：${a}；B：${b}。锁归属：${owner}；共享 count=${count}。当前操作：${operation}。`,
	boxes: [],
	activeNodes:
		operation === "两次更新均保留"
			? ["a", "b", "unlock"]
			: [
					a === "完成" ? "b" : "a",
					operation === "加锁"
						? "lock"
						: operation === "读取"
							? "read"
							: operation === "解锁"
								? "unlock"
								: "write",
				],
}));

export const scene: Scene = {
	diagram: `flowchart TB
 a["线程 A"] --> lock["取得同一把锁"]
 b["线程 B"] --> lock
 lock --> read["读取 count"]
 read --> write["加一并写回"]
 write --> unlock["解锁"]
`,
	title: "同一把锁保护整次更新",
	caption: "同一把锁覆盖完整的“读—改—写”，另一线程等到解锁后才能进入。",
	description:
		"将正文的多线程计数缩小为 A、B 各加一。A 持锁读到 0、写入 1，B 在锁外等待；A 解锁后 B 取得同一把锁，读到 1、写入 2，再解锁。高亮分别标出加锁、读取、计算写回与解锁，临界区保护整次更新，而非只保护最后一次写入。此处只示意互斥，不承诺锁的公平性。",
	frames,
};
