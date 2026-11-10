import type { Channel, SampleDisplayKey } from '#lib/types/data-types.js';

/**
 * The display key for one channel of one run in a sample set: `sample{n}_{ch}`.
 *
 * The shape is fixed and the index is **zero-based**, because legacy `?state=` URLs
 * already carry it. Changing either orphans every shared link that names a run.
 * This pair is the only builder and parser; don't spell the template or the regex
 * out anywhere else.
 */
export function sampleKey(index: number, channel: Channel): SampleDisplayKey {
	return `sample${index}_${channel}`;
}

/** Inverse of `sampleKey`. Null for anything that is not exactly one such key. */
export function parseSampleKey(key: string): { index: number; channel: Channel } | null {
	const match = key.match(/^sample(\d+)_(L|R|AVG)$/);
	if (!match) return null;
	return { index: parseInt(match[1]), channel: match[2] as Channel };
}
