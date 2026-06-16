<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { menuStore, type MenuPanel } from '$lib/stores/menu-store.svelte';

	const MIN_W = 96; // px — floor, matches the previous w-24 width
	const MAX_W = 144; // px — cap so a pathologically long label can't swallow the carousel
	const GAP = 12; // px — gap-3 between buttons

	const panels: { id: MenuPanel; label: () => string }[] = [
		{ id: 'device', label: m.menu_item_device_label },
		{ id: 'graph', label: m.menu_item_graph_label },
		{ id: 'equalizer', label: m.menu_item_equalizer_label },
		{ id: 'misc', label: m.menu_item_misc_label }
	];

	// Intrinsic label widths (incl. px-2 padding) measured off the invisible ghost row below.
	// bind:clientWidth is backed by a ResizeObserver, so this re-settles once the web font loads.
	let labelWidths = $state<number[]>([]);
	// Every button shares one width sized to the widest label, clamped between floor and cap.
	// Uniform width keeps the centering/drag/wheel math (STRIDE) trivial.
	const BUTTON_W = $derived(
		Math.min(MAX_W, Math.max(MIN_W, ...labelWidths.filter(Number.isFinite)) + 2)
	);
	const STRIDE = $derived(BUTTON_W + GAP);

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
	data-tutorial-target="menu"
	class="relative flex h-12 items-center overflow-hidden border-base-content/15 bg-base-300 select-none {appStore.isMobile
		? 'border-t'
		: 'border-b'}"
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
				title={labelWidths[i] > MAX_W ? panel.label() : undefined}
				style:width="{BUTTON_W}px"
				class="relative shrink-0 rounded-md px-2 py-1.5 text-sm font-semibold
					tracking-wide transition-all hover:cursor-pointer hover:bg-base-content/5
					focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none
					{menuStore.currentPanel === panel.id
					? 'text-accent'
					: Math.abs(i - currentIndex) === 1
						? 'text-base-content/60'
						: 'text-base-content/25'}"
				onclick={() => goTo(i)}
			>
				<span class="block overflow-hidden text-center text-ellipsis whitespace-nowrap">
					{panel.label()}
				</span>
				{#if menuStore.currentPanel === panel.id}
					<span
						class="absolute bottom-0 left-1/2 h-0.5 w-12 -translate-x-1/2 rounded-full bg-accent"
					></span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Invisible ghost row: measures each label's intrinsic width (incl. px-2 padding) to
	     size the buttons above. Kept out of flow and hidden from AT/pointer. -->
	<div aria-hidden="true" class="pointer-events-none invisible absolute flex">
		{#each panels as panel, i (panel.id)}
			<span
				bind:clientWidth={labelWidths[i]}
				class="px-2 text-sm font-semibold tracking-wide whitespace-nowrap"
			>
				{panel.label()}
			</span>
		{/each}
	</div>
</nav>
