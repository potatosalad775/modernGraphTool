<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import WatermarkItemEditor from './WatermarkItemEditor.svelte';
	import type { WatermarkFormState } from '../../../../utils/configDefaults';

	let watermarks = $derived(configEditor.config.WATERMARK);

	function addItem() {
		watermarks.push({
			TYPE: 'TEXT',
			CONTENT: '',
			LOCATION: 'BOTTOM_RIGHT',
			SIZE: '14px',
			FONT_FAMILY: 'sans-serif',
			FONT_WEIGHT: '600'
		} satisfies WatermarkFormState);
	}
</script>

<AccordionSection
	id="section-watermark"
	title="Watermark"
	description="Graph watermarks (text or images). Multiple watermarks can be displayed simultaneously."
	learnMoreHref="./guide-for-admins/customize-page#watermark"
>
	{#each watermarks as _, i (i)}
		<WatermarkItemEditor
			bind:item={watermarks[i]}
			index={i}
			onRemove={() => watermarks.splice(i, 1)}
		/>
	{/each}
	<button type="button" class="ceArrayAddBtn" onclick={addItem}>+ Add watermark</button>
</AccordionSection>
