<script lang="ts">
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import type { FRDataObject, ParsedFRData } from '$lib/types/data-types.js';
	import * as m from '$lib/paraglide/messages.js';
	import { SvelteMap } from 'svelte/reactivity';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// ── Config gate ───────────────────────────────────────────────────────────

	const config = (window as any).GRAPHTOOL_CONFIG?.TARGET_CUSTOMIZER as
		| { CUSTOMIZABLE_TARGETS: string[] }
		| undefined;

	const isCustomizable = $derived(
		config != null && config.CUSTOMIZABLE_TARGETS.includes(item.identifier)
	);

	// ── State ─────────────────────────────────────────────────────────────────

	let tilt = $state(0);
	let bass = $state(0);
	let treble = $state(0);
	let isExpanded = $state(false);

	// ── Equalizer instance ────────────────────────────────────────────────────

	const eq = new Equalizer();

	// ── Cache original data on mount ──────────────────────────────────────────
	// Must use $effect (not $derived) because we need a one-time snapshot.
	// Using $derived would recompute whenever frStore updates, but we push
	// modified data back via updateFRDataWithRawData — creating an infinite loop.

	let originalData: SvelteMap<string, [number, number][]> | null = $state(null);

	$effect(() => {
		const frObj = frStore.get(uuid);
		if (frObj && !originalData) {
			const cached = new SvelteMap<string, [number, number][]>();
			const channels = frObj.channels;
			for (const key of Object.keys(channels) as (keyof ParsedFRData)[]) {
				const ch = channels[key];
				if (ch) {
					cached.set(key, ch.data.map(([f, d]) => [f, d] as [number, number]));
				}
			}
			originalData = cached;
		}
	});

	// ── Apply adjustments when tilt/bass/treble change ────────────────────────

	$effect(() => {
		// Read reactive deps
		const currentTilt = tilt;
		const currentBass = bass;
		const currentTreble = treble;
		const cached = originalData;

		if (!cached) return;

		const filters: EQFilter[] = [];
		if (currentBass !== 0) {
			filters.push({ enabled: true, type: 'LSQ', freq: 105, q: 0.707, gain: currentBass });
		}
		if (currentTreble !== 0) {
			filters.push({ enabled: true, type: 'HSQ', freq: 2500, q: 0.42, gain: currentTreble });
		}

		const modifiedChannels: ParsedFRData = {};

		for (const [key, points] of cached) {
			// Start from cached original
			let modified: [number, number][] = points.map(([f, d]) => [f, d]);

			// Apply tilt: gain * log2(freq / 1000)
			if (currentTilt !== 0) {
				modified = modified.map(([f, d]) => [f, d + currentTilt * Math.log2(f / 1000)]);
			}

			// Apply bass/treble EQ filters
			if (filters.length > 0) {
				modified = eq.applyFilters(modified, filters) as [number, number][];
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

		dataProvider.updateFRDataWithRawData(uuid, modifiedChannels);
	});

	// ── Handlers ──────────────────────────────────────────────────────────────

	function handleTiltInput(e: Event): void {
		tilt = parseFloat((e.target as HTMLInputElement).value);
	}

	function handleBassInput(e: Event): void {
		bass = parseFloat((e.target as HTMLInputElement).value);
	}

	function handleTrebleInput(e: Event): void {
		treble = parseFloat((e.target as HTMLInputElement).value);
	}

	function handleReset(): void {
		tilt = 0;
		bass = 0;
		treble = 0;
	}

	function toggleExpanded(): void {
		isExpanded = !isExpanded;
	}
</script>

{#if isCustomizable}
	<div class="mt-1 w-full">
		<button
			onclick={toggleExpanded}
			class="rounded px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
		>
			{m.target_customizer_btn_view()}
		</button>

		{#if isExpanded}
			<div class="mt-1 flex flex-col gap-1.5 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/50">
				<!-- Tilt -->
				<div class="flex items-center gap-2">
					<label for="{uuid}-tilt" class="w-12 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
						{m.target_customizer_label_tilt()}
					</label>
					<input
						id="{uuid}-tilt"
						type="range"
						min="-2"
						max="2"
						step="0.1"
						value={tilt}
						oninput={handleTiltInput}
						class="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-300 accent-blue-500 dark:bg-zinc-600"
					/>
					<span class="w-10 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
						{tilt.toFixed(1)}
					</span>
				</div>

				<!-- Bass -->
				<div class="flex items-center gap-2">
					<label for="{uuid}-bass" class="w-12 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
						{m.target_customizer_label_bass()}
					</label>
					<input
						id="{uuid}-bass"
						type="range"
						min="-10"
						max="10"
						step="0.5"
						value={bass}
						oninput={handleBassInput}
						class="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-300 accent-blue-500 dark:bg-zinc-600"
					/>
					<span class="w-10 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
						{bass.toFixed(1)}
					</span>
				</div>

				<!-- Treble -->
				<div class="flex items-center gap-2">
					<label for="{uuid}-treble" class="w-12 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
						{m.target_customizer_label_treble()}
					</label>
					<input
						id="{uuid}-treble"
						type="range"
						min="-10"
						max="10"
						step="0.5"
						value={treble}
						oninput={handleTrebleInput}
						class="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-300 accent-blue-500 dark:bg-zinc-600"
					/>
					<span class="w-10 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
						{treble.toFixed(1)}
					</span>
				</div>

				<!-- Reset -->
				<div class="flex justify-end">
					<button
						onclick={handleReset}
						class="rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
					>
						{m.target_customizer_btn_reset()}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
