import type { ChannelData, FRDataPoint } from '$lib/types/data-types.js';
import { lookupFRValueAtFreq } from './fr-lookup.js';
import { normalizeAgainst } from './fr-normalizer.js';

/**
 * Normalize the base DF target so the preference band's **center** — not the DF itself —
 * lands at the alignment reference.
 *
 * The bound files are offsets from the DF, but the DF is not inside the band: at 50 Hz it
 * sits ~3 dB under the lower edge. Anchoring the DF at the alignment frequency therefore
 * pushes the band off every device aligned there, so a device at the band's center reads as
 * failing across the whole range. Deriving the offset from DF + (upper + lower) / 2 keeps it
 * inside at any alignment. At a midrange anchor, where the band straddles the DF, the two
 * agree to a fraction of a dB, so the default look is unchanged.
 *
 * The bounds are looked up by frequency rather than by index, so they need not share the
 * DF's grid.
 */
export function alignDFToBoundCenter(
	df: ChannelData,
	upper: FRDataPoint[],
	lower: FRDataPoint[],
	type: string,
	hzValue: number
): ChannelData {
	const center: ChannelData = {
		...df,
		data: df.data.map(([freq, db]) => {
			const u = lookupFRValueAtFreq(upper, freq) ?? 0;
			const d = lookupFRValueAtFreq(lower, freq) ?? 0;
			return [freq, db + (u + d) / 2] as FRDataPoint;
		})
	};
	return normalizeAgainst(df, center, type, hzValue);
}
