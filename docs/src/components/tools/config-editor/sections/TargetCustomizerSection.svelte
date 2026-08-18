<script lang="ts">
	import Icon from '../../shared/Icon.svelte';
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';

	const FILTER_TYPES = ['TILT', 'LSQ', 'HSQ', 'PK'];

	let config = $derived(configEditor.config);
	let tc = $derived(config.TARGET_CUSTOMIZER);
	let filters = $derived(tc.FILTERS);
	const id = $props.id();

	/**
	 * `description` is optional and must disappear from the emitted config when
	 * blanked, not persist as `description: ''` — `configConverter` writes back
	 * whatever key is present.
	 */
	function setDescription(index: number, value: string) {
		if (value) {
			filters[index].description = value;
		} else {
			delete filters[index].description;
		}
	}

	/** Gain of `''` means "this preset does not touch this filter", so drop the key. */
	function setGain(filterObj: Record<string, number>, filterId: string, raw: string) {
		if (raw === '') {
			delete filterObj[filterId];
		} else {
			filterObj[filterId] = Number(raw);
		}
	}
</script>

<!--
	Shared by the preset and initial-filter cards. The React version declared
	this as a component inside the section body, which gave it a fresh identity
	on every render and made each keystroke remount the inputs; a snippet has no
	such problem.
-->
{#snippet filterGainEditor(filterObj: Record<string, number>, scope: string)}
	<div class="ceCardGrid">
		{#each filters as f (f.id)}
			<div style="display: flex; align-items: center; gap: 0.375rem;">
				<label style="font-size: 0.75rem; min-width: 40px;" for="{scope}-gain-{f.id}">
					{f.name || f.id}
				</label>
				<input
					id="{scope}-gain-{f.id}"
					type="number"
					class="ceInput ceInputSmall"
					value={filterObj[f.id] ?? ''}
					oninput={(e) => setGain(filterObj, f.id, e.currentTarget.value)}
					placeholder="0"
					step={f.type === 'TILT' ? 0.1 : 0.5}
					style="width: 80px;"
				/>
			</div>
		{/each}
	</div>
{/snippet}

<AccordionSection
	id="section-target-customizer"
	title="Target Customizer"
	description="Per-target filter adjustments for specified target curves. Define available filters, presets, and initial filter values."
	learnMoreHref="./guide-for-admins/customize-page#target_customizer"
	optional
	bind:enabled={config.TARGET_CUSTOMIZER_ENABLED}
>
	<!-- Customizable Targets -->
	<div class="ceFieldGroup">
		<span class="ceLabel">Customizable Targets</span>
		<StringArrayEditor
			bind:items={tc.CUSTOMIZABLE_TARGETS}
			placeholder="Target file name"
			addLabel="Add target"
		/>
	</div>

	<!-- Filters -->
	<div class="ceSubSection">
		<div class="ceSubSectionTitle">Filters</div>
		{#each filters as f, i (i)}
			<div class="ceCard">
				<div class="ceCardHeader">
					<span class="ceCardTitle">{f.name || `Filter #${i + 1}`}</span>
					<button
						type="button"
						class="ceBtn ceBtnSmall ceBtnDanger"
						onclick={() => filters.splice(i, 1)}
					>
						Remove
					</button>
				</div>
				<div class="ceCardGrid">
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-f{i}-id">ID</label>
						<input
							id="{id}-f{i}-id"
							type="text"
							class="ceInput ceInputSmall"
							bind:value={f.id}
							placeholder="tilt"
						/>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-f{i}-name">Name</label>
						<input
							id="{id}-f{i}-name"
							type="text"
							class="ceInput ceInputSmall"
							bind:value={f.name}
							placeholder="Tilt"
						/>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-f{i}-type">Type</label>
						<select id="{id}-f{i}-type" class="ceSelect" bind:value={f.type}>
							{#each FILTER_TYPES as t (t)}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-f{i}-freq">Freq (Hz)</label>
						<input
							id="{id}-f{i}-freq"
							type="number"
							class="ceInput ceInputSmall"
							bind:value={f.freq}
							min="0"
						/>
					</div>
					<div class="ceFieldGroup">
						<label class="ceLabel" for="{id}-f{i}-q">Q</label>
						<input
							id="{id}-f{i}-q"
							type="number"
							class="ceInput ceInputSmall"
							bind:value={f.q}
							min="0"
							step="0.001"
						/>
					</div>
				</div>
				<div class="ceFieldGroup">
					<label class="ceLabel" for="{id}-f{i}-desc">
						Description
						<span class="ceLabelHint">optional</span>
					</label>
					<input
						id="{id}-f{i}-desc"
						type="text"
						class="ceInput"
						value={f.description ?? ''}
						oninput={(e) => setDescription(i, e.currentTarget.value)}
						placeholder="Bass Filter from Harman MoA 2025 study"
					/>
				</div>
			</div>
		{/each}
		<button
			type="button"
			class="ceArrayAddBtn"
			onclick={() => filters.push({ id: '', name: '', type: 'PK', freq: 0, q: 0 })}
		>
			<Icon name="plus" />
			Add filter
		</button>
	</div>

	<!-- Filter Presets -->
	<div class="ceSubSection">
		<div class="ceSubSectionTitle">Filter Presets</div>
		{#each tc.FILTER_PRESET as p, i (i)}
			<div class="ceCard">
				<div class="ceCardHeader">
					<span class="ceCardTitle">{p.name || `Preset #${i + 1}`}</span>
					<button
						type="button"
						class="ceBtn ceBtnSmall ceBtnDanger"
						onclick={() => tc.FILTER_PRESET.splice(i, 1)}
					>
						Remove
					</button>
				</div>
				<div class="ceFieldGroup">
					<label class="ceLabel" for="{id}-p{i}-name">Name</label>
					<input
						id="{id}-p{i}-name"
						type="text"
						class="ceInput"
						bind:value={p.name}
						placeholder="Harman 2018"
					/>
				</div>
				<div class="ceFieldGroup">
					<span class="ceLabel">Gain Values</span>
					{@render filterGainEditor(p.filter, `${id}-p${i}`)}
				</div>
			</div>
		{/each}
		<button
			type="button"
			class="ceArrayAddBtn"
			onclick={() => tc.FILTER_PRESET.push({ name: '', filter: {} })}
		>
			<Icon name="plus" />
			Add preset
		</button>
	</div>

	<!-- Initial Target Filters -->
	<div class="ceSubSection">
		<div class="ceSubSectionTitle">Initial Target Filters</div>
		{#each tc.INITIAL_TARGET_FILTERS as entry, i (i)}
			<div class="ceCard">
				<div class="ceCardHeader">
					<span class="ceCardTitle">{entry.name || `Entry #${i + 1}`}</span>
					<button
						type="button"
						class="ceBtn ceBtnSmall ceBtnDanger"
						onclick={() => tc.INITIAL_TARGET_FILTERS.splice(i, 1)}
					>
						Remove
					</button>
				</div>
				<div class="ceFieldGroup">
					<label class="ceLabel" for="{id}-i{i}-name">Target Name</label>
					<input
						id="{id}-i{i}-name"
						type="text"
						class="ceInput"
						bind:value={entry.name}
						placeholder="KEMAR DF (KB006x)"
					/>
				</div>
				<div class="ceFieldGroup">
					<span class="ceLabel">Filter Values</span>
					{@render filterGainEditor(entry.filter, `${id}-i${i}`)}
				</div>
			</div>
		{/each}
		<button
			type="button"
			class="ceArrayAddBtn"
			onclick={() => tc.INITIAL_TARGET_FILTERS.push({ name: '', filter: {} })}
		>
			<Icon name="plus" />
			Add initial filter
		</button>
	</div>
</AccordionSection>
