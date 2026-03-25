<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';

	const options = [40, 60, 80, 100] as const;

	function findClosestIndex(value: number): number {
		let closest = 1; // default to 60dB index
		let minDiff = Infinity;
		for (let i = 0; i < options.length; i++) {
			const diff = Math.abs(options[i] - value);
			if (diff < minDiff) {
				minDiff = diff;
				closest = i;
			}
		}
		return closest;
	}

	let currentIndex = $state(findClosestIndex(graphStore.yScale));

	function handleClick() {
		currentIndex = (currentIndex + 1) % options.length;
		graphStore.yScale = options[currentIndex];
	}
</script>

<button
	onclick={handleClick}
	class="flex h-10 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
	{m.y_axis_scale_button_label()}
	<span class="h-4 w-px bg-separator"></span>
	<b>{options[currentIndex]}dB</b>
</button>
