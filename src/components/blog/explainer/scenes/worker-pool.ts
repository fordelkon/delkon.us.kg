import { label, mark } from "./examples.ts";
import type { Frame, Scene } from "./types.ts";

const capacity = 2;

function handoff(): Frame[] {
	const jobs = [2, 3];
	const nextJob = 4;
	let pending: number | undefined = nextJob;
	let working: number | undefined = 1;

	const snapshot = (note: string, transfer?: "dequeue" | "enqueue"): Frame => ({
		note,
		boxes: [
			label("sender", 56, 28, "待入队", 92),
			label("queue", 180, 28, `队列 ${jobs.length}/${capacity}`, 132),
			label("worker", 302, 28, "worker", 100),
			mark("waiting-task", 27, 56, 58, 48, pending?.toString() ?? "—", "cell", pending === nextJob),
			...Array.from({ length: capacity }, (_, i) =>
				mark(
					`slot-${i}`,
					122 + i * 58,
					56,
					58,
					48,
					jobs[capacity - 1 - i]?.toString() ?? "—",
					"cell",
					jobs[capacity - 1 - i] === nextJob,
				),
			),
			mark("running-task", 273, 56, 58, 48, working?.toString() ?? "—", "cell"),
		],
		edges: transfer
			? [
					{
						id: transfer,
						path: transfer === "dequeue" ? "M242 80 H268" : "M89 80 H117",
						active: true,
					},
				]
			: [],
	});

	const frames = [
		snapshot("任务 2 和 3 占满队列，worker 正在处理 1。入口提交的任务 4 只能留在队列外等待。"),
	];

	working = jobs.shift();
	frames.push(
		snapshot("worker 完成 1 并领取队首的 2。入口现在有一个可用槽，任务 4 还没有入队。", "dequeue"),
	);
	jobs.push(nextJob);
	pending = undefined;
	frames.push(snapshot("发送恢复，任务 4 进入队尾。worker 仍在处理 2，队列重新满员。", "enqueue"));

	return frames;
}

export const scene: Scene = {
	title: "满队列把等待留在哪里",
	diagramHeight: 126,
	caption: "队尾在左，队首在右。队列满时任务 4 等在入口，worker 领走队首后，空出的槽位才能接纳它。",
	description:
		"队列容量为二，右边是队首。队列被 2 和 3 占满时，4 在入口等待。worker 完成 1，领走 2，剩下 3 和一个空位。4 随后进入空位，2 仍在 worker 手中。",
	frames: handoff(),
};
