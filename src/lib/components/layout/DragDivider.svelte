<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';

	interface Props {
		mainEl: HTMLElement | null | undefined;
		panelOnLeft?: boolean;
		ondrag: (cols: string) => void;
	}

	let { mainEl, panelOnLeft = false, ondrag }: Props = $props();

	/** Divider track width, matching the `5px` column AppShell lays out. */
	const DIVIDER_PX = 5;
	/** Column min-widths: graph 400px, panel 340px. */
	const GRAPH_MIN_PX = 400;
	const PANEL_MIN_PX = 340;
	/** Distance one arrow-key press moves the divider. */
	const KEY_STEP_PX = 15;

	let dividerEl = $state<HTMLElement | undefined>(undefined);
	let isDragging = $state(false);
	/** Left pane width and container width, in px, as last measured. */
	let leftPx = $state(0);
	let containerPx = $state(0);

	const leftMin = $derived(panelOnLeft ? PANEL_MIN_PX : GRAPH_MIN_PX);
	const rightMin = $derived(panelOnLeft ? GRAPH_MIN_PX : PANEL_MIN_PX);

	// The ARIA values are percentages of the container, so they read the same at any width.
	const toPct = (px: number) => (containerPx > 0 ? Math.round((px / containerPx) * 100) : 0);
	const maxFor = (cw: number) => Math.max(leftMin, cw - DIVIDER_PX - rightMin);
	const valueNow = $derived(toPct(leftPx));
	const valueMin = $derived(toPct(leftMin));
	const valueMax = $derived(toPct(maxFor(containerPx)));

	function measure() {
		if (!mainEl || !dividerEl) return;
		const container = mainEl.getBoundingClientRect();
		containerPx = container.width;
		// The divider's left edge is where the left column ends.
		leftPx = dividerEl.getBoundingClientRect().left - container.left;
	}

	// The columns change from outside (the initial 65% split, a window resize, the parent's
	// own grid string), so watch both the container and the left pane rather than only our moves.
	$effect(() => {
		if (!mainEl || !dividerEl || typeof ResizeObserver === 'undefined') return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(mainEl);
		const leftPane = dividerEl.previousElementSibling;
		if (leftPane) observer.observe(leftPane);
		return () => observer.disconnect();
	});

	/** Set the left column to `px`, clamped the same way for a drag and for the keyboard. */
	function moveTo(px: number) {
		if (!mainEl) return;
		const cw = mainEl.getBoundingClientRect().width;
		if (cw <= 0) return;
		const clamped = Math.min(Math.max(px, leftMin), maxFor(cw));
		const leftWidthPct = (clamped / cw) * 100;
		leftPx = clamped;
		containerPx = cw;
		// Mirror of the clamp the grid itself applies, so a window resize keeps the limits.
		// Left column is `leftMin`, the far column keeps `rightMin` plus the divider.
		ondrag(
			`clamp(${leftMin}px, ${leftWidthPct}%, calc(100% - ${rightMin + DIVIDER_PX}px)) ${DIVIDER_PX}px minmax(${rightMin}px, 1fr)`
		);
	}

	function startDrag(e: PointerEvent) {
		if (e.button !== 0 || !dividerEl) return;
		dividerEl.setPointerCapture(e.pointerId);
		isDragging = true;
		e.preventDefault();
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || !mainEl) return;
		moveTo(e.clientX - mainEl.getBoundingClientRect().x);
	}

	function stopDrag(e: PointerEvent) {
		isDragging = false;
		if (dividerEl?.hasPointerCapture(e.pointerId)) dividerEl.releasePointerCapture(e.pointerId);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.altKey || e.ctrlKey || e.metaKey || !mainEl || !dividerEl) return;
		// Re-read the live size: the parent may have changed the columns since our last measure.
		measure();
		let target: number;
		switch (e.key) {
			case 'ArrowLeft':
				target = leftPx - KEY_STEP_PX;
				break;
			case 'ArrowRight':
				target = leftPx + KEY_STEP_PX;
				break;
			case 'Home':
				target = leftMin;
				break;
			case 'End':
				target = maxFor(containerPx);
				break;
			default:
				return;
		}
		e.preventDefault();
		moveTo(target);
	}
</script>

<!--
	WAI-ARIA window splitter: the value is the left column's share of the container. The line
	stays 5px; the pseudo-element widens only the pointer/touch target.
-->
<!-- A focusable separator is an interactive widget in ARIA 1.2; Svelte still files it as static. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={dividerEl}
	role="separator"
	aria-orientation="vertical"
	aria-label={m.layout_divider_label()}
	aria-valuenow={valueNow}
	aria-valuemin={valueMin}
	aria-valuemax={valueMax}
	tabindex="0"
	data-tutorial-target="divider"
	class="relative z-10 w-1.25 cursor-col-resize touch-none transition-colors before:absolute before:-inset-x-2.5 before:inset-y-0 before:content-[''] focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent {isDragging
		? 'bg-base-content/35'
		: 'bg-base-content/20 hover:bg-base-content/35'}"
	onpointerdown={startDrag}
	onpointermove={handlePointerMove}
	onpointerup={stopDrag}
	onpointercancel={stopDrag}
	onlostpointercapture={() => (isDragging = false)}
	onkeydown={handleKeydown}
></div>
