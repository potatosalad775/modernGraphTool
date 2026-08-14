<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-url"
	title="URL"
	description="Controls whether the URL auto-updates with selected devices/targets and whether it's compressed."
	learnMoreHref="./guide-for-admins/customize-page#url"
>
	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.URL.AUTO_UPDATE_URL}
			id="{id}-auto-update"
		/>
		<label for="{id}-auto-update" class="ceToggleLabel">
			Auto-update URL
			<span class="ceToggleHint">Update URL when phones/targets change</span>
		</label>
	</div>

	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.URL.COMPRESS_URL}
			id="{id}-compress"
		/>
		<label for="{id}-compress" class="ceToggleLabel">
			Compress URL
			<span class="ceToggleHint">Uses Base62 encoding</span>
		</label>
	</div>
</AccordionSection>
