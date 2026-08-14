<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-path"
	title="Path"
	description="File paths for measurement data and phone book. Changing PHONE_BOOK path may break squig.link compatibility."
	learnMoreHref="./guide-for-admins/customize-page#path"
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-phone">Phone Measurement Path</label>
		<input
			id="{id}-phone"
			type="text"
			class="ceInput"
			bind:value={config.PATH.PHONE_MEASUREMENT}
			placeholder="./data/phones"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-target">Target Measurement Path</label>
		<input
			id="{id}-target"
			type="text"
			class="ceInput"
			bind:value={config.PATH.TARGET_MEASUREMENT}
			placeholder="./data/target"
		/>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-book">Phone Book Path</label>
		<input
			id="{id}-book"
			type="text"
			class="ceInput"
			bind:value={config.PATH.PHONE_BOOK}
			placeholder="./data/phone_book.json"
		/>
	</div>
</AccordionSection>
