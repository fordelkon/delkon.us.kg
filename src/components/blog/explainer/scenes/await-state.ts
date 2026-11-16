import type { Scene } from "./types.ts";

const phases = [
	{ active: "running", worker: "A", note: "执行器 poll A，执行到 await。" },
	{
		active: "waiting",
		worker: "B",
		note: "内部 Future 返回 Pending；A 保存继续执行所需的状态并交还线程，线程可运行 B。",
	},
	{
		active: "runnable",
		worker: "B",
		note: "wake 请求再次轮询 A，并不表示内部 Future 已经 Ready。",
	},
	{ active: "running", worker: "A", note: "执行器再次 poll A。" },
	{ active: "waiting", worker: "B", note: "再次得到 Pending，A 继续等待，线程可运行 B。" },
	{ active: "runnable", worker: "B", note: "再次 wake，请求下一次轮询。" },
	{
		active: "ready",
		worker: "A",
		note: "再次 poll 时内部 Future 返回 Ready，A 从 await 后继续；这不表示整个任务 A 已结束。",
	},
];

const frames = phases.map((phase) => ({
	note: `${phase.note} 当前线程运行 ${phase.worker}。`,
	boxes: [],
	activeNodes: [phase.active],
	activeEdges:
		phase.active === "running"
			? [0]
			: phase.active === "waiting"
				? [1]
				: phase.active === "runnable"
					? [2]
					: [3],
}));

export const scene: Scene = {
	diagram: `flowchart TB
 runnable["可运行"] -->|poll| running["执行中"]
 running -->|内部 Pending| waiting["等待中"]
 waiting -->|wake| runnable
 running -->|内部 Ready| ready["await 后继续"]
`,
	title: "唤醒不等于就绪",
	caption: "Pending 时保存状态、交还线程；wake 只请求重轮询，Ready 才让等待继续。",
	description:
		"逻辑状态图：任务 A 等待的内部 Future 返回 Pending 后，外层保存继续执行所需的状态并交还控制权，同一执行线程可以运行 B。wake 请求再次轮询，重轮询仍可能返回 Pending；再次唤醒后，内部 Future 返回 Ready，A 才从 await 后继续。这里的 Ready 表示被等待的操作完成，不是整个任务结束。就绪的 await 可以直接继续，不必经过挂起。这是可能的调度，非精确编译器布局。",
	frames,
};
