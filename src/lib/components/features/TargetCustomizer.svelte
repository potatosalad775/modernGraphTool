<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import {
		targetAdjustmentStore,
		type TargetFilterDef
	} from '$lib/stores/target-adjustment-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, ParsedFRData } from '$lib/types/data-types.js';
	import * as m from '$lib/paraglide/messages.js';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';
	import Button from '../atoms/Button.svelte';
	import { CircleAlert, Settings2, X } from '@lucide/svelte';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// This component is UI only. Slider state lives in targetAdjustmentStore so it
	// survives the panel switches that unmount GraphPanel, and so DataProvider can
	// re-apply adjustments after a global re-smooth / re-normalize without needing
	// a mounted instance.
	const isCustomizable = $derived(targetAdjustmentStore.isCustomizable(item.identifier));
	const adjustment = $derived(targetAdjustmentStore.get(uuid));
	const availableFilters = $derived(targetAdjustmentStore.availableFilters);
	const filterPresets = $derived(targetAdjustmentStore.filterPresets);

	const activeFilters = $derived(
		availableFilters.filter((f) => adjustment.activeIds.includes(f.id))
	);
	const inactiveFilters = $derived(
		availableFilters.filter((f) => !adjustment.activeIds.includes(f.id))
	);

	function getGainRange(def: TargetFilterDef): { min: number; max: number; step: number } {
		if (def.type === 'TILT') return { min: -2, max: 2, step: 0.1 };
		return { min: -20, max: 20, step: 0.5 };
	}

	// ── One-time registration ─────────────────────────────────────────────────
	// Seeds the slider stack from INITIAL_TARGET_FILTERS (no-op if this UUID already
	// has state from an earlier mount) and publishes the target's pre-adjustment
	// curve to graphStore, which baseline compensation and DataProvider's re-apply
	// path both read. Guarded by a plain flag — not $state — to avoid a cycle with
	// the apply effect below.

	let initialized = false;

	$effect(() => {
		const frObj = frStore.get(uuid);
		if (!frObj || initialized) return;
		initialized = true;

		untrack(() => {
			targetAdjustmentStore.ensure(uuid, item.identifier);

			// A snapshot from a previous mount survives in graphStore — don't overwrite
			// it with the already-adjusted channels currently in frStore.
			if (graphStore.targetOriginalData.has(uuid)) return;

			const snapshot: ParsedFRData = {};
			for (const key of Object.keys(frObj.channels) as (keyof ParsedFRData)[]) {
				const ch = frObj.channels[key];
				if (ch) {
					snapshot[key] = {
						data: ch.data.map(([f, d]) => [f, d] as [number, number]),
						metadata: { ...ch.metadata }
					};
				}
			}
			graphStore.targetOriginalData.set(uuid, snapshot);
		});
	});

	onDestroy(() => {
		// Only clean up if the FR data itself has been removed — a panel switch
		// unmounts this component but must not discard the user's adjustments.
		if (!frStore.get(uuid)) {
			graphStore.targetOriginalData.delete(uuid);
			targetAdjustmentStore.delete(uuid);
		}
	});

	// ── Push adjustments into the curve ───────────────────────────────────────
	// Tracks the store record, which is replaced wholesale on every edit, and
	// delegates the math to DataProvider — the same entry point reSmoothAll and
	// renormalizeAll use, so the mounted and unmounted paths can't drift.
	// `targetOriginalVersion` is deliberately NOT tracked: those two callers now
	// re-apply adjustments themselves, so watching it here would double the work.

	$effect(() => {
		void adjustment;
		if (!graphStore.targetOriginalData.has(uuid)) return;
		untrack(() => dataProvider.applyTargetAdjustment(uuid));
	});

	function handlePresetChange(e: Event) {
		targetAdjustmentStore.applyPreset(uuid, (e.target as HTMLSelectElement).value);
	}

	function handleAddFilterChange(e: Event) {
		const el = e.target as HTMLSelectElement;
		if (el.value) {
			targetAdjustmentStore.addFilter(uuid, el.value);
			el.value = '';
		}
	}
</script>

{#if isCustomizable}
	<PopoverPanel contentClass="w-72" trapFocus={false}>
		{#snippet trigger({ props })}
			<Button
				{...props}
				title={m.target_customizer_btn_view()}
				variant="outline"
				size="icon"
				class="mr-0.5 data-[state=open]:bg-accent! data-[state=open]:text-accent-content!"
			>
				<Settings2 class="h-4 w-4" />
			</Button>
		{/snippet}

		<!-- Active filters -->
		{#if activeFilters.length === 0}
			<p class="text-center text-xs text-base-content/60">
				{m.target_customizer_no_filters()}
			</p>
		{/if}

		<div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
			{#each activeFilters as def (def.id)}
				{@const range = getGainRange(def)}
				{@const value = adjustment.values[def.id] ?? 0}
				<div
					class="flex items-center gap-1.5 rounded border border-base-content/15 bg-base-100 p-1.5 pb-2"
				>
					<div class="flex flex-col flex-1 gap-0.25">
						<div class="flex items-center justify-between">
							<div class="flex items-center">
								<label for="{uuid}-{def.id}" class="text-xs font-medium line-clamp-1">
									{def.name}
								</label>
								{#if def.description}
									<PopoverPanel>
										{#snippet trigger({ props })}
											<Button
												{...props}
												title="Open target filter description"
												variant="ghost"
												size="icon"
												class="ml-0.5 p-1! opacity-80 hover:opacity-100 data-[state=open]:bg-accent! data-[state=open]:text-accent-content!"
											>
												<CircleAlert class="h-3 w-3" />
											</Button>
										{/snippet}
										<p class="max-w-xs text-sm text-base-content">{def.description}</p>
									</PopoverPanel>
								{/if}
							</div>
							<span class="w-8 text-right text-xs tabular-nums">
								{value.toFixed(1)}
							</span>
						</div>
						<div>
							<input
								id="{uuid}-{def.id}"
								type="range"
								min={range.min}
								max={range.max}
								step={range.step}
								{value}
								oninput={(e) =>
									targetAdjustmentStore.setValue(uuid, def.id, parseFloat(e.currentTarget.value))}
								class="h-1 min-w-0 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
							/>
						</div>
					</div>
					<Button
						title="Remove"
						onclick={() => targetAdjustmentStore.removeFilter(uuid, def.id)}
						variant="ghost"
						size="icon"
					>
						<X class="size-3" />
					</Button>
				</div>
			{/each}
		</div>

		<!-- Add filter + Preset + Reset row -->
		<div class="mt-2 flex flex-wrap items-center gap-1.5">
			{#if inactiveFilters.length > 0}
				<select
					onchange={handleAddFilterChange}
					class="rounded border border-base-content/20 bg-base-100 px-1.5 py-1 text-sm
						focus:outline-none focus:ring-1 focus:ring-accent flex-1 hover:cursor-pointer hover:bg-base-content/5"
				>
					<option value="">{m.target_customizer_add_filter()}</option>
					{#each inactiveFilters as def (def.id)}
						<option value={def.id}>{def.name}</option>
					{/each}
				</select>
			{/if}

			{#if filterPresets.length > 0}
				<select
					value={adjustment.preset}
					onchange={handlePresetChange}
					class="rounded border border-base-content/20 bg-base-100 px-1.5 py-1 text-sm
						focus:outline-none focus:ring-1 focus:ring-accent flex-1 hover:cursor-pointer hover:bg-base-content/5"
				>
					<option value="">{m.target_customizer_preset()}</option>
					{#each filterPresets as preset (preset.name)}
						<option value={preset.name}>{preset.name}</option>
					{/each}
				</select>
			{/if}

			<div class="ml-auto">
				<Button
					title={m.target_customizer_btn_reset()}
					onclick={() => targetAdjustmentStore.reset(uuid)}
					variant="destructive"
					size="sm"
				>
					{m.target_customizer_btn_reset()}
				</Button>
			</div>
		</div>
	</PopoverPanel>
{/if}
