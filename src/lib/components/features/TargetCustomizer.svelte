<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { frStore } from '#lib/stores/fr-store.svelte.js';
	import {
		targetAdjustmentStore,
		type TargetFilterDef
	} from '#lib/stores/target-adjustment-store.svelte.js';
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import type { FRDataObject } from '#lib/types/data-types.js';
	import * as m from '#lib/paraglide/messages.js';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';
	import Button from '../atoms/Button.svelte';
	import { Settings2, X } from '@lucide/svelte';

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
	// has state from an earlier mount). Guarded by a plain flag — not $state — to
	// avoid a cycle with the apply effect below.

	let initialized = false;

	$effect(() => {
		const frObj = frStore.get(uuid);
		if (!frObj || initialized) return;
		initialized = true;

		untrack(() => {
			targetAdjustmentStore.ensure(uuid, item.identifier);
		});
	});

	onDestroy(() => {
		// Only clean up if the FR data itself has been removed — a panel switch
		// unmounts this component but must not discard the user's adjustments.
		if (!frStore.get(uuid)) targetAdjustmentStore.delete(uuid);
	});

	// ── Push adjustments into the curve ───────────────────────────────────────
	// Tracks the store record, which is replaced wholesale on every edit, and
	// delegates the math to DataProvider — the same entry point reSmoothAll uses,
	// so the mounted and unmounted paths can't drift. A global re-smooth re-applies
	// adjustments itself and a re-normalize keeps them baked in, so nothing here needs
	// to watch for either.

	// The first run after mount puts the stored stack on the curve: registration, not an edit,
	// so it leaves no undo entry. Plain flag, like `initialized`.
	let applied = false;

	$effect(() => {
		void adjustment;
		untrack(() => {
			if (!frStore.get(uuid)?.unadjustedChannels) return;
			if (applied) {
				dataProvider.applyTargetAdjustment(uuid);
			} else {
				applied = true;
				dataProvider.applyTargetAdjustment(uuid, { undoable: false });
			}
		});
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
				activeOnOpen
				class="mr-0.5"
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
					<div class="flex flex-1 flex-col gap-0.25">
						<div class="flex items-center justify-between">
							<div class="flex items-center">
								<label for="{uuid}-{def.id}" class="line-clamp-1 text-xs font-medium">
									{def.name}
								</label>
								{#if def.description}
									<InfoPopover label={m.info_popover_about({ topic: def.name })} class="ml-0.5">
										<p>{def.description}</p>
									</InfoPopover>
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
								class="h-1 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
							/>
						</div>
					</div>
					<Button
						title={m.target_customizer_btn_remove()}
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
					class="flex-1 rounded border border-base-content/20 bg-base-100 px-1.5 py-1
						text-sm hover:cursor-pointer hover:bg-base-content/5 focus:ring-1 focus:ring-accent focus:outline-none"
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
					class="flex-1 rounded border border-base-content/20 bg-base-100 px-1.5 py-1
						text-sm hover:cursor-pointer hover:bg-base-content/5 focus:ring-1 focus:ring-accent focus:outline-none"
				>
					<option value="">{m.target_customizer_preset()}</option>
					{#each filterPresets as preset (preset.name)}
						<option value={preset.name}>{preset.name}</option>
					{/each}
				</select>
			{/if}

			<div class="ml-auto">
				<Button
					label={m.target_customizer_btn_reset()}
					onclick={() => targetAdjustmentStore.reset(uuid)}
					variant="destructive"
					size="sm"
				/>
			</div>
		</div>
	</PopoverPanel>
{/if}
