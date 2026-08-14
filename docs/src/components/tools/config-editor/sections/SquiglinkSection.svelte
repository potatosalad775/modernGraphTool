<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();

	const TOGGLES = [
		{ key: 'LOG_ANALYTICS', label: 'Log analytics events' },
		{ key: 'ENABLE_ANALYTICS', label: 'Enable analytics' },
		{ key: 'ENABLE_CROSS_SITE_SEARCH', label: 'Enable cross-site search' },
		{ key: 'ENABLE_SPONSOR', label: 'Enable sponsor features' }
	] as const;
</script>

<AccordionSection
	id="section-squiglink"
	title="squig.link Integration"
	description="squig.link network integration. These features are only active on *.squig.link domains."
	learnMoreHref="./guide-for-admins/customize-page#squiglink"
	optional
	bind:enabled={config.SQUIGLINK_ENABLED}
>
	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.SQUIGLINK.ENABLED}
			id="{id}-enabled"
		/>
		<label for="{id}-enabled" class="ceToggleLabel">Enabled</label>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">Analytics Measurement IDs</span>
		<StringArrayEditor
			bind:items={config.SQUIGLINK.ANALYTICS_MEASUREMENT_IDS}
			placeholder="G-XXXXXXXXXX"
			addLabel="+ Add ID"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-site">Analytics Site</label>
		<input
			id="{id}-site"
			type="text"
			class="ceInput"
			bind:value={config.SQUIGLINK.ANALYTICS_SITE}
			placeholder="Site name for analytics attribution"
		/>
	</div>

	{#each TOGGLES as { key, label } (key)}
		<div class="ceToggleRow">
			<input
				type="checkbox"
				class="ceCheckbox"
				bind:checked={config.SQUIGLINK[key]}
				id="{id}-{key}"
			/>
			<label for="{id}-{key}" class="ceToggleLabel">{label}</label>
		</div>
	{/each}
</AccordionSection>
