import { label, line, mark } from "./examples.ts";

export const baseline = 154;
export const unitHeight = 19;
export const columnWidth = 44;

export function columnX(count: number, index: number) {
	return (360 - count * columnWidth) / 2 + index * columnWidth;
}

export function histogram(heights: readonly number[], active: number[]) {
	const boxes = heights.flatMap((height, index) => {
		const x = columnX(heights.length, index);
		const top = baseline - height * unitHeight;

		return [
			...(height
				? [
						mark(
							`bar-${index}`,
							x + 2,
							top,
							columnWidth - 4,
							height * unitHeight,
							"",
							"bar",
							active.includes(index),
						),
					]
				: []),
			label(`height-${index}`, x + 22, top - 13, String(height), 40),
			label(`idx-${index}`, x + 22, baseline + 15, String(index), 40),
		];
	});

	return { boxes, edges: [line("baseline", "M36 154 H324")] };
}
