<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import Button from '../atoms/Button.svelte';

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

<div class="flex h-9 items-center rounded-md ring ring-base-content/20 text-sm font-medium">
	<!-- Segmented Hz/Avg toggle -->
	<div class="flex h-full items-center p-0.5 gap-0.5">
		<Button
			title="Normalize at average"
			variant={graphStore.normType === 'Avg' ? 'primary' : 'ghost'}
			class="h-full rounded-sm px-2.5!"
			onclick={() => onNormTypeChange('Avg')}
		>
			{m.normalizer_input_avg_btn()}
		</Button>
		<Button
			title="Normalize at specific frequency"
			variant={graphStore.normType === 'Hz' ? 'primary' : 'ghost'}
			class="h-full rounded-sm px-2.5!"
			onclick={() => onNormTypeChange('Hz')}
		>
			{m.normalizer_input_hz_btn()}
		</Button>
	</div>
	<span class="h-5 w-px bg-base-content/20"></span>
	<!-- Frequency value input -->
	<input
		type="number"
		min="20"
		max="20000"
		step="1"
		value={graphStore.normHzValue}
		disabled={graphStore.normType === 'Avg'}
		oninput={onHzValueChange}
		class="h-full w-16 bg-transparent px-2 text-center tabular-nums focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
	/>
</div>
