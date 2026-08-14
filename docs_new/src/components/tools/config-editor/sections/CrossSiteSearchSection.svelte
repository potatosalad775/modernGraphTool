<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-cross-site-search"
	title="Cross-Site Search"
	description="Let visitors search other measurement databases from your search box. Works on any host."
	learnMoreHref="./features/cross-site-search"
>
	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.CROSS_SITE_SEARCH.ENABLED}
			id="{id}-enabled"
		/>
		<label for="{id}-enabled" class="ceToggleLabel">Enabled</label>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">
			Index URLs
			<span class="ceLabelHint">tried in order — empty uses the official index</span>
		</span>
		<StringArrayEditor
			bind:items={config.CROSS_SITE_SEARCH.INDEX_URLS}
			placeholder="https://example.com/aggregate-index.json"
			addLabel="+ Add URL"
		/>
	</div>
</AccordionSection>
