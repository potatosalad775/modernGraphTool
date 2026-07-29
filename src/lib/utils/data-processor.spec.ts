import { describe, it, expect } from 'vitest';
import { DataProcessor, anchorAndNormalizeHpTFSamples } from './data-processor.js';
import FRSmoother from './fr-smoother.js';
import type {
	ChannelData,
	FRDataPoint,
	HpTFSampleData,
	SampleData
} from '$lib/types/data-types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A dense log-spaced grid so every octave band the smoother creates has points
 * in it — otherwise empty bands are dropped and channels land on different grids.
 */
const GRID: number[] = Array.from({ length: 400 }, (_, i) => 20 * Math.pow(1000, i / 399));

function channel(shape: (hz: number) => number): ChannelData {
	return {
		data: GRID.map((hz) => [hz, shape(hz)] as FRDataPoint),
		metadata: { minFreq: 20, maxFreq: 20000 }
	};
}

/** Deterministic wiggle so channels are not trivially parallel. */
function wobble(hz: number, phase: number): number {
	return 3 * Math.sin(Math.log10(hz) * 4 + phase);
}

const PARAMS_AVG = { smoothValue: '1/12', normType: 'Avg', normHz: 500 };
const PARAMS_HZ = { smoothValue: '1/12', normType: 'Hz', normHz: 1000 };

function sample(offset: number): SampleData {
	return {
		L: channel((hz) => 80 + offset + wobble(hz, 0)),
		R: channel((hz) => 80 + offset + wobble(hz, 1.1) + 2)
	};
}

function hptfSample(label: string, offset: number): HpTFSampleData {
	return {
		label,
		L: channel((hz) => 80 + offset + wobble(hz, 0.3)),
		R: channel((hz) => 80 + offset + wobble(hz, 2.0) - 1)
	};
}

/** Index-wise L − R difference, the quantity a shared offset must preserve. */
function channelDelta(s: SampleData): number[] {
	return s.L!.data.map(([, l], i) => l - s.R!.data[i][1]);
}

// ── processChannel ───────────────────────────────────────────────────────────

describe('DataProcessor.processChannel', () => {
	const both = { L: channel((hz) => 80 + wobble(hz, 0)), R: channel((hz) => 75 + wobble(hz, 1)) };

	it('matches processChannels on the same single channel', () => {
		const single = DataProcessor.processChannel('L', both, PARAMS_AVG);
		const viaChannels = DataProcessor.processChannels({ L: both.L }, PARAMS_AVG).L;
		expect(single).toEqual(viaChannels);
	});

	it('normalizes the requested channel against itself, not against the pair', () => {
		// L alone anchors on L; the L/R pair anchors on their mean, so the two
		// differ by exactly the L-to-mean offset. If processChannel ever started
		// passing the sibling channel through, these would collapse to equal.
		const alone = DataProcessor.processChannel('R', both, PARAMS_AVG)!;
		const withSibling = DataProcessor.processChannels(both, PARAMS_AVG).R!;
		expect(alone.data[0][1]).not.toBeCloseTo(withSibling.data[0][1], 2);
	});

	it('works for R as well as L', () => {
		const r = DataProcessor.processChannel('R', both, PARAMS_HZ);
		expect(r?.data.length).toBeGreaterThan(0);
	});
});

// ── processSamples ───────────────────────────────────────────────────────────

describe('DataProcessor.processSamples', () => {
	const raw = [sample(0), sample(-4), sample(7)];

	it('processes every sample', () => {
		const out = DataProcessor.processSamples(raw, PARAMS_AVG);
		expect(out).toHaveLength(3);
		for (const s of out) {
			expect(s.L!.data.length).toBeGreaterThan(0);
			expect(s.R!.data.length).toBeGreaterThan(0);
		}
	});

	it('normalizes L and R of a sample with a single shared offset', () => {
		// The documented contract: within a sample, channel balance survives
		// normalization. Compare against the same data smoothed but not normalized.
		const smoothed = raw.map((s) => ({
			L: FRSmoother.smoothChannels({ L: s.L }, PARAMS_AVG.smoothValue).L,
			R: FRSmoother.smoothChannels({ R: s.R }, PARAMS_AVG.smoothValue).R
		}));
		const processed = DataProcessor.processSamples(raw, PARAMS_AVG);

		for (let i = 0; i < raw.length; i++) {
			const before = channelDelta(smoothed[i]);
			const after = channelDelta(processed[i]);
			expect(after).toHaveLength(before.length);
			for (let k = 0; k < before.length; k++) {
				expect(after[k]).toBeCloseTo(before[k], 1);
			}
		}
	});

	it('preserves channel balance regardless of normalization choice', () => {
		const viaAvg = DataProcessor.processSamples(raw, PARAMS_AVG);
		const viaHz = DataProcessor.processSamples(raw, PARAMS_HZ);

		for (let i = 0; i < raw.length; i++) {
			const a = channelDelta(viaAvg[i]);
			const b = channelDelta(viaHz[i]);
			for (let k = 0; k < a.length; k++) expect(a[k]).toBeCloseTo(b[k], 1);
		}
	});

	it('normalizes each sample independently', () => {
		// Two samples 4 dB apart both anchor to their own midrange, so after
		// Avg normalization their midrange means coincide.
		const out = DataProcessor.processSamples([sample(0), sample(-4)], PARAMS_AVG);
		const mid = (s: SampleData) => {
			const pts = s.L!.data.filter(([hz]) => hz >= 300 && hz <= 3000);
			return pts.reduce((sum, [, db]) => sum + db, 0) / pts.length;
		};
		expect(mid(out[0])).toBeCloseTo(mid(out[1]), 1);
	});

	it('handles a sample with only one channel', () => {
		const out = DataProcessor.processSamples(
			[{ L: channel((hz) => 80 + wobble(hz, 0)) }],
			PARAMS_AVG
		);
		expect(out[0].L).toBeDefined();
		expect(out[0].R).toBeUndefined();
	});

	it('returns an empty list for empty input', () => {
		expect(DataProcessor.processSamples([], PARAMS_AVG)).toEqual([]);
	});
});

// ── processHpTFSamples ───────────────────────────────────────────────────────

/**
 * Combined envelope span at each frequency: the distance between the highest
 * and lowest value across every sample AND both channels. This is what
 * GraphEngine draws when both channels are displayed, and the file's header
 * comment promises it is invariant to the user's normalization choice.
 */
function combinedSpan(samples: HpTFSampleData[]): number[] {
	const n = samples[0].L!.data.length;
	const spans: number[] = [];
	for (let k = 0; k < n; k++) {
		const values: number[] = [];
		for (const s of samples) {
			if (s.L) values.push(s.L.data[k][1]);
			if (s.R) values.push(s.R.data[k][1]);
		}
		spans.push(Math.max(...values) - Math.min(...values));
	}
	return spans;
}

function channelSpan(samples: HpTFSampleData[], key: 'L' | 'R'): number[] {
	const n = samples[0][key]!.data.length;
	const spans: number[] = [];
	for (let k = 0; k < n; k++) {
		const values = samples.map((s) => s[key]!.data[k][1]);
		spans.push(Math.max(...values) - Math.min(...values));
	}
	return spans;
}

describe('DataProcessor.processHpTFSamples', () => {
	const raw = [hptfSample('A', 0), hptfSample('B', 3), hptfSample('C', -2)];
	const labels = ['First', 'Second', 'Third'];

	it('applies the supplied labels', () => {
		const out = DataProcessor.processHpTFSamples(raw, labels, PARAMS_AVG);
		expect(out.map((s) => s.label)).toEqual(labels);
	});

	it('falls back to the sample label when no labels are supplied', () => {
		const out = DataProcessor.processHpTFSamples(raw, [], PARAMS_AVG);
		expect(out.map((s) => s.label)).toEqual(['A', 'B', 'C']);
	});

	it('falls back to a positional label when neither source has one', () => {
		// The fallback chain uses `??`, so an empty-string label is kept as-is —
		// only a missing label reaches `Sample N`. Untyped runtime data can.
		const unlabelled = raw.map((s) => ({ ...s, label: undefined as unknown as string }));
		const out = DataProcessor.processHpTFSamples(unlabelled, [], PARAMS_AVG);
		expect(out.map((s) => s.label)).toEqual(['Sample 1', 'Sample 2', 'Sample 3']);
	});

	it('prefers a supplied label over the sample own label', () => {
		const out = DataProcessor.processHpTFSamples(raw, ['X'], PARAMS_AVG);
		expect(out.map((s) => s.label)).toEqual(['X', 'B', 'C']);
	});

	it('keeps the per-channel envelope span invariant to normType', () => {
		const viaAvg = DataProcessor.processHpTFSamples(raw, labels, PARAMS_AVG);
		const viaHz = DataProcessor.processHpTFSamples(raw, labels, PARAMS_HZ);

		for (const key of ['L', 'R'] as const) {
			const a = channelSpan(viaAvg, key);
			const b = channelSpan(viaHz, key);
			for (let k = 0; k < a.length; k++) expect(a[k]).toBeCloseTo(b[k], 1);
		}
	});

	it('keeps the combined L+R envelope span invariant to normType and normHz', () => {
		const variants = [
			DataProcessor.processHpTFSamples(raw, labels, PARAMS_AVG),
			DataProcessor.processHpTFSamples(raw, labels, PARAMS_HZ),
			DataProcessor.processHpTFSamples(raw, labels, { ...PARAMS_HZ, normHz: 200 })
		];
		const reference = combinedSpan(variants[0]);
		for (const variant of variants.slice(1)) {
			const span = combinedSpan(variant);
			for (let k = 0; k < reference.length; k++) {
				expect(span[k]).toBeCloseTo(reference[k], 1);
			}
		}
	});

	it('translates the envelope vertically when normalization changes', () => {
		// Invariant span, but not invariant position — otherwise normalization
		// would have no effect on HpTF at all.
		const viaAvg = DataProcessor.processHpTFSamples(raw, labels, PARAMS_AVG);
		const viaHz = DataProcessor.processHpTFSamples(raw, labels, PARAMS_HZ);
		expect(viaAvg[0].L!.data[0][1]).not.toBeCloseTo(viaHz[0].L!.data[0][1], 2);
	});

	it('recomputes AVG as the mean of the resulting L and R', () => {
		const out = DataProcessor.processHpTFSamples(raw, labels, PARAMS_AVG);
		for (const s of out) {
			expect(s.AVG).toBeDefined();
			for (let k = 0; k < s.AVG!.data.length; k++) {
				const expected = (s.L!.data[k][1] + s.R!.data[k][1]) / 2;
				expect(s.AVG!.data[k][1]).toBeCloseTo(expected, 6);
			}
		}
	});
});

// ── anchorAndNormalizeHpTFSamples ────────────────────────────────────────────

describe('anchorAndNormalizeHpTFSamples', () => {
	it('returns an empty list for empty input', () => {
		expect(anchorAndNormalizeHpTFSamples([], 'Avg', 500)).toEqual([]);
	});

	it('falls back to per-curve normalization when fewer than two curves pool', () => {
		// A single sample with a single channel cannot be anchored against a pooled
		// mean, so it takes the `pooled.length < 2` branch and normalizes directly.
		const single: HpTFSampleData[] = [{ label: 'only', L: channel((hz) => 80 + wobble(hz, 0)) }];
		const out = anchorAndNormalizeHpTFSamples(single, 'Avg', 500);

		expect(out).toHaveLength(1);
		expect(out[0].R).toBeUndefined();
		expect(out[0].AVG).toBeUndefined();

		// Avg normalization puts the midrange mean at 0 dB.
		const mid = out[0].L!.data.filter(([hz]) => hz >= 300 && hz <= 3000);
		const mean = mid.reduce((sum, [, db]) => sum + db, 0) / mid.length;
		expect(mean).toBeCloseTo(0, 1);
	});

	it('does not attach AVG when a sample is missing a channel', () => {
		const mixed: HpTFSampleData[] = [
			{ label: 'a', L: channel((hz) => 80 + wobble(hz, 0)) },
			{ label: 'b', L: channel((hz) => 82 + wobble(hz, 1)) }
		];
		const out = anchorAndNormalizeHpTFSamples(mixed, 'Avg', 500);
		expect(out.every((s) => s.AVG === undefined)).toBe(true);
	});

	it('preserves every pairwise difference across samples and channels', () => {
		const raw = [hptfSample('A', 0), hptfSample('B', 5)];
		const smoothed = raw.map((s) => ({
			label: s.label,
			L: FRSmoother.smoothChannels({ L: s.L }, '1/12').L,
			R: FRSmoother.smoothChannels({ R: s.R }, '1/12').R
		}));
		const out = anchorAndNormalizeHpTFSamples(smoothed, 'Hz', 1000);

		const n = out[0].L!.data.length;
		for (let k = 0; k < n; k++) {
			// sample-to-sample within a channel
			expect(out[1].L!.data[k][1] - out[0].L!.data[k][1]).toBeCloseTo(
				smoothed[1].L!.data[k][1] - smoothed[0].L!.data[k][1],
				1
			);
			// L-to-R across channels
			expect(out[0].L!.data[k][1] - out[0].R!.data[k][1]).toBeCloseTo(
				smoothed[0].L!.data[k][1] - smoothed[0].R!.data[k][1],
				1
			);
		}
	});
});
