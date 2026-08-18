<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

	type DisplayMode = 'avg' | 'curves' | 'fill';

	const MODES: Array<{ value: DisplayMode; label: string; hint: string }> = [
		{ value: 'avg', label: 'Averaged curve', hint: 'One line, the mean of every run' },
		{ value: 'curves', label: 'Individual runs', hint: 'One toggleable curve per run' },
		{ value: 'fill', label: 'Deviation fill', hint: 'Shaded min/max band across runs' }
	];

	/**
	 * The `min`/`max` attributes only constrain the spinner arrows — a cleared field
	 * or a pasted value still reaches the handler, and whatever lands in state is what
	 * gets written to `config.js`. Both numeric fields are clamped here instead.
	 */
	const clampCount = (raw: number) => (Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1);

	const clampOpacity = (raw: number) =>
		Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.3;

	let config = $derived(configEditor.config);
	let selected = $derived(config.SAMPLES?.DEFAULT_DISPLAY ?? ['avg']);
	const id = $props.id();

	/** Keeps the stored order canonical (avg, curves, fill) regardless of click order. */
	function toggle(mode: DisplayMode) {
		config.SAMPLES.DEFAULT_DISPLAY = selected.includes(mode)
			? selected.filter((m) => m !== mode)
			: MODES.map((m) => m.value).filter((m) => m === mode || selected.includes(m));
	}
</script>

<!--
	`SAMPLES` replaced the old `MULTI_SAMPLE` and `HPTF` sections. `display` is a
	set rather than an enum, so the control is checkboxes: "averaged curve plus a
	variance band" was one of the combinations neither old section could express.
-->
<AccordionSection
	id="section-samples"
	title="Sample Sets"
	description="Defaults for variants measured more than once — repeat runs, seating positions, one measurement per ear pad."
	learnMoreHref="./guide-for-admins/customize-page#samples"
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-default-count">
			Default Run Count
			<span class="ceLabelHint">when a variant declares none</span>
		</label>
		<input
			id="{id}-default-count"
			type="number"
			class="ceNumberInline"
			value={config.SAMPLES?.DEFAULT_COUNT ?? 1}
			oninput={(e) => (config.SAMPLES.DEFAULT_COUNT = clampCount(e.currentTarget.valueAsNumber))}
			min="1"
			step="1"
		/>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">Default Display</span>
		{#each MODES as mode (mode.value)}
			<Checkbox
				checked={selected.includes(mode.value)}
				onCheckedChange={() => toggle(mode.value)}
				label={mode.label}
				hint={mode.hint}
			/>
		{/each}
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-fill-opacity">
			Fill Opacity
			<span class="ceLabelHint">0 - 1</span>
		</label>
		<div class="ceRangeRow">
			<input
				id="{id}-fill-opacity-range"
				type="range"
				class="ceRange"
				min="0"
				max="1"
				step="0.05"
				value={config.SAMPLES?.FILL_OPACITY ?? 0.3}
				oninput={(e) => (config.SAMPLES.FILL_OPACITY = clampOpacity(e.currentTarget.valueAsNumber))}
				aria-label="Fill Opacity"
			/>
			<input
				id="{id}-fill-opacity"
				type="number"
				class="ceNumberInline"
				value={config.SAMPLES?.FILL_OPACITY ?? 0.3}
				oninput={(e) => (config.SAMPLES.FILL_OPACITY = clampOpacity(e.currentTarget.valueAsNumber))}
				min="0"
				max="1"
				step="0.05"
			/>
		</div>
	</div>
</AccordionSection>
