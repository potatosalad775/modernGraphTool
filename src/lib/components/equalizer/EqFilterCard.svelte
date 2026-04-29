<script lang="ts">
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { logToLinear, linearToLog } from '$lib/utils/log-scale.js';
	import { ChevronDown, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages.js';
	import Switch from '../atoms/Switch.svelte';
	import Button from '../atoms/Button.svelte';

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

	// ── Helpers ──────────────────────────────────────────────────────────────

	const typeShortLabels: Record<EQFilter['type'], string> = { PK: 'PK', LSQ: 'LS', HSQ: 'HS' };

	const typeOptions: [EQFilter['type'], () => string][] = [
		['PK', m.equalizer_filter_list_peak],
		['LSQ', m.equalizer_filter_list_lowshelf],
		['HSQ', m.equalizer_filter_list_highshelf]
	];

	// ── Slider computed values ───────────────────────────────────────────────

	let freqSliderValue = $derived(filter.freq != null ? logToLinear(filter.freq, 20, 20000) : 500);
	let gainSliderValue = $derived(filter.gain != null ? Math.round(filter.gain * 10) : 0);
	let qSliderValue = $derived(
		filter.q != null ? logToLinear(filter.q, 0.1, 10) : logToLinear(1, 0.1, 10)
	);

	// ── Number input handling ────────────────────────────────────────────────

	const inputBase =
		'bg-transparent text-xs tabular-nums text-base-content text-right outline-none rounded px-1 py-0.5 ring-1 ring-base-content/30 hover:bg-base-content/5 focus:bg-base-200 focus:ring-accent/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

	function clampField(field: 'freq' | 'gain' | 'q', val: number): number {
		if (field === 'freq') return Math.max(20, Math.min(20000, Math.round(val)));
		if (field === 'gain') return Math.max(-30, Math.min(30, Math.round(val * 10) / 10));
		return Math.max(0.1, Math.min(10, Math.round(val * 100) / 100));
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

	function handleInputKeydown(e: KeyboardEvent, field: 'freq' | 'gain' | 'q') {
		if (e.key === 'Enter') {
			(e.currentTarget as HTMLInputElement).blur();
			return;
		}
		if (e.key === 'Escape') {
			const input = e.currentTarget as HTMLInputElement;
			input.value = String(filter[field] ?? '');
			input.blur();
			return;
		}
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			// Override browser's default step so we can apply a Shift multiplier and
			// commit to the store immediately (the inputs are one-way bound).
			e.preventDefault();
			const baseStep = field === 'freq' ? 1 : field === 'gain' ? 0.1 : 0.01;
			const multiplier = e.shiftKey ? 10 : 1;
			const dir = e.key === 'ArrowUp' ? 1 : -1;
			const fallback = field === 'freq' ? 1000 : field === 'gain' ? 0 : 1;
			const current = filter[field] ?? fallback;
			const next = clampField(field, current + dir * baseStep * multiplier);
			onUpdate({ [field]: next });
			(e.currentTarget as HTMLInputElement).value = String(next);
		}
	}
</script>

<div class="overflow-hidden rounded-lg border border-base-content/20 transition-colors">
	<!-- Collapsed row (always visible) -->
	<div class="flex min-h-8 items-center gap-2 py-0.5 pr-1 pl-2">
		<!-- Switch -->
		<Switch
			size="sm"
			variant="muted"
			checked={filter.enabled}
			onCheckedChange={(checked) => onUpdate({ enabled: checked })}
		/>

		<!-- Type badge -->
		<Button
			title="Change filter type"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				// Cycle through types on click
				const currentIndex = typeOptions.findIndex(([value]) => value === filter.type);
				const nextType = typeOptions[(currentIndex + 1) % typeOptions.length][0];
				onUpdate({ type: nextType });
			}}
			variant="muted"
			size="xs"
		>
			{typeShortLabels[filter.type]}
		</Button>

		<!-- Freq -->
		<label class="inline-flex flex-1 shrink-0 items-baseline gap-0.5">
			<input
				type="number"
				value={filter.freq}
				min={20}
				max={20000}
				step={1}
				onchange={(e) => commitNumberInput(e, 'freq')}
				onkeydown={(e) => handleInputKeydown(e, 'freq')}
				class="w-full {inputBase}"
			/>
			<span class="text-[12px] text-base-content/60 select-none">Hz</span>
		</label>

		<!-- Gain -->
		<label class="inline-flex flex-1 shrink-0 items-baseline gap-0.5">
			<input
				type="number"
				value={filter.gain}
				min={-30}
				max={30}
				step={0.1}
				onchange={(e) => commitNumberInput(e, 'gain')}
				onkeydown={(e) => handleInputKeydown(e, 'gain')}
				class="w-full {inputBase}"
			/>
			<span class="text-[12px] text-base-content/60 select-none">dB</span>
		</label>

		<span class="text-[12px] text-base-content/60 select-none">-</span>

		<!-- Q -->
		<label class="inline-flex flex-1 shrink-0 items-baseline gap-0.5">
			<span class="text-[12px] text-base-content/60 select-none">Q</span>
			<input
				type="number"
				value={filter.q}
				min={0.1}
				max={10}
				step={0.01}
				onchange={(e) => commitNumberInput(e, 'q')}
				onkeydown={(e) => handleInputKeydown(e, 'q')}
				class="w-full {inputBase}"
			/>
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

			<!-- Delete button -->
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
			<!-- Type selector (segmented buttons) -->
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

			<!-- Frequency slider -->
			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-xs text-base-content/60">
						{m.equalizer_filter_list_freq()}
					</span>
					<label class="inline-flex items-baseline gap-1">
						<input
							type="number"
							value={filter.freq}
							min={20}
							max={20000}
							step={1}
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
						{m.equalizer_filter_list_gain()}
					</span>
					<label class="inline-flex items-baseline gap-1">
						<input
							type="number"
							value={filter.gain}
							min={-30}
							max={30}
							step={0.1}
							onchange={(e) => commitNumberInput(e, 'gain')}
							onkeydown={(e) => handleInputKeydown(e, 'gain')}
							class="w-14 {inputBase} border border-transparent focus:border-base-content/20"
						/>
						<span class="text-[10px] text-base-content/40 select-none">dB</span>
					</label>
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
						{m.equalizer_filter_list_q()}
					</span>
					<label class="inline-flex items-baseline gap-1">
						<span class="text-[10px] text-base-content/40 select-none">Q</span>
						<input
							type="number"
							value={filter.q}
							min={0.1}
							max={10}
							step={0.01}
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
						const q = linearToLog(parseFloat(e.currentTarget.value), 0.1, 10);
						onUpdate({ q: parseFloat(q.toFixed(2)) });
					}}
					class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
				/>
			</div>
		</div>
	{/if}
</div>
