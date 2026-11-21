interface Point {
	x: number;
	y: number;
}

interface Bounds {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

const origin: Readonly<Point> = { x: 0, y: 0 };

interface StickerPlacement {
	read(button: HTMLButtonElement): Readonly<Point>;
	raise(button: HTMLButtonElement): void;
	set(button: HTMLButtonElement, point: Readonly<Point>): void;
	save(button: HTMLButtonElement, start: Readonly<Point>): void;
	fit(
		button: HTMLButtonElement,
		limits: (button: HTMLButtonElement) => ReturnType<typeof constrainSticker>,
	): void;
	reset(button: HTMLButtonElement): void;
}

function samePoint(a: Readonly<Point>, b: Readonly<Point>): boolean {
	return a.x === b.x && a.y === b.y;
}

function isCoordinate(value: unknown): value is number {
	return Number.isFinite(value);
}

function loadPoint(key: string): Readonly<Point> | null {
	try {
		const raw = localStorage.getItem(key);

		if (raw === null) return null;

		const value: unknown = JSON.parse(raw);

		if (!Array.isArray(value) || value.length !== 2) return null;

		const [x, y]: unknown[] = value;

		return isCoordinate(x) && isCoordinate(y) ? { x, y } : null;
	} catch {
		return null;
	}
}

export function stickerPlacement(area: "housing" | "desk"): StickerPlacement {
	const positions = new WeakMap<HTMLButtonElement, Readonly<Point>>();
	const saved = new WeakMap<HTMLButtonElement, Readonly<Point> | null>();
	let layer = 0;

	function key(button: HTMLButtonElement): string | undefined {
		const id = button.dataset.stickerId;

		return id ? `delkon:sticker:v1:${area}:${id}` : undefined;
	}

	function set(button: HTMLButtonElement, point: Readonly<Point>): void {
		if (samePoint(point, positions.get(button) ?? origin)) return;

		positions.set(button, point);
		button.style.setProperty("--drag-x", `${point.x}px`);
		button.style.setProperty("--drag-y", `${point.y}px`);
	}

	function clear(button: HTMLButtonElement): void {
		positions.delete(button);
		button.style.removeProperty("--drag-x");
		button.style.removeProperty("--drag-y");
		button.style.removeProperty("z-index");
	}

	function persist(button: HTMLButtonElement, point: Readonly<Point> | null): void {
		saved.set(button, point);

		const storageKey = key(button);

		if (!storageKey) return;

		try {
			if (point) localStorage.setItem(storageKey, JSON.stringify([point.x, point.y]));
			else localStorage.removeItem(storageKey);
		} catch {
			// Sticker movement still works when storage is unavailable.
		}
	}

	return {
		read: (button) => positions.get(button) ?? origin,
		raise(button) {
			button.style.zIndex = String(++layer);
		},
		set,
		save(button, start) {
			const point = positions.get(button) ?? origin;

			if (!samePoint(point, start)) persist(button, samePoint(point, origin) ? null : point);
		},
		fit(button, limits) {
			let point = saved.get(button);

			if (point === undefined) {
				const storageKey = key(button);

				clear(button);
				point = storageKey ? loadPoint(storageKey) : null;
				saved.set(button, point);
			}

			// Resizing may constrain the displayed position, but not the saved one.
			if (point && button.getClientRects().length) set(button, limits(button)(point.x, point.y));
		},
		reset(button) {
			clear(button);
			persist(button, null);
		},
	};
}

// Measure the rotated footprint once per gesture. Move handlers only use offsets.
export function constrainSticker(
	sticker: Bounds,
	offset: Readonly<Point>,
	surface: Bounds,
	obstacles: readonly Bounds[] = [],
): (x: number, y: number) => Readonly<Point> {
	const left = sticker.left - offset.x;
	const right = sticker.right - offset.x;
	const top = sticker.top - offset.y;
	const bottom = sticker.bottom - offset.y;

	const area = {
		left: surface.left - left,
		right: surface.right - right,
		top: surface.top - top,
		bottom: surface.bottom - bottom,
	};

	const excluded = obstacles.map((obstacle) => ({
		left: obstacle.left - right,
		right: obstacle.right - left,
		top: obstacle.top - bottom,
		bottom: obstacle.bottom - top,
	}));

	return (x, y) => {
		const next = {
			x: Math.max(area.left, Math.min(area.right, x)),
			y: Math.max(area.top, Math.min(area.bottom, y)),
		};

		const overlaps = ({ x, y }: Point): boolean =>
			excluded.some((box) => x > box.left && x < box.right && y > box.top && y < box.bottom);

		if (area.left > area.right || area.top > area.bottom) return offset;

		if (!overlaps(next)) return next;

		// The closest legal point is on a blocking edge or at their intersection.
		const xs = [next.x, ...excluded.flatMap((box) => [box.left, box.right])];
		const ys = [next.y, ...excluded.flatMap((box) => [box.top, box.bottom])];
		let closest = offset;
		let distance = Number.POSITIVE_INFINITY;

		for (const x of xs) {
			if (x < area.left || x > area.right) continue;

			for (const y of ys) {
				if (y < area.top || y > area.bottom || overlaps({ x, y })) continue;
				const squared = (x - next.x) ** 2 + (y - next.y) ** 2;

				if (squared >= distance) continue;
				closest = { x, y };
				distance = squared;
			}
		}

		return closest;
	};
}
