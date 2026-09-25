<script lang="ts">
	import { untrack } from 'svelte';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import type { EQFilter } from '$lib/utils/equalizer.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import {
		compareByChannelThenFreq,
		countBandsPerOutput,
		countSharedFilters,
		effectiveFilters,
		hasPerChannelFilters,
		indexedFiltersInScope
	} from '$lib/utils/eq-channel.js';
	import { formatApoFilters, parseApoFilters } from '$lib/utils/eq-apo.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import EqFilterCard from './EqFilterCard.svelte';
	import EqChannelSelect from './EqChannelSelect.svelte';
	import EqOptionButton from './EqOptionButton.svelte';
	import { ArrowDown01, Download, Minus, Plus, Upload } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';
	import { downloadText } from '$lib/utils/download-text.js';

	/** Quiet time after the last edit before the preamp toast may fire, ms. */
	const PREAMP_TOAST_SETTLE_MS = 800;

	let expandedIndex = $state<number | null>(null);

	const scope = $derived(eqStore.channelScope);
	/** Bands in the active bucket, still carrying their index in the flat array. */
	const visibleBands = $derived(indexedFiltersInScope(eqStore.filters, scope));
	/** Shared bands stack on top of whichever ear is being edited — say so. */
	const sharedBandCount = $derived(
		scope === 'BOTH' ? 0 : countSharedFilters(eqStore.filters.filter((f) => f.enabled))
	);

	/** Derived from the filters by `dataProvider.installEqCurveSync`, not here. */
	const preamp = $derived(eqStore.preamp);

	/**
	 * The preamp before the current burst of edits, or null when none is
	 * pending. A slider drag or a held arrow key moves the preamp dozens of
	 * times, so the toast waits for the edits to settle and compares where the
	 * burst ended with where it began: one toast per burst, and none for a burst
	 * that dipped and came back.
	 */
	let preampBeforeEdits: number | null = null;
	let preampToastTimer: ReturnType<typeof setTimeout> | undefined;
	/** The last value seen, so the first pass after mount starts no burst. */
	let lastPreamp = untrack(() => eqStore.preamp);

	$effect(() => {
		const next = preamp;
		if (next === lastPreamp) return;
		preampBeforeEdits ??= lastPreamp;
		lastPreamp = next;
		clearTimeout(preampToastTimer);
		preampToastTimer = setTimeout(announcePreamp, PREAMP_TOAST_SETTLE_MS);
	});

	// Not in the effect above: its cleanup would run on every re-run, including
	// ones that change nothing, and drop a toast that is still owed.
	$effect(() => () => clearTimeout(preampToastTimer));

	function announcePreamp() {
		const before = preampBeforeEdits;
		preampBeforeEdits = null;
		const now = eqStore.preamp;
		if (before !== null && now < before - 0.05) {
			toast.info(m.eq_preamp_auto_reduced({ value: now.toFixed(1) }));
		}
	}

	const atMaxBands = $derived.by(() => {
		const preset = eqConstraintsStore.active;
		if (!preset || preset.maxBands <= 0) return false;
		// A band added to the active bucket costs a slot on one ear (or both, in
		// the shared bucket), so the cap is measured against the busiest output.
		const probe: EQFilter = {
			enabled: true,
			type: 'PK',
			freq: null,
			q: null,
			gain: null,
			...(scope === 'BOTH' ? {} : { channel: scope })
		};
		return countBandsPerOutput([...eqStore.filters, probe]) > preset.maxBands;
	});

	/** Graphic mode: the band list is fixed, so add/remove/sort/import are no-ops. */
	const isGraphic = $derived(eqConstraintsStore.active?.mode === 'graphic');

	function addBand() {
		const wasEmpty = eqStore.filters.length === 0;
		// A new band joins the bucket the user is looking at.
		const ok = eqCommands.addBand({
			enabled: true,
			type: 'PK',
			freq: null,
			q: null,
			gain: null,
			...(scope === 'BOTH' ? {} : { channel: scope })
		});
		// Only the first band flips the master toggle. Adding a band to a stack
		// the user has deliberately bypassed is an edit, not a fresh start.
		if (ok && wasEmpty) eqCommands.ensureEnabled();
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
		// Removes the last band *of the active bucket* — the one the button sits
		// under. Popping the flat array's tail would delete another channel's band
		// while the user is looking at this one.
		const last = visibleBands.at(-1);
		if (!last) return;
		if (expandedIndex === last.index) expandedIndex = null;
		else if (expandedIndex !== null && expandedIndex > last.index) expandedIndex--;
		eqCommands.removeBand(last.index);
	}

	function sortBands() {
		expandedIndex = null;
		// Sorts by frequency within each bucket and keeps the buckets contiguous,
		// so the flat array's order still matches what each scope shows.
		const sorted = [...eqStore.filters].sort(compareByChannelThenFreq);
		eqCommands.replaceFilters(sorted);
	}

	function updateFilter(index: number, partial: Partial<EQFilter>) {
		// enabled-only toggle bypasses the coalescer so it's always its own undo
		// entry — a gain drag starting within 400 ms can't swallow the toggle.
		if ('enabled' in partial && Object.keys(partial).length === 1) {
			eqCommands.toggleBandEnabled(index, partial.enabled!);
			return;
		}
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
			const filters = parseApoFilters(text);
			if (filters.length) {
				// An imported parametric file is authored without a device
				// constraint in mind — applying it under a graphic preset
				// (e.g. Sony 10-band) would fold the filters into the wrong
				// shape. Reset to unlimited PEQ so the import lands faithfully.
				if (eqConstraintsStore.activeId !== 'default') {
					eqConstraintsStore.setActive('default');
				}
				eqCommands.replaceFilters(filters);
				eqCommands.ensureEnabled();
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

	/** Sanitized "<device model>" for the export filename, or null with no EQ source selected. */
	function sourceDeviceLabel(): string | null {
		const source = eqStore.sourcePhoneUUID ? frStore.get(eqStore.sourcePhoneUUID) : null;
		if (!source) return null;
		const label = `${source.identifier} ${source.dispSuffix || ''}`.trim();
		const sanitized = label.replace(/[\\/:*?"<>|]/g, '').trim();
		return sanitized || null;
	}

	function exportFilters() {
		const validFilters = eqStore.filters.filter(
			(f) => f.freq != null && f.q != null && f.gain != null
		);
		if (!validFilters.length) {
			toast.warning(m.equalizer_filter_list_no_filter_export_alert());
			return;
		}
		const label = sourceDeviceLabel();
		downloadText(
			formatApoFilters(validFilters, preamp),
			label ? `${label} filters.txt` : 'filters.txt'
		);
		toast.success(m.equalizer_filter_list_export());
	}

	function graphicEqText(filters: EQFilter[]): string {
		const curve = new Equalizer().convertFilterAsGraphicEQ(filters);
		return 'GraphicEQ: ' + curve.map(([f, g]) => `${f.toFixed(0)} ${g.toFixed(1)}`).join('; ');
	}

	function exportGraphicEQ() {
		if (!eqStore.filters.length) {
			toast.warning(m.equalizer_filter_list_no_filter_export_alert());
			return;
		}
		const label = sourceDeviceLabel();
		// A GraphicEQ line is one curve and has no channel syntax, so a
		// per-channel EQ can only be expressed as two files — one per ear, each
		// carrying that ear's shared + own bands. The `<name> <suffix>.txt`
		// shape matches the per-channel naming the DOWNLOAD config already uses.
		if (hasPerChannelFilters(eqStore.filters)) {
			for (const ch of ['L', 'R'] as const) {
				downloadText(
					graphicEqText(effectiveFilters(eqStore.filters, ch)),
					label ? `${label} GraphicEQ ${ch}.txt` : `graphic_eq_${ch.toLowerCase()}.txt`
				);
			}
		} else {
			downloadText(
				graphicEqText(eqStore.filters),
				label ? `${label} GraphicEQ.txt` : 'graphic_eq.txt'
			);
		}
		toast.success(m.equalizer_filter_list_export_graphic_eq());
	}
</script>

<div class="flex flex-col gap-1.75">
	<!--
		Channel scope — heads the list because it scopes it: which bands are shown,
		and which bucket `addBand` fills.
	-->
	<EqChannelSelect />

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
			<!-- Disabled EqOption (Constraints) button until shared constraint infra is ready -->
			<!--div class="h-6 w-px mx-1 bg-base-content/20"></div-->
			<!--EqOptionButton /-->
		</div>
	</div>

	<!--
		Filter cards — only the active bucket's bands. `index` stays the band's
		position in the flat `eqStore.filters` array, which is what every command
		addresses; narrowing the view must never renumber it.
	-->
	<div class="flex flex-col gap-1.5">
		{#each visibleBands as { filter, index } (index)}
			<EqFilterCard
				{filter}
				{index}
				expanded={expandedIndex === index}
				onToggle={() => (expandedIndex = expandedIndex === index ? null : index)}
				onUpdate={(partial) => updateFilter(index, partial)}
				onRemove={() => {
					if (expandedIndex === index) expandedIndex = null;
					else if (expandedIndex !== null && expandedIndex > index) expandedIndex--;
					eqCommands.removeBand(index);
				}}
			/>
		{/each}
	</div>

	{#if scope !== 'BOTH' && sharedBandCount > 0}
		<p class="text-xs text-base-content/60">
			{m.eq_channel_shared_hint({ count: sharedBandCount })}
		</p>
	{/if}

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
