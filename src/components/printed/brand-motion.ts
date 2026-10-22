// One visible-time clock keeps the Thinking Five orbit and title in phase.
const HOLD_DURATION = 1600;
const DISSOLVE_DURATION = 2600;
const SETTLE_DURATION = 600;
const PLAYBACK_DURATION = HOLD_DURATION + DISSOLVE_DURATION + SETTLE_DURATION;
const FRAME_INTERVAL = 1000 / 30;

function orbitRenderer(root: HTMLElement) {
	const orbit = root.querySelector("brand-orbit");
	const group = orbit?.querySelector("g");
	const path = orbit?.querySelector("path");
	const trail = orbit?.querySelector("[data-orbit-particles]");
	const particles = [...(orbit?.querySelectorAll("circle") ?? [])];

	if (!group || !path || !trail) return;

	const initialPath = path.getAttribute("d") ?? "";

	// Thinking Five geometry: https://paidax01.github.io/math-curve-loaders/
	const samples = Array.from({ length: 121 }, (_, index): [number, number, number, number] => {
		const t = (index / 120) * Math.PI * 2;

		return [34 * Math.cos(t), 34 * Math.sin(t), Math.cos(5 * t), Math.sin(5 * t)];
	});

	particles.forEach((particle, index) => {
		const fade = (1 - index / (particles.length - 1)) ** 0.56;
		particle.setAttribute("r", (0.45 + fade * 2.2).toFixed(3));
		particle.setAttribute("opacity", (0.04 + fade * 0.96).toFixed(3));
	});
	trail.setAttribute("opacity", "0");

	return {
		render(elapsed: number) {
			const amplitude = 7 * (0.76 + 0.24 * Math.sin((elapsed / 4200) * Math.PI * 2 + 0.55));

			const contour = samples.map(
				([baseX, baseY, detailX, detailY], index) =>
					`${index ? "L" : "M"}${(50 + baseX - amplitude * detailX).toFixed(3)},${(50 + baseY - amplitude * detailY).toFixed(3)}`,
			);

			path.setAttribute("d", `${contour.join(" ")} Z`);
			group.setAttribute("transform", `rotate(${-(elapsed / 28000) * 360} 50 50)`);
			trail.setAttribute(
				"opacity",
				String(Math.min(1, (PLAYBACK_DURATION - elapsed) / SETTLE_DURATION)),
			);

			particles.forEach((particle, index) => {
				const t = (elapsed / 4600 - (index / (particles.length - 1)) * 0.38) * Math.PI * 2;
				particle.setAttribute(
					"cx",
					(50 + 34 * Math.cos(t) - amplitude * Math.cos(5 * t)).toFixed(3),
				);
				particle.setAttribute(
					"cy",
					(50 + 34 * Math.sin(t) - amplitude * Math.sin(5 * t)).toFixed(3),
				);
			});
		},
		finish() {
			trail.setAttribute("opacity", "0");
		},
		reset() {
			group.removeAttribute("transform");
			path.setAttribute("d", initialPath);
			trail.setAttribute("opacity", "0");
		},
	};
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const smooth = (value: number) => {
	const t = clamp(value);

	return t * t * (3 - 2 * t);
};

function titleRenderer(root: HTMLElement) {
	const text = root.querySelector<HTMLElement>("[data-brand-text]");
	const canvas = root.querySelector<HTMLCanvasElement>("[data-brand-ink]");
	const context = canvas?.getContext("2d");

	if (!text || !canvas || !context) return;

	// Inspired by https://ascii.rest/dissolve/: erode ink into falling grains,
	// then condense it again. Sample the existing typeface instead of shrinking
	// the upstream 64x13 character banner into the header's single text line.
	// The real text retains layout, selection, and the accessible site name.
	const style = getComputedStyle(text);
	const bounds = text.parentElement?.getBoundingClientRect() ?? text.getBoundingClientRect();
	const width = Math.ceil(bounds.width) + 8;
	const height = Math.ceil(bounds.height) + 8;
	const raster = document.createElement("canvas");
	raster.width = width * 2;
	raster.height = height * 2;
	const rasterContext = raster.getContext("2d");

	if (!rasterContext) return;

	rasterContext.scale(2, 2);
	rasterContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	rasterContext.letterSpacing = style.letterSpacing;

	const title =
		style.textTransform === "uppercase"
			? (text.textContent ?? "").toUpperCase()
			: (text.textContent ?? "");

	const metrics = rasterContext.measureText(title);
	const lineHeight = Number.parseFloat(style.lineHeight);

	const baseline =
		(lineHeight - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 +
		metrics.fontBoundingBoxAscent;

	rasterContext.fillText(title, 4, 4 + baseline);
	const pixels = rasterContext.getImageData(0, 0, raster.width, raster.height).data;
	const grains: { x: number; y: number; ink: number; jitter: number }[] = [];

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const ink = (pixels[(y * 2 * raster.width + x * 2) * 4 + 3] ?? 0) / 255;

			if (ink < 0.1) continue;
			const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
			grains.push({ x, y, ink, jitter: noise - Math.floor(noise) });
		}
	}

	const ratio = Math.min(devicePixelRatio || 1, 2);
	canvas.width = width * ratio;
	canvas.height = height * ratio;
	context.scale(ratio, ratio);

	return {
		render(elapsed: number) {
			const phase = (elapsed - HOLD_DURATION) / DISSOLVE_DURATION;

			// Dissolve once, then keep native text clear while the orbit fades out.
			if (phase <= 0 || phase >= 1) {
				text.style.opacity = "";
				canvas.style.opacity = "0";

				return;
			}

			text.style.opacity = "0";
			canvas.style.opacity = "1";
			context.clearRect(0, 0, width, height);
			context.fillStyle = getComputedStyle(text).color;

			for (const grain of grains) {
				const stagger = (grain.x / width) * 0.23 + grain.jitter * 0.07;
				const erosion = smooth((phase - stagger) / 0.16);
				const condensed = smooth((phase - 0.44 - stagger) / 0.22);
				context.globalAlpha = grain.ink * Math.max(1 - erosion, condensed);
				context.fillRect(grain.x, grain.y, 1, 1);
				const age = clamp((phase - stagger - 0.1) / 0.38);
				context.globalAlpha = grain.ink * Math.sin(age * Math.PI) * (1 - condensed) * 0.6;
				context.fillRect(grain.x + age * (2 + grain.jitter * 3), grain.y + age * age * 5, 1, 1);
			}
		},
		finish() {
			text.style.opacity = "";
			canvas.style.opacity = "0";
		},
	};
}

export function animateBrand(root: HTMLElement) {
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	const orbit = orbitRenderer(root);
	let title: ReturnType<typeof titleRenderer>;
	let frame = 0;
	let elapsed = 0;
	let previous = 0;
	let disconnected = false;
	let ready = false;

	const render = (now: number) => {
		if (previous && now - previous < FRAME_INTERVAL - 0.5) {
			frame = requestAnimationFrame(render);

			return;
		}

		elapsed = Math.min(PLAYBACK_DURATION, elapsed + (previous ? now - previous : 0));
		previous = now;

		if (elapsed >= PLAYBACK_DURATION) {
			orbit?.finish();
			title?.finish();

			return;
		}

		orbit?.render(elapsed);
		title?.render(elapsed);
		frame = requestAnimationFrame(render);
	};

	const sync = () => {
		cancelAnimationFrame(frame);
		previous = 0;

		if (reducedMotion.matches) {
			orbit?.reset();
			title?.finish();

			return;
		}

		if (!ready || disconnected || elapsed >= PLAYBACK_DURATION) return;

		if (!document.hidden) frame = requestAnimationFrame(render);
	};

	// Wait for the actual font before sampling ink. Static HTML remains visible
	// while it loads, and neither decoration gets ahead of the other.
	void document.fonts.ready.then(() => {
		if (disconnected) return;
		title = titleRenderer(root);
		ready = true;
		sync();
	});

	reducedMotion.addEventListener("change", sync);
	document.addEventListener("visibilitychange", sync);
	sync();

	return () => {
		disconnected = true;
		cancelAnimationFrame(frame);
		reducedMotion.removeEventListener("change", sync);
		document.removeEventListener("visibilitychange", sync);
		title?.finish();
	};
}
