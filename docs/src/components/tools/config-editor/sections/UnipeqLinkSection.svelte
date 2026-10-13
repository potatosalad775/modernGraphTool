<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-unipeq-link"
	title="uniPEQ Link"
	description="“Link with uniPEQ” in the Equalizer panel: edit the EQ live with the uniPEQ app, which writes it to the device connected there. On by default."
	learnMoreHref="./guide-for-admins/customize-page#unipeq_link"
	optional
	bind:enabled={config.UNIPEQ_LINK_ENABLED}
>
	<Checkbox bind:checked={config.UNIPEQ_LINK.ENABLE} label="Show “Link with uniPEQ”" />
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-server">
			Link Server
			<span class="ceLabelHint">optional — leave empty for uniPEQ's own</span>
		</label>
		<input
			id="{id}-server"
			type="url"
			class="ceInput"
			placeholder="https://link.unipeq.com"
			value={config.UNIPEQ_LINK?.SERVER ?? ''}
			oninput={(e) => (config.UNIPEQ_LINK.SERVER = e.currentTarget.value)}
		/>
	</div>
	<div class="ceSectionDescription">
		A self-hosted copy of the
		<a href="https://github.com/potatosalad775/uniPEQ_link" target="_blank" rel="noopener"
			>uniPEQ_link</a
		>
		Worker. It only introduces the two apps; the EQ travels directly between them. On another server,
		the QR code and <strong>Open uniPEQ</strong> still work, but a code typed into uniPEQ won't find it,
		and the QR code opens a web page first rather than uniPEQ itself.
	</div>
</AccordionSection>
