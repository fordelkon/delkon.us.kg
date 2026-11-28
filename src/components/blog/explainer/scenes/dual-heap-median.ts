import { dot, example, frame, label, line } from "./examples.ts";

const incoming = [3, 8];

function tray(id: string, values: number[], left: boolean, highlight?: number) {
	const sorted = [...values].sort((a, b) => (left ? b - a : a - b));

	return sorted.map((value, index) =>
		dot(
			`${id}-${value}`,
			left ? 147 - index * 46 : 213 + index * 46,
			99 - index * 10,
			value,
			value === highlight,
		),
	);
}

function insert(value: number) {
	const small = [2, 5];
	const large = [7, 10];

	const rails = [
		line("left-rail", "M23 92 L165 123 V99"),
		line("right-rail", "M337 92 L195 123 V99"),
		line("axis", "M180 56 V136"),
	];

	function state(note: string, readout: string, waiting: boolean, moved?: number) {
		const boxes = [
			label("small", 82, 20, `左堆 · ${small.length} 个`, 148),
			label("large", 278, 20, `右堆 · ${large.length} 个`, 148),
			...tray("small", small, true, moved),
			...tray("large", large, false, moved),
			label("readout", 180, 155, readout, 320),
		];

		if (waiting) boxes.push(dot("arriving", 213, 49, value, true));

		return frame(note, boxes, rails);
	}

	const frames = [
		state(
			`两堆等长。新数 ${value} 先落入右堆，右堆将挑出最小的一颗交给左边。`,
			`中位数 = (${Math.max(...small)} + ${Math.min(...large)}) / 2 = ${(Math.max(...small) + Math.min(...large)) / 2}`,
			true,
		),
	];

	large.push(value);
	const moved = Math.min(...large);
	frames.push(
		state(
			`右侧三个数中，${moved} 最小，落到闸口。${moved === value ? "这正是刚来的新数。" : `刚来的 ${value} 留在右边。`}`,
			`右堆最小值 = ${moved}`,
			false,
			moved,
		),
	);

	large.splice(large.indexOf(moved), 1);
	small.push(moved);
	const median = Math.max(...small);
	frames.push(
		state(
			`闸口的 ${moved} 进入左堆。左边多一个数，左堆最大值 ${median} 就是五个数的中位数。`,
			`中位数 = ${median}`,
			false,
			moved,
		),
	);

	return frames;
}

export const scene = {
	...example(
		"插入的新数会穿过中位线吗？",
		"两条斜轨按大小排列数珠，靠闸口的分别是左堆最大值和右堆最小值。两堆等长时，右边总是把最小的一颗送到左边。",
		177,
		...incoming.flatMap(insert),
	),
	control: { label: "插入的数", options: incoming.map(String) },
};
