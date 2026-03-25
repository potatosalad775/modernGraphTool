<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import FRSmoother from '$lib/utils/fr-smoother.js';

	const options = ['1/48', '1/24', '1/12', '1/6', '1/3'] as const;
	let currentIndex = $state(0);

	function handleClick() {
		currentIndex = (currentIndex + 1) % options.length;
		FRSmoother.updateSmoothing(options[currentIndex]);
		dataProvider.reSmoothAll();
	}
</script>

<button
	onclick={handleClick}
	class="flex h-10 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
	{m.smoothing_button_label()}
	<span class="h-4 w-px bg-separator"></span>
	<b>{options[currentIndex]}oct</b>
</button>
