class ExplainerScenes extends HTMLElement {
	#events: AbortController | undefined;

	connectedCallback() {
		this.#events?.abort();
		this.#events = new AbortController();
		const navigation = this.querySelector<HTMLElement>("nav");
		const buttons = Array.from(this.querySelectorAll<HTMLButtonElement>("nav button"));
		const panels = Array.from(this.querySelectorAll<HTMLElement>(":scope > section"));

		if (!navigation || buttons.length !== panels.length) return;

		const select = (selected: number) => {
			for (const [index, panel] of panels.entries()) {
				panel.hidden = index !== selected;
				buttons[index]?.setAttribute("aria-pressed", String(index === selected));
			}
		};

		for (const [index, button] of buttons.entries()) {
			button.addEventListener("click", () => select(index), { signal: this.#events.signal });
		}

		navigation.hidden = false;
		select(0);
	}

	disconnectedCallback() {
		this.#events?.abort();
	}
}

if (!customElements.get("explainer-scenes"))
	customElements.define("explainer-scenes", ExplainerScenes);

export {};
