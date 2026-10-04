<script lang="ts">
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { logToLinear, linearToLog } from '$lib/utils/log-scale.js';
	import { ChevronDown, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages.js';
	import Switch from '../atoms/Switch.svelte';
	import Button from '../atoms/Button.svelte';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { domainBounds, type Domain } from '@potatosalad775/eqcaps-core';
	import {
		appTypesOf,
		isPastMaxBands,
		projectFilter,
		slotOf,
		type FilterViolation
	} from '$lib/utils/eq-constraint.js';
	import { domainHint } from '$lib/utils/eq-domain-hint.js';

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

	// ── Helpers ──────────────────────────────────────────────────────────────

	const typeShortLabels: Record<EQFilter['type'], string> = { PK: 'PK', LSQ: 'LS', HSQ: 'HS' };

	const allTypeOptions: [EQFilter['type'], () => string][] = [
		['PK', m.equalizer_filter_list_peak],
		['LSQ', m.equalizer_filter_list_lowshelf],
		['HSQ', m.equalizer_filter_list_highshelf]
	];

	/** The types this slot takes, plus the band's own so a violation stays visible. */
	const typeOptions = $derived.by(() => {
		const allowed = appTypesOf(slot.types);
		return allTypeOptions.filter(([value]) => allowed.includes(value) || value === filter.type);
	});
	const typeLocked = $derived(appTypesOf(slot.types).length <= 1 && !violation.type);

	/** `undefined` is the shared bucket — the band reaches both ears. */
	const channelOptions: [EQFilter['channel'], () => string][] = [
		[undefined, m.eq_channel_both],
		['L', m.eq_channel_left],
		['R', m.eq_channel_right]
	];

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

	// ── Number input handling ────────────────────────────────────────────────

	// Snapshot taken on focus so Escape can revert arrow-key edits that already
	// called onUpdate (unlike manual text entry, arrow keys commit immediately).
	let focusSnapshot: number | null = null;

	const inputBase =
		'bg-transparent text-xs tabular-nums text-base-content text-right outline-none rounded px-1 py-0.5 ring-1 ring-base-content/30 hover:bg-base-content/5 focus:bg-base-200 focus:ring-accent/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

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
		if (e.key === 'Enter') {
			(e.currentTarget as HTMLInputElement).blur();
			return;
		}
		if (e.key === 'Escape') {
			const input = e.currentTarget as HTMLInputElement;
			// Revert to the value captured on focus — arrow-key edits call onUpdate
			// immediately, so filter[field] may already be the incremented value.
			const revertTo = focusSnapshot ?? filter[field] ?? null;
			if (revertTo !== null && revertTo !== filter[field]) {
				onUpdate({ [field]: revertTo });
			}
			input.value = String(revertTo ?? filter[field] ?? '');
			input.blur();
			return;
		}
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			// Override browser's default step so we can apply a Shift multiplier and
			// commit to the store immediately (the inputs are one-way bound).
			e.preventDefault();
			const multiplier = e.shiftKey ? 10 : 1;
			const dir = e.key === 'ArrowUp' ? 1 : -1;
			const fallback = field === 'freq' ? 1000 : field === 'gain' ? 0 : 1;
			const current = filter[field] ?? fallback;
			const next = clampField(field, steppedValue(field, current, dir * multiplier));
			onUpdate({ [field]: next });
			(e.currentTarget as HTMLInputElement).value = String(next);
		}
	}
</script>

<div
	class="overflow-hidden rounded-lg border transition-colors {inactive
		? 'border-base-content/15 opacity-50'
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
		<!-- Switch -->
		<Switch
			size="sm"
			variant="muted"
			checked={filter.enabled}
			onCheckedChange={(checked) => onUpdate({ enabled: checked })}
		/>

		<!-- Type badge — disabled where the slot takes a single type -->
		<Button
			title={typeLocked
				? m.eq_constraint_locked({ label: constraintLabel })
				: violation.type
					? m.eq_constraint_type_violation({ label: constraintLabel })
					: 'Change filter type'}
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
		>
			{typeShortLabels[filter.type]}
		</Button>

		<!-- Freq — read-only chip where the slot locks it (graphic EQs) -->
		<label class="inline-flex flex-1 shrink-0 items-baseline gap-0.5">
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
				/>
			{/if}
			<span class="text-[12px] text-base-content/60 select-none">Hz</span>
		</label>

		<!-- Gain -->
		<label class="inline-flex flex-1 shrink-0 items-baseline gap-0.5">
			{#if gainLocked}
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
				/>
			{/if}
			<span class="text-[12px] text-base-content/60 select-none">dB</span>
		</label>

		<span class="text-[12px] text-base-content/60 select-none">-</span>

		<!-- Q — read-only chip where the slot locks it (graphic EQs) -->
		<label class="inline-flex flex-1 shrink-0 items-baseline gap-0.5">
			<span class="text-[12px] text-base-content/60 select-none">Q</span>
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
				/>
			{/if}
		</label>

		<div class="flex items-center">
			<Button
				title="Expand filter {index + 1} options"
				onclick={onToggle}
				variant="ghost"
				size="icon"
				class="text-base-content/50 hover:text-accent"
			>
				<ChevronDown
					class="h-4 w-4 shrink-0 text-base-content/50 transition-transform duration-150 {expanded
						? 'rotate-180'
						: ''}"
				/>
			</Button>

			<!-- Delete button — hidden in graphic mode (band slots are part of the preset template) -->
			{#if !isGraphic}
				<Button
					title="Remove filter {index + 1}"
					onclick={(e: MouseEvent) => {
						e.stopPropagation();
						onRemove();
					}}
					variant="ghost"
					size="icon"
					class="text-base-content/50 hover:text-error"
				>
					<X class="h-3.5 w-3.5" />
				</Button>
			{/if}
		</div>
		<!-- Expand/collapse button -->
	</div>

	<!-- Expanded content -->
	{#if expanded}
		<div
			transition:slide={{ duration: 150 }}
			class="flex flex-col gap-3 px-3 pt-0.5 pb-4"
			class:opacity-50={!filter.enabled}
		>
			{#if slot.label}
				<!-- What the constraint calls this slot ("Lowshelf 1", "Peaking") -->
				<span class="text-xs text-base-content/60">
					{m.eq_constraint_slot_label({ slot: slotIndex + 1, label: slot.label })}
				</span>
			{/if}
			{#if !typeLocked}
				<!-- Type selector (segmented buttons) — only the types this slot takes -->
				<div class="flex rounded-md border border-base-content/20">
					{#each typeOptions as [value, label] (value)}
						<button
							onclick={() => onUpdate({ type: value })}
							class="flex-1 border-base-content/20 py-1 text-xs font-medium transition-colors first:rounded-l-md first:border-r last:rounded-r-md last:border-l {filter.type ===
							value
								? 'bg-accent text-white'
								: 'bg-base-200 text-base-content/70 hover:bg-base-300'}"
						>
							{label()}
						</button>
					{/each}
				</div>
			{/if}
			{#if !isGraphic}
				<!--
					Channel target — moves the band between the shared / L / R buckets.
					Hidden in graphic mode, where the preset fixes one row per band on a
					single output and there is no per-ear structure to express.
				-->
				<div class="flex flex-col gap-1">
					<span class="text-xs text-base-content/60">{m.eq_channel_applies_to()}</span>
					<div class="flex rounded-md border border-base-content/20">
						{#each channelOptions as [value, label] (value ?? 'BOTH')}
							<button
								onclick={() => onUpdate({ channel: value })}
								class="flex-1 border-base-content/20 py-1 text-xs font-medium transition-colors first:rounded-l-md first:border-r last:rounded-r-md last:border-l {filter.channel ===
								value
									? 'bg-accent text-white'
									: 'bg-base-200 text-base-content/70 hover:bg-base-300'}"
							>
								{label()}
							</button>
						{/each}
					</div>
				</div>
			{/if}
			{#if !freqLocked}
				<!-- Frequency slider — hidden where the slot locks it -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="text-xs text-base-content/60">
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
								onchange={(e) => commitNumberInput(e, 'freq')}
								onkeydown={(e) => handleInputKeydown(e, 'freq')}
								class="w-16 {inputBase} border border-transparent focus:border-base-content/20"
							/>
							<span class="text-[10px] text-base-content/40 select-none">Hz</span>
						</label>
					</div>
					<input
						type="range"
						min="0"
						max="1000"
						step="1"
						value={freqSliderValue}
						oninput={(e) => {
							const hz = linearToLog(
								parseFloat(e.currentTarget.value),
								freqRange.min,
								freqRange.max
							);
							onUpdate({ freq: Math.round(hz) });
						}}
						class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
					/>
				</div>
			{/if}

			{#if !gainLocked}
				<!-- Gain slider -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="text-xs text-base-content/60">
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
								onchange={(e) => commitNumberInput(e, 'gain')}
								onkeydown={(e) => handleInputKeydown(e, 'gain')}
								class="w-14 {inputBase} border border-transparent focus:border-base-content/20"
							/>
							<span class="text-[10px] text-base-content/40 select-none">dB</span>
						</label>
					</div>
					<input
						type="range"
						min={Math.round(gainRange.min * 10)}
						max={Math.round(gainRange.max * 10)}
						step="1"
						value={gainSliderValue}
						oninput={(e) => {
							onUpdate({ gain: parseFloat(e.currentTarget.value) / 10 });
						}}
						class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
					/>
				</div>
			{/if}

			{#if !qLocked}
				<!-- Q slider — hidden where the slot locks it -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="text-xs text-base-content/60">
							{m.equalizer_filter_list_q()}
						</span>
						<label class="inline-flex items-baseline gap-1">
							<span class="text-[10px] text-base-content/40 select-none">Q</span>
							<input
								type="number"
								value={filter.q}
								min={qRange.min}
								max={qRange.max}
								step={stepOf('q')}
								title={fieldTitle('q', '')}
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
						oninput={(e) => {
							const q = linearToLog(parseFloat(e.currentTarget.value), qRange.min, qRange.max);
							onUpdate({ q: parseFloat(q.toFixed(2)) });
						}}
						class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
