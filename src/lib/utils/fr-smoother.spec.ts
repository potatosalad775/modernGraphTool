import { describe, it, expect } from 'vitest';
import FRSmoother from './fr-smoother.js';
import FRParser from './fr-parser.js';
import rewFixture from './__fixtures__/rew-smoothing.json';
import type { FRDataPoint, ParsedFRData } from '#lib/types/data-types.js';

const octaves = Object.keys(FRSmoother.OCTAVE_BANDS);

/** Synthetic FR data on the parser's 1/48oct grid. */
function makeFRData(count = FRParser._standardFrequencies.length, baseDb = 80): FRDataPoint[] {
	return FRParser._standardFrequencies
		.slice(0, count)
		.map((f, i) => [f, baseDb + Math.sin(i * 0.3) * 5] as FRDataPoint);
}

describe('FRSmoother', () => {
	describe('OCTAVE_BANDS', () => {
		it('has the expected band fractions', () => {
			expect(FRSmoother.OCTAVE_BANDS['1/48']).toBeCloseTo(1 / 48);
			expect(FRSmoother.OCTAVE_BANDS['1/24']).toBeCloseTo(1 / 24);
			expect(FRSmoother.OCTAVE_BANDS['1/12']).toBeCloseTo(1 / 12);
			expect(FRSmoother.OCTAVE_BANDS['1/6']).toBeCloseTo(1 / 6);
			expect(FRSmoother.OCTAVE_BANDS['1/3']).toBeCloseTo(1 / 3);
		});
	});

	// The fixture is REW's own output for the same 1/48oct grids, fetched over its API by
	// scripts/rew-smoothing-fixture.mjs. Both sides store float32-ish values, hence the
	// tolerance; the algorithm itself matches exactly. There is no 1/48 entry — on a 48ppo
	// grid REW floors 1/48 to 1/24, which the app deliberately doesn't (see the script).
	describe('matches REW', () => {
		const cases = rewFixture.curves.flatMap((curve) =>
			Object.entries(curve.smoothed).map(
				([octave, expected]) => [curve.name, octave, curve.input, expected] as const
			)
		);

		it.each(cases)('%s at %s', (_name, octave, input, expected) => {
			const grid = input.map((db, i) => [FRParser._standardFrequencies[i], db] as FRDataPoint);
			const result = FRSmoother.smooth(grid, octave);
			const worst = Math.max(...result.map(([, db], i) => Math.abs(db - expected[i])));
			expect(worst).toBeLessThan(0.002);
		});

		it('covers every smoothing but 1/48', () => {
			for (const curve of rewFixture.curves) {
				expect(Object.keys(curve.smoothed)).toEqual(octaves.filter((o) => o !== '1/48'));
			}
		});

		it('keeps 1/48 lighter than 1/24 rather than flooring it the way REW does', () => {
			const grid = rewFixture.curves[0].input.map(
				(db, i) => [FRParser._standardFrequencies[i], db] as FRDataPoint
			);
			const dev = (octave: string) =>
				FRSmoother.smooth(grid, octave).reduce(
					(sum, [, db], i) => sum + Math.abs(db - grid[i][1]),
					0
				);
			expect(dev('1/48')).toBeGreaterThan(0);
			expect(dev('1/48')).toBeLessThan(dev('1/24') / 2);
		});
	});

	describe('smooth', () => {
		it('keeps the input frequencies', () => {
			const data = makeFRData();
			for (const octave of octaves) {
				expect(FRSmoother.smooth(data, octave).map(([f]) => f)).toEqual(data.map(([f]) => f));
			}
		});

		it('leaves a flat curve flat, ends included', () => {
			const flat = makeFRData().map(([f]) => [f, 72] as FRDataPoint);
			for (const [, db] of FRSmoother.smooth(flat, '1/3')) expect(db).toBeCloseTo(72, 10);
		});

		it('reduces variance more with heavier smoothing', () => {
			const data = makeFRData();
			const variance = (points: FRDataPoint[]) => computeVariance(points.map((p) => p[1]));
			const fine = variance(FRSmoother.smooth(data, '1/24'));
			const coarse = variance(FRSmoother.smooth(data, '1/3'));
			expect(fine).toBeLessThan(variance(data));
			expect(coarse).toBeLessThan(fine);
		});

		// Averaging power, a narrow notch fills in from its neighbours; a peak keeps more
		// of its height than the same notch keeps of its depth.
		it('averages in power, not dB', () => {
			const base = makeFRData().map(([f]) => [f, 70] as FRDataPoint);
			const mid = Math.floor(base.length / 2);
			const notch = base.map(([f], i) => [f, i === mid ? 50 : 70] as FRDataPoint);
			const peak = base.map(([f], i) => [f, i === mid ? 90 : 70] as FRDataPoint);
			const notchDepth = 70 - FRSmoother.smooth(notch, '1/6')[mid][1];
			const peakHeight = FRSmoother.smooth(peak, '1/6')[mid][1] - 70;
			expect(peakHeight).toBeGreaterThan(notchDepth);
		});

		it('does not mutate its input', () => {
			const data = makeFRData();
			const copy = data.map((p) => [...p]);
			FRSmoother.smooth(data, '1/3');
			expect(data).toEqual(copy);
		});

		it('copies a single point through', () => {
			const one: FRDataPoint[] = [[1000, 80]];
			const result = FRSmoother.smooth(one, '1/3');
			expect(result).toEqual(one);
			expect(result[0]).not.toBe(one[0]);
		});

		it('returns input unchanged for invalid smooth value', () => {
			const data = makeFRData(50);
			expect(FRSmoother.smooth(data, 'invalid')).toBe(data);
		});

		it('handles null/undefined data gracefully', () => {
			expect(FRSmoother.smooth(null as unknown as FRDataPoint[], '1/6')).toBeNull();
		});
	});

	describe('smoothChannels', () => {
		const channels = (): ParsedFRData => ({
			L: { data: makeFRData(), metadata: { minFreq: 20, maxFreq: 20000 } },
			R: { data: makeFRData(), metadata: { minFreq: 20, maxFreq: 20000 } },
			AVG: { data: makeFRData(), metadata: { minFreq: 20, maxFreq: 20000, weights: [1, 2, 3] } }
		});

		it('smooths every available channel and tags it with the smoothing', () => {
			const result = FRSmoother.smoothChannels(channels(), '1/6');
			for (const ch of ['L', 'R', 'AVG'] as const) {
				expect(result[ch]!.data).toEqual(FRSmoother.smooth(makeFRData(), '1/6'));
				expect(result[ch]!.metadata.smoothing).toBe('1/6');
			}
		});

		it('preserves the rest of the metadata', () => {
			const result = FRSmoother.smoothChannels(channels(), '1/6');
			expect(result.AVG!.metadata).toMatchObject({
				minFreq: 20,
				maxFreq: 20000,
				weights: [1, 2, 3]
			});
		});

		it('does not mutate the original channels', () => {
			const data = channels();
			FRSmoother.smoothChannels(data, '1/6');
			expect(data.L!.data).toEqual(makeFRData());
			expect(data.L!.metadata.smoothing).toBeUndefined();
		});

		it('skips missing channels', () => {
			const { AVG } = channels();
			const result = FRSmoother.smoothChannels({ AVG }, '1/6');
			expect(result.L).toBeUndefined();
			expect(result.R).toBeUndefined();
			expect(result.AVG).toBeDefined();
		});

		it('returns input for invalid smooth value', () => {
			const data = channels();
			expect(FRSmoother.smoothChannels(data, 'invalid')).toBe(data);
		});

		// Stored channels and the live EQ curve are already smoothed; sending them through
		// again at the same value must not blur them a second time.
		it('passes a channel already smoothed at the same value through', () => {
			const once = FRSmoother.smoothChannels(channels(), '1/3');
			const twice = FRSmoother.smoothChannels(once, '1/3');
			expect(twice.L).toBe(once.L);
			expect(twice.AVG).toBe(once.AVG);
		});

		it('throws in dev on data already smoothed at another value', () => {
			const once = FRSmoother.smoothChannels(channels(), '1/48');
			expect(() => FRSmoother.smoothChannels(once, '1/3')).toThrow(/already smoothed at 1\/48/);
		});
	});
});

function computeVariance(values: number[]): number {
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}
