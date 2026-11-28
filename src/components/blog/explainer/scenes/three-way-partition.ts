import { cells, example, frame, label, line } from "./examples.ts";

const size = 36;

function partition(
	values: number[],
	zeros: number,
	cursor: number,
	lastUnknown: number,
	note: string,
) {
	const start = (360 - values.length * size) / 2;

	const regions = [
		{ name: "0 区", from: 0, end: zeros },
		{ name: "1 区", from: zeros, end: cursor },
		{ name: "待查", from: cursor, end: lastUnknown + 1 },
		{ name: "2 区", from: lastUnknown + 1, end: values.length },
	].filter(({ from, end }) => from < end);

	const pointerX = start + (cursor + 0.5) * size;

	const unknown = Array.from({ length: lastUnknown - cursor + 1 }, (_, offset) => cursor + offset);

	return frame(
		note,
		[
			...regions.map(({ name, from, end }) =>
				label(`region-${from}`, start + ((from + end) * size) / 2, 20, name, 64),
			),
			...cells("value", values, 47, unknown, size),
			label("cursor", pointerX, 116, "curr", 60),
		],
		[
			...regions.map(({ from, end }) =>
				line(`span-${from}`, `M${start + from * size + 2} 41 V35 H${start + end * size - 2} V41`),
			),
			{ id: "cursor", path: `M${pointerX} 104 V86`, active: true },
		],
	);
}

export const scene = example(
	"把 2 换出去以后，为什么游标要停在原地？",
	"每次交换都会缩短待查区。游标能否前进，取决于换回来的值是否已经检查过。",
	135,
	partition(
		[0, 0, 1, 1, 2, 0, 2, 2],
		2,
		4,
		5,
		"游标读到 2。把它和待查区末尾的 0 交换，右侧就多了一个已归位的 2。",
	),
	partition(
		[0, 0, 1, 1, 0, 2, 2, 2],
		2,
		4,
		4,
		"游标还在下标 4。换回的 0 来自待查区，跳过它，就会把 0 留在两个 1 后面。",
	),
	partition(
		[0, 0, 0, 1, 1, 2, 2, 2],
		3,
		5,
		4,
		"把 0 换到第一个 1 的位置。换回来的 1 已经检查过，游标前进，待查区清空。",
	),
);
