import { center, type Frame, type Scene } from "./types.ts";

type Worker = 0 | 1;

type Event =
	| { kind: "send"; job: number }
	| { kind: "wait"; job: number }
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
	{ kind: "wait", job: 4 },
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
	let pending: number | undefined;
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
		let status = "queue Q=2 / workers W=2";

		if (event?.kind === "send") {
			const start = 16 + (jobs.length - 1) * 2;
			emphasis.push({ row: 0, start: 0, end: 6 }, { row: 0, start, end: start + 1 });
			status = `send(${event.job}) -> queued`;
		}

		if (event?.kind === "wait") {
			emphasis.push({ row: 0, start: 15, end: 20 });
			status = `send(${event.job}) stays with producer`;
		}

		if (event?.kind === "collect") {
			emphasis.push(
				{ row: 6, start: 15, end: 20 },
				{ row: 7, start: 17, end: 18 },
				{ row: 8, start: 21, end: 24 },
			);
			status =
				collected.length === 6
					? "6/6 collected / workers reused"
					: "collect -> drain a result slot";
		}

		if (event?.kind === "receive" || event?.kind === "finish") {
			const left = event.worker === 0;
			const workerStart = left ? 2 : 26;
			emphasis.push({ row: 4, start: workerStart, end: workerStart + worker(event.worker).length });
			emphasis.push({
				row: event.kind === "receive" ? 3 : 5,
				start: left ? 5 : 17,
				end: left ? 18 : 30,
			});

			if (event.kind === "receive") {
				emphasis.push(
					{ row: 0, start: 15, end: 20 },
					{ row: 1, start: 17, end: 18 },
					{ row: 2, start: 13, end: 22 },
				);
				incoming = left ? "     v-----------+-----------+" : "     +-----------+-----------v";
				status = `W${event.worker}: receive -> compute`;
			} else {
				const start = 16 + (results.length - 1) * 2;
				emphasis.push({ row: 6, start, end: start + 1 });
				outgoing = left ? "     +---------->v-----------+" : "     +-----------v<----------+";
				status = `W${event.worker}: finish -> result queued`;
			}
		}

		const footer =
			pending !== undefined
				? `send(${pending}): ${jobs.length === 2 ? "FULL -> WAIT" : "SLOT FREE -> resume"}`
				: event?.kind === "send" && event.job === 4
					? "send(4) resumed in the free slot"
					: "capacity=2 / worker count=2";

		if (pending !== undefined || (event?.kind === "send" && event.job === 4)) active.push(10);

		if (event) active.push(9);

		// Hold the important states; transfer steps remain quick and discrete.
		const bothBusy = workers.every((job) => job !== undefined);
		let durationMs = 600;

		if (!event) durationMs = 1200;
		else if (collected.length === 6) durationMs = 1500;
		else if (event.kind === "wait" || (event.kind === "receive" && pending !== undefined))
			durationMs = 2200;
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
				center(status, 35),
				center(footer, 35),
			],
			active,
			emphasis,
		};
	};

	const frames = [snapshot()];

	for (const event of events) {
		switch (event.kind) {
			case "send":
				if (
					jobs.length === 2 ||
					sent.has(event.job) ||
					(pending !== undefined && pending !== event.job)
				)
					throw new Error("Invalid worker-pool send");
				jobs.push(event.job);
				sent.add(event.job);
				pending = undefined;
				break;
			case "wait":
				if (jobs.length !== 2 || pending !== undefined || sent.has(event.job))
					throw new Error("Invalid worker-pool backpressure");
				pending = event.job;
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

		// Simulate every handoff, but show only the causal milestones in the introduction.
		if (
			(event.kind === "send" && [1, 3, 4, 5].includes(event.job)) ||
			event.kind === "wait" ||
			(event.kind === "receive" && pending !== undefined) ||
			collected.length === 6
		)
			frames.push({ ...snapshot(event), durationMs: 2200 });
	}

	if (collected.length !== 6 || pending !== undefined)
		throw new Error("Incomplete worker-pool scene");

	frames.push({
		rows: [
			"BACKPRESSURE / RECAP",
			"",
			"send(4) --> [2|3] --> W0 / W1",
			"   WAIT      FULL      BUSY",
			"     ^        |",
			"     +--------+",
			"",
			"W1 takes 2 -> a slot opens",
			"send(4) resumes -> [3|4]",
			"",
			"Bound the queue; reuse workers",
			"6/6 results collected",
		].map((row) => center(row, 35)),
		active: [3, 7, 8],
	});

	return frames;
}

export const workerPool: Scene = {
	caption: "队列满时，发送者等待；worker 领取后腾出空位，压力由此传回上游。",
	description:
		"两个固定 worker 处理任务 0 到 5，任务与结果队列容量均为 2。两位 worker 忙碌且任务队列积压 2、3 时，send(4) 等待，4 此时仍在发送者手里；W1 完成并领取 2 后腾出空位，4 才能入队。recv 锁只覆盖领取，计算在锁外；结果持续收集，槽内展示任务编号，最终收齐六份。这是一种可能调度，停留时间不表示耗时，不展开关闭和退出。",
	frames: buildFrames(),
};
