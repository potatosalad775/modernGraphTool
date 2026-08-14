<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-normalization"
	title="Normalization"
	description="Default graph normalization method. Hz normalizes to a specific frequency; Avg uses the 300-3000 Hz midrange average."
	learnMoreHref="./guide-for-admins/customize-page#normalization"
>
	<div class="ceFieldGroup">
		<span class="ceLabel">Type</span>
		<div class="ceRadioGroup">
			<label class="ceRadioLabel">
				<input
					type="radio"
					class="ceRadio"
					name="{id}-type"
					value="Hz"
					bind:group={config.NORMALIZATION.TYPE}
				/>
				Hz (specific frequency)
			</label>
			<label class="ceRadioLabel">
				<input
					type="radio"
					class="ceRadio"
					name="{id}-type"
					value="Avg"
					bind:group={config.NORMALIZATION.TYPE}
				/>
				Avg (300-3000 Hz)
			</label>
		</div>
	</div>

	{#if config.NORMALIZATION.TYPE === 'Hz'}
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-hz">
				Frequency (Hz)
				<span class="ceLabelHint">20 - 20000</span>
			</label>
			<input
				id="{id}-hz"
				type="number"
				class="ceInput ceInputSmall"
				bind:value={config.NORMALIZATION.HZ_VALUE}
				min="20"
				max="20000"
			/>
		</div>
	{/if}
</AccordionSection>
