import type { Texture } from "vgpu";
import {
	clipFold,
	dot,
	type Fold,
	foldAt,
	type Grip,
	gripTravel,
	peelGrip,
	pullFold,
	restingFold,
	type Vector,
} from "./sticker-peel-geometry";
import type { StickerRenderer } from "./sticker-peel-gpu";
import { constrainSticker, stickerPlacement } from "./sticker-placement";

interface Grab {
	pointerId: number;
	x: number;
	y: number;
}

interface Move {
	kind: "move";
	button: HTMLButtonElement;
	grab: Grab;
	start: { x: number; y: number };
	constrain: ReturnType<typeof constrainSticker>;
}

const moveSlop = 3;
const peelSlop = 10;

interface Peel {
	kind: "peel";
	button: HTMLButtonElement;
	lift: HTMLElement;
	size: Vector;
	grip: Grip;
	grab: (Grab & { cos: number; sin: number; travel: Vector; pending: boolean }) | null;
	fold: Fold;
	motion: { startedAt: number; target: "flat" | "loose" } | null;
	artwork: Texture | "loading" | null;
}

function flightTransform([x, y]: Vector, angle = 0, scale = 1): string {
	return `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale})`;
}

function displayFold(peel: Peel, time: number): Fold {
	const { fold, motion, grip } = peel;

	if (!motion) return fold;

	const elapsed = Math.max(0, time - motion.startedAt);
	const t = elapsed * 0.022;

	const depth =
		motion.target === "flat"
			? fold.depth * (1 + t) * Math.exp(-t)
			: fold.span * Math.min(elapsed / 360, 1);

	return foldAt(grip, fold.direction, depth, fold.span);
}

export function bindDeskPeel(root: HTMLElement): () => void {
	const buttons = root.querySelectorAll<HTMLButtonElement>("button[data-sticker-srcset]");
	const housing = document.querySelector("[data-sticker-housing]");
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	const placement = stickerPlacement("desk");
	const listeners = new AbortController();
	const canvas = document.createElement("canvas");

	canvas.className = "desk-peel-canvas";
	canvas.setAttribute("aria-hidden", "true");

	let active: Move | Peel | undefined;
	let flight: Animation | undefined;
	let frameId = 0;
	let fitFrame = 0;
	let gpuUnavailable = !navigator.gpu;
	let renderer: StickerRenderer | undefined;
	let rendererJob: Promise<StickerRenderer> | undefined;

	function limits(button: HTMLButtonElement): ReturnType<typeof constrainSticker> {
		const { left, right } = root.getBoundingClientRect();
		const shell = housing?.getBoundingClientRect();
		const isLeft = button.dataset.stickerSide === "left";

		return constrainSticker(button.getBoundingClientRect(), placement.read(button), {
			left: isLeft ? left + 8 : (shell?.right ?? right) + 8,
			right: isLeft ? (shell?.left ?? left) - 8 : right - 8,
			top: 8,
			bottom: window.innerHeight - 8,
		});
	}

	function flatten({ button, lift }: Peel): void {
		canvas.remove();
		delete button.dataset.curl;
		lift.removeAttribute("style");
	}

	function stop(restore = false): void {
		const previous = active;

		active = undefined;
		flight?.cancel();
		flight = undefined;
		cancelAnimationFrame(frameId);
		frameId = 0;

		if (!previous) return;

		const { button, grab } = previous;

		if (previous.kind === "peel") {
			flatten(previous);
			delete button.dataset.detached;
			delete button.dataset.restoring;
		} else if (restore) placement.set(button, previous.start);

		delete button.dataset.grab;

		if (grab && button.hasPointerCapture(grab.pointerId))
			button.releasePointerCapture(grab.pointerId);
	}

	function restoreSticker(peel: Peel): void {
		const { button } = peel;
		const surface = button.querySelector<HTMLElement>(".desk-sticker-flight");
		const exit = flight;

		if (!surface) {
			stop();

			return;
		}

		flatten(peel);
		button.dataset.restoring = "";

		// The strips expand in X at staggered times; scaling Y on their shared
		// surface keeps the artwork joined as it springs back into place.
		const entrance = surface.animate(
			[
				{ transform: "scaleY(0.6)", opacity: 0, easing: "ease-out" },
				{ transform: "scaleY(0.8)", opacity: 1, offset: 0.12, easing: "ease-out" },
				{ transform: "scaleY(1.075)", opacity: 1, offset: 0.38, easing: "ease-in-out" },
				{ transform: "scaleY(0.988)", opacity: 1, offset: 0.64, easing: "ease-in-out" },
				{ transform: "scaleY(1)", opacity: 1 },
			],
			{ duration: 720, fill: "both" },
		);

		flight = entrance;
		exit?.cancel();
		entrance.addEventListener(
			"finish",
			() => {
				if (flight === entrance) stop();
			},
			{ once: true },
		);
	}

	function flyOff(peel: Peel, fold: Fold): void {
		const { button, lift } = peel;
		const [x, y] = fold.carry;
		const [nx, ny] = fold.direction;
		const dx = nx * 178 - ny * 24;
		const dy = ny * 178 + nx * 24;
		const spin = nx < 0 ? -14 : 14;

		button.dataset.detached = "";
		cancelAnimationFrame(frameId);
		frameId = 0;

		// Fly out on the same curled sheet, not a new front-facing sprite.
		const exit = lift.animate(
			[
				{ transform: flightTransform([x, y]), opacity: 1, easing: "ease-in" },
				{
					transform: flightTransform([x + dx * 0.26, y + dy * 0.26], spin * 0.35),
					opacity: 1,
					offset: 0.43,
				},
				{ transform: flightTransform([x + dx, y + dy], spin, 0.96), opacity: 0 },
			],
			{ duration: 460, fill: "both" },
		);

		flight = exit;
		exit.addEventListener(
			"finish",
			() => {
				if (flight === exit) restoreSticker(peel);
			},
			{ once: true },
		);
	}

	function useFallback(): void {
		if (listeners.signal.aborted || gpuUnavailable) return;

		gpuUnavailable = true;
		renderer?.dispose();
		renderer = undefined;
		canvas.remove();
		schedule();
	}

	async function prepare(peel: Peel): Promise<void> {
		const srcset = peel.button.dataset.stickerSrcset;

		if (!srcset || gpuUnavailable || peel.artwork) return;

		active = { ...peel, artwork: "loading" };

		try {
			rendererJob ??= import("./sticker-peel-gpu").then(({ createStickerRenderer }) =>
				createStickerRenderer(canvas, listeners.signal, useFallback),
			);
			renderer = await rendererJob;
		} catch {
			useFallback();

			return;
		}

		if (listeners.signal.aborted || gpuUnavailable) {
			renderer.dispose();
			renderer = undefined;

			return;
		}

		try {
			const artwork = await renderer.load(srcset);

			if (active?.kind !== "peel" || active.button !== peel.button) return;
			active = { ...active, artwork };
			schedule();
		} catch {
			// This image stays on the CSS path; other stickers can still use the GPU.
		}
	}

	function drawFallback({ button, lift, size }: Peel, fold: Fold): void {
		const {
			direction: [nx, ny],
			crease,
			depth,
			radius,
		} = fold;

		const compression = gripTravel(depth, radius) / depth;
		const shift = crease * compression;
		const cross = -compression * nx * ny;
		const reflect = `matrix(${1 - compression * nx * nx},${cross},${cross},${1 - compression * ny * ny},${nx * shift},${ny * shift})`;

		lift.style.setProperty("--peel-attached", clipFold(size, fold, false));
		lift.style.setProperty("--peel-loose", clipFold(size, fold, true));
		lift.style.setProperty("--peel-reflection", reflect);

		if (button.dataset.curl !== "css") button.dataset.curl = "css";
	}

	function drawFold(peel: Peel, fold: Fold): void {
		const { button, lift, artwork } = peel;

		lift.style.transform = flightTransform(fold.carry);

		if (renderer && artwork && artwork !== "loading") {
			try {
				const remounted = canvas.parentElement !== lift;

				if (remounted) lift.append(canvas);
				renderer.paint(artwork, peel.size, fold, remounted);

				if (button.dataset.curl !== "gpu") button.dataset.curl = "gpu";

				return;
			} catch {
				useFallback();
			}
		}

		drawFallback(peel, fold);
	}

	function paint(time: number): void {
		frameId = 0;

		const peel = active;

		if (peel?.kind !== "peel" || flight) return;

		const fold = displayFold(peel, time);

		if (fold.depth < 0.45) {
			if (peel.motion?.target === "flat") stop();
			else if (peel.button.dataset.curl) flatten(peel);
		} else {
			drawFold(peel, fold);
		}

		if (peel.motion?.target === "loose" && fold.depth === fold.span) {
			const complete = { ...peel, fold, motion: null };

			active = complete;
			flyOff(complete, fold);
		} else if (peel.motion && active) schedule();
	}

	function schedule(): void {
		if (!frameId) frameId = requestAnimationFrame(paint);
	}

	function startMove(button: HTMLButtonElement, grab: Grab): Move {
		return { kind: "move", button, grab, start: placement.read(button), constrain: limits(button) };
	}

	function positionMove(gesture: Move, dx: number, dy: number): void {
		placement.set(gesture.button, gesture.constrain(gesture.start.x + dx, gesture.start.y + dy));
	}

	function start(button: HTMLButtonElement, event: PointerEvent): void {
		if (!event.isPrimary || event.button !== 0 || active?.grab) return;

		const previous =
			!flight && active?.kind === "peel" && active.button === button ? active : undefined;

		const rect = button.getBoundingClientRect();
		const rotation = Number.parseFloat(getComputedStyle(button).getPropertyValue("--sticker-tilt"));
		const cos = Math.cos((rotation * Math.PI) / 180);
		const sin = Math.sin((rotation * Math.PI) / 180);
		const size = [button.offsetWidth, button.offsetHeight] as const;
		const px = event.clientX - (rect.left + rect.width / 2);
		const py = event.clientY - (rect.top + rect.height / 2);

		const point: Vector = [px * cos + py * sin + size[0] / 2, py * cos - px * sin + size[1] / 2];

		const grip = reducedMotion.matches
			? null
			: (previous?.grip ?? peelGrip(button.dataset.stickerOutline ?? "", size, point));

		const lift = button.querySelector<HTMLElement>(".desk-sticker-lift");
		const grab = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };

		if (!previous || !grip || !lift) stop();

		button.setPointerCapture(event.pointerId);
		button.dataset.grab = "";
		placement.raise(button);

		if (grip && lift) {
			const fold = previous ? displayFold(previous, performance.now()) : restingFold(grip);
			const distance = gripTravel(fold.depth, fold.radius);
			const [nx, ny] = fold.direction;

			active = {
				kind: "peel",
				button,
				lift,
				size,
				grip,
				grab: { ...grab, cos, sin, travel: [distance * nx, distance * ny], pending: !previous },
				fold,
				motion: null,
				artwork: previous?.artwork ?? null,
			};
		} else {
			active = startMove(button, grab);
		}
	}

	function move(event: PointerEvent): void {
		const gesture = active;

		if (gesture?.grab?.pointerId !== event.pointerId) return;

		const dx = event.clientX - gesture.grab.x;
		const dy = event.clientY - gesture.grab.y;

		if (gesture.kind === "move") {
			positionMove(gesture, dx, dy);

			return;
		}

		const { cos, sin, pending } = gesture.grab;
		const local: Vector = [dx * cos + dy * sin, dy * cos - dx * sin];
		let travel = gesture.grab.travel;

		if (pending) {
			const distance = Math.hypot(dx, dy);

			if (distance < moveSlop) return;

			const inward = dot(local, gesture.grip.inward) >= distance * 0.76;

			if (inward && distance < peelSlop && event.type !== "pointerup") return;

			if (!inward || distance < peelSlop) {
				const reposition = startMove(gesture.button, gesture.grab);

				active = reposition;
				positionMove(reposition, dx, dy);

				return;
			}

			// Consume the dead zone so the first curl doesn't jump to the full pull distance.
			const slop = (peelSlop - 1) / distance;

			travel = [-local[0] * slop, -local[1] * slop];
		}

		const fold = pullFold(gesture.grip, [travel[0] + local[0], travel[1] + local[1]], gesture.fold);
		const peel = { ...gesture, grab: { ...gesture.grab, travel, pending: false }, fold };

		active = peel;

		if (fold.depth >= 2) void prepare(peel);
		schedule();
	}

	function release(event: PointerEvent): void {
		const dropped = event.type === "pointerup";

		if (dropped && active?.kind === "peel" && active.grab?.pending) move(event);

		const gesture = active;

		if (gesture?.grab?.pointerId !== event.pointerId) return;

		if (gesture.kind === "move" && dropped) placement.save(gesture.button, gesture.start);

		if (gesture.kind === "move" || !dropped || gesture.fold.depth < 0.45) {
			stop(!dropped);

			return;
		}

		delete gesture.button.dataset.grab;

		const released: Peel = { ...gesture, grab: null };
		const { fold } = released;

		if (fold.depth === fold.span) {
			active = released;
			drawFold(released, fold);
			flyOff(released, fold);
		} else {
			active = { ...released, motion: { startedAt: performance.now(), target: "flat" } };
			schedule();
		}
	}

	function fit(): void {
		stop(true);

		for (const button of buttons) placement.fit(button, limits);
	}

	function syncMotion(): void {
		stop(true);

		for (const button of buttons) {
			const label = button.dataset.stickerLabel;

			button.title = reducedMotion.matches
				? `Drag ${label}`
				: `Drag ${label} to move it; pull a visible edge inward to peel it`;

			const controls = reducedMotion.matches
				? "arrows move; Escape resets"
				: "arrows move; Enter peels and restores; Escape resets";

			button.setAttribute("aria-label", `${label} sticker; ${controls}`);
		}
	}

	const options = { signal: listeners.signal };

	reducedMotion.addEventListener("change", syncMotion, options);
	window.addEventListener(
		"resize",
		() => {
			if (fitFrame) return;

			fitFrame = requestAnimationFrame(() => {
				fitFrame = 0;
				fit();
			});
		},
		options,
	);

	for (const button of buttons) {
		button.disabled = false;
		button.removeAttribute("aria-hidden");
		button.addEventListener("pointerdown", (event) => start(button, event), options);
		button.addEventListener("pointermove", move, options);
		button.addEventListener("pointerup", release, options);
		button.addEventListener("pointercancel", release, options);
		button.addEventListener("lostpointercapture", release, options);
		button.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Escape") {
					if (active?.kind === "peel" && active.button === button) stop();
					else {
						stop(true);
						placement.reset(button);
					}

					return;
				}

				const dx = event.key === "ArrowLeft" ? -8 : event.key === "ArrowRight" ? 8 : 0;
				const dy = event.key === "ArrowUp" ? -8 : event.key === "ArrowDown" ? 8 : 0;

				if ((!dx && !dy) || active?.grab) return;

				const start = placement.read(button);

				event.preventDefault();
				stop();
				placement.raise(button);
				placement.set(button, limits(button)(start.x + dx, start.y + dy));
				placement.save(button, start);
			},
			options,
		);
		button.addEventListener(
			"click",
			(event) => {
				if (event.detail > 0) {
					// Some browsers do not focus buttons on a pointer click.
					button.focus({ preventScroll: true });

					return;
				}

				if (active?.grab || reducedMotion.matches) return;

				const lift = button.querySelector<HTMLElement>(".desk-sticker-lift");
				const size: Vector = [button.offsetWidth, button.offsetHeight];

				const grip = peelGrip(
					button.dataset.stickerOutline ?? "",
					size,
					[size[0] / 2, size[1]],
					true,
				);

				if (!lift || !grip) return;

				stop();
				placement.raise(button);

				const peel: Peel = {
					kind: "peel",
					button,
					lift,
					size,
					grip,
					grab: null,
					fold: restingFold(grip),
					motion: { startedAt: performance.now(), target: "loose" },
					artwork: null,
				};

				active = peel;
				void prepare(peel);
				schedule();
			},
			options,
		);
	}

	fit();
	syncMotion();

	return () => {
		listeners.abort();
		cancelAnimationFrame(fitFrame);
		stop(true);
		renderer?.dispose();

		for (const button of buttons) {
			button.disabled = true;
			button.setAttribute("aria-hidden", "true");
		}
	};
}
