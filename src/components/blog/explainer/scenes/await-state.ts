import { EXECUTION_LEGEND, interaction, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

const polling: Scene = {
	title: "poll、wake 与 Ready",
	section: "执行器轮询与唤醒的循环",
	diagramHeight: 312,
	description:
		"本图假设：一个线程上的任务 A 等待内部 Future，B 也可运行。展示一种可能调度；wake 可在 poll 返回前发生，多个唤醒可合并，不保证立即轮询。",
	caption:
		"wake 请求重新 poll；内部 Future 的 Ready 只让 await 继续，外层 Future 的 Ready 才表示任务完成。",
	frames: (
		[
			[
				"轮询 A",
				"执行到 await",
				"正在 poll",
				"尚无通知",
				"A 正在执行",
				"执行器 poll 外层任务 A，A 再轮询被等待的内部 Future。async 函数保存继续执行所需的状态，并不因为创建 Future 就自动在后台运行。",
			],
			[
				"可推进 B",
				"外层 Pending",
				"Pending",
				"已登记 Waker",
				"A 保存进度并交还线程",
				"内部操作尚未就绪，登记唤醒方式并返回 Pending；此路径中外层也返回 Pending，执行器才得到线程控制权。组合器可能先在同一次 poll 中推进其他分支。",
			],
			[
				"仍可运行 B",
				"请求重新调度",
				"尚未确认 Ready",
				"调用 wake",
				"A 有待轮询请求",
				"事件源调用 wake，请求再次轮询 A。通知不是内部操作完成的证明，执行器也不必立即停下 B；通知期间的重新调度请求不能丢失。",
			],
			[
				"再次轮询 A",
				"恢复到等待点",
				"再次 poll",
				"通知已处理",
				"重试操作的状态检查",
				"A 再次获得轮询机会，重新检查内部操作。就绪通知也可能已过时，例如重试 I/O 仍会得到 WouldBlock，需要继续等待。",
			],
			[
				"可继续推进 B",
				"再次 Pending",
				"Pending",
				"继续保留唤醒路径",
				"线程不是被 A 阻塞住",
				"再次 poll 仍可返回 Pending，A 继续等待，同一线程可以推进 B。能否让出取决于实际 poll 路径，不能认为每次 await 都会切换。",
			],
			[
				"准备再次轮询",
				"请求重新调度",
				"待下次 poll 确认",
				"再次 wake",
				"唤醒仍只是机会",
				"后续事件再次发出 wake；本图用两个通知展示重试，不要求每次通知与排队或轮询次数一一对应。",
			],
			[
				"线程运行 A",
				"从 await 后继续",
				"Ready(value)",
				"本次等待已完成",
				"内部 Ready ≠ 任务结束",
				"这次内部 Future 返回 Ready，A 取得 value 并继续执行 await 后面的代码。此时外层任务可能还有计算、其他等待或资源清理。",
			],
			[
				"可运行其他任务",
				"外层返回 Ready",
				"不再轮询该操作",
				"无需再为 A 调度",
				"任务 A 结果已返回",
				"本例再完成剩余代码，外层 Future 返回 Ready，才表示任务 A 结束。已完成的 Future 不应继续按未完成任务轮询，结果与错误由其所有者接收。",
			],
		] as const
	).map(([executor, task, inner, waker, state, note], i) => ({
		note,
		boxes: [
			node("executor", 8, 8, 156, ["执行器 / 线程", executor], "actor", true),
			node("task", 196, 8, 156, ["外层任务 A", task], "state", true),
			node("waker", 8, 104, 156, ["事件源 / Waker", waker], "control", i === 2 || i === 5),
			node("inner", 196, 104, 156, ["内部 Future", inner], i >= 6 ? "result" : "state", true),
			node("state", 8, 200, 344, ["当前边界", state], i === 7 ? "result" : "control", true),
			node(
				"queue",
				8,
				264,
				344,
				[
					"调度与运行",
					i === 2 || i === 5 ? "请求已就绪，仍需执行器安排" : "线程可用性与操作完成度分开判断",
				],
				"control",
			),
		],
		edges: [
			edge("poll", "M164 32 H190", i === 0 || i === 3 || i === 6),
			edge("await", "M274 56 V98", i === 0 || i === 3),
			edge("wake", "M86 104 V62", i === 2 || i === 5),
		],
	})),
};

const cancellation: Scene = {
	title: "取消与值的归属",
	section: "取消安全中断后能否重来",
	description:
		"本图假设：Tokio 有界 mpsc 容量已满，select 的取消分支先完成。先比较拥有 value 的 send Future，再从新值开始比较外层持有 value 的 reserve 方案。",
	caption:
		"取消安全需要检查谁拥有值、哪些进度已发生；停止等待、保留消息和撤销外部副作用是不同保证。",
	frames: [
		interaction(
			"send(value) 已把 value 移入发送 Future。队列满时等待空位，外层不再拥有这份值；如果这时取消分支胜出，消息尚未入队。",
			["外层调用者", "value 已移出"],
			["send Future", "持有 value 并等待"],
			["队列已满", "未完成发送"],
			["此时取消", "会丢弃拥有 value 的 Future"],
		),
		interaction(
			"send 分支被丢弃时，尚未发送的 value 随 Future 析构。消息没发出去不等于调用者拿回了 value；不能在下一轮直接重试那份已丢弃的值。",
			["外层调用者", "没有取回 value"],
			["send Future", "被丢弃"],
			["队列未收到该消息", "value 的生命周期已经结束"],
			["取消的范围", "停止这个等待，不回滚外部效果"],
		),
		interaction(
			"独立方案：把新 value 保留在外层，select 分支只等待 reserve()。取消时失去容量等待队列中的位置，但 value 仍在外层，可按策略重试或返回。",
			["外层调用者", "仍持有 value"],
			["reserve Future", "取消，失去排队位置"],
			["队列未收到该消息", "外层保留待发送值"],
			["保留数据 ≠ 保留公平位置", "重试需重新排队"],
		),
		interaction(
			"另一条成功分支取得 Permit 后，调用 permit.send(value) 才把 value 交给通道。部分网络读写等操作可能已经产生进度，不能照搬这个未入队模型。",
			["外层调用者", "取得许可后移交值"],
			["通道", "接纳 value"],
			["责任完成移交", "有许可 → send(value)"],
			["按具体 API 核对", "部分写入不能视为从未发生"],
		),
	],
};

const lifecycle: Scene = {
	title: "超时与任务收束",
	section: "结构化并发与任务收束",
	description:
		"本图假设：Tokio spawn 创建独立异步任务，运行时保持存活。三个独立路径对比丢弃句柄、请求 abort、等待结束；不把异步取消视为同步代码的强制中断。",
	caption:
		"请求期限限制等待，任务所有者还要管理终止和清理；释放本地资源不等于撤回远端已经执行的工作。",
	frames: [
		interaction(
			"把拥有所有权的 JoinHandle 交给 timeout，超时后可能丢弃句柄。它只放弃等待，spawn 出的任务仍可在运行时存活期间继续，父任务返回也不自动收束子任务。",
			["父任务", "超时，丢弃句柄"],
			["spawn 子任务", "仍可能继续运行"],
			["等待已结束", "后台任务不一定结束"],
			["生命周期缺口", "结果与清理还没有得到确认"],
		),
		interaction(
			"改为保留 JoinHandle，用可变引用等待。超时后请求 abort，运行时安排取消；任务可能已先完成，abort 返回也不表示其析构已经完成。",
			["父任务", "保留句柄并 abort"],
			["spawn 子任务", "取消请求待生效"],
			["请求停止 ≠ 已停止", "同步 poll 不会被强行切断"],
			["下一步", "等待 JoinHandle 确认结束"],
		),
		interaction(
			"等待 JoinHandle 后，才观察到正常结果、失败或取消，确认此 Tokio 任务已结束并完成析构。需要异步善后时应显式协调退出；本地取消不撤回已经发往外部系统的请求。",
			["父任务", "await 取得退出结果"],
			["子任务", "结束与析构已确认"],
			["结果 / 错误 / 取消", "都由任务所有者收束"],
			["外部副作用", "另行确认、补偿或幂等处理"],
		),
		interaction(
			"批量任务也要覆盖成功、失败和取消路径。协调者先关闭新工作入口，再通知停止并持续收集退出结果；若持锁跨 await 又依赖同锁，仍可能形成等待环。",
			["协调者", "停止接纳与派生"],
			["任务组", "响应停止并逐个结束"],
			["结构化生命周期", "离开作用域前收束所管理的任务"],
			["阻塞工作另行管理", "已启动的阻塞工作不能靠 abort 强停"],
		),
	],
};

export const scene: Scene = {
	...polling,
	legend: EXECUTION_LEGEND,
	chapters: [polling, cancellation, lifecycle],
};
