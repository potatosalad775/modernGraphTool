<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

	let config = $derived(configEditor.config);
</script>

<AccordionSection
	id="section-cross-site-search"
	title="Cross-Site Search"
	description="Let visitors search other measurement databases from your search box. Works on any host."
	learnMoreHref="./features/cross-site-search"
>
	<Checkbox bind:checked={config.CROSS_SITE_SEARCH.ENABLED} label="Enabled" />

	<div class="ceFieldGroup">
		<span class="ceLabel">
			Index URLs
			<span class="ceLabelHint">tried in order — empty uses the official index</span>
		</span>
		<StringArrayEditor
			bind:items={config.CROSS_SITE_SEARCH.INDEX_URLS}
			placeholder="https://example.com/aggregate-index.json"
			addLabel="Add URL"
		/>
	</div>
</AccordionSection>
