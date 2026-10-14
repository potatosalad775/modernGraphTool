import { describe, it, expect, vi } from 'vitest';
import { alignDFToBoundCenter, resolvePreferenceBoundEntries } from './preference-bound.js';
import { normalize } from './fr-normalizer.js';
import { lookupFRValueAtFreq } from './fr-lookup.js';
import type { ChannelData, FRDataPoint } from '$lib/types/data-types.js';

/** Synthetic DF target on the parser's 1/48oct grid, 20 Hz – ~20 kHz */
function makeDF(): ChannelData {
	const step = Math.pow(2, 1 / 48);
	const data: FRDataPoint[] = [];
	let freq = 20;
	for (let i = 0; i < 480; i++) {
		data.push([freq, 80 + Math.sin(i * 0.1) * 3]);
		freq *= step;
	}
	return { data, metadata: { minFreq: 20, maxFreq: freq } };
}

/** Band center as a function of frequency — bass-heavy, like the shipped Bounds files */
const centerAt = (freq: number) => 8 / (1 + freq / 100);

/** Bounds on a coarser 1/24oct grid than the DF, so lookup-by-frequency is exercised */
function makeBound(halfWidth: number): FRDataPoint[] {
	const step = Math.pow(2, 1 / 24);
	const data: FRDataPoint[] = [];
	for (let freq = 20; freq <= 20000; freq *= step) {
		data.push([freq, centerAt(freq) + halfWidth]);
	}
	return data;
}

const upper = makeBound(3);
const lower = makeBound(-3);

/** Drawn band center at `freq`: the aligned DF plus the bound offsets' midpoint */
const drawnCenter = (df: ChannelData, freq: number) =>
	lookupFRValueAtFreq(df.data, freq)! + centerAt(freq);

describe('alignDFToBoundCenter', () => {
	it.each([50, 500, 1000])('puts the band center at 0 dB at %i Hz', (hz) => {
		const result = alignDFToBoundCenter(makeDF(), upper, lower, 'Hz', hz);
		expect(drawnCenter(result, hz)).toBeCloseTo(0, 1);
	});

	it('anchors the band center, not the DF', () => {
		const result = alignDFToBoundCenter(makeDF(), upper, lower, 'Hz', 50);
		// The DF itself sits one center-offset below 0 dB where the band is bass-heavy
		expect(lookupFRValueAtFreq(result.data, 50)!).toBeCloseTo(-centerAt(50), 1);
		const dfAnchored = normalize(makeDF(), 'Hz', 50);
		expect(lookupFRValueAtFreq(dfAnchored.data, 50)!).toBeCloseTo(0, 1);
	});

	it('zeroes the band center mean over 300–3000 Hz in Avg mode', () => {
		const result = alignDFToBoundCenter(makeDF(), upper, lower, 'Avg', 0);
		const mid = result.data.filter(([f]) => f >= 300 && f <= 3000);
		const mean = mid.reduce((sum, [f, db]) => sum + db + centerAt(f), 0) / mid.length;
		expect(mean).toBeCloseTo(0, 1);
	});

	it('shifts the DF by a constant, preserving its shape', () => {
		const df = makeDF();
		const result = alignDFToBoundCenter(df, upper, lower, 'Hz', 50);
		const shift = result.data[0][1] - df.data[0][1];
		result.data.forEach(([, db], i) => {
			expect(db - df.data[i][1]).toBeCloseTo(shift, 1);
		});
	});

	it('does not mutate its inputs', () => {
		const df = makeDF();
		const dfBefore = structuredClone(df);
		const upperBefore = structuredClone(upper);
		alignDFToBoundCenter(df, upper, lower, 'Hz', 50);
		expect(df).toEqual(dfBefore);
		expect(upper).toEqual(upperBefore);
	});
});

describe('resolvePreferenceBoundEntries', () => {
	it('is empty when nothing is configured', () => {
		expect(resolvePreferenceBoundEntries(undefined, 'en')).toEqual([]);
		expect(resolvePreferenceBoundEntries({ BASE_DF_TARGET_FILE: '' }, 'en')).toEqual([]);
		expect(resolvePreferenceBoundEntries({ BOUND_LIST: [] }, 'en')).toEqual([]);
	});

	it('turns the legacy BASE_DF_TARGET_FILE into a single default entry', () => {
		expect(
			resolvePreferenceBoundEntries({ BASE_DF_TARGET_FILE: 'KEMAR DF (KB006x) Target' }, 'en')
		).toEqual([
			{
				name: 'KEMAR DF (KB006x)',
				target: 'KEMAR DF (KB006x) Target',
				upper: 'Bounds U.txt',
				lower: 'Bounds D.txt'
			}
		]);
	});

	it('prefers BOUND_LIST over the legacy key', () => {
		const entries = resolvePreferenceBoundEntries(
			{ BOUND_LIST: [{ target: '5128 DF' }], BASE_DF_TARGET_FILE: 'KEMAR DF' },
			'en'
		);
		expect(entries.map((e) => e.target)).toEqual(['5128 DF Target']);
	});

	it('normalizes the target and keeps custom names and bound files', () => {
		const [entry] = resolvePreferenceBoundEntries(
			{
				BOUND_LIST: [
					{ name: 'Wide', target: 'KEMAR DF.txt', upper: 'wide/U.txt', lower: 'wide/D.txt' }
				]
			},
			'en'
		);
		expect(entry).toEqual({
			name: 'Wide',
			target: 'KEMAR DF Target',
			upper: 'wide/U.txt',
			lower: 'wide/D.txt'
		});
	});

	it('resolves an i18n-wrapped name, falling back to the default', () => {
		const config = {
			BOUND_LIST: [{ name: { default: 'Wide', i18n: { ko: '넓게' } }, target: 'KEMAR DF' }]
		};
		expect(resolvePreferenceBoundEntries(config, 'ko')[0].name).toBe('넓게');
		expect(resolvePreferenceBoundEntries(config, 'cs')[0].name).toBe('Wide');
	});

	it('drops entries without a target and repeated names', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const entries = resolvePreferenceBoundEntries(
			{
				BOUND_LIST: [
					{ name: 'No target' },
					{ target: 'KEMAR DF' },
					{ target: 'KEMAR DF Target', upper: 'Other U.txt' },
					{ name: 'KEMAR wide', target: 'KEMAR DF', upper: 'Other U.txt' }
				]
			},
			'en'
		);
		expect(entries.map((e) => e.name)).toEqual(['KEMAR DF', 'KEMAR wide']);
		expect(warn).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});
});
