import { constrainSticker, stickerPlacement } from "./sticker-placement";

interface Drag {
	button: HTMLButtonElement;
	pointerId: number;
	x: number;
	y: number;
	start: ReturnType<ReturnType<typeof stickerPlacement>["read"]>;
	constrain: ReturnType<typeof constrainSticker>;
}

export function bindHousingDrag(root: HTMLElement): (() => void) | undefined {
	const housing = root.closest<HTMLElement>("[data-sticker-housing]");
	const feed = housing?.querySelector<HTMLElement>("[data-sticker-feed]");

	if (!housing || !feed) return;

	const buttons = root.querySelectorAll<HTMLButtonElement>("button");
	const obstacles = housing.querySelectorAll<HTMLElement>("[data-sticker-obstacle]");
	const interactive = matchMedia("(min-width: 24rem)");
	const listeners = new AbortController();
	const placement = stickerPlacement("housing");
	let active: Drag | undefined;

	const limits = (button: HTMLButtonElement): ReturnType<typeof constrainSticker> => {
		const face = housing.getBoundingClientRect();

		const surface = {
			left: face.left + 24,
			right: face.right - 24,
			top: face.top + 12,
			bottom: feed.getBoundingClientRect().top - 4,
		};

		const reserved = [...obstacles].flatMap((item) => {
			const { width, height, left, right, top, bottom } = item.getBoundingClientRect();

			return width && height
				? [{ left: left - 4, right: right + 4, top: top - 4, bottom: bottom + 4 }]
				: [];
		});

		const target = button.getBoundingClientRect();
		const artwork = button.firstElementChild?.getBoundingClientRect() ?? target;

		const footprint = {
			left: Math.min(target.left, artwork.left),
			right: Math.max(target.right, artwork.right),
			top: Math.min(target.top, artwork.top),
			bottom: Math.max(target.bottom, artwork.bottom),
		};

		return constrainSticker(footprint, placement.read(button), surface, reserved);
	};

	function stop(restore = false): void {
		const drag = active;

		active = undefined;

		if (!drag) return;

		if (restore) placement.set(drag.button, drag.start);
		delete drag.button.dataset.moving;

		if (drag.button.hasPointerCapture(drag.pointerId)) {
			drag.button.releasePointerCapture(drag.pointerId);
		}
	}

	function fit(): void {
		stop(true);

		if (!interactive.matches) return;

		for (const button of buttons) placement.fit(button, limits);
	}

	function syncControls(): void {
		fit();

		for (const button of buttons) {
			button.disabled = !interactive.matches;

			if (interactive.matches) button.removeAttribute("aria-hidden");
			else button.setAttribute("aria-hidden", "true");
		}
	}

	const options = { signal: listeners.signal };
	const resize = new ResizeObserver(fit);

	resize.observe(housing);
	resize.observe(root);

	for (const obstacle of obstacles) resize.observe(obstacle);
	interactive.addEventListener("change", syncControls, options);

	for (const button of buttons) {
		button.addEventListener(
			"pointerdown",
			(event) => {
				if (!event.isPrimary || event.button !== 0 || active) return;

				const start = placement.read(button);

				button.setPointerCapture(event.pointerId);
				placement.raise(button);
				button.dataset.moving = "";
				active = {
					button,
					pointerId: event.pointerId,
					x: event.clientX - start.x,
					y: event.clientY - start.y,
					start,
					constrain: limits(button),
				};
			},
			options,
		);
		button.addEventListener(
			"pointermove",
			(event) => {
				if (active?.pointerId !== event.pointerId) return;

				placement.set(button, active.constrain(event.clientX - active.x, event.clientY - active.y));
			},
			options,
		);

		const release = (event: PointerEvent): void => {
			if (active?.pointerId !== event.pointerId) return;

			if (event.type === "pointerup") placement.save(button, active.start);
			stop(event.type !== "pointerup");
		};

		button.addEventListener("pointerup", release, options);
		button.addEventListener("pointercancel", release, options);
		button.addEventListener("lostpointercapture", release, options);
		button.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Escape") {
					stop(true);
					placement.reset(button);

					return;
				}

				const dx = event.key === "ArrowLeft" ? -8 : event.key === "ArrowRight" ? 8 : 0;
				const dy = event.key === "ArrowUp" ? -8 : event.key === "ArrowDown" ? 8 : 0;

				if ((!dx && !dy) || active) return;

				const start = placement.read(button);

				event.preventDefault();
				placement.raise(button);
				placement.set(button, limits(button)(start.x + dx, start.y + dy));
				placement.save(button, start);
			},
			options,
		);
	}

	syncControls();

	return () => {
		listeners.abort();
		resize.disconnect();
		stop(true);
	};
}
