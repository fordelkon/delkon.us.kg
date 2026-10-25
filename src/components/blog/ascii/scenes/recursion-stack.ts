import { center, type Scene } from "./types.ts";

const phases = [
	{
		depth: 1,
		returned: 0,
		event: "call: save n=3, wait for child",
		emphasis: [{ row: 2, start: 2, end: 21 }],
	},
	{
		depth: 2,
		returned: 0,
		event: "call: save n=2, wait for child",
		emphasis: [
			{ row: 3, start: 4, end: 5 },
			{ row: 4, start: 4, end: 23 },
		],
	},
	{
		depth: 3,
		returned: 0,
		event: "call: save n=1, wait for child",
		emphasis: [
			{ row: 5, start: 6, end: 7 },
			{ row: 6, start: 6, end: 25 },
		],
	},
	{
		depth: 4,
		returned: 0,
		event: "base case: return 0",
		emphasis: [
			{ row: 7, start: 8, end: 9 },
			{ row: 8, start: 8, end: 27 },
		],
	},
	{
		depth: 4,
		returned: 1,
		event: "resume n=1: child 0 + 1 = 1",
		emphasis: [
			{ row: 7, start: 26, end: 27 },
			{ row: 6, start: 6, end: 31 },
		],
	},
	{
		depth: 4,
		returned: 2,
		event: "resume n=2: child 1 + 2 = 3",
		emphasis: [
			{ row: 5, start: 26, end: 27 },
			{ row: 4, start: 4, end: 31 },
		],
	},
	{
		depth: 4,
		returned: 3,
		event: "resume n=3: child 3 + 3 = 6",
		emphasis: [
			{ row: 3, start: 26, end: 27 },
			{ row: 2, start: 2, end: 31 },
			{ row: 10, start: 2, end: 31 },
		],
	},
];

export const recursionStack: Scene = {
	caption: "递进时各层保留自己的 n；命中基本情况后，子调用的返回值逐层参与加法。",
	description:
		"sumTo(3) 的逻辑调用与返回轨迹，保留已发生的步骤，不是同一时刻的内存快照。依次调用 3、2、1、0，每层保留各自的 n 和返回后待做的加法；0 返回后，1 计算 0+1=1，2 计算 1+2=3，3 计算 3+3=6。返回按后进先出顺序进行，基本情况只结束最内层调用。",
	frames: phases.map((phase) => ({
		durationMs: 1600,
		rows: [
			center("sumTo(3) / CALL AND RETURN TRACE", 33),
			"call: save n         return: add n",
			`  [n=3]${phase.returned >= 3 ? " <---------------- 3+3=6" : " ... child + 3"}`,
			phase.depth >= 2 ? "    v                     ^" : "",
			phase.depth >= 2
				? `    [n=2]${phase.returned >= 2 ? " <-------------- 1+2=3" : " ... child + 2"}`
				: "",
			phase.depth >= 3 ? "      v                   ^" : "",
			phase.depth >= 3
				? `      [n=1]${phase.returned >= 1 ? " <------------ 0+1=1" : " ... child + 1"}`
				: "",
			phase.depth >= 4 ? "        v                 ^" : "",
			phase.depth >= 4 ? "        [n=0] -- base --> 0" : "",
			"",
			phase.returned === 3 ? center("result: ((0 + 1) + 2) + 3 = 6", 33) : "",
			center(phase.event, 33),
		],
		active: [11],
		emphasis: phase.emphasis,
	})),
};
