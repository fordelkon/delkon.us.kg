import { EXECUTION_LEGEND, node, withRoles } from "./diagram-layout.ts";
import { box, edge, type Frame, type Scene } from "./types.ts";

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
	const slots = (values: number[]) => `[ ${values[0] ?? "·"} | ${values[1] ?? "·"} ]`;

	const snapshot = (event?: Event): Frame => ({
		durationMs: 5000,
		note:
			pending !== undefined
				? `任务 ${pending} 仍在发送者手中。${jobs.length === 2 ? "任务队列已满，发送等待。" : "worker 已领取任务，腾出空位，发送现在可以恢复。"}`
				: collected.length === 6
					? "六份结果均已收集。队列有界、worker 复用，任务不会因移交而复制。"
					: event?.kind === "send" && event.job === 4
						? "空位可用，send(4) 恢复，任务 4 进入队列。"
						: "槽内数字是任务编号。recv 期间持锁，计算在锁外；收集者与生产者并发推进。",
		boxes: [
			box(
				"producer",
				8,
				8,
				136,
				["发送者", pending === undefined ? "可以发送" : `持有任务 ${pending}`],
				pending !== undefined,
			),
			box("jobs", 188, 8, 164, ["任务队列 · 容量 2", slots(jobs)], jobs.length === 2),
			box(
				"w0",
				8,
				100,
				148,
				["worker 0", workers[0] === undefined ? "空闲" : `计算任务 ${workers[0]}`],
				workers[0] !== undefined,
			),
			box(
				"w1",
				204,
				100,
				148,
				["worker 1", workers[1] === undefined ? "空闲" : `计算任务 ${workers[1]}`],
				workers[1] !== undefined,
			),
			box("results", 188, 188, 164, ["结果队列 · 容量 2", slots(results)], results.length > 0),
			box("collected", 8, 188, 136, ["已收集", `${collected.length} / 6`], collected.length === 6),
		],
		edges: [
			edge("send", "M144 32 H182", event?.kind === "send"),
			edge("receive0", "M242 56 V78 H82 V94", event?.kind === "receive" && event.worker === 0),
			edge("receive1", "M298 56 V94", event?.kind === "receive" && event.worker === 1),
			edge("result0", "M82 148 V168 H242 V182", event?.kind === "finish" && event.worker === 0),
			edge("result1", "M298 148 V182", event?.kind === "finish" && event.worker === 1),
			edge("collect", "M188 212 H150", event?.kind === "collect"),
		],
	});

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
			frames.push(snapshot(event));
	}

	if (collected.length !== 6 || pending !== undefined)
		throw new Error("Incomplete worker-pool scene");

	return frames;
}

const frames = buildFrames();

const pool: Scene = {
	title: "有界队列与背压",
	section: "背压与队列容量",
	caption: "队列满时，发送者等待；worker 领取后腾出空位，压力由此传回上游。",
	description:
		"两个固定 worker 处理任务 0 到 5，任务与结果队列容量均为 2。两位 worker 忙碌且任务队列积压 2、3 时，send(4) 等待，4 此时仍在发送者手里；W1 完成并领取 2 后腾出空位，4 才能入队。锁覆盖 recv，空队列等待时也会持锁，计算在锁外；收集者与生产者并发推进，槽内展示任务编号，最终收齐六份。这是一种可能调度，停留时间不表示耗时，不展开关闭和退出。",
	frames,
};

const acknowledgement: Scene = {
	title: "接纳、领取与结果确认",
	section: "消息交付与处理完成",
	description:
		"本图假设：一个有缓冲的进程内通道，消息 M 移动给接收者，处理成功后发送独立 ACK。实线分别表示入队、领取与独立确认，不是 send 直接交给消费者；不承诺外部副作用恰好发生一次。",
	caption: "任务接纳、领取、处理完成与确认送达各有边界；超时重试还要考虑幂等性。",
	frames: (
		[
			[
				"send(M) 返回",
				"尚未接收",
				"[M]",
				"Accepted · 已接纳",
				"有空位时 send 可以在入队后返回。发送成功并不证明消费者已领取，更不证明业务完成；接收端后续断开还可能留下未处理消息。",
			],
			[
				"等待业务确认",
				"recv(M) 返回",
				"[]",
				"Delivered · 已领取",
				"接收者领走 M 后负责处理。即使是无缓冲会合，发送完成最多提供对应的交接保证，也不包括接收后的业务步骤。",
			],
			[
				"仍在等待确认",
				"得到处理结果",
				"[]",
				"Completed · 已处理",
				"处理已经结束。消费者还要把结果或 ACK 交给调用方；若结果端已关闭，完成的工作也可能没有确认。",
			],
			[
				"收到 ACK(M)",
				"确认已送达",
				"[]",
				"完成已确认",
				"消费者完成约定处理后单独返回 ACK，生产者收到它才获得该层级的完成凭证。若确认丢失或超时，仍可能已经产生外部效果，不能盲目重复执行。",
			],
		] as const
	).map(([producer, consumer, queue, state, note], i) => ({
		note,
		boxes: [
			node("producer", 8, 8, 156, ["生产者", producer], "actor", true),
			node("consumer", 196, 8, 156, ["消费者", consumer], "actor", i > 0),
			node("queue", 8, 100, 344, ["消息队列", queue], "control", i === 0),
			node("result", 8, 188, 344, ["业务状态", state], i >= 2 ? "result" : "state", true),
		],
		edges: [
			edge("enqueue", "M86 56 V94", i === 0),
			edge("receive", "M274 100 V62", i === 1),
			edge("complete", "M352 32 H358 V212 H352", i === 2),
			...(i === 3 ? [edge("ack", "M196 32 H170", true)] : []),
		],
	})),
};

export const scene: Scene = {
	...pool,
	legend: EXECUTION_LEGEND,
	chapters: [
		withRoles(pool, {
			producer: "actor",
			jobs: "control",
			w0: "actor",
			w1: "actor",
			results: "state",
			collected: "result",
		}),
		acknowledgement,
	],
};
