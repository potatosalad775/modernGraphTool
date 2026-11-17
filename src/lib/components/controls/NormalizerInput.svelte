<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { graphStore } from '#lib/stores/graph-store.svelte.js';
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import Button from '../atoms/Button.svelte';
	import { parseBounded } from '#lib/utils/number-field.js';

	function onNormTypeChange(value: 'Hz' | 'Avg') {
		graphStore.normType = value;
		dataProvider.renormalizeAll();
	}

	/**
	 * Commits on `change`, not per keystroke: typing `1000` would otherwise renormalize at 1, 10 and
	 * 100 Hz on the way, and an emptied box would store 0. Text that isn't a number is dropped and
	 * the box shows the stored value again — the `value` attribute alone wouldn't redraw when the
	 * stored number is unchanged.
	 */
	function onHzValueChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const v = parseBounded(input.value, 20, 20000, true);
		if (v !== null && v !== graphStore.normHzValue) {
			graphStore.normHzValue = v;
			dataProvider.renormalizeAll();
		}
		input.value = String(graphStore.normHzValue);
	}
</script>

<!-- Height/type match the `toolbar` Button size — see --toolbar-height in layout.css -->
<div
	class="flex h-(--toolbar-height) items-center rounded-md text-xs font-medium ring ring-base-content/20 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent"
>
	<!--
		Segmented Hz/Avg toggle. Kept as two Buttons with aria-pressed rather than the
		SegmentedControl atom: that one draws its own border and square joined items inside this
		wrapper's ring, and its items carry a native `title` where these show the translated tooltip.
	-->
	<div
		role="group"
		aria-label={m.normalizer_input_label()}
		class="flex h-full items-center gap-0.5 p-0.5"
	>
		<Button
			label={m.normalizer_input_avg_btn()}
			hint={m.normalizer_input_avg_title()}
			variant={graphStore.normType === 'Avg' ? 'primary' : 'ghost'}
			aria-pressed={graphStore.normType === 'Avg'}
			class="h-full rounded-sm px-2.5 text-xs"
			onclick={() => onNormTypeChange('Avg')}
		/>
		<Button
			label={m.normalizer_input_hz_btn()}
			hint={m.normalizer_input_hz_title()}
			variant={graphStore.normType === 'Hz' ? 'primary' : 'ghost'}
			aria-pressed={graphStore.normType === 'Hz'}
			class="h-full rounded-sm px-2.5 text-xs"
			onclick={() => onNormTypeChange('Hz')}
		/>
	</div>
	<span class="h-5 w-px bg-base-content/20"></span>
	<!-- Frequency value input -->
	<input
		type="number"
		min="20"
		max="20000"
		step="1"
		value={graphStore.normHzValue}
		aria-label={m.normalizer_input_hz_label()}
		disabled={graphStore.normType === 'Avg'}
		onchange={onHzValueChange}
		class="h-full w-16 bg-transparent px-2 text-center tabular-nums focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-40"
	/>
</div>
