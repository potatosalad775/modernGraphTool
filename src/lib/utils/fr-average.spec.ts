import { describe, it, expect } from 'vitest';
import { averageChannels, isAveragable, type AverageSource } from './fr-average.js';
import { DataProcessor } from './data-processor.js';
import FRParser from './fr-parser.js';
import { normalizeChannels } from './fr-normalizer.js';
import type { ChannelData, FRDataObject, FRDataType } from '#lib/types/data-types.js';

/** A flat channel at `db`, on the two-point grid the other utils' specs use. */
function channel(db: number, freqs: number[] = [20, 1000, 20000]): ChannelData {
	return {
		data: freqs.map((f) => [f, db] as [number, number]),
		metadata: { minFreq: freqs[0], maxFreq: freqs[freqs.length - 1] }
	};
}

function source(
	channels: Record<string, ChannelData>,
	dispChannel: ('L' | 'R' | 'AVG')[]
): AverageSource {
	return { channels, dispChannel };
}

function makeItem(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'uuid-1',
		type: 'phone',
		identifier: 'Foo',
		channels: { AVG: channel(80) },
		dispChannel: ['AVG'],
		colors: { AVG: '#000' },
		dash: '1 0',
		...overrides
	};
}

describe('isAveragable', () => {
	it('accepts a visible phone that is displaying a channel it has', () => {
		expect(isAveragable(makeItem())).toBe(true);
	});

	it('accepts an inserted phone — an upload is the case the feature exists for', () => {
		expect(isAveragable(makeItem({ type: 'inserted-phone' }))).toBe(true);
	});

	it('rejects hidden items', () => {
		expect(isAveragable(makeItem({ hidden: true }))).toBe(false);
	});

	it.each(['target', 'eq', 'inserted-target', 'inserted-eq'] as FRDataType[])(
		'rejects %s — averaging it against a measurement is meaningless',
		(type) => {
			expect(isAveragable(makeItem({ type }))).toBe(false);
		}
	);

	it('rejects an item displaying a channel it has no data for', () => {
		expect(isAveragable(makeItem({ channels: { AVG: channel(80) }, dispChannel: ['L'] }))).toBe(
			false
		);
	});
});

describe('averageChannels', () => {
	it('averages a channel point-by-point across contributors', () => {
		const result = averageChannels([
			source({ AVG: channel(80) }, ['AVG']),
			source({ AVG: channel(90) }, ['AVG'])
		]);
		expect(result.AVG!.data.map(([, db]) => db)).toEqual([85, 85, 85]);
	});

	it('keeps the frequency grid of its contributors', () => {
		const result = averageChannels([
			source({ AVG: channel(80) }, ['AVG']),
			source({ AVG: channel(90) }, ['AVG'])
		]);
		expect(result.AVG!.data.map(([f]) => f)).toEqual([20, 1000, 20000]);
	});

	it('only counts a channel the item is actually displaying', () => {
		// Both hold L, but the second is drawn as AVG — so L has one contributor
		// and is dropped, and AVG never had two.
		const result = averageChannels([
			source({ L: channel(80) }, ['L']),
			source({ L: channel(90), AVG: channel(70) }, ['AVG'])
		]);
		expect(result.L).toBeUndefined();
		expect(result.AVG).toBeUndefined();
	});

	it('averages each channel over its own contributor count', () => {
		const result = averageChannels([
			source({ L: channel(80), R: channel(80) }, ['L', 'R']),
			source({ L: channel(90), R: channel(90) }, ['L', 'R']),
			source({ AVG: channel(0) }, ['AVG'])
		]);
		expect(result.L!.data[0][1]).toBe(85);
		expect(result.R!.data[0][1]).toBe(85);
		expect(result.AVG).toBeUndefined();
	});

	it('returns nothing for a single source — a one-curve average is a no-op', () => {
		expect(averageChannels([source({ AVG: channel(80) }, ['AVG'])])).toEqual({});
	});

	it('returns nothing when no two items share a displayed channel', () => {
		expect(
			averageChannels([source({ L: channel(80) }, ['L']), source({ R: channel(90) }, ['R'])])
		).toEqual({});
	});

	it('clamps to the shortest contributor instead of reading past its end', () => {
		const result = averageChannels([
			source({ AVG: channel(80, [20, 1000, 20000]) }, ['AVG']),
			source({ AVG: channel(90, [20, 1000]) }, ['AVG'])
		]);
		expect(result.AVG!.data).toHaveLength(2);
		expect(result.AVG!.data.every(([, db]) => Number.isFinite(db))).toBe(true);
	});

	it('narrows metadata to the range every contributor covers', () => {
		const result = averageChannels([
			source({ AVG: channel(80, [20, 1000, 20000]) }, ['AVG']),
			source({ AVG: channel(90, [50, 1000, 10000]) }, ['AVG'])
		]);
		expect(result.AVG!.metadata.minFreq).toBe(50);
		expect(result.AVG!.metadata.maxFreq).toBe(10000);
	});
});

describe('averaging order', () => {
	const freqs = FRParser._standardFrequencies;
	/** A flat curve with one sharp notch, at a different place per curve. */
	const notched = (base: number, at: number): ChannelData => ({
		data: freqs.map((f, i) => [f, Math.abs(i - at) < 3 ? base - 20 : base] as [number, number]),
		metadata: { minFreq: 20, maxFreq: 20000 }
	});
	const worstGap = (a: ChannelData, b: ChannelData) =>
		a.data.reduce((max, [, db], i) => Math.max(max, Math.abs(db - b.data[i][1])), 0);

	// Normalization is a constant dB offset per curve, so it commutes with the mean —
	// up to `clampDB` rounding every stored value to 0.01 dB: rounding each curve
	// before the mean lands up to half a quantum away from rounding the mean.
	it('commutes with normalization, to within the 0.01 dB quantum', () => {
		const [a, b] = [notched(80, 200), notched(92, 260)];
		const averageThenNormalize = normalizeChannels(
			averageChannels([source({ AVG: a }, ['AVG']), source({ AVG: b }, ['AVG'])]),
			'Hz',
			500
		);
		const normalizeThenAverage = averageChannels([
			source({ AVG: normalizeChannels({ AVG: a }, 'Hz', 500).AVG! }, ['AVG']),
			source({ AVG: normalizeChannels({ AVG: b }, 'Hz', 500).AVG! }, ['AVG'])
		]);
		expect(worstGap(averageThenNormalize.AVG!, normalizeThenAverage.AVG!)).toBeLessThanOrEqual(
			0.01
		);
	});

	// Smoothing averages power, so it does not commute with the dB mean: two notches in
	// different places each fill in on their own, but not once averaged together. Which
	// is why DataProvider averages raw channels and processes the mean — at creation and
	// again on every reSmoothAll, so the average never jumps between the two orders.
	it('does not commute with smoothing', () => {
		const params = { smoothValue: '1/6', normType: 'Hz' as const, normHz: 500 };
		const [a, b] = [notched(80, 200), notched(80, 260)];
		const averageThenProcess = DataProcessor.processChannels(
			averageChannels([source({ AVG: a }, ['AVG']), source({ AVG: b }, ['AVG'])]),
			params
		);
		const processThenAverage = averageChannels([
			source({ AVG: DataProcessor.processChannels({ AVG: a }, params).AVG! }, ['AVG']),
			source({ AVG: DataProcessor.processChannels({ AVG: b }, params).AVG! }, ['AVG'])
		]);
		expect(worstGap(averageThenProcess.AVG!, processThenAverage.AVG!)).toBeGreaterThan(0.5);
	});
});
