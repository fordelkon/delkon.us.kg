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
	muted?: boolean;
}

export interface Edge {
	id: string;
	path: string;
	active?: boolean;
	dashed?: boolean;
	undirected?: boolean;
}

export interface Frame {
	note: string;
	boxes: Box[];
	edges?: Edge[];
}

export interface Scene {
	title: string;
	diagramHeight?: number;
	caption: string;
	description: string;
	frames: Frame[];
}

export function edge(id: string, path: string, active = false): Edge {
	return { id, path, active };
}
