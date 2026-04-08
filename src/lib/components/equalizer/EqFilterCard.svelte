<script lang="ts">
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { logToLinear, linearToLog, formatFreq, formatGain, formatQ } from '$lib/utils/log-scale.js';
	import { ChevronDown } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages.js';

	let {
		filter,
		index,
		expanded,
		onToggle,
		onUpdate,
		onRemove,
	}: {
		filter: EQFilter;
		index: number;
		expanded: boolean;
		onToggle: () => void;
		onUpdate: (partial: Partial<EQFilter>) => void;
		onRemove: () => void;
	} = $props();

	// ── Local state ──────────────────────────────────────────────────────────

	let editingField = $state<'freq' | 'gain' | 'q' | null>(null);
	let editValue = $state('');

	// ── Helpers ──────────────────────────────────────────────────────────────

	const typeShortLabels: Record<EQFilter['type'], string> = { PK: 'PK', LSQ: 'LS', HSQ: 'HS' };

	const typeOptions: [EQFilter['type'], () => string][] = [
		['PK', m.extension_equalizer_filter_list_peak],
		['LSQ', m.extension_equalizer_filter_list_lowshelf],
		['HSQ', m.extension_equalizer_filter_list_highshelf],
	];

	// ── Slider computed values ───────────────────────────────────────────────

	let freqSliderValue = $derived(filter.freq != null ? logToLinear(filter.freq, 20, 20000) : 500);
	let gainSliderValue = $derived(filter.gain != null ? Math.round(filter.gain * 10) : 0);
	let qSliderValue = $derived(filter.q != null ? logToLinear(filter.q, 0.1, 10) : logToLinear(1, 0.1, 10));

	// ── Inline edit ──────────────────────────────────────────────────────────

	function startEdit(field: 'freq' | 'gain' | 'q') {
		editingField = field;
		editValue = String(filter[field] ?? '');
	}

	function commitEdit(field: 'freq' | 'gain' | 'q') {
		const val = parseFloat(editValue);
		if (!isNaN(val)) {
			const clamped =
				field === 'freq'
					? Math.max(20, Math.min(20000, val))
					: field === 'gain'
						? Math.max(-30, Math.min(30, val))
						: Math.max(0.1, Math.min(10, val));
			onUpdate({ [field]: clamped });
		}
		editingField = null;
	}

	function handleEditKeydown(e: KeyboardEvent, field: 'freq' | 'gain' | 'q') {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEdit(field);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			editingField = null;
		}
	}

	/** Attachment to auto-focus and select an input element on mount */
	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

</script>

<div
	class="rounded-lg border overflow-hidden transition-colors {expanded
		? 'border-l-2 border-l-accent border-base-content/15'
		: 'border-base-content/15'}"
>
	<!-- Collapsed row (always visible) -->
	<div class="flex min-h-[44px] items-center gap-1.5 px-2">
		<!-- Checkbox -->
		<input
			type="checkbox"
			checked={filter.enabled}
			onchange={(e) => onUpdate({ enabled: (e.target as HTMLInputElement).checked })}
			class="h-3.5 w-3.5 shrink-0 accent-accent"
		/>

		<!-- Clickable summary row -->
		<button
			onclick={onToggle}
			aria-expanded={expanded}
			class="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
		>
			<!-- Type badge -->
			<span class="rounded bg-base-content/10 px-1.5 py-0.5 text-[10px] font-medium">
				{typeShortLabels[filter.type]}
			</span>

			<!-- Freq -->
			<span class="text-xs tabular-nums text-base-content">
				{formatFreq(filter.freq)}{filter.freq != null ? ' Hz' : ''}
			</span>

			<!-- Gain -->
			<span class="text-xs tabular-nums text-base-content">
				{formatGain(filter.gain)}{filter.gain != null ? ' dB' : ''}
			</span>

			<!-- Q -->
			<span class="text-xs tabular-nums text-base-content">
				Q {formatQ(filter.q)}
			</span>

			<!-- Spacer -->
			<span class="flex-1"></span>

			<!-- Chevron -->
			<ChevronDown
				class="h-3.5 w-3.5 shrink-0 text-base-content/50 transition-transform duration-150 {expanded
					? 'rotate-180'
					: ''}"
			/>
		</button>

		<!-- Delete button -->
		<button
			onclick={(e) => {
				e.stopPropagation();
				onRemove();
			}}
			class="shrink-0 px-1 text-base-content/40 transition-colors hover:text-error"
			aria-label="Remove filter {index + 1}"
		>
			&times;
		</button>
	</div>

	<!-- Expanded content -->
	{#if expanded}
		<div
			transition:slide={{ duration: 150 }}
			class="flex flex-col gap-3 px-3 pb-3 pt-1"
			class:opacity-50={!filter.enabled}
		>
			<!-- Type selector (segmented buttons) -->
			<div class="flex">
				{#each typeOptions as [value, label] (value)}
					<button
						onclick={() => onUpdate({ type: value })}
						class="flex-1 py-1 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md {filter.type ===
						value
							? 'bg-accent text-white'
							: 'bg-base-200 text-base-content/70 hover:bg-base-300'}"
					>
						{label()}
					</button>
				{/each}
			</div>

			<!-- Frequency slider -->
			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-xs text-base-content/60">
						{m.extension_equalizer_filter_list_freq()}
					</span>
					{#if editingField === 'freq'}
						<input
							{@attach autofocus}
							type="number"
							bind:value={editValue}
							onblur={() => commitEdit('freq')}
							onkeydown={(e) => handleEditKeydown(e, 'freq')}
							class="w-20 rounded border border-base-content/20 bg-base-200 px-1.5 py-0.5 text-xs text-right"
						/>
					{:else}
						<button
							onclick={() => startEdit('freq')}
							class="cursor-pointer rounded px-1 py-0.5 text-xs font-medium tabular-nums text-base-content hover:bg-base-content/5 hover:text-accent"
						>
							{formatFreq(filter.freq)} Hz
						</button>
					{/if}
				</div>
				<input
					type="range"
					min="0"
					max="1000"
					step="1"
					value={freqSliderValue}
					oninput={(e) => {
						const hz = linearToLog(parseFloat(e.currentTarget.value), 20, 20000);
						onUpdate({ freq: Math.round(hz) });
					}}
					class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
				/>
			</div>

			<!-- Gain slider -->
			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-xs text-base-content/60">
						{m.extension_equalizer_filter_list_gain()}
					</span>
					{#if editingField === 'gain'}
						<input
							{@attach autofocus}
							type="number"
							bind:value={editValue}
							onblur={() => commitEdit('gain')}
							onkeydown={(e) => handleEditKeydown(e, 'gain')}
							class="w-20 rounded border border-base-content/20 bg-base-200 px-1.5 py-0.5 text-xs text-right"
						/>
					{:else}
						<button
							onclick={() => startEdit('gain')}
							class="cursor-pointer rounded px-1 py-0.5 text-xs font-medium tabular-nums text-base-content hover:bg-base-content/5 hover:text-accent"
						>
							{formatGain(filter.gain)} dB
						</button>
					{/if}
				</div>
				<input
					type="range"
					min="-300"
					max="300"
					step="1"
					value={gainSliderValue}
					oninput={(e) => {
						onUpdate({ gain: parseFloat(e.currentTarget.value) / 10 });
					}}
					class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
				/>
			</div>

			<!-- Q slider -->
			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-xs text-base-content/60">
						{m.extension_equalizer_filter_list_q()}
					</span>
					{#if editingField === 'q'}
						<input
							{@attach autofocus}
							type="number"
							bind:value={editValue}
							onblur={() => commitEdit('q')}
							onkeydown={(e) => handleEditKeydown(e, 'q')}
							class="w-20 rounded border border-base-content/20 bg-base-200 px-1.5 py-0.5 text-xs text-right"
						/>
					{:else}
						<button
							onclick={() => startEdit('q')}
							class="cursor-pointer rounded px-1 py-0.5 text-xs font-medium tabular-nums text-base-content hover:bg-base-content/5 hover:text-accent"
						>
							Q {formatQ(filter.q)}
						</button>
					{/if}
				</div>
				<input
					type="range"
					min="0"
					max="1000"
					step="1"
					value={qSliderValue}
					oninput={(e) => {
						const q = linearToLog(parseFloat(e.currentTarget.value), 0.1, 10);
						onUpdate({ q: parseFloat(q.toFixed(2)) });
					}}
					class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
				/>
			</div>
		</div>
	{/if}
</div>
