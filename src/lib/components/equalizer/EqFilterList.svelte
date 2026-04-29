<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import EqFilterCard from './EqFilterCard.svelte';
	import { ArrowDown01, Download, Minus, Plus, Upload } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';

	let expandedIndex = $state<number | null>(null);

	const preamp = $derived.by(() => {
		const filters = eqStore.filters.filter((f) => f.enabled && f.freq && f.q && f.gain);
		if (!filters.length) return 0;
		const baseFreqs = Array.from(
			{ length: 100 },
			(_, i) => 20 * Math.pow(10, (i * Math.log10(20000 / 20)) / 99)
		);
		const baseFR: [number, number][] = baseFreqs.map((f) => [f, 0]);
		const eq = new Equalizer();
		return parseFloat(eq.calculatePreamp(baseFR, filters).toFixed(1));
	});

	$effect(() => {
		eqStore.preamp = preamp;
	});

	const atMaxBands = $derived.by(() => {
		const preset = eqConstraintsStore.active;
		return preset && preset.maxBands > 0 && eqStore.filters.length >= preset.maxBands;
	});

	/** Graphic mode: the band list is fixed, so add/remove/sort/import are no-ops. */
	const isGraphic = $derived(eqConstraintsStore.active?.mode === 'graphic');

	function addBand() {
		const ok = eqCommands.addBand({
			enabled: true,
			type: 'PK',
			freq: null,
			q: null,
			gain: null
		});
		if (!ok) {
			const preset = eqConstraintsStore.active;
			if (preset && preset.maxBands > 0) {
				toast.warning(
					m.eq_constraint_max_bands_reached({ label: preset.label, max: preset.maxBands })
				);
			}
		}
	}

	function removeBand() {
		if (eqStore.filters.length > 0) {
			const lastIdx = eqStore.filters.length - 1;
			if (expandedIndex === lastIdx) expandedIndex = null;
			eqCommands.removeBand(lastIdx);
		}
	}

	function sortBands() {
		expandedIndex = null;
		const sorted = [...eqStore.filters].sort((a, b) => (a.freq ?? Infinity) - (b.freq ?? Infinity));
		eqCommands.replaceFilters(sorted);
	}

	function updateFilter(index: number, partial: Partial<EQFilter>) {
		// Number inputs and sliders flow through the coalescer so a slider
		// drag (60 oninput events/sec) collapses into one undo entry.
		eqCommands.updateBand(index, partial);
	}

	let importInputEl = $state<HTMLInputElement | undefined>(undefined);

	function importFilters() {
		importInputEl?.click();
	}

	function handleImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = ev.target!.result as string;
			const filters = parseFilterText(text);
			if (filters.length) {
				eqCommands.replaceFilters(filters);
				toast.success(m.equalizer_filter_list_import(), {
					description: `${filters.length} filters`
				});
			} else {
				toast.error(m.equalizer_filter_list_import(), {
					description: 'No valid filters found in file'
				});
			}
			(e.target as HTMLInputElement).value = '';
		};
		reader.readAsText(file);
	}

	function parseFilterText(text: string): EQFilter[] {
		const filters: EQFilter[] = [];
		for (const line of text.split('\n')) {
			if (line.includes('Filter')) {
				const match = line.match(
					/(\w+)\s+Fc\s+(\d+)\s+Hz\s+Gain\s+([+-]?\d*\.?\d+)\s+dB\s+Q\s+([+-]?\d*\.?\d+)/
				);
				if (match) {
					const [, type, freq, gain, q] = match;
					filters.push({
						enabled: true,
						type: type === 'LSC' ? 'LSQ' : type === 'HSC' ? 'HSQ' : (type as EQFilter['type']),
						freq: parseFloat(freq),
						gain: parseFloat(gain),
						q: parseFloat(q)
					});
				}
			}
		}
		return filters;
	}

	function exportFilters() {
		const validFilters = eqStore.filters.filter(
			(f) => f.freq != null && f.q != null && f.gain != null
		);
		if (!validFilters.length) {
			toast.warning(m.equalizer_filter_list_no_filter_export_alert());
			return;
		}
		let text = `Preamp: ${preamp.toFixed(1)} dB\n`;
		validFilters.forEach((f, i) => {
			let type: string = f.type;
			if (type === 'LSQ') type = 'LSC';
			if (type === 'HSQ') type = 'HSC';
			text += `Filter ${i + 1}: ON ${type} Fc ${f.freq!.toFixed(0)} Hz Gain ${f.gain!.toFixed(1)} dB Q ${f.q!.toFixed(3)}\n`;
		});
		downloadText(text, 'filters.txt');
		toast.success(m.equalizer_filter_list_export());
	}

	function exportGraphicEQ() {
		if (!eqStore.filters.length) {
			toast.warning(m.equalizer_filter_list_no_filter_export_alert());
			return;
		}
		const eq = new Equalizer();
		const graphicEQ = eq.convertFilterAsGraphicEQ(eqStore.filters);
		const text =
			'GraphicEQ: ' + graphicEQ.map(([f, g]) => `${f.toFixed(0)} ${g.toFixed(1)}`).join('; ');
		downloadText(text, 'graphic_eq.txt');
		toast.success(m.equalizer_filter_list_export_graphic_eq());
	}

	function downloadText(text: string, filename: string) {
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="flex flex-col gap-1.75">
	<!-- Header: preamp display + add/remove/sort buttons -->
	<div class="flex items-center justify-between">
		<span class="text-xs text-base-content/60">
			{m.equalizer_filter_list_preamp()}:
			<span class="font-medium text-base-content">{preamp.toFixed(1)} dB</span>
		</span>
		<div class="flex gap-1">
			<Button
				title={isGraphic
					? 'Bands are fixed by the graphic preset'
					: atMaxBands
						? 'Active constraint preset has reached its maxBands cap'
						: 'Add EQ Band'}
				variant="outline"
				size="icon"
				class="size-6 p-px"
				disabled={atMaxBands || isGraphic}
				onclick={addBand}
			>
				<Plus class="size-3" />
			</Button>
			<Button
				title={isGraphic ? 'Bands are fixed by the graphic preset' : 'Remove EQ Band'}
				variant="outline"
				size="icon"
				class="size-6 p-px"
				disabled={isGraphic}
				onclick={removeBand}
			>
				<Minus class="size-3" />
			</Button>
			<Button
				title={isGraphic ? 'Bands are fixed by the graphic preset' : 'Sort EQ Bands'}
				variant="outline"
				size="icon"
				class="size-6 p-px"
				disabled={isGraphic}
				onclick={sortBands}
			>
				<ArrowDown01 class="size-3.25" />
			</Button>
		</div>
	</div>

	<!-- Filter cards -->
	<div class="flex flex-col gap-1.5">
		{#each eqStore.filters as filter, i (i)}
			<EqFilterCard
				{filter}
				index={i}
				expanded={expandedIndex === i}
				onToggle={() => (expandedIndex = expandedIndex === i ? null : i)}
				onUpdate={(partial) => updateFilter(i, partial)}
				onRemove={() => {
					if (expandedIndex === i) expandedIndex = null;
					else if (expandedIndex !== null && expandedIndex > i) expandedIndex--;
					eqCommands.removeBand(i);
				}}
			/>
		{/each}
	</div>

	<!-- Import/Export buttons -->
	<div class="flex gap-1.5">
		<Button
			title={m.equalizer_filter_list_import()}
			onclick={importFilters}
			variant="outline"
			size="sm"
			class="flex-1"
		>
			<Download class="mr-1.5 size-3.5" />
			{m.equalizer_filter_list_import()}
		</Button>
		<Button
			title={m.equalizer_filter_list_export()}
			onclick={exportFilters}
			variant="outline"
			size="sm"
			class="flex-1"
		>
			<Upload class="mr-1.5 size-3.5" />
			{m.equalizer_filter_list_export()}
		</Button>
	</div>
	<div>
		<Button
			title="Export filters as Graphic EQ File"
			onclick={exportGraphicEQ}
			variant="muted"
			size="sm"
			class="w-full ring-1 ring-base-content/20 hover:ring-base-content/40 focus:ring-base-content/40"
		>
			{m.equalizer_filter_list_export_graphic_eq()}
		</Button>
	</div>

	<input
		bind:this={importInputEl}
		type="file"
		accept=".txt"
		class="hidden"
		onchange={handleImportFile}
	/>
</div>
