import type { FRDataObject, FRDataPoint } from '#lib/types/data-types.js';
import type { BaselineMode } from '#lib/stores/graph-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { lookupFRValueAtFreq } from '#lib/utils/fr-lookup.js';
import { shareKey } from '#lib/utils/url-state.js';

/**
 * The baseline: the curve item every trace is drawn relative to, so it appears
 * flat and the others show their difference from it.
 *
 * `graphStore.baselineUUID` / `baselineMode` are the only state, and this module
 * is the only writer of them (`baseline.cycle`, `baseline.restoreFromURL`). It
 * has no state of its own: the channel data to subtract is derived on demand
 * from those two fields and `frStore` (including a target's `unadjustedChannels`), so it
 * cannot go stale and a baseline restored before the graph exists compensates
 * the curves like any other. Every reader outside this module goes through the
 * *effective* baseline below, never the raw store fields.
 */

export type ActiveBaselineMode = Exclude<BaselineMode, 'off'>;

/** The two modes that put a baseline in effect; `off` and anything else do not. */
export function isActiveBaselineMode(mode: unknown): mode is ActiveBaselineMode {
	return mode === 'withoutAdjustment' || mode === 'withAdjustment';
}

// ── Resolving the data ────────────────────────────────────────────────────────

/**
 * Resolve the channel data to subtract from every curve for a given baseline UUID + mode.
 * The single resolver — nothing else may branch on the mode to pick data.
 *
 * - `'withoutAdjustment'` → the target's `unadjustedChannels` (before the user's target
 *   adjustments), so slider changes on the baseline target appear as a delta on the target line.
 *   Phones / items without unadjusted channels fall through to their drawn channels — they have no
 *   "unadjusted" vs "adjusted" distinction.
 * - `'withAdjustment'` (and the phone fallback) → current channels from `frStore`, so the
 *   target line is flat and other curves shift with adjustments.
 * - `'off'` → nothing.
 *
 * Returns `null` when the UUID has no baseline source in the store.
 */
export function resolveBaselineChannelData(
	uuid: string | null,
	mode: BaselineMode
): FRDataPoint[] | null {
	if (!uuid || mode === 'off') return null;

	if (mode === 'withoutAdjustment') {
		const data = frStore.get(uuid)?.unadjustedChannels?.AVG?.data;
		if (data) return data;
		// Items without unadjusted channels fall through to their drawn channels.
	}

	const data = frStore.get(uuid);
	if (!data) return null;
	return channelDataForFREntry(data);
}

/**
 * Which channel of an item is the baseline. Phones and inserted phones use the
 * channel they show (AVG when both L and R are shown); targets, `eq` and
 * `inserted-eq` always use AVG.
 */
function channelDataForFREntry(data: FRDataObject): FRDataPoint[] | null {
	if (data.type === 'phone' || data.type === 'inserted-phone') {
		const key =
			data.dispChannel.includes('L') && data.dispChannel.includes('R')
				? 'AVG'
				: data.dispChannel[0];
		return data.channels[key]?.data ?? null;
	}
	return data.channels.AVG?.data ?? null;
}

// ── Compensation ──────────────────────────────────────────────────────────────

/**
 * `value` (dB) at `freq` with the baseline subtracted — the one copy of
 * "subtract the interpolated baseline" that the curves, the hover readout and
 * every overlay use. Linear interpolation, the end values held outside the
 * baseline's range; an empty or missing baseline leaves `value` as it is.
 */
export function compensateAt(
	value: number,
	freq: number,
	baselineData: FRDataPoint[] | null | undefined
): number {
	if (!baselineData?.length) return value;
	const level = lookupFRValueAtFreq(baselineData, freq);
	return level === null ? value : value - level;
}

// ── The baseline in effect ────────────────────────────────────────────────────

class Baseline {
	/**
	 * The baseline item, or `null`. A baseline whose item is not in `frStore` is
	 * dormant: it stays in the store fields (so undoing the removal that took the
	 * item away brings it back) but is not in effect. A hidden item still counts.
	 */
	get uuid(): string | null {
		const uuid = graphStore.baselineUUID;
		if (!uuid || !isActiveBaselineMode(graphStore.baselineMode)) return null;
		return frStore.get(uuid) ? uuid : null;
	}

	/** `off` unless a baseline is in effect. */
	get mode(): BaselineMode {
		return this.uuid ? graphStore.baselineMode : 'off';
	}

	/** What to subtract from every trace; `null` for no baseline. Always current. */
	get channelData(): FRDataPoint[] | null {
		return resolveBaselineChannelData(this.uuid, this.mode);
	}

	/** The mode this item is the baseline in, `off` when it is not. */
	modeFor(uuid: string): BaselineMode {
		return this.uuid === uuid ? this.mode : 'off';
	}

	/**
	 * One click on an item's baseline button.
	 *
	 * - A phone, or any item without unadjusted channels: this item is the baseline →
	 *   off; otherwise it becomes the baseline in `withoutAdjustment`, replacing any
	 *   other.
	 * - A target (the only items with `unadjustedChannels`): not the baseline → `withoutAdjustment`;
	 *   → `withAdjustment`; → off.
	 */
	cycle(uuid: string): void {
		const item = frStore.get(uuid);
		if (!item) return;

		const current = this.modeFor(uuid);
		const adjustable = !!item.unadjustedChannels;

		if (current === 'off') this.#set(uuid, 'withoutAdjustment');
		else if (adjustable && current === 'withoutAdjustment') this.#set(uuid, 'withAdjustment');
		else this.#set(null, 'off');
	}

	/**
	 * Restore the baseline a `?state=` URL recorded: the item is matched by its
	 * share key. An unknown key, or a mode that is not an active one (the URL is
	 * hand-editable), means no baseline.
	 */
	restoreFromURL(saved: { key: string; mode: unknown } | null | undefined): void {
		if (saved && isActiveBaselineMode(saved.mode)) {
			for (const [uuid, data] of frStore.entries) {
				if (shareKey(data) === saved.key) {
					this.#set(uuid, saved.mode);
					return;
				}
			}
		}
		this.#set(null, 'off');
	}

	#set(uuid: string | null, mode: BaselineMode): void {
		graphStore.baselineUUID = mode === 'off' ? null : uuid;
		graphStore.baselineMode = mode;
	}
}

export const baseline = new Baseline();
