import { EXECUTION_LEGEND, interaction, node, withRoles } from "./diagram-layout.ts";
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
		"本图假设：一个有缓冲的进程内通道，消息 M 移动给接收者，处理成功后发送独立 ACK。不是持久消息系统，也不承诺外部副作用恰好发生一次。",
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
		edges:
			i === 3 ? [edge("ack", "M196 32 H170", true)] : [edge("message", "M164 32 H190", i === 1)],
	})),
};

const budget: Scene = {
	title: "容量与并发预算",
	section: "信号量与资源并发数",
	description:
		"本图假设：工作队列容量 2、执行资源许可 2。分别观察排队数量、正在占用的资源和系统处理能力；不把示意数值当成吞吐测量。",
	caption: "队列限制积压位置，信号量限制资源占用数；等待许可的任务本身也要受接纳策略约束。",
	frames: [
		interaction(
			"队列里有 2 个任务，两个 worker 各持有 1 个任务，另有一个发送者持有待提交值。队列容量 2 只限制队列内的积压，不代表整个系统只有 2 个未完成任务。",
			["生产者", "手中还有待提交值"],
			["两个 worker", "各处理 1 个任务"],
			["任务队列 2 / 2", "队列外仍有运行中与待提交工作"],
			["有界队列", "不自动限制全部内存与等待时间"],
		),
		interaction(
			"两个资源许可已经被持有，第三个使用者必须等待。许可释放后才可继续；如果先创建无限多任务再等许可，任务数量和内存仍可能无界增长。",
			["任务 A、B", "各占用一个许可"],
			["任务 C", "等待许可"],
			["Semaphore：可用 0 / 2", "限制的是同时使用资源的数量"],
			["接纳与启动", "可在启动任务前先取得许可"],
		),
		interaction(
			"放大队列只能吸收一部分突发，不会直接提高下游服务率。持续到达速率超过处理能力时，需要等待、拒绝、降级或增加真实处理能力，并持续收集结果避免反向堵塞。",
			["上游", "持续提交更快"],
			["下游", "处理能力有限"],
			["积压与延迟增加", "更多缓冲不等于更多吞吐"],
			["选择过载策略", "等待 / 拒绝 / 降级 / 扩容"],
		),
	],
};

const shutdown: Scene = {
	title: "排空与关停",
	section: "关停时怎样处置已接受的工作",
	description:
		"本图假设：正文的 Rust 标准库任务池采用排空策略。所有生产者最终释放发送端，主线程持续接收结果，最后 join；取消剩余工作是另一个需要明确结果的策略。",
	caption: "关停要同时管住入口、已接纳工作、结果与执行单元；关闭一个句柄不等于所有 worker 已退出。",
	frames: (
		[
			[
				"停止新工作入口",
				"继续处理已接纳任务",
				"任务队列尚未排空",
				"协调所有生产者停止提交，释放全部任务发送端。只 drop 主线程保留的一份发送端，不能关闭其他生产者仍持有的入口。",
			],
			[
				"结果接收保持运行",
				"排空队列并返回结果",
				"运行中工作仍有责任人",
				"排空阶段保持结果接收者工作，否则结果队列满后 worker 可能堵住，不再领取任务，形成任务队列与结果队列之间的等待环。",
			],
			[
				"收齐结果并等待",
				"排空后退出",
				"结果发送端陆续释放",
				"任务通道排空且全部发送端释放后，worker 才得到结束信号。worker 退出时释放结果发送端，结果通道也要等所有发送端释放才结束。",
			],
			[
				"join 全部 worker",
				"全部结束已确认",
				"完成、失败、取消均有结果",
				"最后等待提交线程及全部 worker，确认生命周期已结束。若采用取消策略，应明确剩余任务被丢弃、退回还是转移；已发生的外部副作用不会自动回滚。",
			],
		] as const
	).map(([coordinator, workers, state, note]) =>
		interaction(
			note,
			["协调者", coordinator],
			["worker", workers],
			["关停状态", state],
			["顺序约束", "停止接纳 → 处置工作 → 确认退出"],
		),
	),
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
		budget,
		shutdown,
	],
};
