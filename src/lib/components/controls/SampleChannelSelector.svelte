<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, SampleDisplayKey } from '$lib/types/data-types.js';
	import { Popover } from 'bits-ui';
	import Button from '../atoms/Button.svelte';
	import { Ellipsis } from '@lucide/svelte';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// ── Channel helpers ──────────────────────────────────────────────────────────

	function dispChannelToSelectValue(dispChannel: ('L' | 'R' | 'AVG')[]): string {
		if (dispChannel.includes('L') && dispChannel.includes('R')) return 'L+R';
		return dispChannel[0] ?? 'AVG';
	}

	function selectValueToDispChannel(value: string): ('L' | 'R' | 'AVG')[] {
		if (value === 'L+R') return ['L', 'R'];
		return [value as 'L' | 'R' | 'AVG'];
	}

	// ── Channel options derived from item data ──────────────────────────────────

	type ChannelOption = { value: string; label: string };

	let channelOptions = $derived.by((): ChannelOption[] => {
		const keys = Object.keys(item.channels) as ('L' | 'R' | 'AVG')[];
		const opts: ChannelOption[] = [];
		const hasL = keys.includes('L');
		const hasR = keys.includes('R');
		const hasAVG = keys.includes('AVG');
		if (hasL) opts.push({ value: 'L', label: m.selection_list_channel_left() });
		if (hasR) opts.push({ value: 'R', label: m.selection_list_channel_right() });
		if (hasL && hasR) opts.push({ value: 'L+R', label: m.selection_list_channel_left_and_right() });
		if (hasAVG) opts.push({ value: 'AVG', label: m.selection_list_channel_average() });
		return opts;
	});

	let currentChannelValue = $derived(dispChannelToSelectValue(item.dispChannel));

	// ── Trigger label ───────────────────────────────────────────────────────────

	let triggerLabel = $derived.by((): string => {
		const val = currentChannelValue;
		const opt = channelOptions.find((o) => o.value === val);
		return opt ? opt.label : val;
	});

	// ── Sample-set state ────────────────────────────────────────────────────────

	let samples = $derived(item.samples ?? []);
	let hasSamples = $derived(samples.length > 0);
	let dispSamples = $derived(item.dispSamples ?? []);
	let showFill = $derived(item.showFill ?? false);
	let showAvg = $derived(item.showAvg ?? true);
	/** A single run has no spread to fill, so the toggle would do nothing. */
	let canFill = $derived(samples.length > 1);

	/** Which channels a given run actually loaded. */
	function runChannels(index: number): ('L' | 'R' | 'AVG')[] {
		const sample = samples[index];
		if (!sample) return [];
		return (['L', 'R', 'AVG'] as const).filter((ch) => sample[ch]);
	}

	function runLabel(index: number): string {
		return samples[index]?.label ?? `${m.selection_list_samples_run()} ${index + 1}`;
	}

	// ── Handlers ────────────────────────────────────────────────────────────────

	function handleChannelChange(value: string): void {
		dataProvider.updateDisplayChannel(uuid, selectValueToDispChannel(value));
	}

	/**
	 * Toggle one channel of one run.
	 *
	 * The old HpTF control emitted `sample{n}_AVG` unconditionally, so an
	 * individual sample curve was always the L/R mean no matter which channel the
	 * user wanted. The renderer has always understood all three suffixes — the
	 * UI just never produced them.
	 */
	function handleSampleToggle(key: SampleDisplayKey): void {
		const current = [...dispSamples];
		const idx = current.indexOf(key);
		if (idx >= 0) current.splice(idx, 1);
		else current.push(key);
		dataProvider.updateSampleDisplay(uuid, current);
	}

	function keysFor(channels: ('L' | 'R' | 'AVG')[]): SampleDisplayKey[] {
		const keys: SampleDisplayKey[] = [];
		samples.forEach((_, i) => {
			for (const ch of channels) {
				if (samples[i]?.[ch]) keys.push(`sample${i}_${ch}` as SampleDisplayKey);
			}
		});
		return keys;
	}

	function handlePreset(preset: 'allL' | 'allR' | 'all' | 'none'): void {
		const next: SampleDisplayKey[] =
			preset === 'allL'
				? keysFor(['L'])
				: preset === 'allR'
					? keysFor(['R'])
					: preset === 'all'
						? keysFor(['L', 'R', 'AVG'])
						: [];
		dataProvider.updateSampleDisplay(uuid, next);
	}

	function isSampleChecked(key: SampleDisplayKey): boolean {
		return dispSamples.includes(key);
	}

	function handleFillToggle(): void {
		dataProvider.updateSampleDisplay(uuid, [...dispSamples], !showFill, showAvg);
	}

	function handleAvgToggle(): void {
		dataProvider.updateSampleDisplay(uuid, [...dispSamples], showFill, !showAvg);
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				title={triggerLabel}
				variant="outline"
				size="sm"
				class="h-7! min-w-14 justify-between! gap-1 rounded-sm! bg-base-200! px-2! hover:bg-base-content/10!"
			>
				{triggerLabel}
				<Ellipsis class="h-3 w-3 shrink-0 text-base-content/70" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			sideOffset={6}
			class="z-50 w-54 rounded-lg border border-base-content/15 bg-base-200 p-2 shadow-xl"
		>
			<!-- Section 1: Channel Display (radio buttons) -->
			<fieldset class="mb-0">
				{#each channelOptions as opt (opt.value)}
					<label
						class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs
							 hover:bg-base-300"
					>
						<input
							type="radio"
							name="{uuid}-channel"
							value={opt.value}
							checked={currentChannelValue === opt.value}
							onchange={() => handleChannelChange(opt.value)}
							class="accent-accent"
						/>
						{opt.label}
					</label>
				{/each}
			</fieldset>

			<!-- Section 2: Sample set — one section for every kind of set -->
			{#if hasSamples}
				<div class="mt-2 border-t border-base-content/8 pt-2">
					<p class="mb-1.5 px-1.5 text-xs font-medium text-base-content/60">
						{m.selection_list_samples_header()} ({samples.length})
					</p>

					<!-- Averaged curve -->
					<label
						class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
							 hover:bg-base-300"
					>
						<input
							type="checkbox"
							checked={showAvg}
							onchange={handleAvgToggle}
							class="accent-accent"
						/>
						{m.selection_list_samples_avg_toggle()}
					</label>

					<!-- Deviation fill -->
					{#if canFill}
						<label
							class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
								 hover:bg-base-300"
						>
							<input
								type="checkbox"
								checked={showFill}
								onchange={handleFillToggle}
								class="accent-accent"
							/>
							{m.selection_list_samples_fill_toggle()}
						</label>
					{/if}

					<!-- One row per run, with a checkbox per channel that run loaded -->
					<div class="mt-1 flex flex-col gap-0.5">
						{#each samples as _sample, i (i)}
							{@const channels = runChannels(i)}
							{#if channels.length > 0}
								<div class="flex items-center justify-between gap-2 px-1.5">
									<span class="truncate text-xs text-base-content/80">{runLabel(i)}</span>
									<div class="flex shrink-0 gap-1.5">
										{#each channels as ch (ch)}
											{@const key = `sample${i}_${ch}` as SampleDisplayKey}
											<label
												class="flex cursor-pointer items-center gap-0.5 rounded px-1 text-xs
													hover:bg-base-300"
											>
												<input
													type="checkbox"
													aria-label="{runLabel(i)} {ch}"
													checked={isSampleChecked(key)}
													onchange={() => handleSampleToggle(key)}
													class="accent-accent"
												/>
												{ch}
											</label>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
					</div>

					<!-- Preset buttons -->
					<div class="mt-1.5 flex gap-1 px-1">
						<Button
							title={m.selection_list_samples_all_l()}
							onclick={() => handlePreset('allL')}
							variant="muted"
							size="sm"
							class="flex-1"
						>
							{m.selection_list_samples_all_l()}
						</Button>
						<Button
							title={m.selection_list_samples_all_r()}
							onclick={() => handlePreset('allR')}
							variant="muted"
							size="sm"
							class="flex-1"
						>
							{m.selection_list_samples_all_r()}
						</Button>
					</div>
					<div class="mt-1.5 flex gap-1 px-1">
						<Button
							title={m.selection_list_samples_all()}
							onclick={() => handlePreset('all')}
							variant="muted"
							size="sm"
							class="flex-1"
						>
							{m.selection_list_samples_all()}
						</Button>
						<Button
							title={m.selection_list_samples_none()}
							onclick={() => handlePreset('none')}
							variant="muted"
							size="sm"
							class="flex-1"
						>
							{m.selection_list_samples_none()}
						</Button>
					</div>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
