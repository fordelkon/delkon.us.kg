import { example, frame, label, line, mark } from "./examples.ts";
import type { Edge } from "./types.ts";

const a = [1, 4, 8];
const b = [2, 3, 6, 9];
const leftCount = Math.ceil((a.length + b.length) / 2);
const cuts = [0, 1, 2, 3];

function display(value: number) {
	if (value === Number.NEGATIVE_INFINITY) return "−∞";

	if (value === Number.POSITIVE_INFINITY) return "+∞";

	return String(value);
}

function row(name: string, values: number[], cut: number, y: number, highlight: number[]) {
	const indices = values.map((_, index) => index);

	if (cut === 0) indices.unshift(-1);

	if (cut === values.length) indices.push(values.length);

	return indices.map((index) => {
		const value =
			values[index] ?? (index < 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);

		const x = 180 + (index - cut) * 34 + (index < cut ? -4 : 4);

		return mark(
			`${name}-${index}`,
			x,
			y,
			34,
			36,
			display(value),
			"cell",
			highlight.includes(index),
		);
	});
}

function reading(i: number) {
	const j = leftCount - i;
	const aLeft = a[i - 1] ?? Number.NEGATIVE_INFINITY;
	const aRight = a[i] ?? Number.POSITIVE_INFINITY;
	const bLeft = b[j - 1] ?? Number.NEGATIVE_INFINITY;
	const bRight = b[j] ?? Number.POSITIVE_INFINITY;
	const tooFarRight = aLeft > bRight;
	const tooFarLeft = bLeft > aRight;
	const valid = !tooFarRight && !tooFarLeft;
	const median = Math.max(aLeft, bLeft);
	const aActive = [];
	const bActive = [];
	const edges: Edge[] = [line("cut", "M180 27 V148")];

	if (!tooFarLeft) {
		aActive.push(i - 1);
		bActive.push(j);
		edges.push({ ...line("a-left-b-right", "M159 69 L201 106", tooFarRight), dashed: tooFarRight });
	}

	if (!tooFarRight) {
		bActive.push(j - 1);
		aActive.push(i);
		edges.push({ ...line("b-left-a-right", "M159 106 L201 69", tooFarLeft), dashed: tooFarLeft });
	}

	const result = valid ? `中位数 = ${median}` : tooFarLeft ? "A 切口应右移" : "A 切口应左移";

	const note = valid
		? `${display(aLeft)} ≤ ${display(bRight)}，${display(bLeft)} ≤ ${display(aRight)}。四个左半元素中的最大值 ${median} 排在合并序列的正中央。`
		: tooFarLeft
			? `B 左半末项 ${display(bLeft)} 大于 A 右半首项 ${display(aRight)}。A 左半取得太少，增大 i，同步减小 j。`
			: `A 左半末项 ${display(aLeft)} 大于 B 右半首项 ${display(bRight)}。A 左半取得太多，减小 i，同步增大 j。`;

	return frame(
		note,
		[
			label("counts", 180, 14, `左半　i = ${i}，j = ${j}`, 300),
			label("A", 16, 51, "A", 26),
			...row("a", a, i, 33, aActive),
			label("B", 16, 125, "B", 26),
			...row("b", b, j, 107, bActive),
			label("result", 180, 167, result, 290),
		],
		edges,
	);
}

export const scene = {
	...example(
		"两道切口夹住哪一个中位数？",
		"竖线左边始终有四个数。斜线连接两行需要比较的边界值，虚线表示左值越过了对面的右值。切口外没有元素时用无穷哨兵。",
		187,
		...cuts.map(reading),
	),
	control: { label: "A 的切口 i", options: cuts.map(String), kind: "range" as const },
};
