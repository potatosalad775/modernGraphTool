import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBaselineChannelData } from './baseline.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import type { FRDataObject, FRDataPoint, ParsedFRData } from '$lib/types/data-types.js';

function makeTarget(uuid: string, avg: FRDataPoint[]): FRDataObject {
	return {
		uuid,
		type: 'target',
		identifier: `target-${uuid}`,
		channels: {
			AVG: { data: avg, metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		colors: { AVG: '#666' },
		dash: '4 4'
	};
}

function makePhone(uuid: string, avg: FRDataPoint[]): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `phone-${uuid}`,
		channels: {
			AVG: { data: avg, metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		colors: { AVG: '#f00' },
		dash: '1 0'
	};
}

const ORIGINAL: FRDataPoint[] = [
	[500, 70],
	[1000, 75],
	[2000, 72]
];
const ADJUSTED: FRDataPoint[] = [
	[500, 72],
	[1000, 77],
	[2000, 74]
];

describe('resolveBaselineChannelData', () => {
	beforeEach(() => {
		frStore.clear();
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.targetOriginalData.clear();
	});

	it('returns null when UUID is null', () => {
		expect(resolveBaselineChannelData(null, 'withoutAdjustment')).toBeNull();
		expect(resolveBaselineChannelData(null, 'withAdjustment')).toBeNull();
		expect(resolveBaselineChannelData(null, 'off')).toBeNull();
	});

	it('withoutAdjustment returns pre-adjustment target data from targetOriginalData', () => {
		const original: ParsedFRData = {
			AVG: { data: ORIGINAL, metadata: { minFreq: 20, maxFreq: 20000 } }
		};
		graphStore.targetOriginalData.set('t', original);
		frStore.set('t', makeTarget('t', ADJUSTED));

		const resolved = resolveBaselineChannelData('t', 'withoutAdjustment');
		expect(resolved).toBe(ORIGINAL);
	});

	it('withAdjustment returns current (adjusted) channels from frStore', () => {
		const original: ParsedFRData = {
			AVG: { data: ORIGINAL, metadata: { minFreq: 20, maxFreq: 20000 } }
		};
		graphStore.targetOriginalData.set('t', original);
		frStore.set('t', makeTarget('t', ADJUSTED));

		const resolved = resolveBaselineChannelData('t', 'withAdjustment');
		expect(resolved).toBe(ADJUSTED);
	});

	it('withoutAdjustment falls through to frStore when target has no cached original', () => {
		// Simulates a customizable target whose TargetCustomizer has not mounted yet,
		// or a target that never had adjustments applied.
		frStore.set('t', makeTarget('t', ADJUSTED));
		expect(graphStore.targetOriginalData.has('t')).toBe(false);

		const resolved = resolveBaselineChannelData('t', 'withoutAdjustment');
		expect(resolved).toBe(ADJUSTED);
	});

	it('withoutAdjustment falls through to frStore for phones', () => {
		// SelectionList sets baselineMode = 'withoutAdjustment' for phone baselines too,
		// via the simple toggle branch. Phones never populate targetOriginalData.
		frStore.set('p', makePhone('p', ADJUSTED));

		const resolved = resolveBaselineChannelData('p', 'withoutAdjustment');
		expect(resolved).toBe(ADJUSTED);
	});

	it('returns null when UUID is unknown to both stores', () => {
		expect(resolveBaselineChannelData('missing', 'withoutAdjustment')).toBeNull();
		expect(resolveBaselineChannelData('missing', 'withAdjustment')).toBeNull();
	});

	it('picks L or R channel for phones displaying a single channel', () => {
		frStore.set('p', {
			...makePhone('p', ADJUSTED),
			dispChannel: ['L'],
			channels: {
				L: { data: ORIGINAL, metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: ADJUSTED, metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: ADJUSTED, metadata: { minFreq: 20, maxFreq: 20000 } }
			}
		});

		expect(resolveBaselineChannelData('p', 'withAdjustment')).toBe(ORIGINAL);
	});
});
