<script lang="ts">
	import { untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, SampleDisplayKey } from '$lib/types/data-types.js';
	import { Popover } from 'bits-ui';
	import Button from '../atoms/Button.svelte';
	import { ChevronDown, Ellipsis } from '@lucide/svelte';

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

	// Event handlers read straight off `item` rather than through `$derived`
	// aliases: a handler can fire after the effect a derived belongs to is torn
	// down, which Svelte warns about (`derived_inert`) and answers with a
	// possibly stale value.
	const runsOf = () => item.samples ?? [];
	const dispSamplesOf = () => item.dispSamples ?? [];
	const showFillOf = () => item.showFill ?? false;
	const showAvgOf = () => item.showAvg ?? true;

	/**
	 * One row per run that loaded something, with a checkbox per channel it has.
	 * Rows carry their own checked state so the template needs no `{@const}` or
	 * per-checkbox lookup inside the loop.
	 */
	let sampleRows = $derived.by(() => {
		const disp = item.dispSamples ?? [];
		return (item.samples ?? [])
			.map((run, index) => ({
				index,
				label: run.label ?? `${m.selection_list_samples_run()} ${index + 1}`,
				boxes: (['L', 'R', 'AVG'] as const)
					.filter((channel) => run[channel])
					.map((channel) => {
						const key = `sample${index}_${channel}` as SampleDisplayKey;
						return { channel, key, checked: disp.includes(key) };
					})
			}))
			.filter((row) => row.boxes.length > 0);
	});

	let showAvg = $derived(item.showAvg ?? true);
	let showFill = $derived(item.showFill ?? false);

	let selectedRunCount = $derived(
		sampleRows.reduce((total, row) => total + row.boxes.filter((box) => box.checked).length, 0)
	);

	/**
	 * Per-run curves are collapsed by default. Most visitors only ever want the
	 * averaged curve, and an unbounded run list made the popover taller than the
	 * viewport on sets with many runs.
	 *
	 * Opened up front when the item already displays runs — a `?share=` link or a
	 * variant configured `display: ['curves']` would otherwise hide the very
	 * checkboxes that explain what is on the graph.
	 */
	let runsOpen = $state(untrack(() => (item.dispSamples ?? []).length > 0));

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
		const current = [...dispSamplesOf()];
		const idx = current.indexOf(key);
		if (idx >= 0) current.splice(idx, 1);
		else current.push(key);
		dataProvider.updateSampleDisplay(uuid, current);
	}

	function keysFor(channels: ('L' | 'R' | 'AVG')[]): SampleDisplayKey[] {
		const keys: SampleDisplayKey[] = [];
		runsOf().forEach((run, i) => {
			for (const ch of channels) {
				if (run[ch]) keys.push(`sample${i}_${ch}` as SampleDisplayKey);
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

	function handleFillToggle(): void {
		dataProvider.updateSampleDisplay(uuid, [...dispSamplesOf()], !showFillOf(), showAvgOf());
	}

	function handleAvgToggle(): void {
		dataProvider.updateSampleDisplay(uuid, [...dispSamplesOf()], showFillOf(), !showAvgOf());
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
				class="h-7 min-w-14 justify-between gap-1 rounded-sm bg-base-200 px-2 hover:bg-base-content/10"
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
			<!--
				Section 1: Channel display.

				Governs more than the averaged curve, so it stays visible whatever the
				sample toggles below are set to: `_buildEnvelopePath` picks which side
				of the deviation fill to draw off `dispChannel`, and so do the baseline,
				the hover readout and the EQ overlay.
			-->
			<fieldset class="mb-0">
				<legend class="mb-1 px-1.5 text-xs font-medium text-base-content/60">
					{m.selection_list_channel_header()}
				</legend>
				<div class="flex flex-wrap gap-x-1">
					{#each channelOptions as opt (opt.value)}
						<label
							class="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs
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
				</div>
			</fieldset>

			<!-- Section 2: Sample set — one section for every kind of set -->
			{#if sampleRows.length > 0}
				<div class="mt-2 border-t border-base-content/8 pt-2">
					<p class="mb-1.5 px-1.5 text-xs font-medium text-base-content/60">
						{m.selection_list_samples_header()} ({sampleRows.length})
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

					<!-- Deviation fill. A single run has no spread, so the toggle is hidden. -->
					{#if sampleRows.length > 1}
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

					<!--
						Per-run curves, behind a disclosure. The list is capped and scrolls:
						a set with a dozen runs used to push the popover past the viewport.
					-->
					<Button
						title={m.selection_list_samples_runs_toggle()}
						onclick={() => (runsOpen = !runsOpen)}
						aria-expanded={runsOpen}
						aria-controls="{uuid}-sample-runs"
						variant="muted"
						size="sm"
						class="mt-1 w-full justify-start gap-1 rounded px-1.5 py-1 font-normal
							 hover:bg-base-300"
					>
						<ChevronDown
							class="h-3 w-3 shrink-0 transition-transform {runsOpen ? '' : '-rotate-90'}"
						/>
						<span class="truncate">{m.selection_list_samples_runs_toggle()}</span>
						{#if selectedRunCount > 0}
							<span class="ml-auto shrink-0 text-base-content/60">{selectedRunCount}</span>
						{/if}
					</Button>

					{#if runsOpen}
						<div id="{uuid}-sample-runs">
							<!-- One row per run, with a checkbox per channel that run loaded -->
							<div class="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
								{#each sampleRows as row (row.index)}
									<div class="flex items-center justify-between gap-2 px-1.5">
										<span class="truncate text-xs text-base-content/80">{row.label}</span>
										<div class="flex shrink-0 gap-1.5">
											{#each row.boxes as box (box.key)}
												<label
													class="flex cursor-pointer items-center gap-0.5 rounded px-1 text-xs
												hover:bg-base-300"
												>
													<input
														type="checkbox"
														aria-label="{row.label} {box.channel}"
														checked={box.checked}
														onchange={() => handleSampleToggle(box.key)}
														class="accent-accent"
													/>
													{box.channel}
												</label>
											{/each}
										</div>
									</div>
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
				</div>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
