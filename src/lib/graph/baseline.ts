import type { FRDataObject, FRDataPoint } from '$lib/types/data-types.js';
import type { BaselineMode } from '$lib/stores/graph-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';

/**
 * Resolve the channel data to subtract from every curve for a given baseline UUID + mode.
 *
 * - `'withoutAdjustment'` → original (pre-adjustment) target channels from `graphStore.targetOriginalData`,
 *   so slider changes on the baseline target appear as a delta on the target line.
 *   Phones / targets without cached original data fall through to `frStore` — they have no
 *   "original" vs "adjusted" distinction.
 * - `'withAdjustment'` (and the phone fallback) → current channels from `frStore`, so the
 *   target line is flat and other curves shift with adjustments.
 *
 * Returns `null` when the UUID has no baseline source in the store.
 */
export function resolveBaselineChannelData(
	uuid: string | null,
	mode: BaselineMode
): FRDataPoint[] | null {
	if (!uuid) return null;

	if (mode === 'withoutAdjustment') {
		const original = graphStore.targetOriginalData.get(uuid);
		const data = original?.AVG?.data;
		if (data) return data;
		// Phones / targets without cached original data fall through to frStore.
	}

	const data = frStore.get(uuid);
	if (!data) return null;
	return channelDataForFREntry(data);
}

function channelDataForFREntry(data: FRDataObject): FRDataPoint[] | null {
	if (data.type === 'phone') {
		const key =
			data.dispChannel.includes('L') && data.dispChannel.includes('R')
				? 'AVG'
				: data.dispChannel[0];
		return data.channels[key]?.data ?? null;
	}
	return data.channels.AVG?.data ?? null;
}
