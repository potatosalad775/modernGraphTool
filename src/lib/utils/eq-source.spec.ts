import { describe, it, expect } from 'vitest';
import { eqSourceChannels, eqSourceRun, sameEqSourceSample, sampleRunLabel } from './eq-source.js';
import type { ChannelData, FRDataObject } from '#lib/types/data-types.js';

function curve(db: number): ChannelData {
	return { data: [[1000, db]], metadata: { minFreq: 20, maxFreq: 20000 } };
}

function sampleSet(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'p',
		type: 'phone',
		identifier: 'IEM',
		dispSuffix: 'Depths',
		channels: { L: curve(0), R: curve(0), AVG: curve(0) },
		dispChannel: ['AVG'],
		colors: {},
		samples: [
			{ label: 'Shallow', L: curve(1), R: curve(1), AVG: curve(1) },
			{ label: 'Deep', L: curve(2) },
			{ label: 'Empty' }
		],
		...overrides
	} as FRDataObject;
}

describe('eqSourceRun', () => {
	it('returns the picked run of the variant it was picked on', () => {
		expect(eqSourceRun(sampleSet(), { index: 1, variant: 'Depths' })?.label).toBe('Deep');
	});

	it('means the average with no pick', () => {
		expect(eqSourceRun(sampleSet(), null)).toBeNull();
	});

	// Index 1 of one variant's set is an unrelated run in another's.
	it('goes stale once the source shows another variant', () => {
		const item = sampleSet({ dispSuffix: 'Repeat Runs' });
		expect(eqSourceRun(item, { index: 1, variant: 'Depths' })).toBeNull();
	});

	it('treats a missing dispSuffix as the empty variant', () => {
		const item = sampleSet({ dispSuffix: undefined });
		expect(eqSourceRun(item, { index: 0, variant: '' })?.label).toBe('Shallow');
	});

	it('ignores an index past the end, and a run with no data', () => {
		expect(eqSourceRun(sampleSet(), { index: 9, variant: 'Depths' })).toBeNull();
		expect(eqSourceRun(sampleSet(), { index: 2, variant: 'Depths' })).toBeNull();
	});

	it('ignores an item that is not a sample set', () => {
		expect(
			eqSourceRun(sampleSet({ samples: undefined }), { index: 0, variant: 'Depths' })
		).toBeNull();
	});
});

describe('eqSourceChannels', () => {
	it('is the item channels for the average', () => {
		const item = sampleSet();
		expect(eqSourceChannels(item, null)).toBe(item.channels);
	});

	it("is the run's channels, and only those it has", () => {
		const channels = eqSourceChannels(sampleSet(), { index: 1, variant: 'Depths' });
		expect(Object.keys(channels)).toEqual(['L']);
		expect(channels.L!.data[0][1]).toBe(2);
	});

	it('falls back to the average for a stale pick', () => {
		const item = sampleSet({ dispSuffix: 'Other' });
		expect(eqSourceChannels(item, { index: 0, variant: 'Depths' })).toBe(item.channels);
	});
});

describe('sameEqSourceSample', () => {
	it('compares index and variant, with null as the average', () => {
		expect(sameEqSourceSample(null, null)).toBe(true);
		expect(sameEqSourceSample(null, { index: 0, variant: '' })).toBe(false);
		expect(sameEqSourceSample({ index: 0, variant: 'a' }, { index: 0, variant: 'a' })).toBe(true);
		expect(sameEqSourceSample({ index: 0, variant: 'a' }, { index: 0, variant: 'b' })).toBe(false);
		expect(sameEqSourceSample({ index: 0, variant: 'a' }, { index: 1, variant: 'a' })).toBe(false);
	});
});

describe('sampleRunLabel', () => {
	it('uses the declared label, else a 1-based fallback', () => {
		expect(sampleRunLabel({ label: 'Front' }, 0)).toBe('Front');
		expect(sampleRunLabel({}, 2)).toMatch(/ 3$/);
	});
});
