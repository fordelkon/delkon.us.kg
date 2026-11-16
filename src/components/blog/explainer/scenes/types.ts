export const DIAGRAM_WIDTH = 360;
export const DIAGRAM_HEIGHT = 244;
export const NODE_HEIGHT = 48;

export interface Box {
	id: string;
	x: number;
	y: number;
	width: number;
	lines: string[];
	active?: boolean;
	muted?: boolean;
}

export interface Edge {
	id: string;
	path: string;
	active?: boolean;
	dashed?: boolean;
}

export interface Frame {
	note: string;
	activeNodes?: string[];
	activeEdges?: number[];
	boxes: Box[];
	edges?: Edge[];
	durationMs?: number;
}

export interface Scene {
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
