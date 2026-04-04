<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';

	function onNormTypeChange(value: 'Hz' | 'Avg') {
		graphStore.normType = value;
		dataProvider.renormalizeAll();
	}

	function onHzValueChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		graphStore.normHzValue = Number(input.value);
		dataProvider.renormalizeAll();
	}
</script>

<div class="flex h-10 items-center rounded-md border border-base-content/20 text-sm font-medium text-base-content/60">
	<!-- Segmented Hz/Avg toggle -->
	<div class="flex h-full items-center">
		<button
			type="button"
			class="h-full rounded-l-md px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent {graphStore.normType === 'Hz' ? 'bg-accent text-accent-content' : 'hover:bg-base-300'}"
			onclick={() => onNormTypeChange('Hz')}
		>
			{m.normalizer_input_hz_btn()}
		</button>
		<button
			type="button"
			class="h-full rounded-r-md border-l border-base-content/20 px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent {graphStore.normType === 'Avg' ? 'bg-accent text-accent-content' : 'hover:bg-base-300'}"
			onclick={() => onNormTypeChange('Avg')}
		>
			{m.normalizer_input_avg_btn()}
		</button>
	</div>
	<span class="h-4 w-px bg-base-content/20"></span>
	<!-- Frequency value input -->
	<input
		type="number"
		min="20"
		max="20000"
		step="1"
		value={graphStore.normHzValue}
		disabled={graphStore.normType === 'Avg'}
		onchange={onHzValueChange}
		class="h-full w-16 bg-transparent px-2 text-center tabular-nums focus:outline-none disabled:opacity-40"
	/>
</div>
