export interface Frame {
	rows: string[];
	active: number[];
	durationMs?: number;
	// Non-overlapping spans; start is inclusive and end is exclusive.
	emphasis?: { row: number; start: number; end: number }[];
}

export interface Scene {
	caption: string;
	description: string;
	frames: Frame[];
}

export function center(value: string, width: number) {
	return value.padStart(Math.floor((width + value.length) / 2)).padEnd(width);
}
