import { example, frame, label, line, mark } from "./examples.ts";
import { edge } from "./types.ts";

const item = 2;
const sums = [0, 1, 2, 3, 4, 5, 6];
const x = (sum: number) => 42 + sum * 46;

function scan(ascending: boolean) {
	const uses = new Map([[0, 0]]);
	const order = sums.filter((sum) => sum > 0 && sum % item === 0);

	if (!ascending) order.reverse();

	function reading(note: string, target?: number) {
		const boxes = sums.flatMap((sum) => {
			const count = uses.get(sum);

			return [
				label(`tick-${sum}`, x(sum), 22, String(sum), 40),
				mark(
					`value-${sum}`,
					x(sum) - 22,
					71,
					44,
					41,
					count === undefined ? "·" : String(count),
					count ? "water" : "cell",
					sum === target,
				),
			];
		});

		const maxUses = Math.max(...uses.values());
		boxes.push(label("readout", 180, 144, `同一个 2 最多用了 ${maxUses} 次`, 328));

		const edges = [line("scale", "M20 40 H340")];

		if (target !== undefined) {
			const from = x(target - item);
			const to = x(target);
			edges.push(edge("read-write", `M${from} 68 C${from} 38 ${to} 38 ${to} 68`, true));
		}

		return {
			...frame(note, boxes, edges),
			readout: target === undefined ? "起点" : `j = ${target}`,
		};
	}

	const frames = [
		reading(
			"只处理输入 [2, 2, 3, 5] 的第一个 2。和 0 已可达；奇数格始终留空，只观察偶数位置的读写。",
		),
	];

	for (const target of order) {
		const source = target - item;
		const previousUses = uses.get(source);

		if (previousUses !== undefined) uses.set(target, previousUses + 1);

		const note =
			previousUses === undefined
				? `更新 ${target} 时，来源 ${source} 仍不可达。${target} 留空。`
				: previousUses === 0
					? `从上一轮的和 0 写出 ${target}，用掉这一个 2。`
					: `来源 ${source} 是本轮刚写出的和。再写 ${target}，就把同一个 2 用了 ${previousUses + 1} 次。`;

		frames.push(reading(note, target));
	}

	return frames;
}

export const scene = {
	...example(
		"背包扫描会读到哪一轮的值？",
		"刻度是目标和，格内是用同一个 2 的次数，点表示不可达。底纹标出本轮新写的格子；弧线从读取位置指向写入位置。",
		167,
		...scan(false),
		...scan(true),
	),
	control: { label: "扫描方向", options: ["倒序", "升序"], stepLabel: "扫描位置" },
};
