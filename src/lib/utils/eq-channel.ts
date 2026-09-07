import type { EQFilter } from './equalizer.js';

/**
 * Per-channel EQ helpers.
 *
 * The filter list stays one flat array; a band's `channel` field decides which
 * ear it reaches, and an absent `channel` means both. Everything that needs to
 * ask "what actually happens to the left ear?" goes through `effectiveFilters`
 * rather than re-deriving the union, so the rule lives in one place.
 *
 * With no per-channel bands present every function here degenerates to the
 * whole list, which is why adding the feature changed no behaviour for the
 * EQs users already had.
 */

/** One physical output. */
export type EqChannel = 'L' | 'R';

/** What the EQ panel is currently editing. `BOTH` is the shared bucket. */
export type EqChannelScope = 'BOTH' | EqChannel;

export const EQ_CHANNEL_SCOPES: readonly EqChannelScope[] = ['BOTH', 'L', 'R'];

/**
 * Every band that shapes one ear: the shared bands plus that ear's own.
 * This is the set to hand to `applyFilters`, a `BiquadFilterNode` chain, or
 * `calculatePreamp` — never the raw array.
 */
export function effectiveFilters(filters: EQFilter[], channel: EqChannel): EQFilter[] {
	return filters.filter((f) => f.channel == null || f.channel === channel);
}

/** Bands belonging to one bucket — what the scoped band list renders. */
export function filtersInScope(filters: EQFilter[], scope: EqChannelScope): EQFilter[] {
	if (scope === 'BOTH') return filters.filter((f) => f.channel == null);
	return filters.filter((f) => f.channel === scope);
}

/**
 * Bands in one bucket, paired with their index in the flat array. The band list
 * and the graph overlay both address bands by that index, so narrowing the view
 * must not renumber them.
 */
export function indexedFiltersInScope(
	filters: EQFilter[],
	scope: EqChannelScope
): { filter: EQFilter; index: number }[] {
	const matches = (f: EQFilter) => (scope === 'BOTH' ? f.channel == null : f.channel === scope);
	return filters
		.map((filter, index) => ({ filter, index }))
		.filter(({ filter }) => matches(filter));
}

/** Bands that shape one ear, paired with their index in the flat array. */
export function indexedEffectiveFilters(
	filters: EQFilter[],
	channel: EqChannel
): { filter: EQFilter; index: number }[] {
	return filters
		.map((filter, index) => ({ filter, index }))
		.filter(({ filter }) => filter.channel == null || filter.channel === channel);
}

/** True once any band is pinned to a single ear. */
export function hasPerChannelFilters(filters: EQFilter[]): boolean {
	return filters.some((f) => f.channel != null);
}

/** Count of bands pinned to one ear — what the "shared bands also apply" hint reports. */
export function countSharedFilters(filters: EQFilter[]): number {
	return filters.reduce((n, f) => (f.channel == null ? n + 1 : n), 0);
}

/**
 * Bands the busiest output has to realise. A hardware band budget is per
 * output, not per list: 4 shared + 3 L + 3 R is 7 bands per ear, not 10.
 *
 * Equals `filters.length` whenever nothing is per-channel, so every
 * `maxBands` check keeps its old answer for an ordinary EQ.
 */
export function countBandsPerOutput(filters: EQFilter[]): number {
	let shared = 0;
	let left = 0;
	let right = 0;
	for (const f of filters) {
		if (f.channel === 'L') left++;
		else if (f.channel === 'R') right++;
		else shared++;
	}
	return shared + Math.max(left, right);
}

/**
 * Drop bands until every output fits within `maxBands`.
 *
 * Walks the list in order and keeps each band that still fits, so the bands a
 * user sees first are the ones that survive — the same "the tail is what you
 * lose" contract the single-channel `slice(0, maxBands)` had. It is a greedy
 * fill rather than a strict prefix cut: once a shared band no longer fits (it
 * costs a slot on both ears) a later single-ear band still might, and dropping
 * it too would waste a slot the device has.
 */
export function trimToBandsPerOutput(filters: EQFilter[], maxBands: number): EQFilter[] {
	if (maxBands <= 0) return filters;
	const kept: EQFilter[] = [];
	for (const f of filters) {
		if (countBandsPerOutput([...kept, f]) > maxBands) continue;
		kept.push(f);
	}
	return kept;
}

/** Sort key that keeps buckets contiguous and each bucket ordered by frequency. */
export function compareByChannelThenFreq(a: EQFilter, b: EQFilter): number {
	const rank = (f: EQFilter) => (f.channel == null ? 0 : f.channel === 'L' ? 1 : 2);
	const byChannel = rank(a) - rank(b);
	if (byChannel !== 0) return byChannel;
	return (a.freq ?? Infinity) - (b.freq ?? Infinity);
}

/** Narrow an untrusted value (share URL, imported file) to a channel or `undefined`. */
export function sanitizeChannel(value: unknown): EqChannel | undefined {
	return value === 'L' || value === 'R' ? value : undefined;
}
