<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import * as m from '$lib/paraglide/messages.js';

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
		eqStore.addBand({ enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 0 });
	}

	function removeBand() {
		if (eqStore.filters.length > 0) {
			eqStore.removeBandAt(eqStore.filters.length - 1);
		}
	}

	function sortBands() {
		const sorted = [...eqStore.filters].sort((a, b) => a.freq - b.freq);
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
			if (filters.length) eqStore.filters = filters;
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
		if (!eqStore.filters.length) {
			alert(m.extension_equalizer_filter_list_no_filter_export_alert());
			return;
		}
		let text = `Preamp: ${preamp.toFixed(1)} dB\n`;
		eqStore.filters.forEach((f, i) => {
			let type: string = f.type;
			if (type === 'LSQ') type = 'LSC';
			if (type === 'HSQ') type = 'HSC';
			text += `Filter ${i + 1}: ON ${type} Fc ${f.freq.toFixed(0)} Hz Gain ${f.gain.toFixed(1)} dB Q ${f.q.toFixed(3)}\n`;
		});
		downloadText(text, 'filters.txt');
	}

	function exportGraphicEQ() {
		if (!eqStore.filters.length) {
			alert(m.extension_equalizer_filter_list_no_filter_export_alert());
			return;
		}
		const eq = new Equalizer();
		const graphicEQ = eq.convertFilterAsGraphicEQ(eqStore.filters);
		const text =
			'GraphicEQ: ' + graphicEQ.map(([f, g]) => `${f.toFixed(0)} ${g.toFixed(1)}`).join('; ');
		downloadText(text, 'graphic_eq.txt');
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
		<span class="text-xs text-zinc-500 dark:text-zinc-400">
			{m.extension_equalizer_filter_list_preamp()}:
			<span class="font-medium text-zinc-900 dark:text-zinc-100">{preamp.toFixed(1)} dB</span>
		</span>
		<div class="flex gap-1">
			<button
				onclick={addBand}
				class="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
			>+</button>
			<button
				onclick={removeBand}
				class="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
			>−</button>
			<button
				onclick={sortBands}
				class="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
			>↕</button>
		</div>
	</div>

	<!-- Filter bands table -->
	<div class="max-h-56 overflow-y-auto">
		<table class="w-full text-xs">
			<thead>
				<tr
					class="border-b border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
				>
					<th class="w-6 pb-1 text-left font-normal"></th>
					<th class="pb-1 text-left font-normal">Type</th>
					<th class="pb-1 text-left font-normal">{m.extension_equalizer_filter_list_freq()}</th>
					<th class="pb-1 text-left font-normal">{m.extension_equalizer_filter_list_q()}</th>
					<th class="pb-1 text-left font-normal">{m.extension_equalizer_filter_list_gain()}</th>
					<th class="w-6 pb-1"></th>
				</tr>
			</thead>
			<tbody>
				{#each eqStore.filters as filter, i (i)}
					<tr class="border-b border-zinc-100 dark:border-zinc-800">
						<td class="py-0.5 pr-1">
							<input
								type="checkbox"
								checked={filter.enabled}
								onchange={(e) =>
									updateFilter(i, { enabled: (e.target as HTMLInputElement).checked })}
								class="h-3 w-3 accent-zinc-700 dark:accent-zinc-300"
							/>
						</td>
						<td class="py-0.5 pr-1">
							<select
								value={filter.type}
								onchange={(e) =>
									updateFilter(i, {
										type: (e.target as HTMLSelectElement).value as EQFilter['type']
									})}
								class="w-full rounded border-0 bg-transparent text-xs focus:outline-none dark:text-zinc-200"
							>
								<option value="PK">{m.extension_equalizer_filter_list_peak()}</option>
								<option value="LSQ">{m.extension_equalizer_filter_list_lowshelf()}</option>
								<option value="HSQ">{m.extension_equalizer_filter_list_highshelf()}</option>
							</select>
						</td>
						<td class="py-0.5 pr-1">
							<input
								type="number"
								value={filter.freq}
								min="20"
								max="20000"
								oninput={(e) =>
									updateFilter(i, {
										freq: parseFloat((e.target as HTMLInputElement).value) || filter.freq
									})}
								class="w-16 rounded border-0 bg-transparent text-xs focus:outline-none dark:text-zinc-200"
							/>
						</td>
						<td class="py-0.5 pr-1">
							<input
								type="number"
								value={filter.q}
								min="0.1"
								max="10"
								step="0.1"
								oninput={(e) =>
									updateFilter(i, {
										q: parseFloat((e.target as HTMLInputElement).value) || filter.q
									})}
								class="w-12 rounded border-0 bg-transparent text-xs focus:outline-none dark:text-zinc-200"
							/>
						</td>
						<td class="py-0.5 pr-1">
							<input
								type="number"
								value={filter.gain}
								min="-30"
								max="30"
								step="0.1"
								oninput={(e) =>
									updateFilter(i, {
										gain: parseFloat((e.target as HTMLInputElement).value) ?? filter.gain
									})}
								class="w-12 rounded border-0 bg-transparent text-xs focus:outline-none dark:text-zinc-200"
							/>
						</td>
						<td class="py-0.5">
							<button
								onclick={() => eqStore.removeBandAt(i)}
								class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
								aria-label="Remove filter"
							>×</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Import/Export buttons -->
	<div class="flex gap-1">
		<button
			onclick={importFilters}
			class="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
		>
			{m.extension_equalizer_filter_list_import()}
		</button>
		<button
			onclick={exportFilters}
			class="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
		>
			{m.extension_equalizer_filter_list_export()}
		</button>
	</div>
	<div>
		<button
			onclick={exportGraphicEQ}
			class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
