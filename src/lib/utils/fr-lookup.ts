import type { FRDataPoint } from '$lib/types/data-types.js';

/**
 * Look up the dB value at an arbitrary frequency from sorted FR data.
 * Uses binary search + linear interpolation between adjacent points.
 */
export function lookupFRValueAtFreq(frData: FRDataPoint[], freq: number): number | null {
	if (!frData || frData.length === 0) return null;

	// Edge cases: outside data range
	if (freq <= frData[0][0]) return frData[0][1];
	if (freq >= frData[frData.length - 1][0]) return frData[frData.length - 1][1];

	// Binary search for the interval containing freq
	let lo = 0;
	let hi = frData.length - 1;
	while (lo < hi - 1) {
		const mid = (lo + hi) >> 1;
		if (frData[mid][0] <= freq) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	const [f0, v0] = frData[lo];
	const [f1, v1] = frData[hi];

	// Linear interpolation
	const t = (freq - f0) / (f1 - f0);
	return v0 + t * (v1 - v0);
}
