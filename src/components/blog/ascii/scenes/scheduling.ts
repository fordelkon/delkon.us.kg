import type { Scene } from "./types.ts";

const progress = [
	{ preemptive: "[A][A]", cause: "", cooperative: "[A][A]", yield: "", active: [1, 5] },
	{
		preemptive: "[A][A]|[B]",
		cause: "      ^ timer",
		cooperative: "[A][A][A]",
		yield: "",
		active: [1, 2],
	},
	{
		preemptive: "[A][A]|[B][B]",
		cause: "      ^ timer",
		cooperative: "[A][A][A]o[B]",
		yield: "         ^ yield / Pending",
		active: [5, 6],
	},
	{
		preemptive: "[A][A]|[B][B]|[A]",
		cause: "      ^ timer",
		cooperative: "[A][A][A]o[B][B]o[A]",
		yield: "         ^ yield / Pending",
		active: [1, 5],
	},
];

export const scheduling: Scene = {
	description:
		"对比两种切换机制：操作系统可在 A 未主动让出时抢占线程；同一任务内 join! 的 Future 分支在让出点给另一分支推进机会。图示一种可能交错，不保证严格轮换；await 已就绪时可以直接继续。",
	frames: progress.map((phase) => ({
		rows: [
			"PREEMPTIVE / OS threads",
			phase.preemptive,
			phase.cause,
			"",
			"COOPERATIVE / join! branches",
			phase.cooperative,
			phase.yield,
		],
		active: phase.active,
	})),
};
