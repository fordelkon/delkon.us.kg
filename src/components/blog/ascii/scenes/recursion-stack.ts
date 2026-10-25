import { center, type Scene } from "./types.ts";

const phases = [
	{ depth: 1, entered: 1, children: "????", value: 3, event: "call sumTo(3): save n=3", active: 2 },
	{ depth: 2, entered: 2, children: "????", value: 2, event: "call sumTo(2): save n=2", active: 4 },
	{ depth: 3, entered: 3, children: "????", value: 1, event: "call sumTo(1): save n=1", active: 6 },
	{ depth: 4, entered: 4, children: "????", value: 0, event: "call sumTo(0): save n=0", active: 8 },
	{
		depth: 4,
		entered: 4,
		children: "????",
		value: 0,
		event: "base case: return 0 -> w0",
		active: 11,
	},
	{
		depth: 3,
		entered: 4,
		children: "????",
		value: 0,
		event: "pop: release frame, keep bytes",
		active: 8,
	},
	{ depth: 3, entered: 4, children: "??0?", value: 0, event: "resume: w0 -> child", active: 6 },
	{ depth: 3, entered: 4, children: "??0?", value: 1, event: "child + n: 0 + 1 -> w0", active: 11 },
	{
		depth: 2,
		entered: 4,
		children: "??0?",
		value: 1,
		event: "pop: release frame, keep bytes",
		active: 6,
	},
	{ depth: 2, entered: 4, children: "?10?", value: 1, event: "resume: w0 -> child", active: 4 },
	{ depth: 2, entered: 4, children: "?10?", value: 3, event: "child + n: 1 + 2 -> w0", active: 11 },
	{
		depth: 1,
		entered: 4,
		children: "?10?",
		value: 3,
		event: "pop: release frame, keep bytes",
		active: 4,
	},
	{ depth: 1, entered: 4, children: "310?", value: 3, event: "resume: w0 -> child", active: 2 },
	{ depth: 1, entered: 4, children: "310?", value: 6, event: "child + n: 3 + 3 -> w0", active: 11 },
	{
		depth: 0,
		entered: 4,
		children: "310?",
		value: 6,
		event: "done: sumTo(3) = 6; stack restored",
		active: 10,
	},
];

export const recursionStack: Scene = {
	description:
		"sumTo(3) 的精简栈帧示意，不表示精确字节布局。高地址在上，栈向下增长，SP 标记已分配区域的低地址边界。每层保存自己的 n 和返回地址 RA；递归层的 resume 都表示同一处调用之后的指令。问号表示 child 尚未初始化。到达 n=0 后，结果通过 w0 返回；父层恢复后才写入 child，再加上本层 n。出栈只回收空间，标记 free 的旧值仍残留，但不再属于存活变量。最终返回 6，所有帧均已释放。",
	frames: phases.map((phase) => {
		const border = "+------------------------+";
		const rows = [center("sumTo(3) / STACK grows down", 35), `    ${border}`];

		for (let index = 0; index < 4; index++) {
			const saved = `n=${3 - index} child=${phase.children[index]}`;

			const contents =
				index >= phase.entered
					? ". . . . . . . . . . ."
					: index >= phase.depth
						? `${saved} [free]`
						: `${saved} RA=${index === 0 ? "caller" : "resume"}`;

			rows.push(`    |${contents.padEnd(24)}|`);
			rows.push(`${phase.depth === index + 1 ? "SP >" : "    "}${border}`);
		}

		if (phase.depth === 0) rows[1] = `SP >${border}`;
		rows.push(center(phase.event, 35), center(`w0=${phase.value}   ?=unset   free=released`, 35));

		return {
			rows,
			active: [phase.active],
			durationMs: 1600,
		};
	}),
};
