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
	import PopoverPanel from '../atoms/PopoverPanel.svelte';
	import Button from '../atoms/Button.svelte';
	import { CircleAlert, Settings2, X } from '@lucide/svelte';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// ── Config ────────────────────────────────────────────────────────────────

	interface FilterDef {
		id: string;
		name: string;
		type: 'TILT' | 'LSQ' | 'HSQ' | 'PK';
		freq: number;
		q: number;
		description?: string;
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

	function normalizeTargetName(name: string): string {
		const trimmed = name.trim();
		return trimmed.endsWith(' Target') ? trimmed : `${trimmed} Target`;
	}

	const customizableTargets = (tcConfig?.CUSTOMIZABLE_TARGETS ?? []).map(normalizeTargetName);
	const availableFilters: FilterDef[] = tcConfig?.FILTERS ?? [
		{ id: 'tilt', name: 'Tilt (dB/oct)', type: 'TILT', freq: 0, q: 0 },
		{ id: 'bass', name: 'Bass (dB)', type: 'LSQ', freq: 105, q: 0.707 },
		{ id: 'treble', name: 'Treble (dB)', type: 'HSQ', freq: 2500, q: 0.42 }
	];
	const filterPresets: FilterPreset[] = tcConfig?.FILTER_PRESET ?? [];
	const initialFilters: InitialFilter[] = tcConfig?.INITIAL_TARGET_FILTERS ?? [];

	const normalizedIdentifier = $derived(normalizeTargetName(item.identifier));
	const isCustomizable = $derived(customizableTargets.includes(normalizedIdentifier));

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
	let selectedPreset = $state('');

	// Apply initial filters for this target
	const initial = initialFilters.find(
		(f) => normalizeTargetName(f.name) === normalizedIdentifier
	);
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

</script>

{#if isCustomizable}
	<PopoverPanel contentClass="w-72" align="end" trapFocus={false}>
		{#snippet trigger({ props })}
			<Button
				{...props}
				title={m.target_customizer_btn_view()}
				variant="outline" size="icon"
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
				{@const value = filterValues.get(def.id) ?? 0}
				<div class="flex items-center gap-1.5 rounded border border-base-content/15 bg-base-100 p-1.5 pb-2">
					<div class="flex flex-col flex-1 gap-0.25">
						<div class="flex items-center justify-between">
							<div class="flex items-center">
								<label for="{uuid}-{def.id}" class="text-xs font-medium line-clamp-1">
									{getFilterLabel(def)}
								</label>
								{#if def.description}
									<PopoverPanel align="end">
										{#snippet trigger({ props })}
											<Button
												{...props}
												title="Open target filter description"
												variant="ghost" size="icon"
												class="ml-0.5 p-1! opacity-80 hover:opacity-100 data-[state=open]:bg-accent! data-[state=open]:text-accent-content!"
											>
												<CircleAlert class="h-3 w-3" />
											</Button>
										{/snippet}
										<p class="max-w-xs text-sm text-base-content">{def.description}</p>
									</PopoverPanel>
								{/if}
							</div>
							<span class="w-8 text-right text-xs tabular-nums ">
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
								oninput={(e) => setFilterValue(def.id, parseFloat(e.currentTarget.value))}
								class="h-1 min-w-0 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"
							/>
						</div>
					</div>
					<Button
						title="Remove"
						onclick={() => removeFilter(def.id)}
						variant="ghost" size="icon"
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
						focus:outline-none focus:ring-1 focus:ring-accent flex-1"
				>
					<option value="">{m.target_customizer_add_filter()}</option>
					{#each inactiveFilters as def (def.id)}
						<option value={def.id}>{getFilterLabel(def)}</option>
					{/each}
				</select>
			{/if}

			{#if filterPresets.length > 0}
				<select
					value={selectedPreset}
					onchange={handlePresetChange}
					class="rounded border border-base-content/20 bg-base-100 px-1.5 py-1 text-sm 
						focus:outline-none focus:ring-1 focus:ring-accent flex-1"
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
					onclick={handleReset}
					variant="destructive" size="sm"
				>
					{m.target_customizer_btn_reset()}
				</Button>
			</div>
		</div>
	</PopoverPanel>
{/if}
