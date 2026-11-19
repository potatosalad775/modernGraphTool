<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { frStore } from '#lib/stores/fr-store.svelte.js';
	import { graphEngine } from '#lib/graph/GraphEngine.svelte.js';
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import { baseline } from '#lib/graph/baseline.js';
	import type { BaselineMode } from '#lib/types/data-types.js';
	import { getConfigValue } from '#lib/utils/config.js';
	import { isTargetType, type FRDataObject, type PhoneFileVariant } from '#lib/types/data-types.js';
	import {
		channelOptions,
		dispChannelToSelectValue,
		selectValueToDispChannel
	} from '#lib/utils/channel-choice.js';
	import GraphColorPicker from '#lib/components/features/GraphColorPicker.svelte';
	import TargetCustomizer from '#lib/components/features/TargetCustomizer.svelte';
	import SampleChannelSelector from '#lib/components/controls/SampleChannelSelector.svelte';
	import DownloadButton from '#lib/components/controls/DownloadButton.svelte';
	import { Check, ChevronDown, Eye, EyeOff, Minus, Plus, Trash } from '@lucide/svelte';
	import PopoverPanel from '#lib/components/atoms/PopoverPanel.svelte';
	import Button from '../atoms/Button.svelte';
	import GraphUploader from './GraphUploader.svelte';

	// ── Derived: sorted entries ──────────────────────────────────────────────────
	// Targets always first, phones/others after.
	const sortedEntries = $derived.by((): [string, FRDataObject][] => {
		const _size = frStore.size; // subscribe to size changes
		const entries = [...frStore.entries.entries()];
		return entries.sort(([, a], [, b]) => Number(isTargetType(b)) - Number(isTargetType(a)));
	});

	// ── Per-item state (keyed by uuid) ──────────────────────────────────────────
	// Variant dropdowns open state
	let openVariantUUID = $state<string | null>(null);

	// Off by default — set DOWNLOAD.ENABLED in config.js to expose it.
	const downloadEnabled = $derived(Boolean(getConfigValue('DOWNLOAD.ENABLED')));

	function handleChannelChange(uuid: string, value: string) {
		dataProvider.updateDisplayChannel(uuid, selectValueToDispChannel(value));
	}

	// ── Y-offset long-press ──────────────────────────────────────────────────────
	// Timer lives at component level to survive re-renders triggered by frStore updates.
	// Per-render closures (via {@const}) would lose the timer reference on each re-render,
	// causing the interval to keep running after release (runaway increment).
	// Pointer events, not mouse events: a touch press gets the same hold-to-repeat, and pointer
	// capture keeps the release coming to the button even after the finger or cursor drifts off.
	// A keyboard activation has no pointer, so `onclick` (detail 0) steps once instead.
	let yOffsetTimer: ReturnType<typeof setInterval> | null = null;

	function stepYOffset(uuid: string, direction: 'inc' | 'dec'): boolean {
		const item = frStore.get(uuid);
		if (!item) return false;
		const next = (item.yOffset ?? 0) + (direction === 'inc' ? 1 : -1);
		dataProvider.updateYOffset(uuid, next);
		return true;
	}

	function startYOffset(e: PointerEvent, uuid: string, direction: 'inc' | 'dec') {
		// Primary pointer, primary button only: a right-click must not start a repeat.
		if (!e.isPrimary || e.button !== 0) return;
		stopYOffset();
		try {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		} catch {
			// The pointer is already gone; the step below still runs and pointerup cleans up.
		}
		if (!stepYOffset(uuid, direction)) return;
		yOffsetTimer = setInterval(() => {
			if (!stepYOffset(uuid, direction)) stopYOffset();
		}, 150);
	}

	function stopYOffset() {
		if (yOffsetTimer !== null) {
			clearInterval(yOffsetTimer);
			yOffsetTimer = null;
		}
	}

	// Enter / Space on a focused button. A pointer click has `detail >= 1` and was already
	// stepped by `pointerdown`.
	function handleYOffsetClick(e: MouseEvent, uuid: string, direction: 'inc' | 'dec') {
		if (e.detail === 0) stepYOffset(uuid, direction);
	}

	onDestroy(stopYOffset);

	// Commit on `change` (blur / Enter), so typing "-12" is one undo entry rather than three.
	function handleYOffsetChange(uuid: string, input: HTMLInputElement) {
		const current = frStore.get(uuid)?.yOffset ?? 0;
		const val = parseFloat(input.value);
		if (!Number.isFinite(val)) {
			// Cleared or unparsable: the store did not change, so Svelte will not rewrite the DOM.
			input.value = String(current);
			return;
		}
		if (val !== current) dataProvider.updateYOffset(uuid, val);
	}

	// ── Baseline ────────────────────────────────────────────────────────────────
	// The cycle and the state behind it live in `baseline` (graph/baseline.ts).
	// The button is a toggle: its name stays "Set as baseline" and `aria-pressed` carries the
	// state. Only a target can sit in a second mode, so that mode goes in the hint.
	function getBaselineHint(mode: BaselineMode): string | undefined {
		if (mode === 'withAdjustment') return m.selection_list_baseline_with_adjustment();
		if (mode === 'withoutAdjustment') return m.selection_list_baseline_without_adjustment();
		return undefined;
	}

	/** What a screen reader calls a curve: the device, plus the variant when it has one. */
	function curveName(item: FRDataObject): string {
		return item.dispSuffix ? `${item.identifier} ${item.dispSuffix}` : item.identifier;
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

	async function handleVariantAdd(identifier: string, suffix: string) {
		try {
			await dataProvider.addFRData('phone', identifier, { dispSuffix: suffix });
		} catch (e) {
			console.error(e);
		}
	}
</script>

<div class="flex flex-1 flex-col gap-0 overflow-y-auto pb-2">
	{#if sortedEntries.length === 0}
		<p class="px-3 py-6 text-center text-xs text-base-content/80">{m.selection_list_empty()}</p>
	{/if}

	{#each sortedEntries as [uuid, item] (uuid)}
		{@const baselineMode = baseline.modeFor(uuid)}
		{@const channelOpts = channelOptions(item)}
		{@const currentChannelVal = dispChannelToSelectValue(item.dispChannel)}
		{@const variantFiles =
			(isTargetType(item)
				? undefined
				: (item.meta as { files?: PhoneFileVariant[] } | undefined)?.files) ?? []}
		{@const hasVariants = variantFiles.length > 1}
		{@const name = curveName(item)}

		<div
			class="flex flex-col gap-2 border-b border-base-content/8 p-3
				{item.hidden ? 'opacity-50' : ''}"
		>
			<!-- Row 1: color swatch + name + action buttons -->
			<div class="flex flex-1 items-start gap-2">
				<!-- Color swatch / picker -->
				<GraphColorPicker {uuid} {item} {name} />

				<!-- Name + suffix / variant trigger -->
				{#if hasVariants}
					<PopoverPanel
						open={openVariantUUID === uuid}
						onOpenChange={(v) => {
							if (v) openVariantUUID = uuid;
							else if (openVariantUUID === uuid) openVariantUUID = null;
						}}
						contentClass="min-w-60 max-w-72 max-h-[min(16rem,var(--bits-popover-content-available-height))]"
						trapFocus={false}
					>
						{#snippet trigger({ props })}
							<button
								{...props}
								class="group -mt-0.5 -ml-1.5 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-0.5
									text-left transition-colors hover:bg-base-content/5
									data-[state=open]:bg-base-content/5"
							>
								<div class="flex min-w-0 flex-1 flex-col">
									<span class="truncate text-sm font-medium text-base-content">
										{item.identifier}
									</span>
									<!-- Suffixes can run long and either end may carry the meaning, so
										 clamp to two lines rather than cutting one end off. -->
									<span class="flex flex-row items-start gap-0.5">
										<span
											class="line-clamp-2 text-xs wrap-break-word text-base-content/80"
											title={item.dispSuffix || undefined}
										>
											{item.dispSuffix || m.selection_list_variant_default()}
										</span>
										<ChevronDown
											class="mt-0.5 h-3 w-3 shrink-0 text-base-content/65 transition-transform
											group-data-[state=open]:rotate-180"
										/>
									</span>
									{#if item.adjustmentLabel}
										<span class="truncate text-xs text-base-content/80">
											{item.adjustmentLabel}
										</span>
									{/if}
									<!-- The caption describes the set, not the fill — a single-run set
										 drawn as `avg` or `curves` still needs it. -->
									{#if item.samples?.length && item.sampleDescription}
										<span class="truncate text-xs text-base-content/80">
											{item.sampleDescription}
										</span>
									{/if}
								</div>
							</button>
						{/snippet}

						<div class="flex flex-col">
							{#each variantFiles as variant (variant.suffix)}
								{@const isSelected = item.dispSuffix === variant.suffix}
								{@const isLoaded = dataProvider.isFRDataLoaded(item.identifier, variant.suffix)}
								<!-- The variant's own note wins; the set caption fills in for
									 entries that only have one (e.g. legacy hptfs[]). -->
								{@const description = variant.description ?? variant.sampleDescription}
								<div
									class="flex w-full items-start gap-1 rounded-md transition-colors
										{isSelected ? 'bg-accent/10' : 'hover:bg-base-content/5'}"
								>
									<button
										type="button"
										onclick={() => handleVariantSelect(uuid, variant.suffix)}
										aria-current={isSelected ? 'true' : undefined}
										class="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left text-sm transition-colors
											{isSelected ? 'font-medium text-accent' : 'text-base-content'}"
									>
										<Check
											class="mt-0.5 h-4 w-4 shrink-0 {isSelected ? 'opacity-100' : 'opacity-0'}"
											aria-hidden="true"
										/>
										<span class="flex min-w-0 flex-col">
											<span class="wrap-break-word">
												{variant.suffix || m.selection_list_variant_default()}
											</span>
											{#if description}
												<span class="text-xs font-normal wrap-break-word text-base-content/80">
													{description}
												</span>
											{/if}
										</span>
									</button>
									<button
										type="button"
										onclick={() => handleVariantAdd(item.identifier, variant.suffix)}
										disabled={isLoaded}
										title={isLoaded
											? m.selection_list_variant_already_loaded()
											: m.selection_list_variant_add()}
										aria-label={isLoaded
											? m.selection_list_variant_already_loaded_named({
													variant: variant.suffix || m.selection_list_variant_default()
												})
											: m.selection_list_variant_add_named({
													variant: variant.suffix || m.selection_list_variant_default()
												})}
										class="mt-0.5 mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded
											text-base-content/60 transition-colors
											hover:bg-base-content/10 hover:text-base-content
											disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-base-content/60"
									>
										<Plus class="h-4 w-4" aria-hidden="true" />
									</button>
								</div>
							{/each}
						</div>
					</PopoverPanel>
				{:else}
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-sm font-medium text-base-content">
							{item.identifier}
						</span>
						{#if item.dispSuffix}
							<span class="truncate text-xs text-base-content/80">{item.dispSuffix}</span>
						{/if}
						{#if item.adjustmentLabel}
							<span class="truncate text-xs text-base-content/80">{item.adjustmentLabel}</span>
						{/if}
						{#if item.samples?.length && item.sampleDescription}
							<span class="truncate text-xs text-base-content/80">{item.sampleDescription}</span>
						{/if}
					</div>
				{/if}

				<div class="-mt-1 -mr-1 mb-2 flex items-center justify-end gap-1">
					<!-- Target Customizer (for target items only) -->
					{#if isTargetType(item)}
						<TargetCustomizer {uuid} {item} {name} />
					{/if}

					<!-- Baseline button -->
					<Button
						title={m.selection_list_baseline_off()}
						hint={getBaselineHint(baselineMode)}
						aria-label={m.selection_list_baseline_named({ name })}
						aria-pressed={baselineMode !== 'off'}
						onclick={() => baseline.cycle(uuid)}
						variant="ghost"
						size="icon"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="currentColor"
							class="h-4 w-4"
						>
							{#if baselineMode === 'withoutAdjustment'}
								<path
									d="M12.5935 23.2578l-0.0116 0.0017 -0.071 0.0355 -0.019 0.0037 -0.0152 -0.0037 -0.071 -0.0355c-0.0099 -0.0031 -0.0187 -0.0005 -0.0236 0.0054l-0.0041 0.0109 -0.0171 0.4273 0.005 0.0204 0.011 0.0122 0.1036 0.074 0.0148 0.0039 0.0118 -0.0039 0.1036 -0.074 0.0126 -0.016 0.0034 -0.0166 -0.0171 -0.4273c-0.002 -0.0101 -0.0086 -0.0165 -0.0161 -0.018Zm0.2649 -0.1125 -0.0139 0.002 -0.1847 0.0924 -0.0099 0.0102 -0.0027 0.0112 0.0179 0.4295 0.0048 0.0128 0.0085 0.0071 0.2009 0.0927c0.0121 0.0037 0.0229 -0.0002 0.0285 -0.008l0.004 -0.014 -0.0341 -0.6147c-0.0024 -0.0119 -0.0103 -0.0195 -0.0193 -0.0212Zm-0.7154 0.002c-0.0098 -0.0049 -0.0208 -0.002 -0.0274 0.0053l-0.0057 0.0139 -0.0341 0.6147c-0.0007 0.0115 0.007 0.0207 0.0168 0.0234l0.0157 -0.0014 0.2009 -0.0927 0.0094 -0.0081 0.0039 -0.0118 0.0179 -0.4295 -0.0032 -0.0126 -0.0094 -0.0088 -0.1848 -0.0924Z"
									stroke-width="5"
								></path><path
									d="M20.7071 3.29289c0.3905 0.39053 0.3905 1.02369 0 1.41422L4.70711 20.7071c-0.39053 0.3905 -1.02369 0.3905 -1.41422 0 -0.39052 -0.3905 -0.39052 -1.0237 0 -1.4142L19.2929 3.29289c0.3905 -0.39052 1.0237 -0.39052 1.4142 0Z"
									stroke-width="5"
								></path>
							{:else if baselineMode === 'withAdjustment'}
								<path
									d="M2 12C2 11.4477 2.44772 11 3 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H3C2.44772 13 2 12.5523 2 12Z"
								></path>
							{:else}
								<path
									d="M22.768125 12.478124999999999c-2.15625 4.59375 -4.03125 6.6468750000000005 -6.076874999999999 6.6468750000000005 -2.59125 0 -4.106249999999999 -3.22875 -5.709375 -6.6468750000000005 -0.6693749999999999 -1.43625 -1.3696875 -2.9156250000000004 -2.083125 -3.9721874999999995C8.2865625 7.6021875 7.7371875 7.125 7.3125 7.125c-0.35812499999999997 0 -1.71 0.38625 -4.0396875 5.353125a1.125 1.125 0 0 1 -2.0371875 -0.9562499999999999c2.15625 -4.59375 4.03125 -6.6468750000000005 6.076874999999999 -6.6468750000000005 2.59125 0 4.106249999999999 3.22875 5.709375 6.6468750000000005 0.6740625 1.43625 1.3696875 2.9203124999999996 2.083125 3.9721874999999995 0.6121875 0.90375 1.1615625 1.3809375 1.59375 1.3809375 0.35812499999999997 0 1.71 -0.38625 4.0396875 -5.353125a1.125 1.125 0 0 1 2.0371875 0.9562499999999999Z"
								></path>
							{/if}
						</svg>
					</Button>

					<!-- Visibility toggle -->
					<Button
						title={item.hidden ? m.selection_list_show() : m.selection_list_hide()}
						aria-label={item.hidden
							? m.selection_list_show_named({ name })
							: m.selection_list_hide_named({ name })}
						onclick={() => {
							const willBeHidden = !item.hidden;
							graphEngine.updateVisibility(uuid, !willBeHidden);
							dataProvider.updateVisibility(uuid, willBeHidden);
						}}
						variant="ghost"
						size="icon"
					>
						{#if item.hidden}
							<EyeOff class="h-4 w-4" aria-hidden="true" />
						{:else}
							<Eye class="h-4 w-4" aria-hidden="true" />
						{/if}
					</Button>

					<!-- Download button -->
					{#if downloadEnabled}
						<DownloadButton {uuid} {item} {name} />
					{/if}

					<!-- Delete button -->
					<Button
						title={m.selection_list_remove()}
						aria-label={m.selection_list_remove_named({ name })}
						onclick={() => dataProvider.removeFRDataWithUUID(item.type, uuid)}
						variant="ghost"
						size="icon"
						class="hover:bg-error/10 hover:text-error"
					>
						<Trash class="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			<!-- Row 2: action buttons -->
			<div class="-mt-2 flex flex-col">
				<div class="flex flex-wrap items-center justify-end gap-3">
					<!-- Channel select (not for targets) -->
					{#if !isTargetType(item) && channelOpts.length > 0}
						{#if item.samples?.length}
							<SampleChannelSelector {uuid} {item} {name} />
						{:else}
							<select
								value={currentChannelVal}
								onchange={(e) => handleChannelChange(uuid, e.currentTarget.value)}
								aria-label={m.selection_list_channel_named({ name })}
								class="h-7 rounded border border-base-content/20 bg-base-200 pl-1 text-xs
									focus:ring-1 focus:ring-accent focus:outline-hidden"
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
							title={m.selection_list_y_offset_decrease()}
							aria-label={m.selection_list_y_offset_decrease_named({ name })}
							onpointerdown={(e: PointerEvent) => startYOffset(e, uuid, 'dec')}
							onpointerup={stopYOffset}
							onpointercancel={stopYOffset}
							onlostpointercapture={stopYOffset}
							onclick={(e: MouseEvent) => handleYOffsetClick(e, uuid, 'dec')}
							variant="secondary"
							size="icon-xs"
							class="touch-none rounded-full"
						>
							<Minus class="h-4 w-4" aria-hidden="true" />
						</Button>

						<input
							type="number"
							step="any"
							name="yOffset"
							id="yOffset_{uuid}"
							value={item.yOffset ?? 0}
							onchange={(e) => handleYOffsetChange(uuid, e.currentTarget)}
							aria-label={m.selection_list_y_offset_named({ name })}
							class="h-7 w-12 rounded border border-base-content/20 bg-base-200 text-center text-xs
									focus:ring-1 focus:ring-accent focus:outline-hidden"
						/>

						<Button
							title={m.selection_list_y_offset_increase()}
							aria-label={m.selection_list_y_offset_increase_named({ name })}
							onpointerdown={(e: PointerEvent) => startYOffset(e, uuid, 'inc')}
							onpointerup={stopYOffset}
							onpointercancel={stopYOffset}
							onlostpointercapture={stopYOffset}
							onclick={(e: MouseEvent) => handleYOffsetClick(e, uuid, 'inc')}
							variant="secondary"
							size="icon-xs"
							class="touch-none rounded-full"
						>
							<Plus class="h-4 w-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	{/each}

	<!-- Graph Uploader -->
	<div class="-mb-2 px-2 py-4">
		<GraphUploader />
	</div>
</div>
