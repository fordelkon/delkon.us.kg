export interface Frame {
	rows: string[];
	active: number[];
}

export interface Scene {
	description: string;
	frames: Frame[];
}

export function center(value: string, width: number) {
	return value.padStart(Math.floor((width + value.length) / 2)).padEnd(width);
}
