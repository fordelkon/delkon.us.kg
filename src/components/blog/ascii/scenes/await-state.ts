import { center, type Scene } from "./types.ts";

const phases = [
	{ state: "BEFORE AWAIT", value: "local n = 7", event: "poll -> running", executor: "A" },
	{ state: "WAITING", value: "saved n = 7", event: "poll -> Pending", executor: "B" },
	{ state: "WAITING", value: "saved n = 7", event: "wake -> runnable", executor: "B" },
	{ state: "AFTER AWAIT", value: "local n = 7", event: "inner poll -> Ready", executor: "A" },
	{ state: "DONE", value: "n = 7", event: "poll -> Ready", executor: "-" },
];

export const awaitState: Scene = {
	description:
		"用局部值 n=7 示意 await 的状态保存，不代表编译器的精确内存布局。首次 poll 执行到等待，内部 Future 返回 Pending 后保存 n，执行器可运行 B；wake 只使 A 可再次轮询。内部 Future 随后返回 Ready，才继续 await 后的代码，最终外层返回 Ready。已经就绪的 await 可以直接继续，无需经过挂起。",
	frames: phases.map((phase) => ({
		rows: [
			"      +---------------------+",
			`      |${center("FUTURE A", 21)}|`,
			`      |${center(phase.state, 21)}|`,
			`      |${center(phase.value, 21)}|`,
			"      +---------------------+",
			"",
			center(phase.event, 35),
			center(`executor: ${phase.executor}`, 35),
		],
		active: [2, 6],
	})),
};
