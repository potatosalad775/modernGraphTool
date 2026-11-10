import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	curveDataFromRaw,
	pickChannels,
	processingParams,
	renormalizedCurveData
} from './curve-data.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { DataProcessor, anchorAndNormalizeSamples } from '#lib/utils/data-processor.js';
import type {
	ChannelData,
	FRDataObject,
	FRDataPoint,
	ParsedFRData,
	SampleData
} from '#lib/types/data-types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Evenly log-spaced, as the smoother requires of every curve the parser hands it. */
const GRID: number[] = Array.from({ length: 400 }, (_, i) => 20 * Math.pow(1000, i / 399));

function channel(shape: (hz: number) => number): ChannelData {
	return {
		data: GRID.map((hz) => [hz, shape(hz)] as FRDataPoint),
		metadata: { minFreq: 20, maxFreq: 20000 }
	};
}

/** A wiggle sharp enough that smoothing visibly moves it. */
function wobble(hz: number, phase: number): number {
	return 3 * Math.sin(Math.log10(hz) * 40 + phase);
}

function rawChannels(): ParsedFRData {
	return {
		L: channel((hz) => 80 + wobble(hz, 0)),
		R: channel((hz) => 78 + wobble(hz, 1.1)),
		AVG: channel((hz) => 79 + wobble(hz, 0.5))
	};
}

function rawRuns(): SampleData[] {
	return [0, 1, 2].map((i) => ({
		label: `Run ${i}`,
		L: channel((hz) => 80 + i * 3 + wobble(hz, i)),
		R: channel((hz) => 78 - i * 2 + wobble(hz, i + 1))
	}));
}

function item(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'x',
		type: 'phone',
		identifier: 'Brand Phone',
		channels: {},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: '#000' },
		dash: '1 0',
		...overrides
	};
}

function expectEnvelopeBounds(
	samples: SampleData[],
	envelope: NonNullable<FRDataObject['envelope']>
) {
	expect(envelope.L.upper.length).toBe(GRID.length);
	for (const run of samples) {
		run.L!.data.forEach(([, db], k) => {
			expect(envelope.L.upper[k][1]).toBeGreaterThanOrEqual(db);
			expect(envelope.L.lower[k][1]).toBeLessThanOrEqual(db);
		});
	}
}

describe('curve-data', () => {
	beforeEach(() => {
		graphStore.smoothValue = '1/12';
		graphStore.normType = 'Hz';
		graphStore.normHzValue = 1000;
	});

	afterEach(() => {
		graphStore.smoothValue = '1/48';
		graphStore.normType = 'Hz';
		graphStore.normHzValue = 500;
	});

	describe('processingParams', () => {
		it('reads the graph store', () => {
			expect(processingParams()).toEqual({ smoothValue: '1/12', normType: 'Hz', normHz: 1000 });
		});

		it('follows the store rather than caching it', () => {
			graphStore.normType = 'Avg';
			graphStore.normHzValue = 400;
			expect(processingParams()).toEqual({ smoothValue: '1/12', normType: 'Avg', normHz: 400 });
		});
	});

	describe('pickChannels', () => {
		it('keeps only the channels that are present', () => {
			const data = rawChannels();
			const picked = pickChannels({ L: data.L, AVG: data.AVG });
			expect(Object.keys(picked)).toEqual(['L', 'AVG']);
			expect(picked.L).toBe(data.L);
			expect(picked.AVG).toBe(data.AVG);
		});

		it('drops channels that are explicitly undefined, and keys that are not channels', () => {
			const picked = pickChannels({
				L: undefined,
				R: rawChannels().R,
				_samples: rawRuns()
			} as ParsedFRData);
			expect(Object.keys(picked)).toEqual(['R']);
		});

		it('returns a fresh object', () => {
			const data = rawChannels();
			const picked = pickChannels(data);
			expect(picked).not.toBe(data);
			expect(picked).toEqual(data);
		});

		it('returns an empty object for no channels', () => {
			expect(pickChannels({})).toEqual({});
		});
	});

	describe('curveDataFromRaw', () => {
		it('smooths and normalizes the channels', () => {
			const channels = rawChannels();
			const curve = curveDataFromRaw({ channels }, 'phone');

			expect(curve.channels).toEqual(DataProcessor.processChannels(channels, processingParams()));
			expect(curve.channels.AVG!.metadata.smoothing).toBe('1/12');
			// Smoothing flattens a wobble this sharp.
			const spread = (c: ChannelData) => {
				const dbs = c.data.map(([, db]) => db);
				return Math.max(...dbs) - Math.min(...dbs);
			};
			expect(spread(curve.channels.AVG!)).toBeLessThan(spread(channels.AVG!));
		});

		it('leaves the raw cache untouched', () => {
			const channels = rawChannels();
			const runs = rawRuns();
			curveDataFromRaw({ channels, samples: runs }, 'phone');
			expect(channels.AVG!.metadata.smoothing).toBeUndefined();
			expect(runs[0].L!.metadata.smoothing).toBeUndefined();
		});

		it('has explicitly undefined runs and envelope when the cache has no runs', () => {
			const curve = curveDataFromRaw({ channels: rawChannels() }, 'phone');
			expect(Object.keys(curve)).toEqual(['channels', 'samples', 'envelope']);
			expect(curve.samples).toBeUndefined();
			expect(curve.envelope).toBeUndefined();
		});

		it('smooths and anchors the runs, keeping their labels', () => {
			const runs = rawRuns();
			const curve = curveDataFromRaw({ channels: rawChannels(), samples: runs }, 'phone');

			expect(curve.samples).toEqual(DataProcessor.processSamples(runs, processingParams()));
			expect(curve.samples!.map((s) => s.label)).toEqual(['Run 0', 'Run 1', 'Run 2']);
			expect(curve.samples![0].L!.metadata.smoothing).toBe('1/12');
		});

		it('builds an envelope that bounds every processed run', () => {
			const curve = curveDataFromRaw({ channels: rawChannels(), samples: rawRuns() }, 'phone');
			expectEnvelopeBounds(curve.samples!, curve.envelope!);
			// Three distinct runs: the band has real width.
			expect(curve.envelope!.L.upper[0][1]).toBeGreaterThan(curve.envelope!.L.lower[0][1]);
		});

		for (const type of ['target', 'inserted-target'] as const) {
			it(`sets unadjustedChannels for ${type}, equal to the processed channels`, () => {
				const curve = curveDataFromRaw({ channels: rawChannels() }, type);
				expect(curve.unadjustedChannels).toBeDefined();
				expect(curve.unadjustedChannels).toEqual(curve.channels);
			});
		}

		for (const type of ['phone', 'inserted-phone', 'eq', 'inserted-eq'] as const) {
			it(`sets no unadjustedChannels for ${type}`, () => {
				const curve = curveDataFromRaw({ channels: rawChannels() }, type);
				expect(curve.unadjustedChannels).toBeUndefined();
				expect('unadjustedChannels' in curve).toBe(false);
			});
		}

		it('follows the smoothing and normalization asked for now', () => {
			const raw = { channels: rawChannels(), samples: rawRuns() };
			const at12 = curveDataFromRaw(raw, 'phone');
			graphStore.smoothValue = '1/3';
			const at3 = curveDataFromRaw(raw, 'phone');

			expect(at3.channels.AVG!.metadata.smoothing).toBe('1/3');
			expect(at3.samples![0].L!.metadata.smoothing).toBe('1/3');
			expect(at3.envelope!.L.upper).not.toEqual(at12.envelope!.L.upper);
			expectEnvelopeBounds(at3.samples!, at3.envelope!);
		});
	});

	describe('renormalizedCurveData', () => {
		/** An item as `curveDataFromRaw` leaves it, at the current normalization. */
		function drawn(withRuns: boolean): FRDataObject {
			const curve = curveDataFromRaw(
				{ channels: rawChannels(), samples: withRuns ? rawRuns() : undefined },
				'phone'
			);
			return item({ ...curve });
		}

		it('shifts the channels by a constant and does not smooth them again', () => {
			const before = drawn(false);
			graphStore.normHzValue = 4000;
			const curve = renormalizedCurveData(before);

			const delta = curve.channels.L!.data[0][1] - before.channels.L!.data[0][1];
			expect(delta).not.toBe(0);
			curve.channels.L!.data.forEach(([f, db], k) => {
				expect(f).toBe(before.channels.L!.data[k][0]);
				expect(db - before.channels.L!.data[k][1]).toBeCloseTo(delta, 1);
			});
			expect(curve.channels.L!.metadata.smoothing).toBe('1/12');
		});

		it('normalizes a target’s unadjustedChannels the same way as its channels', () => {
			const before = item({
				type: 'target',
				...curveDataFromRaw({ channels: rawChannels() }, 'target')
			});
			graphStore.normHzValue = 4000;
			const curve = renormalizedCurveData(before);

			expect(curve.unadjustedChannels).toEqual(curve.channels);
			expect(curve.unadjustedChannels).not.toEqual(before.unadjustedChannels);
		});

		it('normalizes unadjustedChannels on their own, not against the adjusted channels', () => {
			const unadjusted = { AVG: channel(() => 70) };
			const adjusted = { AVG: channel(() => 75) };
			graphStore.normHzValue = 1000;
			const curve = renormalizedCurveData(
				item({ type: 'target', channels: adjusted, unadjustedChannels: unadjusted })
			);

			// Both land on 0 dB at the reference: the adjustment is a shape, not a level.
			expect(curve.unadjustedChannels!.AVG!.data[0][1]).toBeCloseTo(0, 6);
			expect(curve.channels.AVG!.data[0][1]).toBeCloseTo(0, 6);
		});

		it('has no unadjustedChannels for an item that has none', () => {
			const curve = renormalizedCurveData(drawn(false));
			expect(curve.unadjustedChannels).toBeUndefined();
		});

		it('hands back the item’s own runs and envelope when it has none', () => {
			const envelope = {
				L: { upper: [], lower: [] },
				R: { upper: [], lower: [] },
				AVG: { upper: [], lower: [] }
			};
			const curve = renormalizedCurveData(item({ channels: rawChannels(), envelope }));
			expect(curve.samples).toBeUndefined();
			expect(curve.envelope).toBe(envelope);
		});

		it('has explicitly undefined runs and envelope for an item that never had any', () => {
			const curve = renormalizedCurveData(drawn(false));
			expect(Object.keys(curve)).toEqual(['channels', 'samples', 'envelope']);
			expect(curve.samples).toBeUndefined();
			expect(curve.envelope).toBeUndefined();
		});

		it('re-anchors the runs and rebuilds the envelope from them', () => {
			const before = drawn(true);
			graphStore.normType = 'Avg';
			const curve = renormalizedCurveData(before);

			expect(curve.samples).toEqual(anchorAndNormalizeSamples(before.samples!, 'Avg', 1000));
			expect(curve.samples![0].label).toBe('Run 0');
			expect(curve.samples![0].L!.metadata.smoothing).toBe('1/12');
			expectEnvelopeBounds(curve.samples!, curve.envelope!);
			expect(curve.envelope).not.toBe(before.envelope);
		});

		it('keeps the spread between runs', () => {
			const before = drawn(true);
			graphStore.normHzValue = 250;
			const curve = renormalizedCurveData(before);

			const width = (e: NonNullable<FRDataObject['envelope']>) => e.L.upper[7][1] - e.L.lower[7][1];
			expect(width(curve.envelope!)).toBeCloseTo(width(before.envelope!), 1);
		});
	});
});
