import { describe, it, expect } from 'vitest';
import { averageChannels, isAveragable, type AverageSource } from './fr-average.js';
import { DataProcessor } from './data-processor.js';
import type { ChannelData, FRDataObject, FRDataType } from '$lib/types/data-types.js';

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
	// The reason DataProvider can average raw channels and process afterwards:
	// if the two orders disagreed, the average would visibly jump the first time
	// the user changed smoothing and reSmoothAll rebuilt it from `_rawData`.
	//
	// Both stages are linear, so the only gap is `clampDB` rounding every stored
	// value to 0.01 dB — rounding each curve before the mean lands up to half a
	// quantum away from rounding the mean. Tightening this tolerance means the
	// pipeline gained a genuinely non-linear stage, and averaging raw would no
	// longer be equivalent to averaging what's drawn.
	it('commutes with smoothing and normalization, to within the 0.01 dB quantum', () => {
		const params = { smoothValue: '1/12', normType: 'Hz' as const, normHz: 500 };
		const freqs = [20, 50, 125, 315, 800, 2000, 5000, 12500];
		const shapeA: ChannelData = {
			data: freqs.map((f, i) => [f, 80 + i * 1.5] as [number, number]),
			metadata: { minFreq: 20, maxFreq: 12500 }
		};
		const shapeB: ChannelData = {
			data: freqs.map((f, i) => [f, 95 - i * 2.25] as [number, number]),
			metadata: { minFreq: 20, maxFreq: 12500 }
		};

		const averageThenProcess = DataProcessor.processChannels(
			averageChannels([source({ AVG: shapeA }, ['AVG']), source({ AVG: shapeB }, ['AVG'])]),
			params
		);
		const processThenAverage = averageChannels([
			source({ AVG: DataProcessor.processChannels({ AVG: shapeA }, params).AVG! }, ['AVG']),
			source({ AVG: DataProcessor.processChannels({ AVG: shapeB }, params).AVG! }, ['AVG'])
		]);

		expect(averageThenProcess.AVG!.data).toHaveLength(processThenAverage.AVG!.data.length);
		const worst = averageThenProcess.AVG!.data.reduce(
			(max, [, db], i) => Math.max(max, Math.abs(db - processThenAverage.AVG!.data[i][1])),
			0
		);
		expect(worst).toBeLessThanOrEqual(0.01);
	});
});
