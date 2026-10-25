import { center, type Frame, type Scene } from "./types.ts";

type Worker = 0 | 1;

type Event =
	| { kind: "send"; job: number }
	| { kind: "receive"; worker: Worker }
	| { kind: "finish"; worker: Worker }
	| { kind: "collect" };

// Each event makes one handoff. W1 reuses its slot while W0 still holds job 0.
// Result slots show IDs, not the squared values returned by the article's code.
const events: Event[] = [
	{ kind: "send", job: 0 },
	{ kind: "send", job: 1 },
	{ kind: "receive", worker: 0 },
	{ kind: "receive", worker: 1 },
	{ kind: "send", job: 2 },
	{ kind: "send", job: 3 },
	{ kind: "finish", worker: 1 },
	{ kind: "receive", worker: 1 },
	{ kind: "send", job: 4 },
	{ kind: "finish", worker: 1 },
	{ kind: "receive", worker: 1 },
	{ kind: "send", job: 5 },
	{ kind: "collect" },
	{ kind: "finish", worker: 0 },
	{ kind: "receive", worker: 0 },
	{ kind: "collect" },
	{ kind: "finish", worker: 1 },
	{ kind: "receive", worker: 1 },
	{ kind: "collect" },
	{ kind: "finish", worker: 0 },
	{ kind: "collect" },
	{ kind: "finish", worker: 1 },
	{ kind: "collect" },
	{ kind: "collect" },
];

function buildFrames(): Frame[] {
	const jobs: number[] = [];
	const workers: [number | undefined, number | undefined] = [undefined, undefined];
	const results: number[] = [];
	const collected: number[] = [];
	const sent = new Set<number>();
	const slots = (values: number[]) => `[${values[0] ?? " "}|${values[1] ?? " "}]`;

	const queue = (label: string, values: number[], prefix = "       ") =>
		`${prefix}${label.padEnd(7)} ${slots(values)}`;

	const worker = (id: Worker) =>
		`W${id}:${workers[id] === undefined ? "IDLE" : `[${workers[id]}]`}`;

	const snapshot = (event?: Event): Frame => {
		const active: number[] = [];
		const emphasis: NonNullable<Frame["emphasis"]> = [];
		let incoming = "     +-----------+-----------+";
		let outgoing = "     +-----------+-----------+";

		if (event?.kind === "send") active.push(0);

		if (event?.kind === "collect") active.push(6, 7, 8);

		if (event?.kind === "receive" || event?.kind === "finish") {
			const left = event.worker === 0;
			emphasis.push({ row: 4, start: left ? 0 : 24, end: left ? 11 : 35 });
			emphasis.push({
				row: event.kind === "receive" ? 3 : 5,
				start: left ? 5 : 17,
				end: left ? 18 : 30,
			});

			if (event.kind === "receive") {
				active.push(2);
				incoming = left ? "     v-----------+-----------+" : "     +-----------+-----------v";
			} else {
				active.push(6);
				outgoing = left ? "     +---------->v-----------+" : "     +-----------v<----------+";
			}
		}

		// Hold the important states; transfer steps remain quick and discrete.
		const bothBusy = workers.every((job) => job !== undefined);
		let durationMs = 600;

		if (!event) durationMs = 1200;
		else if (collected.length === 6) durationMs = 1500;
		else if (jobs.length === 2 && results.length === 2 && bothBusy) durationMs = 1800;
		else if (jobs.length === 2 && results.length === 0 && bothBusy) durationMs = 1400;
		else if (event.kind === "receive" && event.worker === 0 && collected.length > 0)
			durationMs = 1400;

		return {
			durationMs,
			rows: [
				queue("jobs", jobs, "send-> "),
				"                 |",
				center("recv lock", 35),
				incoming,
				`${center(worker(0), 11)}             ${center(worker(1), 11)}`,
				outgoing,
				queue("results", results),
				event?.kind === "collect" ? "                 v" : "                 |",
				center(`collected: ${collected.length}/6`, 35),
			],
			active,
			emphasis,
		};
	};

	const frames = [snapshot()];

	for (const event of events) {
		switch (event.kind) {
			case "send":
				if (jobs.length === 2 || sent.has(event.job)) throw new Error("Invalid worker-pool send");
				jobs.push(event.job);
				sent.add(event.job);
				break;
			case "receive": {
				if (workers[event.worker] !== undefined || !jobs.length)
					throw new Error("Invalid worker-pool receive");
				workers[event.worker] = jobs.shift();
				break;
			}

			case "finish": {
				const job = workers[event.worker];

				if (job === undefined || results.length === 2)
					throw new Error("Invalid worker-pool result");
				results.push(job);
				workers[event.worker] = undefined;
				break;
			}

			case "collect": {
				const job = results.shift();

				if (job === undefined) throw new Error("Invalid worker-pool collection");
				collected.push(job);
				break;
			}
		}

		const owned = [...jobs, ...results, ...collected];

		for (const job of workers) if (job !== undefined) owned.push(job);

		if (owned.length !== sent.size || new Set(owned).size !== owned.length)
			throw new Error("Worker-pool job ownership mismatch");
		frames.push(snapshot(event));
	}

	if (collected.length !== 6) throw new Error("Incomplete worker-pool scene");

	return frames;
}

export const workerPool: Scene = {
	description:
		"两个固定 worker 处理编号 0 到 5 的六个任务。每帧只发生一次发送、领取、完成或收集，接收通过同一把 recv 锁串行进行，计算在锁外。W0 仍持有任务 0 时，W1 已依次领取任务 1、2、3；任务和结果缓冲都能同时积压两项。结果槽展示任务编号，最终逐项收齐六份结果。这只是一种可能调度，动画停留时间不表示计算耗时，也不展开关闭通道和线程退出。",
	frames: buildFrames(),
};
