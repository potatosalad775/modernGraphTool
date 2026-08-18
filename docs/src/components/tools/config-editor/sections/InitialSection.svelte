<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';

	const PANELS = ['phone', 'graph', 'equalizer', 'misc'];
	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-initial"
	title="Initial Settings"
	description="Phones, targets, and panel displayed on initial page load. These are overridden by URL parameters if present."
	learnMoreHref="./guide-for-admins/customize-page#initial_phones"
	defaultOpen
>
	<div class="ceFieldGroup">
		<span class="ceLabel">Initial Phones</span>
		<StringArrayEditor
			bind:items={config.INITIAL_PHONES}
			placeholder="Brand Model (Suffix)"
			addLabel="Add phone"
		/>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">Initial Targets</span>
		<StringArrayEditor
			bind:items={config.INITIAL_TARGETS}
			placeholder="Target Name"
			addLabel="Add target"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-panel">Initial Panel</label>
		<select id="{id}-panel" class="ceSelect" bind:value={config.INITIAL_PANEL}>
			{#each PANELS as p (p)}
				<option value={p}>{p}</option>
			{/each}
		</select>
	</div>
</AccordionSection>
