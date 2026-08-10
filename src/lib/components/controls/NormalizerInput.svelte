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

<!-- Height/type match the `toolbar` Button size — see --toolbar-height in layout.css -->
<div
	class="flex h-(--toolbar-height) items-center rounded-md text-xs font-medium ring ring-base-content/20"
>
	<!-- Segmented Hz/Avg toggle -->
	<div class="flex h-full items-center gap-0.5 p-0.5">
		<Button
			title="Normalize at average"
			variant={graphStore.normType === 'Avg' ? 'primary' : 'ghost'}
			class="h-full rounded-sm px-2.5 text-xs"
			onclick={() => onNormTypeChange('Avg')}
		>
			{m.normalizer_input_avg_btn()}
		</Button>
		<Button
			title="Normalize at specific frequency"
			variant={graphStore.normType === 'Hz' ? 'primary' : 'ghost'}
			class="h-full rounded-sm px-2.5 text-xs"
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
		class="h-full w-16 bg-transparent px-2 text-center tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
	/>
</div>
