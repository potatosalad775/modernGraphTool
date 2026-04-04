<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { menuStore, type MenuPanel } from '$lib/stores/menu-store.svelte';

	const BUTTON_W = 96; // px — w-24 button width
	const STRIDE = BUTTON_W + 12; // px — button + gap-3

	const panels: { id: MenuPanel; label: () => string }[] = [
		{ id: 'device', label: m.menu_item_device_label },
		{ id: 'graph', label: m.menu_item_graph_label },
		{ id: 'equalizer', label: m.menu_item_equalizer_label },
		{ id: 'misc', label: m.menu_item_misc_label }
	];

	let currentIndex = $derived(panels.findIndex((p) => p.id === menuStore.currentPanel));

	// Measured container width — reacts to window resize via bind:clientWidth
	let containerWidth = $state(0);

	// Drag state
	let isDragging = $state(false);
	let startX = $state(0);
	let dragStartIndex = $state(0);
	let liveOffset = $state(0); // extra px offset during active drag
	// Wheel accumulator
	let wheelAccumulator = $state(0);
	const WHEEL_SENSITIVITY = 0.3;
	const WHEEL_THRESHOLD = 1.0;

	// Center the selected button: translate so its midpoint aligns with container center
	const scrollX = $derived(
		containerWidth / 2 - currentIndex * STRIDE - BUTTON_W / 2 + (isDragging ? liveOffset : 0)
	);

	function goTo(index: number) {
		const clamped = Math.max(0, Math.min(index, panels.length - 1));
		menuStore.setPanel(panels[clamped].id);
	}

	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		startX = e.pageX;
		dragStartIndex = currentIndex;
		liveOffset = 0;
		e.preventDefault();
	}

	function handleTouchStart(e: TouchEvent) {
		isDragging = true;
		startX = e.touches[0].pageX;
		dragStartIndex = currentIndex;
		liveOffset = 0;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		const x = e.pageX;
		liveOffset = x - startX;
		const estimatedIndex = Math.round(-liveOffset / STRIDE) + dragStartIndex;
		if (estimatedIndex !== currentIndex) {
			goTo(estimatedIndex);
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		e.preventDefault();
		const x = e.touches[0].pageX;
		liveOffset = x - startX;
		const estimatedIndex = Math.round(-liveOffset / STRIDE) + dragStartIndex;
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
	bind:clientWidth={containerWidth}
	class="relative flex h-12 select-none items-center overflow-hidden border-base-content/15 bg-base-200 {appStore.isMobile ? 'border-t' : 'border-b'}"
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
		class="flex items-center gap-3 transition-transform duration-300 ease-in-out"
		style:transform="translateX({scrollX}px)"
		style:transition={isDragging ? 'none' : undefined}
	>
		{#each panels as panel, i (panel.id)}
			<button
				type="button"
				role="tab"
				aria-selected={menuStore.currentPanel === panel.id}
				class="relative w-24 shrink-0 rounded-md px-2 py-1.5 text-xs font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent {menuStore.currentPanel === panel.id ? 'text-accent' : Math.abs(i - currentIndex) === 1 ? 'text-base-content/45' : 'text-base-content/25'}"
				onclick={() => goTo(i)}
			>
				{panel.label()}
				{#if menuStore.currentPanel === panel.id}
					<span class="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent"></span>
				{/if}
			</button>
		{/each}
	</div>
</nav>
