<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import type { FRDataObject } from '$lib/types/data-types.js';
	import GraphColorWheel from '$lib/components/features/GraphColorWheel.svelte';
	import TargetCustomizer from '$lib/components/features/TargetCustomizer.svelte';
	import SampleChannelSelector from '$lib/components/controls/SampleChannelSelector.svelte';

	// ── Derived: sorted entries ──────────────────────────────────────────────────
	// Targets always first, phones/others after.
	const sortedEntries = $derived.by((): [string, FRDataObject][] => {
		const _size = frStore.size; // subscribe to size changes
		const entries = [...frStore.entries.entries()];
		return entries.sort(([, a], [, b]) => {
			if (a.type === 'target' && b.type !== 'target') return -1;
			if (b.type === 'target' && a.type !== 'target') return 1;
			return 0;
		});
	});

	// ── Per-item state (keyed by uuid) ──────────────────────────────────────────
	// Variant dropdowns open state
	let openVariantUUID = $state<string | null>(null);

	// ── Channel helpers ──────────────────────────────────────────────────────────
	type ChannelOption = { value: string; label: string };

	function getChannelOptions(item: FRDataObject): ChannelOption[] {
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
	}

	function dispChannelToSelectValue(dispChannel: ('L' | 'R' | 'AVG')[]): string {
		if (dispChannel.includes('L') && dispChannel.includes('R')) return 'L+R';
		return dispChannel[0] ?? 'AVG';
	}

	function selectValueToDispChannel(value: string): ('L' | 'R' | 'AVG')[] {
		if (value === 'L+R') return ['L', 'R'];
		return [value as 'L' | 'R' | 'AVG'];
	}

	function handleChannelChange(uuid: string, value: string) {
		dataProvider.updateDisplayChannel(uuid, selectValueToDispChannel(value));
	}

	// ── Y-offset long-press ──────────────────────────────────────────────────────
	// Timer lives at component level to survive re-renders triggered by frStore updates.
	// Per-render closures (via {@const}) would lose the timer reference on each re-render,
	// causing the interval to keep running after mouseup (runaway increment).
	let yOffsetTimer: ReturnType<typeof setInterval> | null = null;

	function startYOffset(uuid: string, direction: 'inc' | 'dec') {
		stopYOffset();
		const perform = () => {
			const item = frStore.get(uuid);
			if (!item) { stopYOffset(); return; }
			const next = (item.yOffset ?? 0) + (direction === 'inc' ? 1 : -1);
			dataProvider.updateYOffset(uuid, next);
		};
		perform();
		yOffsetTimer = setInterval(perform, 150);
	}

	function stopYOffset() {
		if (yOffsetTimer !== null) {
			clearInterval(yOffsetTimer);
			yOffsetTimer = null;
		}
	}

	function handleYOffsetInput(uuid: string, raw: string) {
		const val = parseFloat(raw);
		if (!isNaN(val)) dataProvider.updateYOffset(uuid, val);
	}

	// ── Baseline ────────────────────────────────────────────────────────────────
	function handleBaselineClick(uuid: string) {
		const item = frStore.get(uuid);
		const hasOriginal = graphStore.targetOriginalData.has(uuid);
		const isTargetItem = item && isTarget(item);

		if (!isTargetItem || !hasOriginal) {
			// Simple toggle for phones / targets without adjustments
			const isActive = graphStore.baselineUUID === uuid;
			graphEngine.updateBaselineData(!isActive, { uuid });
			graphStore.baselineUUID = isActive ? null : uuid;
			graphStore.baselineMode = isActive ? 'off' : 'adjusted';
			return;
		}

		// Three-mode cycle for targets with adjustments: off → adjusted → original → off
		const currentUUID = graphStore.baselineUUID;
		const currentMode = graphStore.baselineMode;

		if (currentUUID !== uuid) {
			// Different UUID or no baseline: start with adjusted
			graphEngine.updateBaselineData(true, { uuid });
			graphStore.baselineMode = 'adjusted';
		} else if (currentMode === 'adjusted') {
			// Switch to original
			const originalChannels = graphStore.targetOriginalData.get(uuid)!;
			const channelData = originalChannels['AVG']?.data ?? null;
			graphEngine.updateBaselineData(true, { uuid, channelData });
			graphStore.baselineMode = 'original';
		} else {
			// original → off
			graphEngine.updateBaselineData(false);
			graphStore.baselineMode = 'off';
		}
	}

	function getBaselineTooltip(uuid: string): string {
		if (graphStore.baselineUUID !== uuid) return m.selection_list_baseline_off();
		if (graphStore.baselineMode === 'original') return m.selection_list_baseline_original();
		return m.selection_list_baseline_adjusted();
	}

	// ── Variant dropdown ────────────────────────────────────────────────────────
	function toggleVariantDropdown(uuid: string) {
		openVariantUUID = openVariantUUID === uuid ? null : uuid;
	}

	async function handleVariantSelect(uuid: string, suffix: string) {
		openVariantUUID = null;
		try {
			await dataProvider.updateVariant(uuid, suffix);
		} catch (e) {
			console.error(e);
		}
	}

	// ── Type guard ───────────────────────────────────────────────────────────────
	function isTarget(item: FRDataObject): boolean {
		return item.type === 'target' || item.type === 'inserted-target';
	}
</script>

<div class="flex flex-col gap-0 overflow-y-auto pb-2">
	{#if sortedEntries.length === 0}
		<p class="px-3 py-6 text-center text-xs text-base-content/45">No curves loaded.</p>
	{/if}

	{#each sortedEntries as [uuid, item] (uuid)}
		{@const isBaseline = graphStore.baselineUUID === uuid}
		{@const channelOpts = getChannelOptions(item)}
		{@const currentChannelVal = dispChannelToSelectValue(item.dispChannel)}
		{@const hasVariants = !isTarget(item) && (item.meta as { files?: unknown[] } | undefined)?.files && ((item.meta as { files: unknown[] }).files.length > 1)}

		<div
			class="flex flex-col border-b border-base-content/8 px-3 py-2-muted
				{item.hidden ? 'opacity-50' : ''}"
		>
			<!-- Row 1: color swatch + name + action buttons -->
			<div class="flex items-center gap-2">
				<!-- Color swatch / picker -->
				<GraphColorWheel {uuid} {item} />

				<!-- Name + suffix -->
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-medium text-base-content">
						{item.identifier}
					</span>
					{#if item.dispSuffix}
						<span class="truncate text-xs text-base-content/45">{item.dispSuffix}</span>
					{/if}
				</div>

				<!-- Variant selector -->
				{#if hasVariants}
					<div class="relative">
						<button
							onclick={() => toggleVariantDropdown(uuid)}
							aria-label="Switch variant"
							class="flex h-7 w-7 items-center justify-center rounded text-xs font-bold transition-colors
								text-base-content/55 hover:bg-base-300 hover:text-base-content
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
						>
							+
						</button>

						{#if openVariantUUID === uuid}
							<div
								class="absolute right-0 top-8 z-10 min-w-max rounded-md border border-base-content/15
									bg-base-200 shadow-lg"
							>
								{#each (item.meta as { files: { suffix: string }[] }).files as variant (variant.suffix)}
									<button
										onclick={() => handleVariantSelect(uuid, variant.suffix)}
										class="block w-full px-3 py-1.5 text-left text-xs text-base-content/60
											hover:bg-base-300
											{item.dispSuffix === variant.suffix ? 'font-semibold' : ''}"
									>
										{variant.suffix || '(default)'}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Baseline button -->
				<button
					onclick={() => handleBaselineClick(uuid)}
					aria-label={getBaselineTooltip(uuid)}
					class="flex h-7 w-7 items-center justify-center rounded text-sm transition-colors
						focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
						{isBaseline
						? graphStore.baselineMode === 'original'
							? 'border border-accent text-accent'
							: 'bg-accent text-accent-content'
						: 'text-base-content/55 hover:bg-base-300 hover:text-base-content/60'}"
				>
					{isBaseline && graphStore.baselineMode === 'original' ? '~*' : '~'}
				</button>

				<!-- Visibility toggle -->
				<button
					onclick={() => {
						const willBeHidden = !item.hidden;
						graphEngine.updateVisibility(uuid, !willBeHidden);
						dataProvider.updateVisibility(uuid, willBeHidden);
					}}
					aria-label={item.hidden ? 'Show' : 'Hide'}
					class="flex h-7 w-7 items-center justify-center rounded transition-colors
						text-base-content/55 hover:bg-base-300 hover:text-base-content/60
						focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true">
						{#if item.hidden}
							<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
							<line x1="1" y1="1" x2="23" y2="23" />
						{:else}
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						{/if}
					</svg>
				</button>

				<!-- Delete button -->
				<button
					onclick={() => dataProvider.removeFRDataWithUUID(item.type, uuid)}
					aria-label="Remove"
					class="flex h-7 w-7 items-center justify-center rounded transition-colors
						text-base-content/55 hover:bg-error/10 hover:text-error
						focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<!-- Row 2: channel select + y-offset controls -->
			<div class="mt-1.5 flex items-center gap-2 pl-6">
				<!-- Channel select (not for targets) -->
				{#if !isTarget(item) && channelOpts.length > 0}
					{#if (item.sampleCount && item.sampleCount > 0) || item.hptf}
						<SampleChannelSelector {uuid} {item} />
					{:else}
						<select
							value={currentChannelVal}
							onchange={(e) => handleChannelChange(uuid, e.currentTarget.value)}
							aria-label="Channel"
							class="h-7 rounded border border-base-content/20 bg-base-200 px-1 text-xs text-base-content/60
								focus:outline-none focus:ring-1 focus:ring-accent"
						>
							{#each channelOpts as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					{/if}
				{/if}

				<!-- Y-offset controls -->
				<div class="ml-auto flex items-center gap-1">
					<button
						onmousedown={() => startYOffset(uuid, 'dec')}
						onmouseup={stopYOffset}
						onmouseleave={stopYOffset}
						aria-label="Decrease Y offset"
						class="flex h-6 w-6 items-center justify-center rounded-full bg-accent
							text-xs font-bold text-accent-content transition-colors hover:bg-accent/80
							focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					>
						−
					</button>

					<input
						type="number"
						value={item.yOffset ?? 0}
						oninput={(e) => handleYOffsetInput(uuid, e.currentTarget.value)}
						aria-label="Y offset"
						class="h-7 w-12 rounded border border-base-content/20 bg-base-200 text-center text-xs
							text-base-content/60 focus:outline-none focus:ring-1 focus:ring-accent"
					/>

					<button
						onmousedown={() => startYOffset(uuid, 'inc')}
						onmouseup={stopYOffset}
						onmouseleave={stopYOffset}
						aria-label="Increase Y offset"
						class="flex h-6 w-6 items-center justify-center rounded-full bg-accent
							text-xs font-bold text-accent-content transition-colors hover:bg-accent/80
							focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					>
						+
					</button>
				</div>
			</div>

			<!-- Row 3: Target Customizer (for target items only) -->
			{#if isTarget(item)}
				<TargetCustomizer {uuid} {item} />
			{/if}
		</div>
	{/each}
</div>
