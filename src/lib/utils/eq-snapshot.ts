import type { EQFilter } from './equalizer.js';

/** Anything holding a frozen EQ state: a history snapshot or a bookmark. */
export interface EqState {
	filters: EQFilter[];
	preamp: number;
}

/**
 * Whether `snapshot` holds exactly this filter list and preamp. Used to skip
 * duplicate history entries, to tell which A/B side is live, and to tell
 * whether a history entry is already bookmarked.
 */
export function snapshotMatches(snapshot: EqState, filters: EQFilter[], preamp: number): boolean {
	return snapshot.preamp === preamp && filtersMatch(snapshot, filters);
}

/**
 * Whether `snapshot` holds exactly this filter list, whatever its stored
 * preamp. The live preamp is derived from the filters (and a connected
 * device's grid), so an entry saved under another device can carry a preamp
 * the same filters no longer produce.
 */
export function filtersMatch(snapshot: EqState, filters: EQFilter[]): boolean {
	if (snapshot.filters.length !== filters.length) return false;
	for (let i = 0; i < filters.length; i++) {
		const a = snapshot.filters[i];
		const b = filters[i];
		if (
			a.enabled !== b.enabled ||
			a.type !== b.type ||
			a.freq !== b.freq ||
			a.q !== b.q ||
			a.gain !== b.gain ||
			// Retargeting a band between ears changes nothing else about it, so
			// without this the move never gets logged as its own snapshot.
			(a.channel ?? null) !== (b.channel ?? null)
		) {
			return false;
		}
	}
	return true;
}
