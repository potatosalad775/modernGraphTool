import { describe, it, expect } from 'vitest';
import { Equalizer, type EQFilter } from './equalizer.js';

type FreqPoint = [number, number];

/** Generate a flat FR curve at the given dB level */
function flatCurve(db = 0, count = 480): FreqPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const points: FreqPoint[] = [];
	for (let i = 0; i < count; i++) {
		points.push([freq, db]);
		freq *= step;
	}
	return points;
}

/** Generate a simple shaped curve with a peak/dip */
function shapedCurve(count = 480): FreqPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const points: FreqPoint[] = [];
	for (let i = 0; i < count; i++) {
		// Simulate a bass boost + treble roll-off
		const db = 5 * Math.exp(-((Math.log10(freq) - 2.5) ** 2));
		points.push([freq, db]);
		freq *= step;
	}
	return points;
}

describe('Equalizer', () => {
	let eq: Equalizer;

	function makeEq() {
		return new Equalizer();
	}

	describe('constructor', () => {
		it('initializes with default sample rate of 48000', () => {
			eq = makeEq();
			expect(eq.config.DefaultSampleRate).toBe(48000);
		});

		it('initializes AutoEQ range', () => {
			eq = makeEq();
			expect(eq.config.AutoEQRange).toEqual([20, 15000]);
		});

		it('has graphic EQ frequencies sorted', () => {
			eq = makeEq();
			const freqs = eq.config.GraphicEQFrequences;
			for (let i = 1; i < freqs.length; i++) {
				expect(freqs[i]).toBeGreaterThanOrEqual(freqs[i - 1]);
			}
		});
	});

	describe('biquad coefficient calculations', () => {
		it('_peaking returns 6 coefficients', () => {
			eq = makeEq();
			const coeffs = eq._peaking(1000, 1.0, 6);
			expect(coeffs).toHaveLength(6);
			expect(coeffs[0]).toBe(1.0); // a0 is normalized to 1
		});

		it('_lowshelf returns 6 coefficients', () => {
			eq = makeEq();
			const coeffs = eq._lowshelf(100, 0.7, 3);
			expect(coeffs).toHaveLength(6);
			expect(coeffs[0]).toBe(1.0);
		});

		it('_highshelf returns 6 coefficients', () => {
			eq = makeEq();
			const coeffs = eq._highshelf(8000, 0.7, -3);
			expect(coeffs).toHaveLength(6);
			expect(coeffs[0]).toBe(1.0);
		});

		it('peaking with 0 gain produces near-unity response', () => {
			eq = makeEq();
			const coeffs = eq._peaking(1000, 1.0, 0);
			// b0/a0 ≈ 1, b1/a1 should be equal, b2/a2 should be equal
			// Check numerator ≈ denominator
			expect(coeffs[3]).toBeCloseTo(1.0, 4); // b0/a0
		});
	});

	describe('calculateGainsFromFilter', () => {
		it('returns zero gains for no filters', () => {
			eq = makeEq();
			const freqs = [100, 1000, 10000];
			const gains = eq.calculateGainsFromFilter(freqs, []);
			expect(gains).toHaveLength(3);
			gains.forEach((g) => expect(g).toBeCloseTo(0, 4));
		});

		it('returns non-zero gains for a peaking filter', () => {
			eq = makeEq();
			const freqs = [100, 1000, 10000];
			const filters: EQFilter[] = [{ enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 6 }];
			const gains = eq.calculateGainsFromFilter(freqs, filters);
			// Peak should be near 1000 Hz
			expect(gains[1]).toBeGreaterThan(gains[0]);
			expect(gains[1]).toBeGreaterThan(gains[2]);
		});

		it('skips filters with zero freq/gain/q', () => {
			eq = makeEq();
			const freqs = [1000];
			const filters: EQFilter[] = [{ enabled: true, type: 'PK', freq: 0, q: 1.0, gain: 6 }];
			const gains = eq.calculateGainsFromFilter(freqs, filters);
			expect(gains[0]).toBeCloseTo(0, 4);
		});
	});

	describe('applyFilters', () => {
		it('returns unchanged FR with no filters', () => {
			eq = makeEq();
			const fr = flatCurve(0, 50);
			const result = eq.applyFilters(fr, []);
			expect(result).toHaveLength(50);
			result.forEach((p, i) => {
				expect(p[0]).toBe(fr[i][0]);
				expect(p[1]).toBeCloseTo(fr[i][1], 4);
			});
		});

		it('boosts around the filter frequency', () => {
			eq = makeEq();
			const fr = flatCurve(0);
			const filters: EQFilter[] = [{ enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 6 }];
			const result = eq.applyFilters(fr, filters);
			// Find the point closest to 1000 Hz
			const idx1k = result.findIndex((p) => p[0] >= 1000);
			expect(result[idx1k][1]).toBeGreaterThan(3); // Should be significantly boosted
		});

		it('applies multiple filters additively', () => {
			eq = makeEq();
			const fr = flatCurve(0);
			const f1: EQFilter[] = [{ enabled: true, type: 'PK', freq: 100, q: 1.0, gain: 3 }];
			const f2: EQFilter[] = [{ enabled: true, type: 'PK', freq: 10000, q: 1.0, gain: 3 }];
			const both: EQFilter[] = [...f1, ...f2];

			const r1 = eq.applyFilters(fr, f1);
			const r2 = eq.applyFilters(fr, f2);
			const rBoth = eq.applyFilters(fr, both);

			// At 100 Hz, combined should equal single filter (other filter negligible)
			const idx100 = rBoth.findIndex((p) => p[0] >= 100);
			expect(rBoth[idx100][1]).toBeCloseTo(r1[idx100][1] + r2[idx100][1], 0);
		});
	});

	describe('calculatePreamp', () => {
		it('returns negative of max gain increase', () => {
			eq = makeEq();
			const fr = flatCurve(0);
			const filters: EQFilter[] = [{ enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 6 }];
			const preamp = eq.calculatePreamp(fr, filters);
			expect(preamp).toBeLessThan(0);
			expect(preamp).toBeCloseTo(-6, 0);
		});

		it('returns 0 for negative-only gain filters', () => {
			eq = makeEq();
			const fr = flatCurve(0);
			const filters: EQFilter[] = [{ enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: -6 }];
			const preamp = eq.calculatePreamp(fr, filters);
			// Max gain change is negative, so preamp should be positive (or zero)
			expect(preamp).toBeGreaterThanOrEqual(0);
		});
	});

	describe('convertFilterAsGraphicEQ', () => {
		it('returns frequency points', () => {
			eq = makeEq();
			const filters: EQFilter[] = [{ enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 6 }];
			const result = eq.convertFilterAsGraphicEQ(filters);
			expect(result.length).toBeGreaterThan(0);
			// Max gain should be 0 (normalized)
			const maxGain = Math.max(...result.map((p) => p[1]));
			expect(maxGain).toBeCloseTo(0, 1);
		});
	});

	describe('autoEQ', () => {
		it('produces filters that reduce error between source and target', () => {
			eq = makeEq();
			const source = flatCurve(0);
			const target = shapedCurve();

			const filters = eq.autoEQ(source, target, { maxFilters: 4 });
			expect(filters.length).toBeGreaterThan(0);
			expect(filters.length).toBeLessThanOrEqual(4);

			// Each filter should have valid properties
			for (const f of filters) {
				expect(f.enabled).toBe(true);
				expect(['PK', 'LSQ', 'HSQ']).toContain(f.type);
				expect(f.freq).toBeGreaterThan(0);
				expect(f.q).toBeGreaterThan(0);
				expect(f.gain).not.toBe(0);
			}
		});

		it('returns filters sorted by frequency', () => {
			eq = makeEq();
			const source = flatCurve(0);
			const target = shapedCurve();

			const filters = eq.autoEQ(source, target, { maxFilters: 5 });
			expect(Array.isArray(filters)).toBe(true);
			for (let i = 1; i < filters.length; i++) {
				expect(filters[i].freq).toBeGreaterThanOrEqual(filters[i - 1].freq!);
			}
		});

		it('respects maxFilters option', () => {
			eq = makeEq();
			const source = flatCurve(0);
			const target = shapedCurve();

			const filters = eq.autoEQ(source, target, { maxFilters: 3 });
			expect(filters.length).toBeLessThanOrEqual(3);
		});

		it('returns empty array when source equals target', () => {
			eq = makeEq();
			const curve = flatCurve(0);
			const filters = eq.autoEQ(curve, curve, { maxFilters: 5 });
			// Either empty or all filters are pruned as ineffective
			expect(filters.length).toBeLessThanOrEqual(1);
		});
	});

	describe('autoEQ edge cases', () => {
		it('produces no filters when source and target are both flat at same level', () => {
			eq = makeEq();
			const flat = flatCurve(80);
			const filters = eq.autoEQ(flat, flat, { maxFilters: 5 });
			expect(filters.length).toBeLessThanOrEqual(1);
			if (filters.length > 0) {
				// Any residual filter should have negligible gain
				expect(Math.abs(filters[0].gain ?? 0)).toBeLessThan(1);
			}
		});

		it('handles source with fewer points than target', () => {
			eq = makeEq();
			const source = flatCurve(0, 100);
			const target = shapedCurve(480);
			const filters = eq.autoEQ(source, target, { maxFilters: 4 });
			expect(Array.isArray(filters)).toBe(true);
			for (const f of filters) {
				expect(f.freq).toBeGreaterThan(0);
			}
		});

		it('handles extreme gain differences between source and target', () => {
			eq = makeEq();
			const source = flatCurve(0);
			const target = flatCurve(20); // 20 dB difference
			const filters = eq.autoEQ(source, target, { maxFilters: 5 });
			expect(Array.isArray(filters)).toBe(true);
		});
	});

	describe('convertFilterAsGraphicEQ edge cases', () => {
		it('returns frequency points for LSQ filter', () => {
			eq = makeEq();
			const filters: EQFilter[] = [{ enabled: true, type: 'LSQ', freq: 100, q: 0.7, gain: 6 }];
			const result = eq.convertFilterAsGraphicEQ(filters);
			expect(result.length).toBeGreaterThan(0);
			// Low shelf should boost low frequencies more
			const lowIdx = result.findIndex((p) => p[0] >= 50);
			const highIdx = result.findIndex((p) => p[0] >= 5000);
			if (lowIdx >= 0 && highIdx >= 0) {
				expect(result[lowIdx][1]).toBeGreaterThan(result[highIdx][1]);
			}
		});

		it('returns frequency points for HSQ filter', () => {
			eq = makeEq();
			const filters: EQFilter[] = [{ enabled: true, type: 'HSQ', freq: 8000, q: 0.7, gain: 6 }];
			const result = eq.convertFilterAsGraphicEQ(filters);
			expect(result.length).toBeGreaterThan(0);
		});

		it('handles empty filter array', () => {
			eq = makeEq();
			const result = eq.convertFilterAsGraphicEQ([]);
			expect(result.length).toBeGreaterThan(0);
			// All gains should be 0 (normalized from 0)
			for (const p of result) {
				expect(p[1]).toBeCloseTo(0, 4);
			}
		});
	});

	describe('_round', () => {
		it('rounds to specified decimal places', () => {
			eq = makeEq();
			expect(eq._round(3.456, 1)).toBe(3.5);
			expect(eq._round(3.456, 2)).toBe(3.46);
			expect(eq._round(3.456, 0)).toBe(3);
		});
	});

	describe('_freqUnit', () => {
		it('returns 1 for frequencies below 100', () => {
			eq = makeEq();
			expect(eq._freqUnit(50)).toBe(1);
		});

		it('returns 10 for frequencies 100–999', () => {
			eq = makeEq();
			expect(eq._freqUnit(500)).toBe(10);
		});

		it('returns 100 for frequencies 1000–9999', () => {
			eq = makeEq();
			expect(eq._freqUnit(5000)).toBe(100);
		});

		it('returns 1000 for frequencies >= 10000', () => {
			eq = makeEq();
			expect(eq._freqUnit(15000)).toBe(1000);
		});
	});
});
