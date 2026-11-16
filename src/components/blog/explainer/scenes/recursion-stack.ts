import { box, type Scene } from "./types.ts";

const phases = [
	{ stack: [3], result: "尚无返回值", note: "调用 sumTo(3)，保留 n=3，等待子调用。" },
	{ stack: [3, 2], result: "尚无返回值", note: "调用 sumTo(2)。外层 n=3 仍保存在自己的栈帧中。" },
	{ stack: [3, 2, 1], result: "尚无返回值", note: "调用 sumTo(1)，各层分别等待 child + n。" },
	{ stack: [3, 2, 1, 0], result: "基本情况", note: "sumTo(0) 命中基本情况，执行 return 0。" },
	{ stack: [3, 2, 1], result: "0 → child", note: "n=0 已出栈。n=1 恢复执行，计算 0 + 1 = 1。" },
	{ stack: [3, 2], result: "1 → child", note: "n=1 已出栈。n=2 恢复执行，计算 1 + 2 = 3。" },
	{ stack: [3], result: "3 → child", note: "n=2 已出栈。n=3 恢复执行，计算 3 + 3 = 6。" },
	{ stack: [], result: "最终返回 6", note: "所有调用均已返回。图中回顾各层结果，不再表示当前栈。" },
];

const frames = phases.map((phase) => ({
	note: phase.note,
	boxes: [
		...[3, 2, 1, 0].map((n, index) =>
			box(
				`frame-${n}`,
				12,
				8 + index * 60,
				188,
				phase.stack.includes(n)
					? [`sumTo(${n})`, n === phase.stack.at(-1) ? "当前执行" : `n=${n} · 等待 child`]
					: phase.stack.length === 0
						? [
								`已返回 sumTo(${n})`,
								n === 0 ? "基本情况：0" : `${((n - 1) * n) / 2} + ${n} = ${(n * (n + 1)) / 2}`,
							]
						: ["—", "无活动栈帧"],
				n === phase.stack.at(-1),
				!phase.stack.includes(n),
			),
		),
		box("result", 216, 68, 132, ["返回值", phase.result], true),
		box("order", 216, 188, 132, ["后进先出", phase.stack.length ? "底部为当前层" : "返回结果回顾"]),
	],
}));

export const scene: Scene = {
	title: "递归：当前栈与返回结果",
	caption: "递进时各层保留自己的 n；命中基本情况后，子调用的返回值逐层参与加法。",
	description:
		"sumTo(3) 的逻辑调用栈：只保留尚未返回的调用，已返回的值单独展示。依次调用 3、2、1、0，每层保留各自的 n 和返回后待做的加法；0 返回后，1 计算 0+1=1，2 计算 1+2=3，3 计算 3+3=6。返回按后进先出顺序进行，基本情况只结束最内层调用。",
	frames,
};
