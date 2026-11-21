import { resolve } from "node:path";
import sharp from "sharp";
import { outlineHeight, outlineWidth } from "./sticker-peel-geometry";

const outlines = new Map<string, Promise<string>>();

async function readOutline(id: string): Promise<string> {
	const alpha = await sharp(resolve("public", "stickers", `${id}.webp`))
		.ensureAlpha()
		.resize(outlineWidth, outlineHeight)
		.extractChannel(3)
		.raw()
		.toBuffer();

	// Mark only transparent pixels connected to the outside, not holes in the art.
	const width = outlineWidth + 2;
	const height = outlineHeight + 2;
	const grid = new Uint8Array(width * height);

	for (let y = 0; y < outlineHeight; y++) {
		for (let x = 0; x < outlineWidth; x++) {
			if ((alpha[y * outlineWidth + x] ?? 0) >= 92) grid[(y + 1) * width + x + 1] = 1;
		}
	}

	grid[0] = 2;
	const pending = [0];

	while (pending.length) {
		const at = pending.pop();

		if (at === undefined) break;

		const x = at % width;
		const adjacent = [x > 0 ? at - 1 : -1, x + 1 < width ? at + 1 : -1, at - width, at + width];

		for (const next of adjacent) {
			if (grid[next] !== 0) continue;
			grid[next] = 2;
			pending.push(next);
		}
	}

	let encoded = "";

	for (let y = 0; y < outlineHeight; y++) {
		for (let x = 0; x < outlineWidth; x++) {
			const at = (y + 1) * width + x + 1;

			if (grid[at] !== 1) continue;

			const north = Number(grid[at - width] === 2);
			const south = Number(grid[at + width] === 2);
			const west = Number(grid[at - 1] === 2);
			const east = Number(grid[at + 1] === 2);

			if (!north && !south && !west && !east) continue;

			const nx = west - east;
			const ny = north - south;
			const angle = nx || ny ? (Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) + 8) % 8 : 8;

			encoded += x.toString(36) + y.toString(36) + angle;
		}
	}

	return encoded;
}

export function stickerOutline(id: string): Promise<string> {
	const cached = outlines.get(id);

	if (cached) return cached;

	const result = readOutline(id);

	outlines.set(id, result);

	return result;
}
