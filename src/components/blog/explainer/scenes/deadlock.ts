import type { Scene } from "./types.ts";

const notes = [
	"运行一：A 持 L1，B 持 L2。",
	"A 等待 B 持有的 L2。",
	"B 又等待 A 持有的 L1，形成等待环。",
	"开始独立的运行二：双方都按 L1 → L2 获取锁。",
	"B 等待 L1 时不持有锁，A 可以完成并释放。",
	"A 释放后，B 依次获得 L1、L2 并完成。",
	"两次独立运行的对照：统一获取顺序排除这两把锁的循环等待。",
];

const highlights = [
	["a", "b"],
	["a"],
	["a", "b"],
	["first", "second"],
	["first"],
	["second"],
	["a", "b", "first", "second"],
];

const links = [[], [0], [0, 1], [], [], [2], [0, 1, 2]];

const frames = notes.map((note, step) => ({
	note,
	boxes: [],
	activeNodes: highlights[step] ?? [],
	activeEdges: links[step] ?? [],
}));

export const scene: Scene = {
	diagram: `flowchart TB
 subgraph opposite[运行一：相反顺序]
 direction LR
  a["A 持 L1"] -->|等 L2| b["B 持 L2"]
  b -->|等 L1| a
 end
 subgraph ordered[运行二：统一顺序]
 direction LR
  first["A：L1 → L2"] -->|释放后| second["B：L1 → L2"]
 end
 opposite ~~~ ordered
`,
	title: "相反顺序与统一顺序",
	caption: "各持一锁、互等另一锁，就形成等待环；统一加锁顺序，让持锁者能先完成并释放。",
	description:
		"上下对比两次独立运行，不是从死锁中直接恢复。第一次 A 持 L1 等 B 的 L2，B 持 L2 等 A 的 L1，形成等待环。第二次都先取 L1 再取 L2：B 等 L1 时不持锁，A 可以取 L2、完成并释放，随后 B 依次取锁并完成。统一获取顺序排除这两把独占锁的循环等待。",
	frames,
};
