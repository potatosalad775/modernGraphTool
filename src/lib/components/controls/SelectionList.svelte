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
	import { Check, ChevronDown, Eye, EyeOff, Minus, Plus, Trash2 } from '@lucide/svelte';
	import PopoverPanel from '$lib/components/atoms/PopoverPanel.svelte';
	import Button from '../atoms/Button.svelte';
	import GraphUploader from './GraphUploader.svelte';

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
			graphStore.baselineMode = isActive ? 'off' : 'withoutAdjustment';
			return;
		}

		// Three-mode cycle for targets with adjustments: off → withoutAdjustment → withAdjustment → off
		const currentUUID = graphStore.baselineUUID;
		const currentMode = graphStore.baselineMode;

		if (currentUUID !== uuid) {
			// Different UUID or no baseline: start with withoutAdjustment
			const originalChannels = graphStore.targetOriginalData.get(uuid)!;
			const channelData = originalChannels['AVG']?.data ?? null;
			graphEngine.updateBaselineData(true, { uuid, channelData });
			graphStore.baselineMode = 'withoutAdjustment';
		} else if (currentMode === 'withoutAdjustment') {
			// withoutAdjustment -> withAdjustment
			graphEngine.updateBaselineData(true, { uuid });
			graphStore.baselineMode = 'withAdjustment';
		} else {
			// withAdjustment -> off
			graphEngine.updateBaselineData(false);
			graphStore.baselineMode = 'off';
		}
	}

	function getBaselineTooltip(uuid: string): string {
		if (graphStore.baselineUUID !== uuid) return m.selection_list_baseline_off();
		if (graphStore.baselineMode === 'withAdjustment') return m.selection_list_baseline_with_adjustment();
		return m.selection_list_baseline_without_adjustment();
	}

	// ── Variant dropdown ────────────────────────────────────────────────────────
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

<div class="flex flex-col flex-1 gap-0 overflow-y-auto pb-2">
	{#if sortedEntries.length === 0}
		<p class="px-3 py-6 text-center text-xs text-base-content/60">No curves loaded.</p>
	{/if}

	{#each sortedEntries as [uuid, item] (uuid)}
		{@const isBaseline = graphStore.baselineUUID === uuid}
		{@const channelOpts = getChannelOptions(item)}
		{@const currentChannelVal = dispChannelToSelectValue(item.dispChannel)}
		{@const variantFiles = (!isTarget(item) && (item.meta as { files?: { suffix: string }[] })?.files) || []}
		{@const hasVariants = variantFiles.length > 1}

		<div
			class="flex flex-col border-b border-base-content/8 p-3 gap-2
				{item.hidden ? 'opacity-50' : ''}"
		>
			<!-- Row 1: color swatch + name + action buttons -->
			<div class="flex flex-1 items-start gap-2">
				<!-- Color swatch / picker -->
				<GraphColorWheel {uuid} {item} />

				<!-- Name + suffix / variant trigger -->
				{#if hasVariants}
					<PopoverPanel
						open={openVariantUUID === uuid}
						onOpenChange={(v) => {
							if (v) openVariantUUID = uuid;
							else if (openVariantUUID === uuid) openVariantUUID = null;
						}}
						contentClass="w-52"
						trapFocus={false}
					>
						{#snippet trigger({ props })}
							<button
								{...props}
								class="group flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-0.5 -mt-0.5 -ml-1.5
									text-left transition-colors hover:bg-base-content/5
									data-[state=open]:bg-base-content/5"
							>
								<div class="flex min-w-0 flex-1 flex-col">
									<span class="truncate text-sm font-medium text-base-content">
										{item.identifier}
									</span>
									{#if item.dispSuffix}
										<span class="flex flex-row items-center gap-0.5">
											<span class="truncate text-xs text-base-content/60">{item.dispSuffix}</span>
											<ChevronDown class="h-3 w-3 shrink-0 text-base-content/65 transition-transform
												group-data-[state=open]:rotate-180" />
										</span>
									{/if}
									{#if item.hptfFillVisible && item.hptf?.description}
										<span class="truncate text-xs text-base-content/50">{item.hptf.description}</span>
									{/if}
								</div>
							</button>
						{/snippet}

						<div class="flex flex-col">
							{#each variantFiles as variant (variant.suffix)}
								{@const isSelected = item.dispSuffix === variant.suffix}
								<button
									onclick={() => handleVariantSelect(uuid, variant.suffix)}
									class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors
										{isSelected ? 'bg-accent/10 text-accent font-medium' : 'text-base-content/70 hover:bg-base-content/5'}"
								>
									{variant.suffix || '(default)'}
									<Check class="h-4 w-4 shrink-0 {isSelected ? 'opacity-100' : 'opacity-0'}" />
								</button>
							{/each}
						</div>
					</PopoverPanel>
				{:else}
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-sm font-medium text-base-content">
							{item.identifier}
						</span>
						{#if item.dispSuffix}
							<span class="truncate text-xs text-base-content/60">{item.dispSuffix}</span>
						{/if}
						{#if item.hptfFillVisible && item.hptf?.description}
							<span class="truncate text-xs text-base-content/50">{item.hptf.description}</span>
						{/if}
					</div>
				{/if}

				<div class="-mt-1 mb-2 -mr-1 flex items-center justify-end gap-1">
					<!-- Target Customizer (for target items only) -->
					{#if isTarget(item)}
						<TargetCustomizer {uuid} {item} />
					{/if}

					<!-- Baseline button -->
					<Button
						title={getBaselineTooltip(uuid)}
						onclick={() => handleBaselineClick(uuid)}
						aria-label={getBaselineTooltip(uuid)}
						variant="ghost" size="icon"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
							{#if isBaseline && graphStore.baselineMode === 'withoutAdjustment'}
								<path d="M12.5935 23.2578l-0.0116 0.0017 -0.071 0.0355 -0.019 0.0037 -0.0152 -0.0037 -0.071 -0.0355c-0.0099 -0.0031 -0.0187 -0.0005 -0.0236 0.0054l-0.0041 0.0109 -0.0171 0.4273 0.005 0.0204 0.011 0.0122 0.1036 0.074 0.0148 0.0039 0.0118 -0.0039 0.1036 -0.074 0.0126 -0.016 0.0034 -0.0166 -0.0171 -0.4273c-0.002 -0.0101 -0.0086 -0.0165 -0.0161 -0.018Zm0.2649 -0.1125 -0.0139 0.002 -0.1847 0.0924 -0.0099 0.0102 -0.0027 0.0112 0.0179 0.4295 0.0048 0.0128 0.0085 0.0071 0.2009 0.0927c0.0121 0.0037 0.0229 -0.0002 0.0285 -0.008l0.004 -0.014 -0.0341 -0.6147c-0.0024 -0.0119 -0.0103 -0.0195 -0.0193 -0.0212Zm-0.7154 0.002c-0.0098 -0.0049 -0.0208 -0.002 -0.0274 0.0053l-0.0057 0.0139 -0.0341 0.6147c-0.0007 0.0115 0.007 0.0207 0.0168 0.0234l0.0157 -0.0014 0.2009 -0.0927 0.0094 -0.0081 0.0039 -0.0118 0.0179 -0.4295 -0.0032 -0.0126 -0.0094 -0.0088 -0.1848 -0.0924Z" stroke-width="5"></path><path d="M20.7071 3.29289c0.3905 0.39053 0.3905 1.02369 0 1.41422L4.70711 20.7071c-0.39053 0.3905 -1.02369 0.3905 -1.41422 0 -0.39052 -0.3905 -0.39052 -1.0237 0 -1.4142L19.2929 3.29289c0.3905 -0.39052 1.0237 -0.39052 1.4142 0Z" stroke-width="5"></path>
							{:else if isBaseline && graphStore.baselineMode === 'withAdjustment'}
								<path d="M2 12C2 11.4477 2.44772 11 3 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H3C2.44772 13 2 12.5523 2 12Z"></path>
							{:else}
								<path d="M22.768125 12.478124999999999c-2.15625 4.59375 -4.03125 6.6468750000000005 -6.076874999999999 6.6468750000000005 -2.59125 0 -4.106249999999999 -3.22875 -5.709375 -6.6468750000000005 -0.6693749999999999 -1.43625 -1.3696875 -2.9156250000000004 -2.083125 -3.9721874999999995C8.2865625 7.6021875 7.7371875 7.125 7.3125 7.125c-0.35812499999999997 0 -1.71 0.38625 -4.0396875 5.353125a1.125 1.125 0 0 1 -2.0371875 -0.9562499999999999c2.15625 -4.59375 4.03125 -6.6468750000000005 6.076874999999999 -6.6468750000000005 2.59125 0 4.106249999999999 3.22875 5.709375 6.6468750000000005 0.6740625 1.43625 1.3696875 2.9203124999999996 2.083125 3.9721874999999995 0.6121875 0.90375 1.1615625 1.3809375 1.59375 1.3809375 0.35812499999999997 0 1.71 -0.38625 4.0396875 -5.353125a1.125 1.125 0 0 1 2.0371875 0.9562499999999999Z"></path>
							{/if}
						</svg>
					</Button>

					<!-- Visibility toggle -->
					<Button
						title={item.hidden ? 'Show' : 'Hide'}
						onclick={() => {
							const willBeHidden = !item.hidden;
							graphEngine.updateVisibility(uuid, !willBeHidden);
							dataProvider.updateVisibility(uuid, willBeHidden);
						}}
						aria-label={item.hidden ? 'Show' : 'Hide'}
						variant="ghost" size="icon"
					>
						{#if item.hidden}
							<EyeOff class="h-4 w-4" aria-hidden="true" />
						{:else}
							<Eye class="h-4 w-4" aria-hidden="true" />
						{/if}
					</Button>

					<!-- Delete button -->
					<Button
						title="Remove"
						onclick={() => dataProvider.removeFRDataWithUUID(item.type, uuid)}
						aria-label="Remove"
						variant="ghost" size="icon"
						class="hover:bg-error/10 hover:text-error"
					>
						<Trash2 class="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			<!-- Row 2: action buttons -->
			<div class="flex flex-col -mt-2">

				<div class="flex justify-end flex-wrap items-center gap-3">
					<!-- Channel select (not for targets) -->
					{#if !isTarget(item) && channelOpts.length > 0}
						{#if (item.sampleCount && item.sampleCount > 0) || item.hptf}
							<SampleChannelSelector {uuid} {item} />
						{:else}
							<select
								value={currentChannelVal}
								onchange={(e) => handleChannelChange(uuid, e.currentTarget.value)}
								aria-label="Channel"
								class="h-7 rounded border border-base-content/20 bg-base-200 px-1 text-xs 
									focus:outline-none focus:ring-1 focus:ring-accent"
							>
								{#each channelOpts as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{/if}
					{/if}

					<!-- Y-offset controls -->
					<div class="flex items-center gap-1">
						<Button
							title="Decrease Y offset"
							onmousedown={() => startYOffset(uuid, 'dec')}
							onmouseup={stopYOffset}
							onmouseleave={stopYOffset}
							aria-label="Decrease Y offset"
							variant="secondary" size="icon"
							class="p-1! rounded-full!"
						>
							<Minus class="h-4 w-4" aria-hidden="true" />
						</Button>

						<input
							type="number" name="yOffset" id="yOffset_{uuid}"
							value={item.yOffset ?? 0}
							oninput={(e) => handleYOffsetInput(uuid, e.currentTarget.value)}
							aria-label="Y offset"
							class="h-7 w-12 rounded border border-base-content/20 bg-base-200 text-center text-xs
									focus:outline-none focus:ring-1 focus:ring-accent"
						/>

						<Button
							title="Increase Y offset"
							onmousedown={() => startYOffset(uuid, 'inc')}
							onmouseup={stopYOffset}
							onmouseleave={stopYOffset}
							aria-label="Increase Y offset"
							variant="secondary" size="icon"
							class="p-1! rounded-full!"
						>
							<Plus class="h-4 w-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	{/each}
	
	<!-- Graph Uploader -->
	<div class="px-2 py-4 -mb-2">
		<GraphUploader />
	</div>
</div>
