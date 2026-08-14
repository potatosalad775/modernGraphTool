<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
</script>

<AccordionSection
	id="section-download"
	title="Download"
	description="Adds a per-curve download button to the selection list, exporting the curve exactly as displayed — smoothing, normalization, target adjustments and EQ included — as .txt files."
	learnMoreHref="./guide-for-admins/customize-page#download"
	optional
	bind:enabled={config.DOWNLOAD_ENABLED}
>
	<div class="ceSectionDescription">Nothing else to configure — toggling this on is enough.</div>
</AccordionSection>
