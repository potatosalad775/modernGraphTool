<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	/**
	 * `min` only constrains the spinner arrows — a cleared or pasted field still
	 * reaches the handler, and whatever lands in state is what gets written to
	 * `config.js`. Clamp here so the generated file can't carry a zero.
	 */
	const clampBandCount = (raw: number) => (Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 8);

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-equalizer"
	title="Equalizer"
	description="Defaults for the Equalizer panel."
	learnMoreHref="./guide-for-admins/customize-page#equalizer"
	optional
	bind:enabled={config.EQUALIZER_ENABLED}
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-band-count">
			AutoEQ Default Band Count
			<span class="ceLabelHint">when the filter list is empty</span>
		</label>
		<input
			id="{id}-band-count"
			type="number"
			class="ceNumberInline"
			value={config.EQUALIZER?.AUTOEQ_DEFAULT_BAND_COUNT ?? 8}
			oninput={(e) =>
				(config.EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT = clampBandCount(
					e.currentTarget.valueAsNumber
				))}
			min="1"
			step="1"
		/>
	</div>
	<div class="ceSectionDescription">
		How many filter bands <strong>Run AutoEQ</strong> generates when the user has not added any. A non-empty
		filter list always wins, so users can still pick a count by adding or removing bands before running.
		The active constraint preset's band cap still applies.
	</div>
</AccordionSection>
