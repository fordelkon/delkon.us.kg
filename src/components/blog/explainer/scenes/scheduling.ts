import { EXECUTION_LEGEND, interaction, node, withRoles } from "./diagram-layout.ts";
import { box, type Scene } from "./types.ts";

const trace = ["A", "B", "B", "A"];

const frames = [0, 1, 2, 3, 4].map((step) => ({
	note:
		step === 4
			? "同一列是同一时刻：单核交错，双核同时推进。格子不表示实际耗时。"
			: `观察第 ${step + 1} 个时间片；切换可来自抢占或主动让出。`,
	boxes: [
		box("single", 8, 8, 80, ["单核", "CPU 0"]),
		box("parallel-a", 8, 104, 80, ["双核", "CPU 0"]),
		box("parallel-b", 8, 176, 80, ["双核", "CPU 1"]),
		...trace.flatMap((task, column) => [
			box(
				`single-${column}`,
				98 + column * 64,
				8,
				54,
				[String(column + 1), task],
				step === column || step === 4,
				column > step,
			),
			box(
				`a-${column}`,
				98 + column * 64,
				104,
				54,
				[String(column + 1), "A"],
				step === column || step === 4,
				column > step,
			),
			box(
				`b-${column}`,
				98 + column * 64,
				176,
				54,
				[String(column + 1), "B"],
				step === column || step === 4,
				column > step,
			),
		]),
	],
}));

const timeline: Scene = {
	title: "并发与并行",
	section: "并发与并行",
	caption: "单核上的并发任务交错推进；有多个执行资源时，它们还可以同时执行。",
	description:
		"一种可能的执行轨迹，横向是时间，每格表示正在执行的任务。单核先后执行 A、B、B、A，同一时刻只执行一个；双核各运行一个任务，同一列的 A 与 B 同时执行。高亮逐列推进，再保留完整轨迹。切换可以来自抢占，也可以来自协作式让出，不保证严格轮换；格子不代表耗时测量。",
	frames: frames.map((frame) => ({
		...frame,
		boxes: frame.boxes.map((item) => ({
			...item,
			tone:
				item.id.startsWith("single-") || item.id.startsWith("a-") || item.id.startsWith("b-")
					? ("actor" as const)
					: ("control" as const),
		})),
	})),
};

const execution: Scene = {
	title: "任务如何落到线程",
	section: "任务与执行单元",
	diagramHeight: 368,
	description:
		"本图假设：一个进程中的简化执行器。前两帧为单线程异步调度，第三帧另换双线程配置，第四帧对照单线程阻塞；不是操作系统或 Go runtime 的完整结构。",
	caption:
		"任务保存逻辑进度，运行时安排任务，OS 调度线程；进程划分地址空间，线程有各自的栈与寄存器现场。",
	frames: (
		[
			[
				"执行中",
				"就绪，等待轮询",
				"A",
				"未配置",
				"一个线程推进 A",
				"两个任务属于同一进程，运行时先在工作线程 0 上推进 A。协程没有脱离线程执行；任务数、线程数和 CPU 数不是同一概念。",
			],
			[
				"Pending，保存状态",
				"执行中",
				"B",
				"未配置",
				"A 交还线程，线程转去推进 B",
				"等待尚未就绪的异步操作时，外层任务返回 Pending，线程可推进 B。若 await 的对象已经 Ready，则可直接继续；不保证每次 await 都发生切换。",
			],
			[
				"线程 0 上执行",
				"线程 1 上执行",
				"A",
				"B",
				"独立配置：两个线程同时获 CPU",
				"另一个配置有两个工作线程，并在这个时刻各自得到 CPU。A 与 B 才真正并行；多线程运行时仍不保证每次运行都发生这种调度。",
			],
			[
				"同步调用阻塞线程",
				"就绪，但无法轮询",
				"被 A 占用",
				"未配置",
				"回到单线程：Pending ≠ 阻塞线程",
				"在单线程执行器内调用阻塞式 I/O，或长时间计算而不交还控制权，会使 B 无法被轮询。OS 可运行其他线程，但不能替这个运行时推进占用线程上的 B。",
			],
		] as const
	).map(([a, b, t0, t1, state, note], index) => ({
		note,
		boxes: [
			node("a", 8, 8, 156, ["任务 A", a], "actor", true),
			node("b", 196, 8, 156, ["任务 B", b], "actor", index === 1 || index === 2),
			node("runtime", 8, 88, 344, ["用户态运行时 / 执行器", state], "state", true),
			node("thread0", 8, 168, 156, ["OS 线程 0", t0], "control", true),
			node("thread1", 196, 168, 156, ["OS 线程 1", t1], "control", index === 2),
			node(
				"cpu0",
				8,
				248,
				156,
				["CPU 0", index === 3 ? "可调度其他线程" : "执行线程 0"],
				"result",
				index !== 3,
			),
			node(
				"cpu1",
				196,
				248,
				156,
				["CPU 1", index === 2 ? "执行线程 1" : "不参与本例"],
				"result",
				index === 2,
			),
			node("process", 8, 312, 344, ["进程地址空间", "线程共享资源；各有栈与执行现场"], "state"),
		],
		edges: [
			{ id: "assign0", path: "M86 136 V162", active: true },
			{ id: "assign1", path: "M274 136 V162", active: index === 2 },
			{ id: "schedule0", path: "M86 216 V242", active: index !== 3 },
			{ id: "schedule1", path: "M274 216 V242", active: index === 2 },
		],
	})),
};

const boundaries: Scene = {
	title: "并行成本与共享状态",
	section: "并行任务的划分与成本",
	description:
		"本图是假设对照：固定工作量，20% 串行、80% 可理想并行；其余帧讨论共享状态的访问规则。不是性能实测，也不将未定义行为模拟成合法时间线。",
	caption: "更多执行单元不自动带来同比加速；任务划分、协调成本与共享状态的正确性须一起考虑。",
	frames: [
		interaction(
			"四个执行单元理想分摊 80% 的部分：总耗时为 20% + 80% / 4 = 40%，加速 2.5 倍。创建、同步与汇总的额外成本尚未计入。",
			["串行部分", "20% 不可分摊"],
			["四路并行部分", "80% / 4 = 20%"],
			["理想总耗时", "40% · 加速 2.5 倍"],
			["实际测量", "还需计入派发、争用与汇总"],
		),
		interaction(
			"大任务块可能分配不均，小任务块增加管理与同步开销。应比较同一输入和结果要求，吞吐提升也不保证单个请求或尾延迟下降。",
			["粗粒度", "开销少，可能不均衡"],
			["细粒度", "均衡好，调度更频繁"],
			["需要测量的结果", "完成耗时 / 吞吐 / 尾延迟"],
			["先明确工作契约", "再决定任务粒度和执行资源"],
		),
		interaction(
			"共享资源意味着需要访问协议。Rust/C++ 中未同步的冲突非原子访问可能构成数据竞争与未定义行为；即使都使用原子访问，拆开的检查和更新也仍可能违反业务要求。",
			["线程 A", "访问共享状态"],
			["线程 B", "访问共享状态"],
			["内存安全与逻辑正确性", "数据竞争 ≠ 所有竞态条件"],
			["后续主线", "锁 / 原子 / 不变量 / 生命周期"],
		),
	],
};

export const scene: Scene = {
	...timeline,
	legend: EXECUTION_LEGEND,
	chapters: [
		withRoles(timeline, { single: "control", "parallel-a": "control", "parallel-b": "control" }),
		execution,
		boundaries,
	],
};
