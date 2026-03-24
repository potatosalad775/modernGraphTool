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
	class="flex h-10 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
>
	{m.smoothing_button_label()}
	<span class="h-4 w-px bg-zinc-300 dark:bg-zinc-600"></span>
	<b>{options[currentIndex]}oct</b>
</button>
