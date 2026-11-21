export type Vector = readonly [number, number];

export const outlineWidth = 24;
export const outlineHeight = 36;

export interface Grip {
	point: Vector;
	inward: Vector;
	outline: readonly Vector[];
}

export interface Fold {
	direction: Vector;
	crease: number;
	depth: number;
	span: number;
	radius: number;
	carry: Vector;
}

const rest: Vector = [0, 0];

export function dot([x, y]: Vector, [nx, ny]: Vector): number {
	return x * nx + y * ny;
}

function unit(x: number, y: number): Vector {
	const length = Math.hypot(x, y);

	return length > 0 ? [x / length, y / length] : [0, -1];
}

export function peelGrip(
	encoded: string,
	size: Vector,
	pointer: Vector,
	preview = false,
): Grip | null {
	const [width, height] = size;
	const [px, py] = pointer;
	const points: Vector[] = [];
	let nearest: Vector | undefined;
	let normal = 8;
	let distance = preview ? Number.POSITIVE_INFINITY : Math.min(12, width * 0.18) ** 2;

	for (let i = 0; i < encoded.length; i += 3) {
		const x = ((Number.parseInt(encoded.charAt(i), 36) + 0.5) * width) / outlineWidth;
		const y = ((Number.parseInt(encoded.charAt(i + 1), 36) + 0.5) * height) / outlineHeight;
		const point: Vector = [x, y];
		const squared = (px - x) ** 2 + (py - y) ** 2;

		points.push(point);

		if (squared > distance) continue;

		distance = squared;
		nearest = point;
		normal = Number(encoded.charAt(i + 2));
	}

	if (!nearest) return null;

	const [cx, cy] = unit(width / 2 - nearest[0], height / 2 - nearest[1]);
	const angle = (normal * Math.PI) / 4;

	const inward =
		normal === 8 ? unit(cx, cy) : unit(Math.cos(angle) + cx * 0.4, Math.sin(angle) + cy * 0.4);

	return { point: nearest, inward, outline: points };
}

function foldExtent(grip: Grip, direction: Vector): number {
	let furthest = dot(grip.point, direction);

	for (const point of grip.outline) furthest = Math.max(furthest, dot(point, direction));

	// Extend past the last sampled pixel center to release its whole footprint.
	return Math.max(3, furthest - dot(grip.point, direction) + 2.5);
}

export function foldAt(grip: Grip, direction: Vector, depth: number, span: number): Fold {
	return {
		direction,
		crease: dot(grip.point, direction) + depth,
		depth,
		span,
		radius: Math.max(0.5, span * 0.19),
		carry: rest,
	};
}

export function gripTravel(depth: number, radius: number): number {
	const turn = Math.PI * radius;

	return depth <= turn ? depth - radius * Math.sin(depth / radius) : 2 * depth - turn;
}

export function pullFold(grip: Grip, drag: Vector, previous: Fold): Fold {
	const [dx, dy] = drag;
	const distance = Math.hypot(dx, dy);
	const aim = unit(dx, dy);

	if (distance < 0.5 || dot(aim, grip.inward) < -0.12) {
		return foldAt(grip, previous.direction, 0, previous.span);
	}

	const [ix, iy] = grip.inward;
	const blend = Math.min(1, distance / 17);

	const isCarried =
		previous.depth === previous.span &&
		dot(drag, previous.direction) >= gripTravel(previous.span, previous.span * 0.19);

	const direction = isCarried
		? previous.direction
		: unit(ix * (1 - blend) + aim[0] * blend, iy * (1 - blend) + aim[1] * blend);

	const span = foldExtent(grip, direction);
	const radius = Math.max(0.5, span * 0.19);
	const travel = Math.max(0, dot(drag, direction));
	const end = gripTravel(span, radius);

	if (travel >= end) {
		const tension = Math.min(1, (travel - end) / span);
		const straightened = radius * (1 - 0.72 * tension);
		const projected = gripTravel(span, straightened);

		return {
			...foldAt(grip, direction, span, span),
			radius: straightened,
			carry: [dx - direction[0] * projected, dy - direction[1] * projected],
		};
	}

	// Solve the inverse of the same projection used to shade the sheet.
	let lower = 0;
	let upper = span;

	for (let i = 0; i < 14; i++) {
		const depth = (lower + upper) / 2;

		if (gripTravel(depth, radius) < travel) lower = depth;
		else upper = depth;
	}

	return foldAt(grip, direction, (lower + upper) / 2, span);
}

export function restingFold(grip: Grip): Fold {
	return foldAt(grip, grip.inward, 0, foldExtent(grip, grip.inward));
}

export function clipFold(size: Vector, fold: Fold, loose: boolean): string {
	const [width, height] = size;

	const corners = [
		[0, 0],
		[width, 0],
		[width, height],
		[0, height],
	] as const;

	const output: string[] = [];
	let point: Vector = corners[3];

	for (const next of corners) {
		const from = point;

		point = next;
		const a = dot(from, fold.direction) - fold.crease;
		const b = dot(next, fold.direction) - fold.crease;
		const fromLoose = a < 0;
		const nextLoose = b < 0;

		if (fromLoose === loose) output.push(`${from[0]}px ${from[1]}px`);

		if (fromLoose === nextLoose) continue;

		const t = a / (a - b);

		output.push(`${from[0] + (next[0] - from[0]) * t}px ${from[1] + (next[1] - from[1]) * t}px`);
	}

	return output.length >= 3 ? `polygon(${output.join(",")})` : "inset(50%)";
}
