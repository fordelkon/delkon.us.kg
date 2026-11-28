import { example, frame, label, mark } from "./examples.ts";

const sums = [0, 2, 4, 6];
const item = 2;
const forward = new Set([0]);
const backward = new Set([0]);

function row(id: string, y: number, reachable: Set<number>, target?: number) {
	return sums.map((sum, index) =>
		mark(
			`${id}-${sum}`,
			89 + index * 57,
			y,
			51,
			38,
			reachable.has(sum) ? String(sum) : "·",
			"cell",
			sum === target,
		),
	);
}

function snapshot(note: string, ascending?: number, descending?: number) {
	return frame(note, [
		...sums.map((sum, index) => label(`sum-${sum}`, 114 + index * 57, 17, String(sum), 48)),
		label("axis", 47, 17, "目标和", 84),
		label("up", 47, 60, "升序", 70),
		...row("up", 41, forward, ascending),
		label("down", 47, 117, "倒序", 70),
		...row("down", 98, backward, descending),
	]);
}

const frames = [
	snapshot("只取输入 [2, 2, 3, 5] 中的第一个 2 做这一轮。开始时只有 0 可达，图中列出偶数和。"),
];

const notes = [
	"升序先读 0，把 2 标为可达。倒序先查 6，它依赖的 4 仍为空。",
	"更新 4 时，两行都要读 2。升序读到了本轮刚写的 2，又用了一遍同一个元素；倒序读到的 2 仍为空。",
	"升序又从 4 写出 6，一个 2 被用了三次。倒序最后才从 0 写出 2，这一轮只增加一个可达和。",
];

for (const [index, note] of notes.entries()) {
	const ascending = item * (index + 1);
	const descending = item * (notes.length - index);

	if (forward.has(ascending - item)) forward.add(ascending);

	if (backward.has(descending - item)) backward.add(descending);
	frames.push(snapshot(note, ascending, descending));
}

export const scene = example(
	"一个 2 能写出哪些可达和",
	"写入和 s 之前，先看 s − 2 是否可达。倒序时，s − 2 还保留着上一轮的结果，同一个 2 只会用一次。· 表示不可达。",
	149,
	...frames,
);
