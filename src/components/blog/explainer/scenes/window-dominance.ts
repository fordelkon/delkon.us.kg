import { example, frame, label, line, mark } from "./examples.ts";

const values = [4, 3, 2, 5, 3, 2, 1];
const width = 3;
const slotWidth = 43;
const origin = 30;
const baseline = 135;

function slide() {
	const frames = [];
	const candidates: { index: number; height: number }[] = [];

	for (const [end, value] of values.entries()) {
		const start = end + 1 - width;
		const weaker: number[] = [];
		let tail = candidates.at(-1);

		while (tail && tail.height <= value) {
			if (tail.index >= start) weaker.push(tail.height);
			candidates.pop();
			tail = candidates.at(-1);
		}

		candidates.push({ index: end, height: value });
		const expired = candidates[0] && candidates[0].index < start ? candidates.shift() : undefined;

		if (start < 0) continue;

		const winner = candidates[0];

		if (winner === undefined) throw new Error("Missing window maximum");
		let note = `窗口覆盖下标 ${start} 至 ${end}。下标 ${winner.index} 的柱子仍是这个窗口中最高的 ${winner.height}。`;

		if (weaker.length)
			note = `新柱 ${value} 在下标 ${end}，比框中旧柱 ${weaker.join("、")} 高，而且更晚出窗。这些旧柱可以同时退出候选。`;

		if (expired)
			note = `左框移过下标 ${expired.index}，原来的最大值 ${expired.height} 已经过期。现在框内最高的是下标 ${winner.index} 的 ${winner.height}。`;

		const x = origin + start * slotWidth;
		const xRight = x + width * slotWidth;
		const peakX = origin + (winner.index + 0.5) * slotWidth;
		frames.push(
			frame(
				note,
				[
					...values.flatMap((height, index) => {
						const left = origin + index * slotWidth;
						const top = baseline - 16 * height;
						const outside = index < start || index > end;

						return [
							{
								...mark(
									`bar-${index}`,
									left + 8,
									top,
									slotWidth - 16,
									baseline - top,
									"",
									"bar",
									candidates.some((candidate) => candidate.index === index),
								),
								muted: outside,
							},
							{
								...label(`height-${index}`, left + slotWidth / 2, top - 12, String(height), 36),
								muted: outside,
							},
							label(`index-${index}`, left + slotWidth / 2, 153, String(index), 36),
						];
					}),
					label("readout", 180, 193, `窗口最大值 = ${winner.height}（下标 ${winner.index}）`, 305),
				],
				[
					line("baseline", `M${origin} ${baseline} H${origin + values.length * slotWidth}`),
					line("window", `M${x} 164 V21 H${xRight} V164`, true),
					line("peak", `M${peakX - 5} 21 L${peakX} 28 L${peakX + 5} 21`, true),
				],
			),
		);
	}

	return frames;
}

const windows = slide();

export const scene = {
	...example(
		"一根矮柱什么时候可以从候选中删掉？",
		"移动宽度为 3 的滑框。粗边柱是仍可能成为最大值的候选；框的位置决定谁先过期，柱高决定谁能压过谁。",
		215,
		...windows,
	),
	control: {
		label: "窗口左边界",
		kind: "range" as const,
		options: windows.map((_, index) => String(index)),
	},
};
