import { type Box, type Edge, edge, type Frame, type Scene } from "./types.ts";

type Value = string | number;

export function mark(
	id: string,
	x: number,
	y: number,
	width: number,
	height: number,
	text: string,
	glyph: NonNullable<Box["glyph"]>,
	active = false,
): Box {
	return { id, x, y, width, height, lines: text ? [text] : [], glyph, active };
}

export function label(id: string, x: number, y: number, text: string, width = 70): Box {
	return mark(id, x - width / 2, y - 12, width, 24, text, "label");
}

export function cells(
	id: string,
	values: Value[],
	y: number,
	active: number[] = [],
	size = 40,
): Box[] {
	const x = (360 - size * values.length) / 2;

	return values.map((value, index) =>
		mark(
			`${id}-${index}`,
			x + index * size,
			y,
			size,
			size,
			String(value),
			"cell",
			active.includes(index),
		),
	);
}

export function grid(rows: Value[][], y: number, active: number[][] = [], size = 40): Box[] {
	return rows.flatMap((row, index) =>
		cells(`row-${index}`, row, y + index * size, active[index], size),
	);
}

export function dot(id: string, x: number, y: number, text: Value, active = false): Box {
	const value = String(text);
	const width = value.length >= 4 ? 48 : 36;

	return mark(id, x - width / 2, y - 18, width, 36, value, "circle", active);
}

export function line(id: string, path: string, active = false): Edge {
	return { ...edge(id, path, active), undirected: true };
}

export function example(
	title: string,
	caption: string,
	diagramHeight: number,
	...frames: Frame[]
): Scene {
	return {
		title,
		caption,
		description: [caption, ...frames.map((frame) => frame.note)].join(" "),
		diagramHeight,
		frames,
	};
}

export function frame(note: string, boxes: Box[], edges: Edge[] = []): Frame {
	return { note, boxes, edges };
}
