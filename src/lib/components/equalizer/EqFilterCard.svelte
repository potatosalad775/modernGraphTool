<script lang="ts">
	import { usesGain, type EQFilter } from '#lib/utils/equalizer.js';
	import { logToLinear, linearToLog } from '#lib/utils/log-scale.js';
	import { isImeComposing } from '#lib/utils/ime.js';
	import { ChevronDown, X } from '@lucide/svelte';
	import { slideOrFade } from '#lib/utils/motion.svelte.js';
	import * as m from '#lib/paraglide/messages.js';
	import Switch from '../atoms/Switch.svelte';
	import Button from '../atoms/Button.svelte';
	import SegmentedControl from '../atoms/SegmentedControl.svelte';
	import { eqConstraintsStore } from '#lib/stores/eq-constraints-store.svelte.js';
	import { eqStore } from '#lib/stores/eq-store.svelte.js';
	import { linkStore } from '#lib/stores/link-store.svelte.js';
	import { domainBounds, type Domain } from '@potatosalad775/eqcaps-core';
	import {
		appTypesOf,
		isPastMaxBands,
		projectFilter,
		slotOf,
		type FilterViolation
	} from '#lib/utils/eq-constraint.js';
	import { domainHint } from '#lib/utils/eq-domain-hint.js';

	let {
		filter,
		index,
		expanded,
		onToggle,
		onUpdate,
		onRemove
	}: {
		filter: EQFilter;
		index: number;
		expanded: boolean;
		onToggle: () => void;
		onUpdate: (partial: Partial<EQFilter>) => void;
		onRemove: () => void;
	} = $props();

	/** One id root per card: the expanded panel and the hidden violation notes hang off it. */
	const uid = $props.id();
	const panelId = `${uid}-panel`;
	/** The band's number as the list shows it (1-based), for every accessible name below. */
	const bandNumber = $derived(index + 1);

	// Constraint-driven UI state, all from the active eqcaps profile. `violation`
	// flags fields the profile doesn't accept with a red ring; `inactive` greys
	// the whole row when it sits past the band cap; `slot` is the domains of the
	// slot this band occupies, which bound every input and slider below.
	const PASS: FilterViolation = { type: false, freq: false, q: false, gain: false };
	const violation: FilterViolation = $derived(eqConstraintsStore.violations[index] ?? PASS);
	const inactive = $derived(
		// Passing the list makes the cap count per output — a band sitting past
		// the cap in the flat array can still fit on its own ear.
		isPastMaxBands(index, eqConstraintsStore.profile, eqStore.filters)
	);
	const slotIndex = $derived(eqConstraintsStore.slots[index] ?? index);
	const slot = $derived(slotOf(eqConstraintsStore.profile, slotIndex, filter));
	const constraintLabel = $derived(eqConstraintsStore.active.label);
	/** The fixed bands of a graphic EQ: one row each, never added or removed. */
	const isGraphic = $derived(eqConstraintsStore.isGraphic);
	const freqLocked = $derived(slot.locked.freq);
	const qLocked = $derived(slot.locked.q);
	const gainLocked = $derived(slot.locked.gain);
	/**
	 * Linked with uniPEQ, every band is a band its device plays: no per-band on/off, as in uniPEQ
	 * itself, and one-ear bands only for a device that drives its channels apart.
	 */
	const linked = $derived(linkStore.linked);
	/** Pass, notch and all-pass bands have no gain: the field reads "—". */
	const gainless = $derived(!usesGain(filter.type));

	// ── Helpers ──────────────────────────────────────────────────────────────

	const typeShortLabels: Record<EQFilter['type'], string> = {
		PK: 'PK',
		LSQ: 'LS',
		HSQ: 'HS',
		LPQ: 'LP',
		HPQ: 'HP',
		BP: 'BP',
		NO: 'NO',
		AP: 'AP'
	};

	const allTypeOptions: [EQFilter['type'], () => string][] = [
		['PK', m.equalizer_filter_list_peak],
		['LSQ', m.equalizer_filter_list_lowshelf],
		['HSQ', m.equalizer_filter_list_highshelf],
		['LPQ', m.equalizer_filter_list_lowpass],
		['HPQ', m.equalizer_filter_list_highpass],
		['BP', m.equalizer_filter_list_bandpass],
		['NO', m.equalizer_filter_list_notch],
		['AP', m.equalizer_filter_list_allpass]
	];

	/** The types this slot takes, plus the band's own so a violation stays visible. */
	const typeOptions = $derived.by(() => {
		const allowed = appTypesOf(slot.types);
		return allTypeOptions.filter(([value]) => allowed.includes(value) || value === filter.type);
	});
	const typeLocked = $derived(appTypesOf(slot.types).length <= 1 && !violation.type);
	/**
	 * A graphic EQ's row is one gain to set, so its slider sits in the row rather than behind the
	 * chevron: a graphic EQ is tuned in sweeps across neighbouring bands, not one band at a time.
	 * The type badge and Q chip give way to it; both are fixed by the preset.
	 */
	const graphicRow = $derived(isGraphic && !gainLocked && !gainless);
	/** Whether the chevron opens anything: in a graphic row, only an editable type or Q. */
	const expandable = $derived(!graphicRow || !typeLocked || !qLocked);

	/**
	 * `undefined` is the shared bucket — the band reaches both ears. The segmented control holds
	 * strings, so the bucket travels as `'BOTH'` and is mapped back at the edge.
	 */
	type ChannelChoice = 'BOTH' | 'L' | 'R';
	const channelOptions: { value: ChannelChoice; label: string }[] = $derived([
		{ value: 'BOTH', label: m.eq_channel_both() },
		{ value: 'L', label: m.eq_channel_left() },
		{ value: 'R', label: m.eq_channel_right() }
	]);

	/** What an input defaults to stepping by, before the slot's own grid. */
	const BASE_STEP = { freq: 1, gain: 0.1, q: 0.01 } as const;

	function bounds(field: 'freq' | 'gain' | 'q'): { min: number; max: number } {
		return domainBounds(slot[field]);
	}

	/** The slot's grid step when it has one coarser than the input's default. */
	function stepOf(field: 'freq' | 'gain' | 'q'): number {
		const d: Domain = slot[field];
		return 'step' in d && d.step > BASE_STEP[field] ? d.step : BASE_STEP[field];
	}

	/**
	 * `current` moved `steps` steps: along the slot's value list when it has one
	 * (one listed value per step), otherwise by the input's step.
	 */
	function steppedValue(field: 'freq' | 'gain' | 'q', current: number, steps: number): number {
		const d: Domain = slot[field];
		if ('values' in d) {
			const values = d.values;
			const eps = 1e-9 * Math.max(1, Math.abs(current));
			let i: number;
			if (steps > 0) {
				i = values.findIndex((v) => v > current + eps);
				i = i < 0 ? values.length - 1 : i + steps - 1;
			} else {
				i = values.findLastIndex((v) => v < current - eps);
				i = i < 0 ? 0 : i + steps + 1;
			}
			return values[Math.min(values.length - 1, Math.max(0, i))];
		}
		return current + steps * stepOf(field);
	}

	/** Tooltip for a field: what's allowed, and whether the value breaks it. */
	function fieldTitle(field: 'freq' | 'gain' | 'q', unit: string): string {
		const allowed = domainHint(slot[field], unit);
		return violation[field]
			? m.eq_constraint_field_violation({ label: constraintLabel, allowed })
			: m.eq_constraint_field_allowed({ allowed });
	}

	// ── Slider computed values ───────────────────────────────────────────────

	const freqRange = $derived(bounds('freq'));
	const gainRange = $derived(bounds('gain'));
	const qRange = $derived(bounds('q'));
	let freqSliderValue = $derived(
		filter.freq != null ? logToLinear(filter.freq, freqRange.min, freqRange.max) : 500
	);
	let gainSliderValue = $derived(filter.gain != null ? Math.round(filter.gain * 10) : 0);
	let qSliderValue = $derived(
		filter.q != null
			? logToLinear(filter.q, qRange.min, qRange.max)
			: logToLinear(1, qRange.min, qRange.max)
	);
	// The log-scaled sliders run 0–1000 and the gain slider in tenths of a dB, so their raw
	// positions mean nothing read aloud: `aria-valuetext` carries the real value instead.
	const freqValueText = $derived(
		`${filter.freq ?? Math.round(linearToLog(freqSliderValue, freqRange.min, freqRange.max))} Hz`
	);
	const gainValueText = $derived(`${filter.gain ?? 0} dB`);
	const qValueText = $derived(`${filter.q ?? 1}`);

	// ── Validation notes ─────────────────────────────────────────────────────

	/** Hidden note a field points at (`aria-describedby`) while the profile rejects its value. */
	const noteIds = {
		freq: `${uid}-freq-note`,
		gain: `${uid}-gain-note`,
		q: `${uid}-q-note`
	} as const;
	const FIELDS = ['freq', 'gain', 'q'] as const;
	const NOTE_UNITS = { freq: 'Hz', gain: 'dB', q: '' } as const;
	function violationNote(field: 'freq' | 'gain' | 'q'): string {
		return m.eq_constraint_field_violation({
			label: constraintLabel,
			allowed: domainHint(slot[field], NOTE_UNITS[field])
		});
	}

	// ── Number input handling ────────────────────────────────────────────────

	// Snapshot taken on focus so Escape can revert arrow-key edits that already
	// called onUpdate (unlike manual text entry, arrow keys commit immediately).
	let focusSnapshot: number | null = null;

	const inputBase =
		'bg-transparent text-xs tabular-nums text-base-content text-right outline-hidden rounded px-1 py-0.5 ring-1 ring-base-content/30 hover:bg-base-content/5 focus:bg-base-200 focus:ring-accent/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

	function clampField(field: 'freq' | 'gain' | 'q', val: number): number {
		const widest =
			field === 'freq'
				? Math.max(1, Math.min(48000, Math.round(val)))
				: field === 'gain'
					? Math.max(-30, Math.min(30, Math.round(val * 10) / 10))
					: Math.max(0.01, Math.min(100, Math.round(val * 100) / 100));
		// `eqCommands.updateBand` projects again onto the band's slot (its range,
		// grid step or value list). Apply the same here so the number input shows
		// the value that actually lands in the store.
		const projected = projectFilter(
			{ ...filter, [field]: widest },
			eqConstraintsStore.profile,
			slotIndex
		)[field];
		return projected ?? widest;
	}

	function commitNumberInput(e: Event, field: 'freq' | 'gain' | 'q') {
		const input = e.currentTarget as HTMLInputElement;
		const val = parseFloat(input.value);
		if (!isNaN(val)) {
			const clamped = clampField(field, val);
			onUpdate({ [field]: clamped });
			input.value = String(clamped);
		} else {
			input.value = String(filter[field] ?? '');
		}
	}

	function handleInputFocus(field: 'freq' | 'gain' | 'q') {
		focusSnapshot = filter[field] ?? null;
	}

	function handleInputBlur() {
		focusSnapshot = null;
	}

	function handleInputKeydown(e: KeyboardEvent, field: 'freq' | 'gain' | 'q') {
		if (isImeComposing(e)) return;
		const input = e.currentTarget as HTMLInputElement;
		if (e.key === 'Enter') {
			input.blur();
		} else if (e.key === 'Escape') {
			revertInput(input, field);
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			// Override browser's default step so we can apply a Shift multiplier and
			// commit to the store immediately (the inputs are one-way bound).
			e.preventDefault();
			stepInput(input, field, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
		}
	}

	/** Escape: put back the value captured on focus, and leave the field. */
	function revertInput(input: HTMLInputElement, field: 'freq' | 'gain' | 'q') {
		// Revert to the value captured on focus — arrow-key edits call onUpdate
		// immediately, so filter[field] may already be the incremented value.
		const revertTo = focusSnapshot ?? filter[field] ?? null;
		if (revertTo !== null && revertTo !== filter[field]) {
			onUpdate({ [field]: revertTo });
		}
		input.value = String(revertTo ?? filter[field] ?? '');
		input.blur();
	}

	function stepInput(input: HTMLInputElement, field: 'freq' | 'gain' | 'q', steps: number) {
		const fallback = field === 'freq' ? 1000 : field === 'gain' ? 0 : 1;
		const current = filter[field] ?? fallback;
		const next = clampField(field, steppedValue(field, current, steps));
		onUpdate({ [field]: next });
		input.value = String(next);
	}
</script>

<div
	class="overflow-hidden rounded-lg border transition-colors {inactive
		? 'border-base-content/15 opacity-70'
		: 'border-base-content/20'}"
	title={inactive
		? m.eq_constraint_past_max_bands({
				label: constraintLabel,
				max: eqConstraintsStore.maxBands
			})
		: undefined}
>
	<!-- Collapsed row (always visible) -->
	<div class="flex min-h-8 items-center gap-2 py-0.5 pr-1 pl-2">
		<!-- Switch — hidden while linked: uniPEQ's bands have no on/off -->
		{#if !linked}
			<Switch
				size="sm"
				variant="muted"
				checked={filter.enabled}
				aria-label={m.equalizer_filter_card_enable({ index: bandNumber })}
				onCheckedChange={(checked) => onUpdate({ enabled: checked })}
			/>
		{/if}

		<!-- Type badge — disabled where the slot takes a single type -->
		{#if !graphicRow}
			<Button
				label={typeShortLabels[filter.type]}
				hint={typeLocked
					? m.eq_constraint_locked({ label: constraintLabel })
					: violation.type
						? m.eq_constraint_type_violation({ label: constraintLabel })
						: m.equalizer_filter_card_change_type()}
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					const allowed = appTypesOf(slot.types);
					if (typeLocked || allowed.length === 0) return;
					// Cycle through the types this slot takes on click
					const next = allowed[(allowed.indexOf(filter.type) + 1) % allowed.length];
					onUpdate({ type: next });
				}}
				variant="muted"
				size="xs"
				class={violation.type ? 'ring-1 ring-error' : ''}
				disabled={typeLocked}
			/>
		{/if}

		<!-- Freq — read-only chip where the slot locks it (graphic EQs) -->
		<label
			class="inline-flex shrink-0 items-baseline gap-0.5 {graphicRow ? 'w-16 flex-none' : 'flex-3'}"
		>
			{#if freqLocked}
				<span
					class="w-full rounded bg-base-300 px-1 py-0.5 text-right text-xs text-base-content/80 tabular-nums"
					title={m.eq_constraint_locked({ label: constraintLabel })}
				>
					{filter.freq ?? '—'}
				</span>
			{:else}
				<input
					type="number"
					value={filter.freq}
					min={freqRange.min}
					max={freqRange.max}
					step={stepOf('freq')}
					onfocus={() => handleInputFocus('freq')}
					onblur={handleInputBlur}
					onchange={(e) => commitNumberInput(e, 'freq')}
					onkeydown={(e) => handleInputKeydown(e, 'freq')}
					class="w-full {inputBase} {violation.freq ? 'ring-error!' : ''}"
					title={fieldTitle('freq', 'Hz')}
					aria-label={m.equalizer_filter_card_freq_field({ index: bandNumber })}
					aria-invalid={violation.freq ? 'true' : undefined}
					aria-describedby={violation.freq ? noteIds.freq : undefined}
				/>
			{/if}
			<span class="text-xs text-base-content/80 select-none">Hz</span>
		</label>

		{#if graphicRow}
			<input
				type="range"
				min={Math.round(gainRange.min * 10)}
				max={Math.round(gainRange.max * 10)}
				step={Math.round(stepOf('gain') * 10)}
				value={gainSliderValue}
				oninput={(e) => onUpdate({ gain: parseFloat(e.currentTarget.value) / 10 })}
				aria-label="{filter.freq} Hz · {m.equalizer_filter_list_gain()}"
				aria-valuetext={gainValueText}
				class="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-base-content/50 accent-accent"
				class:opacity-70={!filter.enabled}
			/>
		{/if}

		<!-- Gain -->
		<label
			class="inline-flex shrink-0 items-baseline gap-0.5 {graphicRow ? 'w-16 flex-none' : 'flex-2'}"
		>
			{#if gainless}
				<span
					class="w-full rounded bg-base-300 px-1 py-0.5 text-right text-xs text-base-content/80 tabular-nums"
				>
					—
				</span>
			{:else if gainLocked}
				<span
					class="w-full rounded bg-base-300 px-1 py-0.5 text-right text-xs text-base-content/80 tabular-nums"
					title={m.eq_constraint_locked({ label: constraintLabel })}
				>
					{filter.gain ?? '—'}
				</span>
			{:else}
				<input
					type="number"
					value={filter.gain}
					min={gainRange.min}
					max={gainRange.max}
					step={stepOf('gain')}
					onfocus={() => handleInputFocus('gain')}
					onblur={handleInputBlur}
					onchange={(e) => commitNumberInput(e, 'gain')}
					onkeydown={(e) => handleInputKeydown(e, 'gain')}
					class="w-full {inputBase} {violation.gain ? 'ring-error!' : ''}"
					title={fieldTitle('gain', 'dB')}
					aria-label={m.equalizer_filter_card_gain_field({ index: bandNumber })}
					aria-invalid={violation.gain ? 'true' : undefined}
					aria-describedby={violation.gain ? noteIds.gain : undefined}
				/>
			{/if}
			<span class="text-xs text-base-content/80 select-none">dB</span>
		</label>

		<!-- Q — read-only chip where the slot locks it (graphic EQs) -->
		{#if !graphicRow}
			<label class="inline-flex flex-2 shrink-0 items-baseline gap-0.5">
				<span class="text-xs text-base-content/80 select-none">Q</span>
				{#if qLocked}
					<span
						class="w-full rounded bg-base-300 px-1 py-0.5 text-right text-xs text-base-content/80 tabular-nums"
						title={m.eq_constraint_locked({ label: constraintLabel })}
					>
						{filter.q ?? '—'}
					</span>
				{:else}
					<input
						type="number"
						value={filter.q}
						min={qRange.min}
						max={qRange.max}
						step={stepOf('q')}
						onfocus={() => handleInputFocus('q')}
						onblur={handleInputBlur}
						onchange={(e) => commitNumberInput(e, 'q')}
						onkeydown={(e) => handleInputKeydown(e, 'q')}
						class="w-full {inputBase} {violation.q ? 'ring-error!' : ''}"
						title={fieldTitle('q', '')}
						aria-label={m.equalizer_filter_card_q_field({ index: bandNumber })}
						aria-invalid={violation.q ? 'true' : undefined}
						aria-describedby={violation.q ? noteIds.q : undefined}
					/>
				{/if}
			</label>
		{/if}

		<div class="-ml-0.75 flex items-center">
			{#if expandable}
				<Button
					title={m.equalizer_filter_card_expand({ index: bandNumber })}
					aria-expanded={expanded}
					aria-controls={expanded ? panelId : undefined}
					onclick={onToggle}
					variant="ghost"
					size="icon"
					class="text-base-content/60 hover:text-accent"
				>
					<ChevronDown
						class="h-4 w-4 shrink-0 transition-transform duration-150 {expanded
							? 'rotate-180'
							: ''}"
					/>
				</Button>
			{/if}

			<!-- Delete button — hidden in graphic mode (band slots are part of the preset template) -->
			{#if !isGraphic}
				<Button
					title={m.equalizer_filter_card_remove({ index: bandNumber })}
					onclick={(e: MouseEvent) => {
						e.stopPropagation();
						onRemove();
					}}
					variant="ghost"
					size="icon"
					class="text-base-content/60 hover:text-error"
				>
					<X class="h-3.5 w-3.5" />
				</Button>
			{/if}
		</div>
		<!-- Expand/collapse button -->
	</div>

	<!-- What a rejected field says to a screen reader; the ring and `title` are visual-only. -->
	{#each FIELDS as field (field)}
		{#if violation[field]}
			<span id={noteIds[field]} class="sr-only">{violationNote(field)}</span>
		{/if}
	{/each}

	<!-- Expanded content -->
	{#if expanded}
		<div
			id={panelId}
			transition:slideOrFade={{ duration: 150 }}
			class="flex flex-col gap-3 px-3 pt-0.5 pb-4"
			class:opacity-70={!filter.enabled}
		>
			{#if slot.label}
				<!-- What the constraint calls this slot ("Lowshelf 1", "Peaking") -->
				<span class="text-xs text-base-content/80">
					{m.eq_constraint_slot_label({ slot: slotIndex + 1, label: slot.label })}
				</span>
			{/if}
			{#if !typeLocked}
				<!-- Type selector (segmented control) — only the types this slot takes -->
				<SegmentedControl
					bind:value={() => filter.type, (type) => onUpdate({ type })}
					options={typeOptions.map(([value, label]) => ({ value, label: label() }))}
					label={m.equalizer_filter_card_type_group({ index: bandNumber })}
					class="-mx-1 mt-1 flex-wrap"
				/>
			{/if}
			{#if !isGraphic && (!linked || !eqStore.channelScopeLocked)}
				<!--
					Channel target — moves the band between the shared / L / R buckets.
					Hidden in graphic mode, where the preset fixes one row per band on a
					single output and there is no per-ear structure to express, and while
					linked, unless uniPEQ's device takes one-ear bands.
				-->
				<div class="flex flex-col gap-1">
					<span class="text-xs text-base-content/80">{m.eq_channel_applies_to()}</span>
					<SegmentedControl
						bind:value={
							() => filter.channel ?? 'BOTH',
							(choice) => onUpdate({ channel: choice === 'BOTH' ? undefined : choice })
						}
						options={channelOptions}
						label={m.eq_channel_applies_to()}
					/>
				</div>
			{/if}
			{#if !freqLocked}
				<!-- Frequency slider — hidden where the slot locks it -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="text-xs text-base-content/80">
							{m.equalizer_filter_list_freq()}
						</span>
						<label class="inline-flex items-baseline gap-1">
							<input
								type="number"
								value={filter.freq}
								min={freqRange.min}
								max={freqRange.max}
								step={stepOf('freq')}
								title={fieldTitle('freq', 'Hz')}
								aria-label={m.equalizer_filter_card_freq_field({ index: bandNumber })}
								aria-invalid={violation.freq ? 'true' : undefined}
								aria-describedby={violation.freq ? noteIds.freq : undefined}
								onchange={(e) => commitNumberInput(e, 'freq')}
								onkeydown={(e) => handleInputKeydown(e, 'freq')}
								class="w-16 {inputBase} border border-transparent focus:border-base-content/20"
							/>
							<span class="text-2xs text-base-content/80 select-none">Hz</span>
						</label>
					</div>
					<input
						type="range"
						min="0"
						max="1000"
						step="1"
						value={freqSliderValue}
						aria-label={m.equalizer_filter_card_freq_field({ index: bandNumber })}
						aria-valuetext={freqValueText}
						oninput={(e) => {
							const hz = linearToLog(
								parseFloat(e.currentTarget.value),
								freqRange.min,
								freqRange.max
							);
							onUpdate({ freq: Math.round(hz) });
						}}
						class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/50 accent-accent"
					/>
				</div>
			{/if}

			{#if !gainLocked && !gainless && !graphicRow}
				<!-- Gain slider — in the row itself for a graphic EQ -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="text-xs text-base-content/80">
							{m.equalizer_filter_list_gain()}
						</span>
						<label class="inline-flex items-baseline gap-1">
							<input
								type="number"
								value={filter.gain}
								min={gainRange.min}
								max={gainRange.max}
								step={stepOf('gain')}
								title={fieldTitle('gain', 'dB')}
								aria-label={m.equalizer_filter_card_gain_field({ index: bandNumber })}
								aria-invalid={violation.gain ? 'true' : undefined}
								aria-describedby={violation.gain ? noteIds.gain : undefined}
								onchange={(e) => commitNumberInput(e, 'gain')}
								onkeydown={(e) => handleInputKeydown(e, 'gain')}
								class="w-14 {inputBase} border border-transparent focus:border-base-content/20"
							/>
							<span class="text-2xs text-base-content/80 select-none">dB</span>
						</label>
					</div>
					<input
						type="range"
						min={Math.round(gainRange.min * 10)}
						max={Math.round(gainRange.max * 10)}
						step="1"
						value={gainSliderValue}
						aria-label={m.equalizer_filter_card_gain_field({ index: bandNumber })}
						aria-valuetext={gainValueText}
						oninput={(e) => {
							onUpdate({ gain: parseFloat(e.currentTarget.value) / 10 });
						}}
						class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/50 accent-accent"
					/>
				</div>
			{/if}

			{#if !qLocked}
				<!-- Q slider — hidden where the slot locks it -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="text-xs text-base-content/80">
							{m.equalizer_filter_list_q()}
						</span>
						<label class="inline-flex items-baseline gap-1">
							<span class="text-2xs text-base-content/80 select-none">Q</span>
							<input
								type="number"
								value={filter.q}
								min={qRange.min}
								max={qRange.max}
								step={stepOf('q')}
								title={fieldTitle('q', '')}
								aria-label={m.equalizer_filter_card_q_field({ index: bandNumber })}
								aria-invalid={violation.q ? 'true' : undefined}
								aria-describedby={violation.q ? noteIds.q : undefined}
								onchange={(e) => commitNumberInput(e, 'q')}
								onkeydown={(e) => handleInputKeydown(e, 'q')}
								class="w-14 {inputBase} border border-transparent focus:border-base-content/20"
							/>
						</label>
					</div>
					<input
						type="range"
						min="0"
						max="1000"
						step="1"
						value={qSliderValue}
						aria-label={m.equalizer_filter_card_q_field({ index: bandNumber })}
						aria-valuetext={qValueText}
						oninput={(e) => {
							const q = linearToLog(parseFloat(e.currentTarget.value), qRange.min, qRange.max);
							onUpdate({ q: parseFloat(q.toFixed(2)) });
						}}
						class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/50 accent-accent"
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
