<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import Button from '../atoms/Button.svelte';

	const options = ['1/48', '1/24', '1/12', '1/6', '1/3'] as const;
	let currentIndex = $state(0);

	function handleClick() {
		currentIndex = (currentIndex + 1) % options.length;
		graphStore.smoothValue = options[currentIndex];
		dataProvider.reSmoothAll();
	}
</script>

<Button
	title={m.smoothing_button_label()}
	onclick={handleClick}
	variant="outline"
	class="h-9! px-3! gap-1.5"
>
	{m.smoothing_button_label()}
	<span class="h-5 w-px bg-base-content/20"></span>
	<b>{options[currentIndex]}oct</b>
</Button>
