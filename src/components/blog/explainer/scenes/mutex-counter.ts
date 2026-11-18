import { EXECUTION_LEGEND, interaction, node } from "./diagram-layout.ts";
import type { Scene } from "./types.ts";

const mutex: Scene = {
	title: "锁覆盖完整更新",
	section: "mutex独占访问",
	description:
		"本图假设：A、B 使用同一把 Mutex，各将 count 加一。一次读取、计算与写回都在持锁范围内；不承诺锁公平性，也不把 Arc 当作数据同步。",
	caption: "锁保护的是所有访问者共同遵守的完整操作；Arc 管生命周期，Send / Sync 管跨线程约束。",
	frames: (
		[
			[
				"持锁，读取 0",
				"等待同一把锁",
				"A",
				"0",
				"A 先获得锁，读取 count=0。B 此时不能进入同一临界区；共享所有权本身不会保护后续修改。",
			],
			[
				"持锁，写回 1",
				"仍在等待",
				"A",
				"1",
				"A 在锁内完成读取、加一与写回。只给最后一次写入加锁，无法使整次读改写成为一个整体。",
			],
			[
				"已解锁",
				"获锁，读取 1",
				"B",
				"1",
				"A 释放后，B 成功获取同一把锁并读取更新后的值。这里选择 A 先执行只是可能调度，不是公平性保证。",
			],
			[
				"完成",
				"持锁，写回 2",
				"B",
				"2",
				"B 从 1 计算出 2 并写回。完整操作没有交错，所以这次运行保留两次更新。",
			],
			[
				"完成",
				"已解锁",
				"无",
				"2",
				"两次操作都结束，最终 count=2。锁粒度要围绕不变量选择；同一把锁不能保护绕过它的访问。",
			],
		] as const
	).map(([a, b, owner, count, note]) =>
		interaction(
			note,
			["线程 A", a],
			["线程 B", b],
			[`锁归属：${owner}`, `count = ${count}`],
			["临界区边界", "读取 → 计算 → 写回 → 解锁"],
			owner === "A" ? "left" : owner === "B" ? "right" : "both",
		),
	),
};

const condition: Scene = {
	title: "条件变量与谓词",
	section: "条件变量等待状态满足条件",
	description:
		"本图假设：队列与 done 均受同一把锁保护。等待谓词为“队列非空或生产结束”；展示虚假唤醒、通知与排空后的退出。",
	caption: "通知只提供重试机会；wait 解锁等待、返回前重新加锁，能否继续要看持锁时重新检查的状态。",
	frames: (
		[
			[
				"持锁：谓词为假",
				"等待入队机会",
				"[] · done=false",
				"消费者持锁检查：队列为空且生产未结束，不能取任务。等待的是状态，不是一次需要记住的通知。",
			],
			[
				"wait：解锁并等待",
				"可以获得锁",
				"[] · done=false",
				"wait 原子地释放锁并进入等待，允许生产者拿同一把锁修改状态；持锁忙等会阻止生产者入队。",
			],
			[
				"醒来，获锁，仍为空",
				"尚未提交任务",
				"[] · done=false",
				"一次虚假唤醒后，消费者重新持锁检查，谓词仍为假，必须继续等待。通知也可能发生在其他消费者先取走数据之前。",
			],
			[
				"等待重新获得锁",
				"持锁入队后解锁通知",
				"[job 7] · done=false",
				"生产者在锁下入队，再解锁并通知。通知不授予队列访问权；写入的可见性由解锁到后续获锁的同步链建立。",
			],
			[
				"持锁领取 job 7",
				"生产者已结束",
				"[] · done=true",
				"生产结束后在锁下设置 done，并通知等待者。若还有排队任务，应继续处理，直到 done 且队列为空才退出。",
			],
		] as const
	).map(([consumer, producer, state, note]) =>
		interaction(
			note,
			["消费者", consumer],
			["生产者／协调者", producer],
			["受同一把锁保护的状态", state],
			["醒来后循环复查", "!queue.empty() || done"],
		),
	),
};

const coordination: Scene = {
	title: "读写锁与阶段会合",
	section: "协调线程推进",
	description:
		"两个独立对照：读写锁控制共享访问，Barrier 等待同一轮参与者到齐。它们不替代彼此，也不保证线程通过后同时得到 CPU。",
	caption:
		"Mutex / RwLock 管访问资格，条件变量管状态等待，Barrier 管阶段到达；选机制前先明确需要维护的条件。",
	frames: [
		interaction(
			"读写锁允许多个共享读者；独占写入需要等待相关读者释放。新读者与写者谁先得到机会依具体实现，不能推导固定优先级。",
			["读者 A、B", "同时持读锁"],
			["写者 C", "等待独占写锁"],
			["RwLock 的访问集合", "多个读者 或 一个写者"],
			["不是无限并发", "公平性与写者饥饿另行分析"],
		),
		{
			note: "三位参与者中 A、B 已完成阶段 1 并到达屏障，C 仍在阶段 1。A、B 要等第 3 位到达，不能提前进入阶段 2。",
			boxes: [
				node("a", 8, 8, 108, ["A：已到达", "等待"], "control", true),
				node("b", 126, 8, 108, ["B：已到达", "等待"], "control", true),
				node("c", 244, 8, 108, ["C：阶段 1", "执行中"], "actor", true),
				node("barrier", 8, 100, 344, ["Barrier · 本轮需要 3 位", "已到达 2 / 3"], "state", true),
				node("next", 8, 188, 344, ["阶段 2", "尚不能开始"], "control"),
			],
		},
		interaction(
			"C 到达后，本轮会合完成，三者才可推进阶段 2。屏障不要求同时运行，也不互斥阶段内的数据访问；若某位提前退出，其他人可能一直等待。",
			["A、B", "允许进入阶段 2"],
			["C", "第 3 位到达"],
			["Barrier", "本轮 3 / 3 · 会合完成"],
			["仍需单独证明", "阶段内访问安全与下一轮参与者"],
		),
	],
};

export const scene: Scene = {
	...mutex,
	legend: EXECUTION_LEGEND,
	chapters: [mutex, condition, coordination],
};
