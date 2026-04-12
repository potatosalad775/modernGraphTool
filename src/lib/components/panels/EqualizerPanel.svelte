<script lang="ts">
	import { untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import { DataProcessor } from '$lib/utils/data-processor.js';
	import type { ParsedFRData, FRDataObject } from '$lib/types/data-types.js';

	import EqPhoneSelect from '$lib/components/equalizer/EqPhoneSelect.svelte';
	import EqFilterList from '$lib/components/equalizer/EqFilterList.svelte';
	import EqAutoEqSelect from '$lib/components/equalizer/EqAutoEqSelect.svelte';
	import EqAutoEq from '$lib/components/equalizer/EqAutoEq.svelte';
	import EqAudioPlayer from '$lib/components/equalizer/EqAudioPlayer.svelte';
	import DevicePeq from '$lib/components/features/DevicePeq.svelte';
	import Switch from '../atoms/Switch.svelte';
	import Accordion from '../atoms/Accordion.svelte';
	import AccordionItem from '../atoms/AccordionItem.svelte';
	import ScrollArea from '../atoms/ScrollArea.svelte';

	const eq = new Equalizer();
	let prevSourceUUID: string | null = null;

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function removeEqCurve(): void {
		const uuid = eqStore.eqCurveUUID;
		if (uuid) {
			frStore.delete(uuid);
			eqStore.eqCurveUUID = null;
		}
		eqStore.eqModifiedData.clear();
	}

	// ---------------------------------------------------------------------------
	// Cleanup when sourcePhoneUUID changes
	// ---------------------------------------------------------------------------

	$effect(() => {
		const currentUUID = eqStore.sourcePhoneUUID;
		const prev = prevSourceUUID;
		prevSourceUUID = currentUUID;
		if (prev && prev !== currentUUID) {
			untrack(() => removeEqCurve());
		}
	});

	// ---------------------------------------------------------------------------
	// EQ Preview effect
	//
	// Reads frStore reactively — when reSmoothAll/renormalizeAll updates frStore,
	// this effect re-fires automatically.
	// Creates/updates a proper FRDataObject in frStore with type 'eq' so the
	// EQ curve goes through the full processing pipeline (normalization).
	// Also writes raw EQ data to eqStore.eqModifiedData for overlay node positioning.
	// ---------------------------------------------------------------------------

	$effect(() => {
		const enabled = eqStore.isEnabled;
		const sourceUUID = eqStore.sourcePhoneUUID;
		const filters = eqStore.filters;
		const preamp = eqStore.preamp;

		if (!enabled || !sourceUUID) {
			untrack(() => removeEqCurve());
			return;
		}

		const sourceData = frStore.get(sourceUUID);
		if (!sourceData) return;

		const enabledFilters = filters.filter((f) => f.enabled && f.freq != null && f.q != null && f.gain != null);

		if (enabledFilters.length === 0 && preamp === 0) {
			untrack(() => removeEqCurve());
			return;
		}

		// Compute raw EQ-modified data (pre-normalization)
		const modified: ParsedFRData = {};

		for (const ch of ['L', 'R', 'AVG'] as const) {
			const chData = sourceData.channels[ch];
			if (!chData) continue;

			let points = chData.data;

			if (enabledFilters.length > 0) {
				points = eq.applyFilters(points, enabledFilters);
			}

			if (preamp !== 0) {
				points = points.map(([f, d]) => [f, d + preamp] as [number, number]);
			}

			modified[ch] = {
				data: points,
				metadata: { ...chData.metadata }
			};
		}

		// Store raw EQ data for overlay node positioning (pre-normalization)
		eqStore.eqModifiedData.set(sourceUUID, modified);

		// Process through normalization pipeline and create/update frStore entry
		untrack(() => {
			const params = {
				smoothValue: graphStore.smoothValue,
				normType: graphStore.normType,
				normHz: graphStore.normHzValue
			};
			const processed = DataProcessor.processChannels(modified, params);

			const existingUUID = eqStore.eqCurveUUID;
			const existing = existingUUID ? frStore.get(existingUUID) : null;

			if (existing) {
				// Update existing EQ entry
				frStore.set(existingUUID!, {
					...existing,
					channels: {
						...(processed.L && { L: processed.L }),
						...(processed.R && { R: processed.R }),
						...(processed.AVG && { AVG: processed.AVG })
					},
					dispChannel: [...sourceData.dispChannel],
					colors: { ...sourceData.colors },
					_rawData: { channels: modified }
				});
			} else {
				// Create new EQ entry
				const uuid = crypto.randomUUID();
				const frObject: FRDataObject = {
					uuid,
					type: 'eq',
					identifier: sourceData.identifier,
					dispSuffix: '(EQ)',
					channels: {
						...(processed.L && { L: processed.L }),
						...(processed.R && { R: processed.R }),
						...(processed.AVG && { AVG: processed.AVG })
					},
					dispChannel: [...sourceData.dispChannel],
					colors: { ...sourceData.colors },
					dash: sourceData.dash || '1 0',
					hidden: false,
					yOffset: 0,
					_rawData: { channels: modified }
				};
				frStore.set(uuid, frObject);
				eqStore.eqCurveUUID = uuid;
			}
		});
	});
</script>

<div class="flex gap-3 px-3 py-2 items-center bg-base-200 border-b border-base-content/20">
	<!-- EQ Enable toggle -->
	<Switch
		labelText={m.menu_item_equalizer_label()}
		size="md" 
		bind:checked={eqStore.isEnabled}
	/>
	<div class="h-7 w-px bg-base-content/20"></div>
	<!-- Phone / Target select -->
	<EqPhoneSelect />
</div>

<div class="flex h-full flex-col overflow-y-auto">
	<!-- Filter band editor -->
	<div class="p-3 pb-4 border-b border-base-content/20">
		<EqFilterList />
	</div>

	<Accordion type="multiple" class="pt-1">
		<!-- AutoEQ — collapsible -->
		<AccordionItem value="auto-eq" title={m.equalizer_auto_eq_label()} class="px-1">
			<div class="flex flex-col gap-2 p-2 pt-1">
				<EqAutoEqSelect />
				<EqAutoEq />
			</div>
		</AccordionItem>
		<div class="w-full h-px bg-base-content/20 my-1"></div>
		<!-- Audio Player — collapsible -->
		<AccordionItem value="audio-player" title={m.equalizer_player_label()} class="px-1">
			<div class="p-2 pt-1">
				<EqAudioPlayer />
			</div>
		</AccordionItem>
		<div class="w-full h-px bg-base-content/20 my-1"></div>
		<!-- Device PEQ — USB/Network hardware EQ bridge -->
		<AccordionItem value="device-peq" title={m.equalizer_device_peq_label()} class="px-1">
			<div class="p-2 pt-1">
				<DevicePeq />
			</div>
		</AccordionItem>
		<div class="w-full h-px bg-base-content/20 mt-1"></div>
	</Accordion>
</div>
