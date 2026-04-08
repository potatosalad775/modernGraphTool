<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import EqFilterCard from './EqFilterCard.svelte';

	let expandedIndex = $state<number | null>(null);

	const preamp = $derived.by(() => {
		const filters = eqStore.filters.filter(f => f.enabled && f.freq && f.q && f.gain);
		if (!filters.length) return 0;
		const baseFreqs = Array.from({ length: 100 }, (_, i) =>
			20 * Math.pow(10, (i * Math.log10(20000 / 20)) / 99)
		);
		const baseFR: [number, number][] = baseFreqs.map(f => [f, 0]);
		const eq = new Equalizer();
		return parseFloat(eq.calculatePreamp(baseFR, filters).toFixed(1));
	});

	$effect(() => {
		eqStore.preamp = preamp;
	});

	function addBand() {
		eqStore.addBand({ enabled: true, type: 'PK', freq: null, q: null, gain: null });
		expandedIndex = eqStore.filters.length - 1;
	}

	function removeBand() {
		if (eqStore.filters.length > 0) {
			const lastIdx = eqStore.filters.length - 1;
			if (expandedIndex === lastIdx) expandedIndex = null;
			eqStore.removeBandAt(lastIdx);
		}
	}

	function sortBands() {
		expandedIndex = null;
		const sorted = [...eqStore.filters].sort((a, b) => (a.freq ?? Infinity) - (b.freq ?? Infinity));
		eqStore.filters = sorted;
	}

	function updateFilter(index: number, partial: Partial<EQFilter>) {
		eqStore.updateBandAt(index, partial);
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
				eqStore.filters = filters;
				toast.success(m.extension_equalizer_filter_list_import(), { description: `${filters.length} filters` });
			} else {
				toast.error(m.extension_equalizer_filter_list_import(), { description: 'No valid filters found in file' });
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
						type:
							type === 'LSC' ? 'LSQ' : type === 'HSC' ? 'HSQ' : (type as EQFilter['type']),
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
		const validFilters = eqStore.filters.filter(f => f.freq != null && f.q != null && f.gain != null);
		if (!validFilters.length) {
			toast.warning(m.extension_equalizer_filter_list_no_filter_export_alert());
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
		toast.success(m.extension_equalizer_filter_list_export());
	}

	function exportGraphicEQ() {
		if (!eqStore.filters.length) {
			toast.warning(m.extension_equalizer_filter_list_no_filter_export_alert());
			return;
		}
		const eq = new Equalizer();
		const graphicEQ = eq.convertFilterAsGraphicEQ(eqStore.filters);
		const text =
			'GraphicEQ: ' + graphicEQ.map(([f, g]) => `${f.toFixed(0)} ${g.toFixed(1)}`).join('; ');
		downloadText(text, 'graphic_eq.txt');
		toast.success(m.extension_equalizer_filter_list_export_graphic_eq());
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

<div class="flex flex-col gap-2">
	<!-- Header: preamp display + add/remove/sort buttons -->
	<div class="flex items-center justify-between">
		<span class="text-xs text-base-content/60">
			{m.extension_equalizer_filter_list_preamp()}:
			<span class="font-medium text-base-content">{preamp.toFixed(1)} dB</span>
		</span>
		<div class="flex gap-1">
			<button
				onclick={addBand}
				class="rounded border border-base-content/20 px-2 py-0.5 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
			>+</button>
			<button
				onclick={removeBand}
				class="rounded border border-base-content/20 px-2 py-0.5 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
			>−</button>
			<button
				onclick={sortBands}
				class="rounded border border-base-content/20 px-2 py-0.5 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
			>↕</button>
		</div>
	</div>

	<!-- Filter cards -->
	<div class="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
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
					eqStore.removeBandAt(i);
				}}
			/>
		{/each}
	</div>

	<!-- Import/Export buttons -->
	<div class="flex gap-1">
		<button
			onclick={importFilters}
			class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
		>
			{m.extension_equalizer_filter_list_import()}
		</button>
		<button
			onclick={exportFilters}
			class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
		>
			{m.extension_equalizer_filter_list_export()}
		</button>
	</div>
	<div>
		<button
			onclick={exportGraphicEQ}
			class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
		>
			{m.extension_equalizer_filter_list_export_graphic_eq()}
		</button>
	</div>

	<input
		bind:this={importInputEl}
		type="file"
		accept=".txt"
		class="hidden"
		onchange={handleImportFile}
	/>
</div>
