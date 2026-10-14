<script lang="ts">
	import Icon from '../../shared/Icon.svelte';
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

	let config = $derived(configEditor.config);
	let bounds = $derived(config.PREFERENCE_BOUND.BOUND_LIST);
	const id = $props.id();
</script>

<AccordionSection
	id="section-preference-bound"
	title="Preference Bound"
	description="Draws a shaded upper/lower preference bound area on the graph, picked from a row in the target list. Each bound pairs a base target with bound files in the data/ folder."
	learnMoreHref="./guide-for-admins/customize-page#preference_bound"
	optional
	bind:enabled={config.PREFERENCE_BOUND_ENABLED}
>
	<Checkbox
		bind:checked={config.PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD}
		label="Show the first bound on initial load"
	/>

	<div class="ceSubSection">
		<div class="ceSubSectionTitle">Bounds</div>
		{#each bounds as b, i (i)}
			<div class="ceCard">
				<div class="ceCardHeader">
					<span class="ceCardTitle">{b.name || b.target || `Bound #${i + 1}`}</span>
					<button
						type="button"
						class="ceBtn ceBtnSmall ceBtnDanger"
						onclick={() => bounds.splice(i, 1)}
					>
						Remove
					</button>
				</div>
				<div class="ceCardGrid">
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-b{i}-target">Base Target</label>
						<input
							id="{id}-b{i}-target"
							type="text"
							class="ceInput ceInputSmall"
							bind:value={b.target}
							placeholder="KEMAR DF (KB006x)"
						/>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-b{i}-name">
							Name
							<span class="ceLabelHint">optional</span>
						</label>
						<input
							id="{id}-b{i}-name"
							type="text"
							class="ceInput ceInputSmall"
							bind:value={b.name}
							placeholder={b.target.replace(/ Target$/, '') || 'Defaults to the target'}
						/>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-b{i}-upper">
							Upper Bound File
							<span class="ceLabelHint">optional</span>
						</label>
						<input
							id="{id}-b{i}-upper"
							type="text"
							class="ceInput ceInputSmall"
							bind:value={b.upper}
							placeholder="Bounds U.txt"
						/>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-b{i}-lower">
							Lower Bound File
							<span class="ceLabelHint">optional</span>
						</label>
						<input
							id="{id}-b{i}-lower"
							type="text"
							class="ceInput ceInputSmall"
							bind:value={b.lower}
							placeholder="Bounds D.txt"
						/>
					</div>
				</div>
			</div>
		{/each}
		<button
			type="button"
			class="ceArrayAddBtn"
			onclick={() => bounds.push({ name: '', target: '', upper: '', lower: '' })}
		>
			<Icon name="plus" />
			Add bound
		</button>
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
