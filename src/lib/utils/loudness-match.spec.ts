import { describe, it, expect } from 'vitest';
import { computeBypassMatchDb, computeBypassMatchLinear } from './loudness-match.js';
import type { EQFilter } from './equalizer.js';

function pk(freq: number, gain: number, q = 1.0): EQFilter {
	return { enabled: true, type: 'PK', freq, q, gain };
}

describe('computeBypassMatchDb', () => {
	it('returns 0 when there are no filters', () => {
		expect(computeBypassMatchDb([], 0)).toBe(0);
	});

	it('returns 0 when all filters are disabled', () => {
		expect(computeBypassMatchDb([{ ...pk(1000, 6), enabled: false }], 0)).toBe(0);
	});

	it('skips filters with null fields (ignored as non-active)', () => {
		const incomplete: EQFilter[] = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: null }];
		expect(computeBypassMatchDb(incomplete, 0)).toBe(0);
	});

	it('returns ~0 dB for a tiny ±0.5 dB peak (audibly negligible)', () => {
		const trim = computeBypassMatchDb([pk(1000, 0.5)], 0);
		expect(Math.abs(trim)).toBeLessThan(0.5);
	});

	it('returns positive dB for a strong mid boost (EQ louder than flat)', () => {
		const trim = computeBypassMatchDb([pk(2000, 6)], 0);
		expect(trim).toBeGreaterThan(0);
	});

	it('returns negative dB for a strong mid cut (EQ quieter than flat)', () => {
		const trim = computeBypassMatchDb([pk(2000, -6)], 0);
		expect(trim).toBeLessThan(0);
	});

	it('treble emphasis weighs more than bass in K-weighted match', () => {
		// Equal peak heights at low and high frequencies. Pink-weighted alone
		// favours bass; K-weighting rebalances toward 1–4 kHz. Treble peak
		// should yield a larger bypass-match magnitude than bass peak of the
		// same dB amplitude.
		const bassTrim = computeBypassMatchDb([pk(60, 6)], 0);
		const trebleTrim = computeBypassMatchDb([pk(3000, 6)], 0);
		expect(trebleTrim).toBeGreaterThan(bassTrim);
	});

	it('preamp factors in directly (a -3 dB preamp drops the trim by ~3 dB)', () => {
		const noPreamp = computeBypassMatchDb([pk(2000, 6)], 0);
		const withPreamp = computeBypassMatchDb([pk(2000, 6)], -3);
		expect(noPreamp - withPreamp).toBeCloseTo(3, 1);
	});

	it('linear wrapper inverts the dB form', () => {
		const filters = [pk(1500, 4)];
		const linear = computeBypassMatchLinear(filters, -1);
		const db = computeBypassMatchDb(filters, -1);
		expect(20 * Math.log10(linear)).toBeCloseTo(db, 6);
	});

	it('symmetric ±gain produces near-symmetric trim', () => {
		const up = computeBypassMatchDb([pk(2000, 6)], 0);
		const down = computeBypassMatchDb([pk(2000, -6)], 0);
		// The K-weighting makes these not exactly antisymmetric (square in
		// the integration), but they should be opposite-signed and similar
		// in magnitude on the dB scale.
		expect(up * down).toBeLessThan(0);
		expect(Math.abs(up + down)).toBeLessThan(Math.abs(up));
	});
});
