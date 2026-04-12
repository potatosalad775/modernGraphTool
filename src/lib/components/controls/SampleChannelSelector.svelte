<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, SampleChannelKey, HpTFDisplayKey } from '$lib/types/data-types.js';
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

	// ── Sample state ────────────────────────────────────────────────────────────

	let hasSamples = $derived((item.sampleCount ?? 0) > 0);
	let sampleCount = $derived(item.sampleCount ?? 0);

	/** All possible sample channel keys for this item */
	let allSampleKeys = $derived.by((): SampleChannelKey[] => {
		const keys: SampleChannelKey[] = [];
		for (let i = 1; i <= sampleCount; i++) {
			keys.push(`L${i}` as SampleChannelKey);
			keys.push(`R${i}` as SampleChannelKey);
		}
		return keys;
	});

	/** Currently displayed sample keys */
	let dispSamples = $derived(item.dispSamples ?? []);

	// ── HpTF state ──────────────────────────────────────────────────────────────

	let hasHptf = $derived(!!item.hptf);
	let hptfFillOnly = $derived(item.hptf?.fillOnly ?? true);
	let hptfSamples = $derived(item.hptf?.samples ?? []);
	let dispHptf = $derived(item.dispHptf ?? []);
	let hptfFillVisible = $derived(item.hptfFillVisible ?? false);
	let hptfAvgVisible = $derived(item.hptfAvgVisible ?? false);

	// ── Handlers ────────────────────────────────────────────────────────────────

	function handleChannelChange(value: string): void {
		dataProvider.updateDisplayChannel(uuid, selectValueToDispChannel(value));
	}

	function handleSampleToggle(key: SampleChannelKey): void {
		const current = [...dispSamples];
		const idx = current.indexOf(key);
		if (idx >= 0) {
			current.splice(idx, 1);
		} else {
			current.push(key);
		}
		dataProvider.updateSampleDisplay(uuid, current);
	}

	function handlePreset(preset: 'allL' | 'allR' | 'all' | 'none'): void {
		let next: SampleChannelKey[] = [];
		switch (preset) {
			case 'allL':
				next = allSampleKeys.filter((k) => k.startsWith('L'));
				break;
			case 'allR':
				next = allSampleKeys.filter((k) => k.startsWith('R'));
				break;
			case 'all':
				next = [...allSampleKeys];
				break;
			case 'none':
				next = [];
				break;
		}
		dataProvider.updateSampleDisplay(uuid, next);
	}

	function isSampleChecked(key: SampleChannelKey): boolean {
		return dispSamples.includes(key);
	}

	// ── HpTF handlers ───────────────────────────────────────────────────────────

	function handleHptfFillToggle(): void {
		dataProvider.updateHpTFDisplay(uuid, [...dispHptf], !hptfFillVisible, hptfAvgVisible);
	}

	function handleHptfAvgToggle(): void {
		dataProvider.updateHpTFDisplay(uuid, [...dispHptf], hptfFillVisible, !hptfAvgVisible);
	}

	function handleHptfSampleToggle(sampleIndex: number): void {
		const current = [...dispHptf];
		// Find keys matching this sample (could be sample0_AVG, sample0_L, sample0_R)
		const samplePrefix = `sample${sampleIndex}_`;
		const existingKeys = current.filter((k) => k.startsWith(samplePrefix));

		if (existingKeys.length > 0) {
			// Remove all keys for this sample
			const next = current.filter((k) => !k.startsWith(samplePrefix));
			dataProvider.updateHpTFDisplay(uuid, next, hptfFillVisible, hptfAvgVisible);
		} else {
			// Add AVG key for this sample (or L if no AVG)
			const sample = item.hptf?.samples[sampleIndex];
			if (sample) {
				const key = sample.AVG
					? `sample${sampleIndex}_AVG`
					: sample.L
						? `sample${sampleIndex}_L`
						: `sample${sampleIndex}_R`;
				current.push(key as HpTFDisplayKey);
				dataProvider.updateHpTFDisplay(uuid, current, hptfFillVisible, hptfAvgVisible);
			}
		}
	}

	function handleHptfPreset(preset: 'all' | 'none'): void {
		if (preset === 'none') {
			dataProvider.updateHpTFDisplay(uuid, [], hptfFillVisible, hptfAvgVisible);
		} else {
			const keys: HpTFDisplayKey[] = [];
			item.hptf?.samples.forEach((sample, i) => {
				if (sample.AVG) keys.push(`sample${i}_AVG` as HpTFDisplayKey);
				else if (sample.L) keys.push(`sample${i}_L` as HpTFDisplayKey);
				else if (sample.R) keys.push(`sample${i}_R` as HpTFDisplayKey);
			});
			dataProvider.updateHpTFDisplay(uuid, keys, hptfFillVisible, hptfAvgVisible);
		}
	}

	function isHptfSampleChecked(sampleIndex: number): boolean {
		return dispHptf.some((k) => k.startsWith(`sample${sampleIndex}_`));
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				title={triggerLabel}
				variant="outline" size="sm"
				class="h-7! px-2! justify-between! gap-1 min-w-14 rounded-sm! bg-base-200!"
			>
				{triggerLabel}
				<Ellipsis class="h-3 w-3 shrink-0 text-base-content/70" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			sideOffset={6} align="end"
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

			<!-- Section 2: Sample Traces (checkboxes) -->
			{#if hasSamples}
				<div class="mt-2 border-t border-base-content/8 pt-2">
					<p class="mb-1.5 px-1.5 text-xs font-medium text-base-content/60">
						{m.selection_list_samples_header()} ({sampleCount})
					</p>

					<!-- Sample checkboxes -->
					<div class="grid grid-cols-2 gap-0">
						{#each allSampleKeys as key (key)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
									 hover:bg-base-300"
							>
								<input
									type="checkbox"
									checked={isSampleChecked(key)}
									onchange={() => handleSampleToggle(key)}
									class="accent-accent"
								/>
								{key}
							</label>
						{/each}
					</div>

					<!-- Preset buttons -->
					<div class="mt-1.5 flex gap-1 px-1">
						<Button
							title={m.selection_list_samples_all_l()}
							onclick={() => handlePreset('allL')}
							variant="muted" size="sm" class="flex-1"
						>
							{m.selection_list_samples_all_l()}
						</Button>
						<Button
							title={m.selection_list_samples_all_r()}
							onclick={() => handlePreset('allR')}
							variant="muted" size="sm" class="flex-1"
						>
							{m.selection_list_samples_all_r()}
						</Button>
					</div>
					<div class="mt-1.5 flex gap-1 px-1">
						<Button
							title={m.selection_list_samples_all()}
							onclick={() => handlePreset('all')}
							variant="muted" size="sm" class="flex-1"
						>
							{m.selection_list_samples_all()}
						</Button>
						<Button
							title={m.selection_list_samples_none()}
							onclick={() => handlePreset('none')}
							variant="muted" size="sm" class="flex-1"
						>
							{m.selection_list_samples_none()}
						</Button>
					</div>
				</div>
			{/if}

			<!-- Section 3: HpTF Samples -->
			{#if hasHptf}
				<div class="mt-2 border-t border-base-content/8 pt-2">
					<p class="mb-1.5 px-1.5 text-xs font-medium text-base-content/60">
						{m.selection_list_hptf_header()}
					</p>

					<!-- Fill toggle -->
					<label
						class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
							 hover:bg-base-300"
					>
						<input
							type="checkbox"
							checked={hptfFillVisible}
							onchange={handleHptfFillToggle}
							class="accent-accent"
						/>
						{m.selection_list_hptf_fill_toggle()}
					</label>

					<!-- Average toggle -->
					<label
						class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
							 hover:bg-base-300"
					>
						<input
							type="checkbox"
							checked={hptfAvgVisible}
							onchange={handleHptfAvgToggle}
							class="accent-accent"
						/>
						{m.selection_list_hptf_avg_toggle()}
					</label>

					<!-- Sample checkboxes: only when fillOnly is false -->
					{#if !hptfFillOnly && hptfSamples.length > 0}
						{#each hptfSamples as sample, i (i)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
									ml-2 hover:bg-base-300"
							>
								<input
									type="checkbox"
									checked={isHptfSampleChecked(i)}
									onchange={() => handleHptfSampleToggle(i)}
									class="accent-accent"
								/>
								{sample.label}
							</label>
						{/each}

						<!-- Preset buttons -->
						<div class="mt-1.5 flex gap-1 px-0.5">
							<Button
								title={m.selection_list_hptf_all()}
								onclick={() => handleHptfPreset('all')}
								variant="muted" size="sm" class="flex-1"
							>
								{m.selection_list_hptf_all()}
							</Button>
							<Button
								title={m.selection_list_hptf_none()}
								onclick={() => handleHptfPreset('none')}
								variant="muted" size="sm" class="flex-1"
							>
								{m.selection_list_hptf_none()}
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
