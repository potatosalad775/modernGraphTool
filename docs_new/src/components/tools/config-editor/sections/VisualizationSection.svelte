<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import LabelConfigEditor from '../shared/LabelConfigEditor.svelte';

	const Y_SCALES = [30, 40, 50, 60, 80];
	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-visualization"
	title="Visualization"
	description="Graph display settings: aspect ratio, Y-axis scale, label positioning, and measurement rig description."
	learnMoreHref="./guide-for-admins/customize-page#visualization"
>
	<div class="ceCardGrid">
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-aspect">Aspect Ratio</label>
			<select id="{id}-aspect" class="ceSelect" bind:value={config.VISUALIZATION.ASPECT_RATIO}>
				<option value="16:9">16:9 (800 x 450)</option>
				<option value="CrinGraph">CrinGraph (800 x 346)</option>
			</select>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-yscale">Default Y Scale (dB)</label>
			<select id="{id}-yscale" class="ceSelect" bind:value={config.VISUALIZATION.DEFAULT_Y_SCALE}>
				{#each Y_SCALES as s (s)}
					<option value={s}>{s}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-rig">Rig Description</label>
		<input
			id="{id}-rig"
			type="text"
			class="ceInput"
			bind:value={config.VISUALIZATION.RIG_DESCRIPTION}
			placeholder="Measured with IEC 60318-4 (711)"
		/>
	</div>

	<LabelConfigEditor label="Phone/Target Label" bind:value={config.VISUALIZATION.LABEL} />

	<LabelConfigEditor label="Baseline Label" bind:value={config.VISUALIZATION.BASELINE_LABEL} />
</AccordionSection>
