/**
 * Scroll helpers for a panel that scrolls as one column — the EQ panel on
 * mobile, where the band list sits above the accordion in a single scroller.
 */

/**
 * Attachment for a scroll container: keeps the element the user last touched
 * or focused at the same on-screen position when content around it resizes.
 *
 * Pressing A/B or Run in the accordion rewrites the bands, so the band list
 * above grows or shrinks and the button the user just pressed moves away.
 * CSS scroll anchoring would cover this, but iOS Safari doesn't implement it,
 * and where it is implemented the browser picks its own anchor, which is not
 * necessarily the control in use.
 *
 * Every direct child of the container is observed. A resize below the anchor
 * doesn't move it, so the correction comes out as zero.
 */
export function anchorScroll(container: HTMLElement): () => void {
	let anchor: Element | null = null;
	// Where the anchor sits in the view, and where it sits in the content.
	let offset = 0;
	let contentTop = 0;

	const measure = (el: Element) =>
		el.getBoundingClientRect().top - container.getBoundingClientRect().top;
	const record = (el: Element) => {
		offset = measure(el);
		contentTop = offset + container.scrollTop;
	};

	// Pointer, not focus alone: iOS doesn't focus a tapped button.
	const setAnchor = (e: Event) => {
		if (!(e.target instanceof Element)) return;
		anchor = e.target;
		record(anchor);
	};
	// A scroll moves the anchor on purpose, so the offset follows it. But
	// content shrinking under a scroller near its end clamps `scrollTop`, and
	// that scroll event lands before the ResizeObserver: it is a layout shift,
	// told apart by the anchor having moved within the content too.
	const onScroll = () => {
		if (!anchor?.isConnected) return;
		if (Math.abs(measure(anchor) + container.scrollTop - contentTop) < 1) record(anchor);
	};

	// Runs after layout and before paint, so the shift never reaches the screen.
	const observer = new ResizeObserver(() => {
		if (!anchor?.isConnected) return;
		const delta = measure(anchor) - offset;
		if (Math.abs(delta) >= 1) container.scrollTop += delta;
		contentTop = measure(anchor) + container.scrollTop;
	});
	const observeChildren = () => {
		observer.disconnect();
		for (const child of container.children) observer.observe(child);
	};
	const children = new MutationObserver(observeChildren);

	observeChildren();
	children.observe(container, { childList: true });
	container.addEventListener('pointerdown', setAnchor, { capture: true });
	container.addEventListener('focusin', setAnchor);
	container.addEventListener('scroll', onScroll, { passive: true });

	return () => {
		observer.disconnect();
		children.disconnect();
		container.removeEventListener('pointerdown', setAnchor, { capture: true });
		container.removeEventListener('focusin', setAnchor);
		container.removeEventListener('scroll', onScroll);
	};
}

export function scrollParent(el: Element): HTMLElement | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);
		if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight)
			return node;
	}
	return null;
}

/**
 * Scroll `el` into its scroll container's view: as much of it as fits, but
 * never so far that its top (the accordion header) leaves the view.
 * Does nothing when `el` is already fully visible.
 */
export function revealInScrollParent(el: Element): void {
	const container = scrollParent(el);
	if (!container) return;
	const view = container.getBoundingClientRect();
	const box = el.getBoundingClientRect();
	const distance = Math.min(box.bottom - view.bottom, box.top - view.top);
	if (distance <= 0) return;
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	container.scrollBy({ top: distance, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * Scroll `container` so `box` is in its view, or its top is when it can't all fit.
 * Scrolls either way, unlike `revealInScrollParent`; a no-op when `box` is in view.
 * `margin` keeps that much room around the box.
 */
export function revealBox(container: HTMLElement, box: DOMRect, margin = 0): void {
	const view = container.getBoundingClientRect();
	const above = box.top - margin - view.top;
	const below = box.bottom + margin - view.bottom;
	const distance = above < 0 ? above : Math.max(0, Math.min(below, above));
	if (distance === 0) return;
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	container.scrollBy({ top: distance, behavior: reduce ? 'auto' : 'smooth' });
}

/** How long a just-opened section is followed as it grows. */
const FOLLOW_MS = 1500;

/**
 * Reveal `target` once `content` has laid out, then again each time `content`
 * grows shortly after. Content that arrives late — Hardware EQ's lazy import —
 * would otherwise be measured while still a placeholder. Following stops after
 * `FOLLOW_MS`, or as soon as the user scrolls or touches anything, so it never
 * fights them. Returns the cleanup.
 */
export function followReveal(content: Element, target: Element): () => void {
	let frame = 0;
	// Also fires once on observe(), which schedules the first reveal.
	const observer = new ResizeObserver(() => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => revealInScrollParent(target));
	});
	observer.observe(content);

	const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
	const stop = () => {
		observer.disconnect();
		clearTimeout(timer);
		for (const type of events) window.removeEventListener(type, stop, true);
	};
	const timer = setTimeout(stop, FOLLOW_MS);
	for (const type of events) window.addEventListener(type, stop, { capture: true, passive: true });

	return () => {
		stop();
		cancelAnimationFrame(frame);
	};
}
