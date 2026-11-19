import { box, type Scene } from "./types.ts";

const calls = [3, 2, 1, 0];

const steps = [
	{ depth: 1, action: "调用 sumTo(2)", note: "sumTo(3) 入栈，准备求和到 2。" },
	{ depth: 2, action: "调用 sumTo(1)", note: "sumTo(2) 入栈，外层保留 n = 3。" },
	{ depth: 3, action: "调用 sumTo(0)", note: "sumTo(1) 入栈，前两层各自等待。" },
	{ depth: 4, action: "直接返回 0", note: "到达基本情况，sumTo(0) 返回 0。" },
	{ depth: 3, action: "0 + 1 = 1", note: "sumTo(0) 出栈，sumTo(1) 拿到 0，再加上自己的 1。" },
	{ depth: 2, action: "1 + 2 = 3", note: "sumTo(1) 出栈，sumTo(2) 接到 1，算出 3。" },
	{ depth: 1, action: "3 + 3 = 6", note: "sumTo(2) 出栈，sumTo(3) 接到 3，算出 6。" },
	{ depth: 0, action: "最终结果 6", note: "sumTo(3) 返回 6，图中的调用栈清空。" },
];

export const scene: Scene = {
	title: "sumTo(3) 的调用栈",
	section: "调用栈保存了什么",
	caption: "粗框标出栈顶。栈顶返回后，上一层用自己保留的 n 完成加法。",
	description:
		"栈向上增长，粗边框标出栈顶。sumTo 依次用 3、2、1、0 入栈。sumTo(0) 直接返回 0，上一层用保留的 n 算出 1，再逐层算出 3 和 6，最后清空调用栈。",
	frames: steps.map(({ depth, action, note }) => ({
		note,
		boxes: depth
			? calls.slice(0, depth).map((n, index) => {
					const isTop = index === depth - 1;

					return box(
						`frame-${n}`,
						64,
						188 - index * 60,
						232,
						[`sumTo(${n})`, isTop ? action : `保留 n = ${n}，等待子调用`],
						isTop,
					);
				})
			: [box("result", 64, 188, 232, ["调用栈已清空", action], true)],
	})),
};
