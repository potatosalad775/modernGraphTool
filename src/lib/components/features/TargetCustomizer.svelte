<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import type { FRDataObject, ParsedFRData } from '$lib/types/data-types.js';
	import * as m from '$lib/paraglide/messages.js';
	import { getConfigValue } from '$lib/utils/config.js';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// ── Config ────────────────────────────────────────────────────────────────

	interface FilterDef {
		id: string;
		name: string;
		type: 'TILT' | 'LSQ' | 'HSQ' | 'PK';
		freq: number;
		q: number;
	}

	interface FilterPreset {
		name: string;
		filter: Record<string, number>;
	}

	interface InitialFilter {
		name: string;
		filter: Record<string, number>;
	}

	const tcConfig = (window as any).GRAPHTOOL_CONFIG?.TARGET_CUSTOMIZER as
		| {
				CUSTOMIZABLE_TARGETS?: string[];
				FILTERS?: FilterDef[];
				FILTER_PRESET?: FilterPreset[];
				INITIAL_TARGET_FILTERS?: InitialFilter[];
		  }
		| undefined;

	const customizableTargets = tcConfig?.CUSTOMIZABLE_TARGETS ?? [];
	const availableFilters: FilterDef[] = tcConfig?.FILTERS ?? [
		{ id: 'tilt', name: 'Tilt', type: 'TILT', freq: 0, q: 0 },
		{ id: 'bass', name: 'Bass', type: 'LSQ', freq: 105, q: 0.707 },
		{ id: 'treble', name: 'Treble', type: 'HSQ', freq: 2500, q: 0.42 }
	];
	const filterPresets: FilterPreset[] = tcConfig?.FILTER_PRESET ?? [];
	const initialFilters: InitialFilter[] = tcConfig?.INITIAL_TARGET_FILTERS ?? [];

	const isCustomizable = $derived(customizableTargets.includes(item.identifier));

	// ── i18n label map ────────────────────────────────────────────────────────

	const i18nLabels: Record<string, () => string> = {
		tilt: m.target_customizer_label_tilt,
		bass: m.target_customizer_label_bass,
		treble: m.target_customizer_label_treble,
		ear: m.target_customizer_label_ear,
		pssr: m.target_customizer_label_pssr
	};

	function getFilterLabel(def: FilterDef): string {
		const fn = i18nLabels[def.id];
		return fn ? fn() : def.name;
	}

	function getGainRange(def: FilterDef): { min: number; max: number; step: number } {
		if (def.type === 'TILT') return { min: -2, max: 2, step: 0.1 };
		return { min: -20, max: 20, step: 0.5 };
	}

	// ── State ─────────────────────────────────────────────────────────────────

	const activeFilterIds = new SvelteSet<string>();
	const filterValues = new SvelteMap<string, number>();
	let isExpanded = $state(false);
	let selectedPreset = $state('');

	// Apply initial filters for this target
	const initial = initialFilters.find((f) => item.identifier.includes(f.name));
	if (initial) {
		for (const [id, value] of Object.entries(initial.filter)) {
			if (availableFilters.some((f) => f.id === id)) {
				activeFilterIds.add(id);
				filterValues.set(id, value);
			}
		}
	}

	// ── Derived ───────────────────────────────────────────────────────────────

	const activeFilters = $derived(
		availableFilters.filter((f) => activeFilterIds.has(f.id))
	);

	const inactiveFilters = $derived(
		availableFilters.filter((f) => !activeFilterIds.has(f.id))
	);

	// ── Equalizer instance ────────────────────────────────────────────────────

	const eq = new Equalizer();

	// ── Cache original data ───────────────────────────────────────────────────
	// Uses a plain flag (not reactive $state) to guard one-time init, avoiding
	// a reactive cycle between the cache effect and the adjustment effect.

	let originalData: SvelteMap<string, [number, number][]> | null = null;
	let cacheInitialized = false;

	$effect(() => {
		const frObj = frStore.get(uuid);
		if (frObj && !cacheInitialized) {
			cacheInitialized = true;
			// Recover persisted original data from a previous mount (panel switch)
			const persisted = graphStore.targetOriginalData.get(uuid);
			if (persisted) {
				const cached = new SvelteMap<string, [number, number][]>();
				for (const key of Object.keys(persisted) as (keyof ParsedFRData)[]) {
					const ch = persisted[key];
					if (ch) {
						cached.set(key, ch.data.map(([f, d]) => [f, d] as [number, number]));
					}
				}
				originalData = cached;
			} else {
				const cached = new SvelteMap<string, [number, number][]>();
				const channels = frObj.channels;
				const sharedSnapshot: ParsedFRData = {};
				for (const key of Object.keys(channels) as (keyof ParsedFRData)[]) {
					const ch = channels[key];
					if (ch) {
						const dataCopy = ch.data.map(([f, d]) => [f, d] as [number, number]);
						cached.set(key, dataCopy);
						sharedSnapshot[key] = {
							data: dataCopy.map(([f, d]) => [f, d] as [number, number]),
							metadata: { ...ch.metadata }
						};
					}
				}
				originalData = cached;
				// Publish original target data for baseline compensation
				graphStore.targetOriginalData.set(uuid, sharedSnapshot);
			}
		}
	});

	onDestroy(() => {
		// Only clean up if the FR data itself has been removed
		// (not just a panel switch which unmounts/remounts the component)
		if (!frStore.get(uuid)) {
			graphStore.targetOriginalData.delete(uuid);
		}
	});

	// ── Sync base data when reSmoothAll updates it ────────────────────────────
	// Watches only the version counter (not the SvelteMap directly) to avoid cycles.

	$effect(() => {
		const _version = graphStore.targetOriginalVersion;
		if (!originalData) return;
		// Non-reactive read of the updated base data
		const stored = untrack(() => graphStore.targetOriginalData.get(uuid));
		if (!stored) return;
		for (const key of Object.keys(stored) as (keyof ParsedFRData)[]) {
			const ch = stored[key];
			if (ch) {
				originalData.set(key, ch.data.map(([f, d]) => [f, d] as [number, number]));
			}
		}
	});

	// ── Apply adjustments when filter values or base data change ──────────────

	$effect(() => {
		// Subscribe to all active filter values
		const snapshot: Record<string, number> = {};
		for (const id of activeFilterIds) {
			snapshot[id] = filterValues.get(id) ?? 0;
		}
		// Also track activeFilterIds size for reactivity on add/remove
		const _size = activeFilterIds.size;

		if (!originalData) return;

		// Build EQ filters (skip tilt — handled separately)
		const eqFilters: EQFilter[] = [];
		for (const def of availableFilters) {
			const value = snapshot[def.id];
			if (value === undefined || value === 0) continue;
			if (def.type === 'TILT') continue;
			eqFilters.push({
				enabled: true,
				type: def.type,
				freq: def.freq,
				q: def.q,
				gain: value
			});
		}

		const tiltValue = snapshot['tilt'] ?? 0;
		const modifiedChannels: ParsedFRData = {};

		for (const [key, points] of originalData) {
			let modified: [number, number][] = points.map(([f, d]) => [f, d]);

			// Apply tilt: gain * log2(freq / 1000)
			if (tiltValue !== 0) {
				modified = modified.map(([f, d]) => [f, d + tiltValue * Math.log2(f / 1000)]);
			}

			// Apply EQ filters
			if (eqFilters.length > 0) {
				modified = eq.applyFilters(modified, eqFilters) as [number, number][];
			}

			const chKey = key as keyof ParsedFRData;
			modifiedChannels[chKey] = {
				data: modified,
				metadata: {
					minFreq: modified[0]?.[0] ?? 20,
					maxFreq: modified[modified.length - 1]?.[0] ?? 20000
				}
			};
		}

		untrack(() => dataProvider.updateFRDataWithRawData(uuid, modifiedChannels));
	});

	// ── Handlers ──────────────────────────────────────────────────────────────

	function addFilter(id: string) {
		activeFilterIds.add(id);
		filterValues.set(id, 0);
	}

	function removeFilter(id: string) {
		activeFilterIds.delete(id);
		filterValues.delete(id);
	}

	function setFilterValue(id: string, value: number) {
		filterValues.set(id, value);
	}

	function handleReset() {
		for (const id of [...activeFilterIds]) {
			activeFilterIds.delete(id);
			filterValues.delete(id);
		}
		selectedPreset = '';
	}

	function applyPreset(preset: FilterPreset) {
		// Clear existing
		for (const id of [...activeFilterIds]) {
			activeFilterIds.delete(id);
			filterValues.delete(id);
		}
		// Apply preset values
		for (const [id, value] of Object.entries(preset.filter)) {
			if (availableFilters.some((f) => f.id === id) && value !== 0) {
				activeFilterIds.add(id);
				filterValues.set(id, value);
			}
		}
	}

	function handlePresetChange(e: Event) {
		const name = (e.target as HTMLSelectElement).value;
		selectedPreset = name;
		if (!name) return;
		const preset = filterPresets.find((p) => p.name === name);
		if (preset) applyPreset(preset);
	}

	function handleAddFilterChange(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		if (id) {
			addFilter(id);
			(e.target as HTMLSelectElement).value = '';
		}
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}
</script>

{#if isCustomizable}
	<div class="mt-1 w-full">
		<button
			onclick={toggleExpanded}
			class="rounded px-1.5 py-0.5 text-xs text-base-content/45 transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent hover:text-base-content/60"
		>
			{m.target_customizer_btn_view()}
		</button>

		{#if isExpanded}
			<div class="mt-1 flex flex-col gap-2 rounded border border-base-content/15 bg-base-100 p-2 border-base-content/15">
				<!-- Active filters -->
				{#if activeFilters.length === 0}
					<p class="text-center text-xs text-base-content/45">
						{m.target_customizer_no_filters()}
					</p>
				{/if}

				<div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
					{#each activeFilters as def (def.id)}
						{@const range = getGainRange(def)}
						{@const value = filterValues.get(def.id) ?? 0}
						<div class="flex flex-col gap-0.5 rounded border border-base-content/15 bg-base-200 p-1.5 border-base-content/15">
							<div class="flex items-center justify-between">
								<label for="{uuid}-{def.id}" class="text-xs font-medium text-base-content/60">
									{getFilterLabel(def)}
								</label>
								<button
									onclick={() => removeFilter(def.id)}
									class="text-xs text-base-content/45 hover:text-error"
									title="Remove"
								>&times;</button>
							</div>
							<div class="flex items-center gap-1">
								<input
									id="{uuid}-{def.id}"
									type="range"
									min={range.min}
									max={range.max}
									step={range.step}
									{value}
									oninput={(e) => setFilterValue(def.id, parseFloat(e.currentTarget.value))}
									class="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
								/>
								<span class="w-10 text-right text-xs tabular-nums text-base-content/60">
									{value.toFixed(1)}
								</span>
							</div>
						</div>
					{/each}
				</div>

				<!-- Add filter + Preset + Reset row -->
				<div class="flex flex-wrap items-center gap-2">
					<!-- Add filter dropdown -->
					{#if inactiveFilters.length > 0}
						<select
							onchange={handleAddFilterChange}
							class="rounded border border-base-content/20 bg-base-200 px-1.5 py-0.5 text-xs text-base-content/60
								focus:outline-none focus:ring-1 focus:ring-accent"
						>
							<option value="">{m.target_customizer_add_filter()}</option>
							{#each inactiveFilters as def (def.id)}
								<option value={def.id}>{getFilterLabel(def)}</option>
							{/each}
						</select>
					{/if}

					<!-- Preset dropdown -->
					{#if filterPresets.length > 0}
						<select
							value={selectedPreset}
							onchange={handlePresetChange}
							class="rounded border border-base-content/20 bg-base-200 px-1.5 py-0.5 text-xs text-base-content/60
								focus:outline-none focus:ring-1 focus:ring-accent"
						>
							<option value="">{m.target_customizer_preset()}</option>
							{#each filterPresets as preset (preset.name)}
								<option value={preset.name}>{preset.name}</option>
							{/each}
						</select>
					{/if}

					<div class="ml-auto">
						<button
							onclick={handleReset}
							class="rounded bg-base-300 px-2 py-0.5 text-xs text-base-content/60 transition-colors hover:bg-base-content/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
						>
							{m.target_customizer_btn_reset()}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
