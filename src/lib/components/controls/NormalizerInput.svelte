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

<div class="normalizer-input flex flex-row flex-wrap items-center gap-2 text-sm text-base-content/60">
	<label class="flex items-center gap-2">
		{m.normalizer_input_label()}
		<gt-divider></gt-divider>
		<input
			type="number"
			min="20"
			max="20000"
			step="1"
			value={graphStore.normHzValue}
			disabled={graphStore.normType === 'Avg'}
			onchange={onHzValueChange}
			class="w-20 rounded border border-base-content/20 px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-accent"
		/>
	</label>

	<label class="flex cursor-pointer items-center gap-1">
		<input
			type="radio"
			name="normType"
			value="Hz"
			checked={graphStore.normType === 'Hz'}
			onchange={() => onNormTypeChange('Hz')}
		/>
		{m.normalizer_input_hz_btn()}
	</label>

	<label class="flex cursor-pointer items-center gap-1">
		<input
			type="radio"
			name="normType"
			value="Avg"
			checked={graphStore.normType === 'Avg'}
			onchange={() => onNormTypeChange('Avg')}
		/>
		{m.normalizer_input_avg_btn()}
	</label>
</div>
