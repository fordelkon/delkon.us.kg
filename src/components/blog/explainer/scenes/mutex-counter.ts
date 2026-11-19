import { node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

const mutex: Scene = {
	title: "同一把锁覆盖完整更新",
	section: "mutex独占访问",
	description:
		"A、B 使用同一把 Mutex，各把 count 加一，初值为 0。实线表示持锁访问，虚线表示等待同一把锁；高亮只表示本次示例的持锁者，不承诺公平性。",
	caption: "互斥的是完整的读、计算与写回；只保护最后一次写入仍会丢失更新。",
	frames: (
		[
			[
				"A",
				"0",
				"持锁，读取 0",
				"等待同一把锁",
				"A 先取得 Mutex，读取 count=0；B 的访问路径停在同一把锁上，不能进入临界区。",
			],
			[
				"A",
				"1",
				"持锁，写回 1",
				"仍在等待",
				"A 在持锁期间完成加一并写回 1。箭头表示访问资格，完整操作结束前不会把锁交给 B。",
			],
			[
				"B",
				"1",
				"已解锁",
				"持锁，读取 1",
				"A 释放后，B 取得同一把锁，读取到 1。这是一次可能的锁交接，不是公平性保证。",
			],
			[
				"B",
				"2",
				"已完成",
				"持锁，写回 2",
				"B 从 1 计算并写回 2。两次完整更新没有交错，所以两次加一均被保留。",
			],
			[
				"无",
				"2",
				"已完成",
				"已解锁",
				"两者完成，count=2。锁只保护遵守同一访问协议的代码；绕过锁的访问仍需另行证明安全。",
			],
		] as const
	).map(([owner, count, a, b, note]) => ({
		note,
		durationMs: 5000,
		boxes: [
			node("a", 8, 8, 156, ["线程 A", a], "actor", owner === "A"),
			node("b", 196, 8, 156, ["线程 B", b], "actor", owner === "B"),
			node(
				"shared",
				8,
				100,
				344,
				[`Mutex 归属：${owner}`, `受保护的 count = ${count}`],
				owner === "无" ? "result" : "state",
				true,
			),
			node(
				"operation",
				8,
				188,
				344,
				["临界区内的完整操作", "读取 → 计算 → 写回 → 解锁"],
				"control",
			),
		],
		edges:
			owner === "无"
				? []
				: [
						edge("access", owner === "A" ? "M86 56 V94" : "M274 56 V94", true),
						...(owner === "A"
							? [
									{
										...edge("wait", "M274 56 V94"),
										dashed: true,
										label: { text: "等待", x: 298, y: 80 },
									},
								]
							: []),
					],
	})),
};

const condition: Scene = {
	title: "通知之后为什么还要复查",
	section: "条件变量等待状态满足条件",
	description:
		"生产尚未结束时的一次队列等待，队列由同一把 Mutex 保护。实线表示持锁检查或操作，虚线表示等待与通知路径；唤醒后仍要重新竞争锁。",
	caption: "条件变量等的是谓词成立，通知只提供重新检查的机会。",
	diagram: `flowchart TB
 check{"持锁检查<br/>队列非空？"}
 check -->|是| take["持锁取出任务<br/>解锁后处理"]
 check -.->|否| wait["wait：原子解锁并等待"]
 wait -.-> producer["生产者可获同一把锁<br/>入队、解锁并通知"]
 producer -.-> retry["等待者重新获锁"]
 retry -->|再次检查，不直接取任务| check
 class check,retry state
 class wait,producer resource
 class take result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["check", "wait"],
			activeEdges: [1],
			durationMs: 5000,
			note: "队列为空就不能取任务。wait 原子地释放锁并等待，让生产者有机会持同一把锁修改队列。",
		},
		{
			boxes: [],
			activeNodes: ["wait", "producer"],
			activeEdges: [2],
			durationMs: 5000,
			note: "生产者取得锁、入队，再解锁并通知。通知不是把锁直接交给等待者，也不是为它预留一份任务。",
		},
		{
			boxes: [],
			activeNodes: ["retry", "check"],
			activeEdges: [3, 4],
			durationMs: 5000,
			note: "醒来后重新获锁并检查：可能是虚假唤醒，也可能已有其他消费者取走任务；谓词仍为假就沿等待分支再走一轮。",
		},
		{
			boxes: [],
			activeNodes: ["check", "take"],
			activeEdges: [0],
			durationMs: 5000,
			note: "只有持锁确认队列非空，才在该临界区取出任务。生产结束与排空退出需要额外的 done 谓词，正文再展开。",
		},
	],
};

export const scene: Scene = {
	...mutex,
	legend:
		"蓝：线程 · 紫：受保护状态／谓词 · 橙：等待与修改 · 绿：取得结果；箭头区分访问与等待关系。",
	chapters: [mutex, condition],
};
