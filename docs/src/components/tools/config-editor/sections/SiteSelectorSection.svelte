<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();

	/** `ENABLED` is `'auto' | boolean`, so the option values round-trip through strings. */
	function setEnabled(raw: string) {
		config.SITE_SELECTOR.ENABLED = raw === 'auto' ? 'auto' : raw === 'true';
	}
</script>

<AccordionSection
	id="section-site-selector"
	title="Site Selector"
	description="Top-bar dropdown for switching between measurement databases across sites."
	learnMoreHref="./features/site-selector"
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-visibility">
			Visibility
			<span class="ceLabelHint">auto shows it only when this site is listed in the index</span>
		</label>
		<select
			id="{id}-visibility"
			class="ceSelect"
			value={String(config.SITE_SELECTOR.ENABLED)}
			onchange={(e) => setEnabled(e.currentTarget.value)}
		>
			<option value="auto">Auto</option>
			<option value="true">Always show</option>
			<option value="false">Never show</option>
		</select>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">
			Index URLs
			<span class="ceLabelHint">tried in order — empty uses the official index</span>
		</span>
		<StringArrayEditor
			bind:items={config.SITE_SELECTOR.INDEX_URLS}
			placeholder="https://example.com/db-site-index.json"
			addLabel="Add URL"
		/>
	</div>
</AccordionSection>
