export const DIAGRAM_WIDTH = 360;
export const DIAGRAM_HEIGHT = 244;
export const NODE_HEIGHT = 48;

export interface Box {
	id: string;
	x: number;
	y: number;
	width: number;
	height?: number;
	glyph?: "cell" | "circle" | "label" | "bar" | "water" | "area";
	lines: string[];
	active?: boolean;
	endpoint?: boolean;
	tone?: "client" | "delivery" | "processing" | "secure" | "actor" | "result" | "control" | "state";
	muted?: boolean;
}

export interface Edge {
	label?: { text: string; x: number; y: number };
	id: string;
	path: string;
	active?: boolean;
	dashed?: boolean;
	undirected?: boolean;
}

export interface Frame {
	note: string;
	activeNodes?: string[];
	activeEdges?: number[];
	boxes: Box[];
	edges?: Edge[];
}

export interface Scene {
	chapters?: Scene[];
	legend?: string;
	section?: string | undefined;
	title: string;
	diagram?: string;
	diagramHeight?: number;
	caption: string;
	description: string;
	frames: Frame[];
}

// Authored SVG scenes share a 360px width and 48px two-line nodes.
export function box(
	id: string,
	x: number,
	y: number,
	width: number,
	lines: string[],
	active = false,
	muted = false,
): Box {
	return { id, x, y, width, lines, active, muted };
}

export function edge(id: string, path: string, active = false): Edge {
	return { id, path, active };
}
