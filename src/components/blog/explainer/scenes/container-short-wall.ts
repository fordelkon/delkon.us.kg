import { example, frame, label, line, mark } from "./examples.ts";

const heights = [2, 5, 3, 4] as const;
const base = 146;
const unit = 22;
const column = (index: number) => 48 + index * 88;

function container(left: 0 | 1, right: 2 | 3, note: string) {
	const level = Math.min(heights[left], heights[right]);
	const width = right - left;
	const depth = level * unit;

	return frame(
		note,
		[
			mark("water", column(left), base - depth, width * 88, depth, "", "water"),
			...heights.flatMap((height, index) => [
				mark(
					`wall-${index}`,
					column(index) - 2,
					base - height * unit,
					4,
					height * unit,
					"",
					"bar",
					index === left || index === right,
				),
				label(`height-${index}`, column(index), base - height * unit - 17, String(height), 28),
			]),
			label("area", 180, 174, `高 ${level} × 宽 ${width} = ${level * width}`, 254),
		],
		[line("base", `M34 ${base} H326`)],
	);
}

export const scene = example(
	"为什么可以放弃短板",
	"如果保留短板，水面最高只能到它的顶端。另一侧向内移只会缩短两端的距离。",
	193,
	container(0, 3, "两端分别高 2 和 4。即使右端高过左端，容量仍由左壁限制，为 2 × 3 = 6。"),
	container(
		0,
		2,
		"试着保留左壁，把右端移到高 3 的位置。水位仍是 2，宽度从 3 降到 2。其他更窄的配对也无法超过 6。",
	),
	container(
		1,
		3,
		"回到起点，改为移动短板。新的左壁高 5，水位可以升到右壁的高度 4。两端虽更近，容量却达到 8。",
	),
);
