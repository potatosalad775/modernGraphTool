<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import * as m from '$lib/paraglide/messages.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { Equalizer } from '$lib/utils/equalizer.js';
	import type { ParsedFRData } from '$lib/types/data-types.js';

	import EqPhoneSelect from '$lib/components/equalizer/EqPhoneSelect.svelte';
	import EqFilterList from '$lib/components/equalizer/EqFilterList.svelte';
	import EqAutoEq from '$lib/components/equalizer/EqAutoEq.svelte';
	import EqAudioPlayer from '$lib/components/equalizer/EqAudioPlayer.svelte';
	import EqUploader from '$lib/components/equalizer/EqUploader.svelte';
	import DevicePeq from '$lib/components/features/DevicePeq.svelte';

	// ---------------------------------------------------------------------------
	// Original data cache for EQ preview — keyed by UUID
	// Non-reactive: mutations are intentional side-effects, not derived state.
	// ---------------------------------------------------------------------------

	const originalDataCache = new SvelteMap<string, ParsedFRData>();
	const eq = new Equalizer();
	let prevSourceUUID: string | null = null;

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function snapshotChannels(channels: ParsedFRData): ParsedFRData {
		const snapshot: ParsedFRData = {};
		for (const ch of ['L', 'R', 'AVG'] as const) {
			if (channels[ch]) {
				snapshot[ch] = {
					data: channels[ch].data.map(([f, d]) => [f, d] as [number, number]),
					metadata: { ...channels[ch].metadata }
				};
			}
		}
		return snapshot;
	}

	function restoreAndRemove(uuid: string): void {
		const cached = originalDataCache.get(uuid);
		if (cached && frStore.has(uuid)) {
			dataProvider.updateFRDataWithRawData(uuid, cached);
		}
		originalDataCache.delete(uuid);
	}

	// ---------------------------------------------------------------------------
	// Restore original data when sourcePhoneUUID changes
	// ---------------------------------------------------------------------------

	$effect(() => {
		const currentUUID = eqStore.sourcePhoneUUID;
		const prev = prevSourceUUID;
		prevSourceUUID = currentUUID;
		if (prev && prev !== currentUUID) {
			untrack(() => restoreAndRemove(prev));
		}
	});

	// ---------------------------------------------------------------------------
	// EQ Preview effect
	// ---------------------------------------------------------------------------

	$effect(() => {
		const enabled = eqStore.isEnabled;
		const sourceUUID = eqStore.sourcePhoneUUID;
		const filters = eqStore.filters;
		const preamp = eqStore.preamp;

		if (!enabled || !sourceUUID) {
			// Restore all cached originals when EQ is disabled
			untrack(() => {
				for (const [uuid] of originalDataCache) {
					restoreAndRemove(uuid);
				}
			});
			return;
		}

		// Read source data reactively so the effect re-runs if it changes externally
		const sourceData = frStore.get(sourceUUID);
		if (!sourceData) return;

		// Cache original channel data on first run for this UUID
		untrack(() => {
			if (!originalDataCache.has(sourceUUID)) {
				originalDataCache.set(sourceUUID, snapshotChannels(sourceData.channels));
			}
		});

		const cached = originalDataCache.get(sourceUUID);
		if (!cached) return;

		// Apply EQ filters + preamp to each cached channel
		const enabledFilters = filters.filter((f) => f.enabled && f.freq != null && f.q != null && f.gain != null);
		const modified: ParsedFRData = {};

		for (const ch of ['L', 'R', 'AVG'] as const) {
			const chData = cached[ch];
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

		untrack(() => {
			dataProvider.updateFRDataWithRawData(sourceUUID, modified);
		});
	});
</script>

<div class="flex h-full flex-col gap-3 overflow-y-auto p-3">
	<!-- EQ Enable toggle -->
	<label class="flex cursor-pointer items-center gap-2">
		<input
			type="checkbox"
			checked={eqStore.isEnabled}
			onchange={() => (eqStore.isEnabled = !eqStore.isEnabled)}
			class="h-4 w-4 accent-accent"
		/>
		<span class="text-sm font-medium text-base-content/60">
			{m.menu_item_equalizer_label()}
		</span>
		<span class="text-xs text-base-content/45">
			({eqStore.isEnabled ? 'ON' : 'OFF'})
		</span>
	</label>

	<!-- Phone / Target select -->
	<EqPhoneSelect />

	<!-- Filter band editor -->
	<EqFilterList />

	<!-- AutoEQ — collapsible -->
	<details class="group">
		<summary
			class="cursor-pointer select-none text-sm font-medium text-base-content/60"
		>
			AutoEQ
		</summary>
		<div class="mt-2">
			<EqAutoEq />
		</div>
	</details>

	<!-- Audio Player — collapsible -->
	<details class="group">
		<summary
			class="cursor-pointer select-none text-sm font-medium text-base-content/60"
		>
			Audio Player
		</summary>
		<div class="mt-2">
			<EqAudioPlayer />
		</div>
	</details>

	<!-- FR / Target file upload -->
	<EqUploader />

	<!-- Device PEQ — USB/Network hardware EQ bridge -->
	<details class="group">
		<summary
			class="cursor-pointer select-none text-sm font-medium text-base-content/60"
		>
			Device PEQ
		</summary>
		<div class="mt-2">
			<DevicePeq />
		</div>
	</details>
</div>
