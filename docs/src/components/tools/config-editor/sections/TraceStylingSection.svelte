<script lang="ts">
	import Icon from '../../shared/Icon.svelte';
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	let dashes = $derived(config.TRACE_STYLING.TARGET_TRACE_DASH);
	const id = $props.id();
</script>

<AccordionSection
	id="section-trace-styling"
	title="Trace Styling"
	description="Line thickness and dash patterns for graph traces. Per-target dash values follow the SVG stroke-dasharray format."
	learnMoreHref="./guide-for-admins/customize-page#trace_styling"
>
	<div class="ceCardGrid">
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-phone-thickness">Phone Trace Thickness</label>
			<input
				id="{id}-phone-thickness"
				type="number"
				class="ceInput ceInputSmall"
				bind:value={config.TRACE_STYLING.PHONE_TRACE_THICKNESS}
				min="0.5"
				max="10"
				step="0.5"
			/>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-target-thickness">Target Trace Thickness</label>
			<input
				id="{id}-target-thickness"
				type="number"
				class="ceInput ceInputSmall"
				bind:value={config.TRACE_STYLING.TARGET_TRACE_THICKNESS}
				min="0.5"
				max="10"
				step="0.5"
			/>
		</div>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">Target Trace Dash Patterns</span>
		<div class="ceArrayList">
			{#each dashes as dash, i (i)}
				<div class="ceArrayItem">
					<input
						type="text"
						class="ceInput"
						bind:value={dash.name}
						placeholder="Target name"
						aria-label="Target name {i + 1}"
						style="flex: 1;"
					/>
					<input
						type="text"
						class="ceInput ceInputSmall"
						bind:value={dash.dash}
						placeholder="10 10"
						aria-label="Dash pattern {i + 1}"
						style="width: 100px;"
					/>
					<button
						type="button"
						class="ceArrayRemoveBtn"
						onclick={() => dashes.splice(i, 1)}
						aria-label="Remove dash pattern {i + 1}"
					>
						<Icon name="close" />
					</button>
				</div>
			{/each}
		</div>
		<button type="button" class="ceArrayAddBtn" onclick={() => dashes.push({ name: '', dash: '' })}>
			<Icon name="plus" />
			Add dash pattern
		</button>
	</div>
</AccordionSection>
