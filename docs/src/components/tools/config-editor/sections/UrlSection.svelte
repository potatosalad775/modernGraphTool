<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

	let config = $derived(configEditor.config);
</script>

<AccordionSection
	id="section-url"
	title="URL"
	description="Controls whether the URL auto-updates with selected devices/targets and whether it's compressed."
	learnMoreHref="./guide-for-admins/customize-page#url"
>
	<Checkbox
		bind:checked={config.URL.AUTO_UPDATE_URL}
		label="Auto-update URL"
		hint="update the URL when phones or targets change"
	/>

	<Checkbox
		bind:checked={config.URL.COMPRESS_URL}
		label="Compress URL"
		hint="uses Base62 encoding"
	/>
</AccordionSection>
