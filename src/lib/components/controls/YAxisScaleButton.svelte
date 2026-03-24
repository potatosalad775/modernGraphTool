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
	class="flex h-10 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
>
	{m.y_axis_scale_button_label()}
	<span class="h-4 w-px bg-zinc-300 dark:bg-zinc-600"></span>
	<b>{options[currentIndex]}dB</b>
</button>
