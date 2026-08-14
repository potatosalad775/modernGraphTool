<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-preference-bound"
	title="Preference Bound"
	description="Draws a shaded upper/lower preference bound area on the graph. Requires Bounds U.txt / Bounds D.txt in the data/ folder."
	learnMoreHref="./guide-for-admins/customize-page#preference_bound"
	optional
	bind:enabled={config.PREFERENCE_BOUND_ENABLED}
>
	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD}
			id="{id}-initial"
		/>
		<label for="{id}-initial" class="ceToggleLabel">Show bounds on initial load</label>
	</div>

	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-base-df">Base DF Target File</label>
		<input
			id="{id}-base-df"
			type="text"
			class="ceInput"
			bind:value={config.PREFERENCE_BOUND.BASE_DF_TARGET_FILE}
			placeholder="KEMAR DF (KB006x) Target"
		/>
	</div>

	<div class="ceCardGrid">
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-fill">Fill Color</label>
			<input
				id="{id}-fill"
				type="text"
				class="ceInput"
				bind:value={config.PREFERENCE_BOUND.COLOR_FILL}
				placeholder="rgba(180,180,180,0.2)"
			/>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-border">Border Color</label>
			<input
				id="{id}-border"
				type="text"
				class="ceInput"
				bind:value={config.PREFERENCE_BOUND.COLOR_BORDER}
				placeholder="rgba(120,120,120,0.5)"
			/>
		</div>
	</div>
</AccordionSection>
