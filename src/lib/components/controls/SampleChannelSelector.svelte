<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, SampleChannelKey, HpTFDisplayKey } from '$lib/types/data-types.js';
	import { Popover } from 'bits-ui';

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
	let hptfLabels = $derived(item.hptf?.labels ?? []);
	let dispHptf = $derived(item.dispHptf ?? []);
	let hptfFillVisible = $derived(item.hptfFillVisible ?? false);

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
		dataProvider.updateHpTFDisplay(uuid, [...dispHptf], !hptfFillVisible);
	}

	function handleHptfRigToggle(rigIndex: number): void {
		const current = [...dispHptf];
		// Find keys matching this rig (could be rig0_AVG, rig0_L, rig0_R)
		const rigPrefix = `rig${rigIndex}_`;
		const existingKeys = current.filter((k) => k.startsWith(rigPrefix));

		if (existingKeys.length > 0) {
			// Remove all keys for this rig
			const next = current.filter((k) => !k.startsWith(rigPrefix));
			dataProvider.updateHpTFDisplay(uuid, next, hptfFillVisible);
		} else {
			// Add AVG key for this rig (or L if no AVG)
			const rig = item.hptf?.rigs[rigIndex];
			if (rig) {
				const key = rig.AVG
					? `rig${rigIndex}_AVG`
					: rig.L
						? `rig${rigIndex}_L`
						: `rig${rigIndex}_R`;
				current.push(key as HpTFDisplayKey);
				dataProvider.updateHpTFDisplay(uuid, current, hptfFillVisible);
			}
		}
	}

	function handleHptfPreset(preset: 'all' | 'none'): void {
		if (preset === 'none') {
			dataProvider.updateHpTFDisplay(uuid, [], hptfFillVisible);
		} else {
			const keys: HpTFDisplayKey[] = [];
			item.hptf?.rigs.forEach((rig, i) => {
				if (rig.AVG) keys.push(`rig${i}_AVG` as HpTFDisplayKey);
				else if (rig.L) keys.push(`rig${i}_L` as HpTFDisplayKey);
				else if (rig.R) keys.push(`rig${i}_R` as HpTFDisplayKey);
			});
			dataProvider.updateHpTFDisplay(uuid, keys, hptfFillVisible);
		}
	}

	function isRigChecked(rigIndex: number): boolean {
		return dispHptf.some((k) => k.startsWith(`rig${rigIndex}_`));
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class="h-6 rounded border border-zinc-200 bg-white px-1.5 text-xs text-zinc-700
					hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-400
					dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
			>
				{triggerLabel}
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			sideOffset={6}
			class="z-50 w-48 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl
				dark:border-zinc-700 dark:bg-zinc-900"
		>
			<!-- Section 1: Channel Display (radio buttons) -->
			<fieldset class="mb-0">
				{#each channelOptions as opt (opt.value)}
					<label
						class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs
							text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
					>
						<input
							type="radio"
							name="{uuid}-channel"
							value={opt.value}
							checked={currentChannelValue === opt.value}
							onchange={() => handleChannelChange(opt.value)}
							class="accent-zinc-700 dark:accent-zinc-300"
						/>
						{opt.label}
					</label>
				{/each}
			</fieldset>

			<!-- Section 2: Sample Traces (checkboxes) -->
			{#if hasSamples}
				<div class="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
					<p class="mb-1.5 px-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
						{m.selection_list_samples_header()} ({sampleCount})
					</p>

					<!-- Sample checkboxes -->
					<div class="grid grid-cols-2 gap-0">
						{#each allSampleKeys as key (key)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
									text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
							>
								<input
									type="checkbox"
									checked={isSampleChecked(key)}
									onchange={() => handleSampleToggle(key)}
									class="accent-zinc-700 dark:accent-zinc-300"
								/>
								{key}
							</label>
						{/each}
					</div>

					<!-- Preset buttons -->
					<div class="mt-1.5 flex gap-1 px-1">
						<button
							onclick={() => handlePreset('allL')}
							class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors
								hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
						>
							{m.selection_list_samples_all_l()}
						</button>
						<button
							onclick={() => handlePreset('allR')}
							class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors
								hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
						>
							{m.selection_list_samples_all_r()}
						</button>
						<button
							onclick={() => handlePreset('all')}
							class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors
								hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
						>
							{m.selection_list_samples_all()}
						</button>
						<button
							onclick={() => handlePreset('none')}
							class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors
								hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
						>
							{m.selection_list_samples_none()}
						</button>
					</div>
				</div>
			{/if}

			<!-- Section 3: HpTF Rigs -->
			{#if hasHptf}
				<div class="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
					<p class="mb-1.5 px-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
						{m.selection_list_hptf_header()}
					</p>

					<!-- Fill toggle -->
					<label
						class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
							text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
					>
						<input
							type="checkbox"
							checked={hptfFillVisible}
							onchange={handleHptfFillToggle}
							class="accent-zinc-700 dark:accent-zinc-300"
						/>
						{m.selection_list_hptf_fill_toggle()}
					</label>

					<!-- Rig checkboxes -->
					{#each hptfLabels as label, i (i)}
						<label
							class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs
								text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
						>
							<input
								type="checkbox"
								checked={isRigChecked(i)}
								onchange={() => handleHptfRigToggle(i)}
								class="accent-zinc-700 dark:accent-zinc-300"
							/>
							{label}
						</label>
					{/each}

					<!-- Preset buttons -->
					<div class="mt-1.5 flex gap-1 px-1">
						<button
							onclick={() => handleHptfPreset('all')}
							class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors
								hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
						>
							{m.selection_list_hptf_all()}
						</button>
						<button
							onclick={() => handleHptfPreset('none')}
							class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors
								hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
						>
							{m.selection_list_hptf_none()}
						</button>
					</div>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
