<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import Button from '../atoms/Button.svelte';

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

<Button
	title={m.y_axis_scale_button_label()}
	onclick={handleClick}
	variant="outline"
	class="h-9! px-3! gap-1.5"
>
	{m.y_axis_scale_button_label()}
	<span class="h-5 w-px bg-base-content/20"></span>
	<b>{options[currentIndex]}dB</b>
</Button>
