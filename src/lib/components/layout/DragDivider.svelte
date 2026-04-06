<script lang="ts">
	interface Props {
		mainEl: HTMLElement | null;
		ondrag: (cols: string) => void;
	}

	let { mainEl, ondrag }: Props = $props();

	let isDragging = $state(false);
	//let startX = $state(0);

	function startDrag(e: MouseEvent) {
		isDragging = true;
		//startX = e.clientX;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !mainEl) return;
		const { width: containerWidth, x: containerX } = mainEl.getBoundingClientRect();
		const newWidthPct = ((e.clientX - containerX) / containerWidth) * 100;
		ondrag(
			`clamp(400px, ${newWidthPct}%, calc(100% - 346px)) 5px minmax(340px, 1fr)`
		);
	}

	function stopDrag() {
		isDragging = false;
	}
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={stopDrag} />

<div
	role="none"
	tabindex="-1"
	class="w-[5px] cursor-col-resize transition-colors {isDragging ? 'bg-base-content/35' : 'bg-base-content/20 hover:bg-base-content/35'}"
	onmousedown={startDrag}
></div>
