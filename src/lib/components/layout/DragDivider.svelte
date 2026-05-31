<script lang="ts">
	interface Props {
		mainEl: HTMLElement | null;
		panelOnLeft?: boolean;
		ondrag: (cols: string) => void;
	}

	let { mainEl, panelOnLeft = false, ondrag }: Props = $props();

	let isDragging = $state(false);

	function startDrag(e: MouseEvent) {
		isDragging = true;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !mainEl) return;
		const { width: containerWidth, x: containerX } = mainEl.getBoundingClientRect();
		const leftWidthPct = ((e.clientX - containerX) / containerWidth) * 100;
		// Column min-widths: graph 400px, panel 340px, divider 5px.
		// Subtract divider + far-column min from 100% so the dragged column can't crush the other.
		if (panelOnLeft) {
			// Left column is the panel (min 340px). Right column is the graph (min 400px).
			ondrag(`clamp(340px, ${leftWidthPct}%, calc(100% - 405px)) 5px minmax(400px, 1fr)`);
		} else {
			// Left column is the graph (min 400px). Right column is the panel (min 340px).
			ondrag(`clamp(400px, ${leftWidthPct}%, calc(100% - 345px)) 5px minmax(340px, 1fr)`);
		}
	}

	function stopDrag() {
		isDragging = false;
	}
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={stopDrag} />

<div
	role="none"
	tabindex="-1"
	data-tutorial-target="divider"
	class="w-1.25 cursor-col-resize transition-colors {isDragging
		? 'bg-base-content/35'
		: 'bg-base-content/20 hover:bg-base-content/35'}"
	onmousedown={startDrag}
></div>
