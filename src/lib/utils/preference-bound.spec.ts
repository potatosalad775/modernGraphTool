import { describe, it, expect } from 'vitest';
import { alignDFToBoundCenter } from './preference-bound.js';
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
