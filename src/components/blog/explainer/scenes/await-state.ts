import { EXECUTION_LEGEND, node } from "./diagram-layout.ts";
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
	title: "取消时 value 归谁",
	section: "取消安全中断后能否重来",
	description:
		"Tokio 有界 mpsc 队列已满，取消分支先完成。两条分支是独立方案：直接 send(value)，或先 reserve 并把 value 留在外层；箭头表示所有权与取消结果，不是连续执行两种发送。",
	caption: "取消安全先看值由谁拥有；消息尚未入队，不代表调用者还能拿回它。",
	diagram: `flowchart TB
 value["外层持有 value"]
 value -->|send(value)：移入| send["发送 Future 拥有 value<br/>等待队列空位"]
 send -->|取消分支胜出，丢弃 Future| lost["value 随 Future 析构<br/>外层不能重试这份值"]
 value -.->|reserve：仅等待许可| reserve["value 仍由外层持有"]
 reserve -->|取消容量等待| retained["保留 value<br/>可返回或按策略重试"]
 class value actor
 class send,reserve state
 class lost risk
 class retained result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["value", "send"],
			activeEdges: [0],
			note: "send(value) 已把值移入发送 Future。队列满时虽然还没入队，外层也不再拥有 value。",
		},
		{
			boxes: [],
			activeNodes: ["send", "lost"],
			activeEdges: [1],
			note: "取消分支胜出，未完成的 send Future 被丢弃，其中的 value 随之析构。取消等待没有把所有权退回调用者。",
		},
		{
			boxes: [],
			activeNodes: ["value", "reserve", "retained"],
			activeEdges: [2, 3],
			note: "独立方案先 reserve，值留在外层。取消只放弃容量等待的位置；取得许可后才发送。它仍不能撤回已经发生的外部副作用。",
		},
	],
};

export const scene: Scene = {
	...polling,
	legend: EXECUTION_LEGEND,
	chapters: [polling, cancellation],
};
