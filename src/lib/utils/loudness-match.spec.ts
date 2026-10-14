import { describe, it, expect } from 'vitest';
import {
	abLoudnessTrimDb,
	computeAbMatchDb,
	computeBypassMatchDb,
	computeBypassMatchLinear
} from './loudness-match.js';
import { derivePreamp } from './eq-preamp.js';
import { effectiveFilters } from './eq-channel.js';
import type { EQFilter } from './equalizer.js';

function pk(freq: number, gain: number, q = 1.0): EQFilter {
	return { enabled: true, type: 'PK', freq, q, gain };
}

describe('computeBypassMatchDb', () => {
	it('returns 0 when there are no filters', () => {
		expect(computeBypassMatchDb([], 0)).toBe(0);
	});

	// A preamp with no filters still changes the EQ-on level by exactly that many dB,
	// so the bypass path has to carry the same trim or toggling EQ jumps in volume.
	// The general integration reduces to preampDb here: with a flat chain the ratio is
	// preampLin², and 10·log10(preampLin²) is preampDb.
	it('matches the preamp exactly when there are no filters', () => {
		expect(computeBypassMatchDb([], -6)).toBeCloseTo(-6, 10);
		expect(computeBypassMatchDb([], 3)).toBeCloseTo(3, 10);
	});

	it('agrees with the general integration for a preamp-only chain', () => {
		// Same preamp, expressed as a filter stack that contributes no gain.
		const noOp = [pk(1000, 0)];
		expect(computeBypassMatchDb([], -6)).toBeCloseTo(computeBypassMatchDb(noOp, -6), 6);
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

describe('computeAbMatchDb / abLoudnessTrimDb', () => {
	const band = (gain: number, o: Partial<EQFilter> = {}): EQFilter => ({
		enabled: true,
		type: 'LSQ',
		freq: 105,
		q: 0.7,
		gain,
		...o
	});
	// A is a big bass boost, B a mild one. The derived preamp cuts A by its whole
	// 8 dB peak, so A is the *quieter* side overall and B the one turned down.
	const A = [band(8)];
	const B = [band(2)];
	const live = (filters: EQFilter[]) => ({ filters, preamp: derivePreamp(filters) });

	it('turns the louder side down to the quieter one', () => {
		const trim = computeAbMatchDb(live(B), A, B);
		expect(trim).toBeLessThan(0);
		// Playing B with the trim lands on A's level.
		const levelB = computeBypassMatchDb(B, derivePreamp(B)) + trim;
		expect(levelB).toBeCloseTo(computeBypassMatchDb(A, derivePreamp(A)), 6);
	});

	it('leaves the quieter side alone and never turns anything up', () => {
		expect(computeAbMatchDb(live(A), A, B)).toBe(0);
	});

	it('measures each side with its derived preamp, not a stale stored one', () => {
		// Only filters go in for the sides; a stale stored preamp can't skew them.
		expect(computeAbMatchDb(live(B), A, B)).toBeCloseTo(
			computeBypassMatchDb(A, derivePreamp(A)) - computeBypassMatchDb(B, derivePreamp(B)),
			6
		);
	});

	it('averages the ears for per-channel bands', () => {
		const split = [band(8, { channel: 'L' })];
		const trim = computeAbMatchDb(live(B), split, B);
		const ears = (['L', 'R'] as const).map((ch) =>
			computeBypassMatchDb(effectiveFilters(split, ch), derivePreamp(split))
		);
		const expected = (ears[0] + ears[1]) / 2 - computeBypassMatchDb(B, derivePreamp(B));
		expect(expected).toBeLessThan(0);
		expect(trim).toBeCloseTo(expected, 6);
	});

	it('is 0 unless matching is on, both sides are set and the live filters equal one', () => {
		const on = { enabled: true, a: live(A), b: live(B), live: live(B) };
		expect(abLoudnessTrimDb(on)).toBeLessThan(0);
		expect(abLoudnessTrimDb({ ...on, enabled: false })).toBe(0);
		expect(abLoudnessTrimDb({ ...on, b: null })).toBe(0);
		// An edit ends the comparison.
		expect(abLoudnessTrimDb({ ...on, live: live([band(7.5)]) })).toBe(0);
	});

	it('matches the live side by its filters even when its stored preamp is stale', () => {
		const b = { filters: B, preamp: -99 };
		expect(abLoudnessTrimDb({ enabled: true, a: live(A), b, live: live(B) })).toBeLessThan(0);
	});
});
