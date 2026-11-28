const frameDuration = 3000;

class ExplainerElement extends HTMLElement {
	#events: AbortController | undefined;

	connectedCallback() {
		this.#events?.abort();
		this.#events = new AbortController();
		const { signal } = this.#events;
		const controls = this.querySelector<HTMLElement>(".explainer-controls");
		const previous = this.querySelector<HTMLButtonElement>("[data-previous]");
		const next = this.querySelector<HTMLButtonElement>("[data-next]");
		const play = this.querySelector<HTMLButtonElement>("[data-play]");
		const status = this.querySelector<HTMLElement>('[role="status"]');
		const position = this.querySelector<HTMLElement>("[data-position]");
		const currentNote = this.querySelector<HTMLElement>("[data-current-note]");
		const frames = Array.from(this.querySelectorAll<HTMLElement>(".step-explainer-frame"));

		if (
			!controls ||
			!previous ||
			!next ||
			!play ||
			!status ||
			!position ||
			!currentNote ||
			frames.length < 2
		)
			return;

		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const last = frames.length - 1;
		let index = 0;
		let playing = false;
		let visible = false;
		let timer: number | undefined;

		const render = () => {
			status.setAttribute("aria-live", playing ? "off" : "polite");

			for (const [step, frame] of frames.entries()) {
				frame.setAttribute("aria-hidden", String(step !== index));
			}

			previous.setAttribute("aria-disabled", String(index === 0));
			next.setAttribute("aria-disabled", String(index === last));
			play.textContent = playing ? "暂停" : index === last ? "重播" : "播放";
			position.textContent = `${index + 1} / ${frames.length}`;
			currentNote.textContent = frames[index]?.querySelector(".explainer-note")?.textContent ?? "";
		};

		const schedule = () => {
			window.clearTimeout(timer);

			if (!playing || !visible || document.hidden) return;

			timer = window.setTimeout(() => {
				index++;
				playing = index < last;
				render();
				schedule();
			}, frameDuration);
		};

		const step = (direction: number) => {
			const target = index + direction;

			if (target < 0 || target > last) return;

			playing = false;
			index = target;
			render();
			schedule();
		};

		previous.addEventListener("click", () => step(-1), { signal });
		next.addEventListener("click", () => step(1), { signal });
		play.addEventListener(
			"click",
			() => {
				if (motion.matches) return;

				if (index === last) index = 0;

				playing = !playing;
				render();
				schedule();
			},
			{ signal },
		);

		controls.addEventListener(
			"keydown",
			(event) => {
				if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

				event.preventDefault();
				step(event.key === "ArrowLeft" ? -1 : 1);
			},
			{ signal },
		);

		const syncMotion = () => {
			if (motion.matches) {
				playing = false;

				if (document.activeElement === play) (index === last ? previous : next).focus();
			}

			play.hidden = motion.matches;
			render();
			schedule();
		};

		// Suspend the clock while the printer housing or another tab hides the figure.
		const header = document.getElementById("main-header")?.getBoundingClientRect().bottom ?? 0;
		const inset = Math.min(Math.max(header, 0), window.innerHeight / 2);

		const observer = new IntersectionObserver(
			([entry]) => {
				visible = Boolean(entry?.isIntersecting);
				schedule();
			},
			{ rootMargin: `-${inset}px 0px 0px 0px` },
		);

		observer.observe(this);
		signal.addEventListener(
			"abort",
			() => {
				observer.disconnect();
				window.clearTimeout(timer);
			},
			{ once: true },
		);

		document.addEventListener("visibilitychange", schedule, { signal });
		motion.addEventListener("change", syncMotion, { signal });
		syncMotion();
		controls.hidden = false;
	}

	disconnectedCallback() {
		this.#events?.abort();
	}
}

if (!customElements.get("step-explainer"))
	customElements.define("step-explainer", ExplainerElement);

export {};
