class ExplainerElement extends HTMLElement {
	#observer: IntersectionObserver | undefined;
	#events: AbortController | undefined;
	#motion: MediaQueryList | undefined;
	#visible = false;
	#paused = false;
	#finished = false;

	connectedCallback() {
		this.#events?.abort();
		this.#observer?.disconnect();
		this.#events = new AbortController();
		this.#motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const replay = this.querySelector<HTMLButtonElement>(".step-explainer-toggle");

		if (replay) {
			replay.hidden = false;
			replay.addEventListener("click", () => this.#toggle(), { signal: this.#events.signal });
		}

		this.#motion.addEventListener("change", () => this.#syncMotion(), {
			signal: this.#events.signal,
		});

		document.addEventListener(
			"visibilitychange",
			() => {
				this.#syncControl();
				this.#start();
			},
			{ signal: this.#events.signal },
		);

		this.addEventListener(
			"animationend",
			(event) => {
				const last = this.querySelector(".step-explainer-frame:last-child");

				if (
					event.target !== last ||
					!last?.getAnimations().every((animation) => animation.playState === "finished")
				)
					return;

				this.#finished = true;
				this.#syncControl();
			},
			{ signal: this.#events.signal },
		);

		if (this.dataset.playback !== "running") this.#syncMotion();

		// Account for the printer housing covering the top of the viewport.
		const headerBottom =
			document.getElementById("main-header")?.getBoundingClientRect().bottom ?? 0;

		const inset = Math.min(Math.max(headerBottom, 0), window.innerHeight / 2);
		this.#observer = new IntersectionObserver(
			(entries) => {
				this.#visible = entries.some(
					(entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25,
				);
				this.#start();
				this.#syncControl();
			},
			{ threshold: 0.25, rootMargin: `-${inset}px 0px 0px 0px` },
		);
		this.#observer.observe(this);
	}

	#syncMotion() {
		this.#finished = false;
		this.#paused = false;
		this.dataset.playback = this.#motion?.matches ? "static" : "waiting";
		this.#start();
		this.#syncControl();
	}

	#toggle() {
		if (this.dataset.playback !== "running" || this.#finished) {
			this.#replay();

			return;
		}

		this.#paused = !this.#paused;
		this.#syncControl();
	}

	#syncControl() {
		const paused = this.#paused || document.hidden || !this.#visible;
		const playing = this.dataset.playback === "running" && !paused && !this.#finished;
		this.toggleAttribute("data-paused", paused);
		this.toggleAttribute("data-playing", playing);

		// Resume may use Animation.play(), so also synchronize imperative play state.
		if (this.dataset.playback === "running" && !this.#finished) {
			for (const frame of this.querySelectorAll(".step-explainer-frame")) {
				for (const animation of frame.getAnimations()) {
					if (paused && animation.playState === "running") animation.pause();
					else if (!paused && animation.playState === "paused") animation.play();
				}
			}
		}

		const button = this.querySelector<HTMLButtonElement>("button");

		if (button) {
			const label = playing ? "暂停" : this.#finished ? "重新播放" : "播放";
			button.title = label;
			button.setAttribute("aria-label", `${label} 原理演示`);
		}
	}

	#replay() {
		this.#visible = true;
		this.#paused = false;
		this.#finished = false;

		// Completed non-final frames have no fill and leave getAnimations().
		// Flush removal before recreating every CSS timeline in one paint.
		this.dataset.playback = "waiting";
		void this.offsetWidth;
		this.dataset.playback = "running";
		this.#syncControl();
	}

	#start() {
		if (
			this.dataset.playback !== "waiting" ||
			!this.#visible ||
			document.hidden ||
			this.#motion?.matches
		)
			return;

		this.dataset.playback = "running";
		this.#syncControl();
	}

	disconnectedCallback() {
		this.#observer?.disconnect();
		this.#events?.abort();
	}
}

if (!customElements.get("step-explainer"))
	customElements.define("step-explainer", ExplainerElement);

export {};
