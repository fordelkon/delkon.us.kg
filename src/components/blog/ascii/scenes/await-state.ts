import { center, type Scene } from "./types.ts";

const phases = [
	{
		event: "poll A: run until await",
		worker: "A",
		emphasis: [
			{ row: 1, start: 11, end: 30 },
			{ row: 9, start: 22, end: 23 },
		],
	},
	{
		event: "Pending: save n=7, return",
		worker: "B",
		emphasis: [
			{ row: 0, start: 26, end: 29 },
			{ row: 2, start: 24, end: 33 },
			{ row: 3, start: 24, end: 25 },
			{ row: 4, start: 20, end: 29 },
			{ row: 9, start: 22, end: 23 },
		],
	},
	{
		event: "wake A: request another poll",
		worker: "B",
		emphasis: [
			{ row: 1, start: 0, end: 10 },
			{ row: 2, start: 4, end: 5 },
			{ row: 3, start: 4, end: 5 },
			{ row: 4, start: 4, end: 5 },
			{ row: 5, start: 4, end: 5 },
			{ row: 5, start: 24, end: 30 },
			{ row: 6, start: 4, end: 25 },
			{ row: 7, start: 10, end: 23 },
		],
	},
	{
		event: "A returned Pending; B runs again",
		worker: "B",
		emphasis: [
			{ row: 1, start: 11, end: 30 },
			{ row: 2, start: 24, end: 33 },
			{ row: 3, start: 24, end: 25 },
			{ row: 4, start: 20, end: 29 },
		],
	},
	{
		event: "wake A: request another poll",
		worker: "B",
		emphasis: [
			{ row: 1, start: 0, end: 10 },
			{ row: 2, start: 4, end: 5 },
			{ row: 3, start: 4, end: 5 },
			{ row: 4, start: 4, end: 5 },
			{ row: 5, start: 4, end: 5 },
			{ row: 5, start: 24, end: 30 },
			{ row: 6, start: 4, end: 25 },
			{ row: 7, start: 10, end: 23 },
		],
	},
	{
		event: "poll A: Ready, resume with n=7",
		worker: "A",
		emphasis: [
			{ row: 0, start: 26, end: 29 },
			{ row: 1, start: 11, end: 30 },
			{ row: 9, start: 22, end: 23 },
			{ row: 10, start: 2, end: 31 },
		],
	},
];

export const awaitState: Scene = {
	caption: "Pending 时保存状态、交还线程；wake 只请求重轮询，Ready 才让等待继续。",
	description:
		"逻辑状态图：任务 A 的内部 Future 返回 Pending 后，外层保存 n=7 并交还控制权，同一执行线程可以运行 B。wake 请求再次轮询，重轮询仍可能返回 Pending；再次唤醒后，内部 Future 返回 Ready，A 才从 await 后继续，n 仍是 7。就绪的 await 可以直接继续，不必经过挂起。这是可能的调度，非精确编译器布局。",
	frames: phases.map((phase) => ({
		durationMs: 1800,
		rows: [
			center("FUTURE A / saved local n=7", 33),
			"[runnable] --poll--> [running]",
			"    ^                   | Pending",
			"    |                   v",
			"    |               [waiting]",
			"    |                   | wake",
			"    +-- request poll ---+",
			center("wake != Ready", 33),
			"",
			center(`worker now: ${phase.worker}`, 33),
			center("Ready -> continue after await", 33),
			center(phase.event, 33),
		],
		active: [11],
		emphasis: phase.emphasis,
	})),
};
