<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { menuStore, MENU_PANELS, type MenuPanel } from '$lib/stores/menu-store.svelte';

	const ITEM_WIDTH = 108; // px — 6rem button + gap

	const panels: { id: MenuPanel; label: () => string }[] = [
		{ id: 'device', label: m.menu_item_device_label },
		{ id: 'graph', label: m.menu_item_graph_label },
		{ id: 'equalizer', label: m.menu_item_equalizer_label },
		{ id: 'misc', label: m.menu_item_misc_label }
	];

	let currentIndex = $derived(panels.findIndex((p) => p.id === menuStore.currentPanel));

	// Drag state
	let isDragging = $state(false);
	let startX = $state(0);
	let dragStartIndex = $state(0);
	let liveOffset = $state(0); // extra px offset during active drag
	let lastDragX = $state(0);

	// Wheel accumulator
	let wheelAccumulator = $state(0);
	const WHEEL_SENSITIVITY = 0.3;
	const WHEEL_THRESHOLD = 1.0;

	const scrollX = $derived(
		((panels.length / 2) - 0.5 - currentIndex) * ITEM_WIDTH + (isDragging ? liveOffset : 0)
	);

	function goTo(index: number) {
		const clamped = Math.max(0, Math.min(index, panels.length - 1));
		menuStore.currentPanel = panels[clamped].id;
	}

	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		startX = e.pageX;
		lastDragX = e.pageX;
		dragStartIndex = currentIndex;
		liveOffset = 0;
		e.preventDefault();
	}

	function handleTouchStart(e: TouchEvent) {
		isDragging = true;
		startX = e.touches[0].pageX;
		lastDragX = e.touches[0].pageX;
		dragStartIndex = currentIndex;
		liveOffset = 0;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		const x = e.pageX;
		liveOffset = x - startX;
		lastDragX = x;
		const estimatedIndex = Math.round(-liveOffset / ITEM_WIDTH) + dragStartIndex;
		if (estimatedIndex !== currentIndex) {
			goTo(estimatedIndex);
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		e.preventDefault();
		const x = e.touches[0].pageX;
		liveOffset = x - startX;
		lastDragX = x;
		const estimatedIndex = Math.round(-liveOffset / ITEM_WIDTH) + dragStartIndex;
		if (estimatedIndex !== currentIndex) {
			goTo(estimatedIndex);
		}
	}

	function handleDragEnd() {
		if (!isDragging) return;
		isDragging = false;
		liveOffset = 0;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
		wheelAccumulator += delta * WHEEL_SENSITIVITY;
		if (Math.abs(wheelAccumulator) >= WHEEL_THRESHOLD) {
			goTo(currentIndex + Math.sign(wheelAccumulator));
			wheelAccumulator = 0;
		}
	}
</script>

<svelte:window
	onmousemove={handleMouseMove}
	onmouseup={handleDragEnd}
	onmouseleave={handleDragEnd}
/>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav
	class="flex h-12 select-none items-center overflow-hidden border-t border-border bg-surface-raised"
	onmousedown={handleMouseDown}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleDragEnd}
	ontouchcancel={handleDragEnd}
	onwheel={handleWheel}
>
	<div
		role="tablist"
		aria-orientation="horizontal"
		class="flex items-center gap-3 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
		style:transform="translateX({scrollX}px)"
		style:transition={isDragging ? 'none' : undefined}
	>
		{#each panels as panel, i (panel.id)}
			<button
				type="button"
				role="tab"
				aria-selected={menuStore.currentPanel === panel.id}
				class="w-24 shrink-0 rounded-md px-2 py-1.5 text-xs font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				class:text-accent={menuStore.currentPanel === panel.id}
				class:text-carousel-near={menuStore.currentPanel !== panel.id && Math.abs(i - currentIndex) === 1}
				class:text-carousel-far={menuStore.currentPanel !== panel.id && Math.abs(i - currentIndex) !== 1}
				onclick={() => goTo(i)}
			>
				{panel.label()}
			</button>
		{/each}
	</div>
</nav>
