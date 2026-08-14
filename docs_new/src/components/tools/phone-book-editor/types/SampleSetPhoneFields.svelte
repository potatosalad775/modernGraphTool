<script lang="ts">
	import {
		emptyVariant,
		type PhoneState,
		type SampleDisplayMode,
		type VariantEntry
	} from '../../../../utils/phoneBookConverter';
	import RowsEditor from '../shared/RowsEditor.svelte';

	interface Props {
		phone: PhoneState;
	}

	let { phone = $bindable() }: Props = $props();

	const id = $props.id();

	const DISPLAY_MODES: Array<{ value: SampleDisplayMode; label: string; hint: string }> = [
		{ value: 'avg', label: 'Averaged curve', hint: 'the mean of every run' },
		{ value: 'curves', label: 'Individual runs', hint: 'one toggleable curve per run' },
		{ value: 'fill', label: 'Deviation fill', hint: 'shaded min/max band' }
	];

	$effect(() => {
		phone.sampleSet ??= { name: '', variants: [emptyVariant()] };
	});

	/** Keeps the stored order canonical (avg, curves, fill) regardless of click order. */
	function toggleMode(variant: VariantEntry, mode: SampleDisplayMode) {
		variant.display = variant.display.includes(mode)
			? variant.display.filter((m) => m !== mode)
			: DISPLAY_MODES.map((m) => m.value).filter((m) => m === mode || variant.display.includes(m));
	}

	/*
	 * `rows` is what decides the mode on export, so `count` goes unused while
	 * named — keeping it means toggling the box twice doesn't silently rewrite
	 * the count the user entered.
	 */
	function setNamed(variant: VariantEntry, named: boolean) {
		if (named) {
			variant.rows = [
				{ file: '', label: '' },
				{ file: '', label: '' }
			];
		} else {
			variant.rows = [];
			variant.count = Math.max(variant.count, 2);
		}
	}

	function variantTitle(variant: VariantEntry, index: number, total: number) {
		if (total <= 1) return 'Variant';
		return `Variant ${index + 1}${variant.suffix ? ` — ${variant.suffix}` : ''}`;
	}
</script>

{#if phone.sampleSet}
	{@const set = phone.sampleSet}
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-name">Display Name</label>
		<input
			id="{id}-name"
			type="text"
			class="ceInput"
			bind:value={set.name}
			placeholder="e.g. HD 600"
		/>
	</div>

	{#each set.variants as variant, index (index)}
		{@const named = variant.rows.length > 0}
		<div class="pbVariantEntry">
			<div class="pbVariantEntryHeader">
				<span class="pbVariantEntryTitle">
					{variantTitle(variant, index, set.variants.length)}
				</span>
				<button
					type="button"
					class="ceArrayRemoveBtn"
					onclick={() => set.variants.splice(index, 1)}
					title="Remove variant"
					disabled={set.variants.length <= 1}
				>
					&times;
				</button>
			</div>

			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-{index}-suffix">
					Variant Suffix
					<span class="ceLabelHint">
						(optional — shown in the device variant selector, e.g. "Leather Pad")
					</span>
				</label>
				<input
					id="{id}-{index}-suffix"
					type="text"
					class="ceInput"
					bind:value={variant.suffix}
					placeholder="e.g. Leather Pad"
				/>
			</div>

			<div class="ceToggleRow">
				<input
					type="checkbox"
					class="ceCheckbox"
					id="{id}-{index}-named"
					checked={named}
					onchange={(e) => setNamed(variant, e.currentTarget.checked)}
				/>
				<label class="ceToggleLabel" for="{id}-{index}-named">
					Name each run's file
					<span class="ceToggleHint">
						(uncheck for the numbered <code>L1/L2/L3</code> layout)
					</span>
				</label>
			</div>

			{#if named}
				<div class="ceFieldGroup">
					<span class="ceLabel">
						Runs
						<span class="ceLabelHint">
							(each loads <code>{'{name}'} L.txt</code> / <code>{'{name}'} R.txt</code>)
						</span>
					</span>
					<RowsEditor
						bind:rows={variant.rows}
						columns={[
							{ key: 'file', label: 'File base name', placeholder: 'HpTF Demo Center' },
							{ key: 'label', label: 'UI label', placeholder: 'Center' }
						]}
						createEmpty={() => ({ file: '', label: '' })}
						minRows={2}
						addLabel="+ Add run"
					/>
				</div>
			{:else}
				<div class="ceFieldGroup">
					<label class="ceLabel" for="{id}-{index}-file">File Base Name</label>
					<input
						id="{id}-{index}-file"
						type="text"
						class="ceInput"
						bind:value={variant.file}
						placeholder="e.g. HD600 Stock"
					/>
				</div>
				<div class="ceFieldGroup">
					<label class="ceLabel" for="{id}-{index}-count">
						Number of Runs
						<span class="ceLabelHint">
							{#if variant.count > 0}
								(loads <code>{variant.file || 'File'} L1.txt … L{variant.count}.txt</code>)
							{:else}
								(0 — a plain <code>{variant.file || 'File'} L.txt</code> / <code>R.txt</code> pair)
							{/if}
						</span>
					</label>
					<input
						id="{id}-{index}-count"
						type="number"
						min="0"
						max="20"
						class="ceInput ceInputSmall"
						value={variant.count}
						oninput={(e) =>
							// `min`/`max` only bound the spinner arrows — a typed or pasted
							// number reaches state unclamped otherwise.
							(variant.count = Math.min(20, Math.max(0, e.currentTarget.valueAsNumber || 0)))}
					/>
				</div>
			{/if}

			{#if named || variant.count > 0}
				<div class="ceFieldGroup">
					<span class="ceLabel">
						Display
						<span class="ceLabelHint">(seeds the toggles; users can still change them)</span>
					</span>
					{#each DISPLAY_MODES as mode (mode.value)}
						<div class="ceToggleRow">
							<input
								type="checkbox"
								class="ceCheckbox"
								id="{id}-{index}-{mode.value}"
								checked={variant.display.includes(mode.value)}
								onchange={() => toggleMode(variant, mode.value)}
							/>
							<label class="ceToggleLabel" for="{id}-{index}-{mode.value}">
								{mode.label}
								<span class="ceToggleHint">({mode.hint})</span>
							</label>
						</div>
					{/each}
				</div>

				<div class="ceFieldGroup">
					<label class="ceLabel" for="{id}-{index}-desc">
						Description
						<span class="ceLabelHint">(shown beside the device name)</span>
					</label>
					<input
						id="{id}-{index}-desc"
						type="text"
						class="ceInput"
						bind:value={variant.description}
						placeholder="(Positional Variance)"
					/>
				</div>
			{/if}
		</div>
	{/each}

	<button type="button" class="ceArrayAddBtn" onclick={() => set.variants.push(emptyVariant())}>
		+ Add variant
	</button>
{/if}
