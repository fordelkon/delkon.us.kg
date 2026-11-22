export function containSearchTouch(dialog: HTMLDialogElement, start: TouchEvent): void {
	const { target, touches } = start;
	const touch = touches.item(0);

	if (!touch || touches.length !== 1 || !(target instanceof Element)) return;

	const results = target.closest<HTMLElement>(".pf-modal-body");
	const gesture = new AbortController();
	const options = { capture: true, signal: gesture.signal };
	const end = () => gesture.abort();
	let previousY = touch.clientY;

	// Register a cancelable listener only for a gesture started while search is open.
	document.addEventListener(
		"touchmove",
		(event) => {
			if (!dialog.open || !dialog.isConnected) {
				end();

				return;
			}

			const touch = event.touches.item(0);

			if (!touch || event.touches.length !== 1) return;

			const y = touch.clientY;
			const delta = y - previousY;

			previousY = y;

			if (!delta || !event.cancelable) return;

			if (results && dialog.contains(results)) {
				const { scrollTop, scrollHeight, clientHeight } = results;
				const canScroll = delta < 0 ? scrollTop < scrollHeight - clientHeight - 1 : scrollTop > 0;

				if (canScroll) return;
			}

			// Keep backdrop swipes and gestures at result boundaries off the page.
			event.preventDefault();
		},
		{ ...options, passive: false },
	);
	document.addEventListener("touchend", end, { ...options, once: true });
	document.addEventListener("touchcancel", end, { ...options, once: true });
}
