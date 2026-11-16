import { EQ_FILTER_TYPES, type EQFilter } from './equalizer.js';

/**
 * Strict reading of an untrusted band — a saved bookmark, a share URL.
 * Pure, so the stores and `url-state.ts` share one implementation.
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isFiniteNumber(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

/** The band, or `null` when any field is missing, mistyped or out of vocabulary. */
export function parseFilter(v: unknown): EQFilter | null {
	if (!isRecord(v)) return null;
	const { enabled, type, freq, q, gain, channel } = v;
	if (typeof enabled !== 'boolean') return null;
	if (!(EQ_FILTER_TYPES as readonly unknown[]).includes(type)) return null;
	if (![freq, q, gain].every((n) => n === null || isFiniteNumber(n))) return null;
	if (channel !== undefined && channel !== 'L' && channel !== 'R') return null;
	return {
		enabled,
		type: type as EQFilter['type'],
		freq: freq as number | null,
		q: q as number | null,
		gain: gain as number | null,
		...(channel ? { channel } : {})
	};
}
