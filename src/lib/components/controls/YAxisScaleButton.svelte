<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';

	const options = [30, 40, 50, 60, 80] as const;

	function findClosestIndex(value: number): number {
		let closest = 2; // default to 50dB index
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
	class="flex h-10 items-center gap-1.5 rounded-md border border-base-content/20 px-3 text-sm font-medium text-base-content/60 transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
	{m.y_axis_scale_button_label()}
	<span class="h-4 w-px bg-base-content/20"></span>
	<b>{options[currentIndex]}dB</b>
</button>
