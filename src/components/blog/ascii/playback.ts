class AsciiExplainerElement extends HTMLElement {
	#observer: IntersectionObserver | undefined;
	#events: AbortController | undefined;
	#visible = false;
	#paused = false;
	#finished = false;

	connectedCallback() {
		this.#events?.abort();
		this.#events = new AbortController();
		const replay = this.querySelector<HTMLButtonElement>(".ascii-explainer-toggle");

		if (replay) {
			replay.hidden = false;
			replay.addEventListener("click", () => this.#toggle(), { signal: this.#events.signal });
		}

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
				const last = this.querySelector(".ascii-explainer-frame:last-child");

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
		this.#syncControl();

		if (
			this.dataset.playback === "running" ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		)
			return;

		this.dataset.playback = "waiting";

		// Account for the printer housing covering the top of the viewport.
		const headerBottom =
			document.getElementById("main-header")?.getBoundingClientRect().bottom ?? 0;

		const inset = Math.min(Math.max(headerBottom, 0), window.innerHeight / 2);
		this.#observer = new IntersectionObserver(
			(entries) => {
				this.#visible = entries.some(
					(entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6,
				);
				this.#start();
			},
			{ threshold: 0.6, rootMargin: `-${inset}px 0px 0px 0px` },
		);
		this.#observer.observe(this);
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
		const paused = this.#paused || document.hidden;
		const playing = this.dataset.playback === "running" && !paused && !this.#finished;
		this.toggleAttribute("data-paused", paused);
		this.toggleAttribute("data-playing", playing);
		const button = this.querySelector<HTMLButtonElement>("button");

		if (button) {
			const label = playing ? "暂停" : this.#finished ? "重新播放" : "播放";
			button.title = label;
			button.setAttribute("aria-label", `${label} ASCII 演示`);
		}
	}

	#replay() {
		this.#observer?.disconnect();
		this.#visible = true;
		this.dataset.playback = "running";
		this.#paused = false;
		this.#finished = false;
		this.#syncControl();

		// Reset the same CSS timeline, including each frame's staggered delay.
		for (const frame of this.querySelectorAll(".ascii-explainer-frame")) {
			for (const animation of frame.getAnimations()) {
				animation.currentTime = 0;
				animation.play();
			}
		}
	}

	#start() {
		if (this.dataset.playback === "running" || !this.#visible || document.hidden) return;

		this.dataset.playback = "running";
		this.#observer?.disconnect();
		this.#syncControl();
	}

	disconnectedCallback() {
		this.#observer?.disconnect();
		this.#events?.abort();
	}
}

if (!customElements.get("ascii-explainer"))
	customElements.define("ascii-explainer", AsciiExplainerElement);

export {};
