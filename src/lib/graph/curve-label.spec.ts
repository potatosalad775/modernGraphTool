import { describe, it, expect } from 'vitest';
import { curveBaseName, curveDisplayName, sampleKeyParts } from './curve-label.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/**
 * The naming rules the on-graph labels and the inspection readout share. These
 * are pure string cases; that the two call sites actually use them is covered
 * by GraphInspection.svelte.spec.ts.
 */

function obj(extra: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'a',
		type: 'phone',
		identifier: 'Phone A',
		channels: {},
		dispChannel: ['AVG'],
		colors: {},
		dash: '',
		...extra
	} as FRDataObject;
}

describe('curveBaseName', () => {
	it('appends the variant suffix', () => {
		expect(curveBaseName(obj({ dispSuffix: 'Stock' }))).toBe('Phone A Stock');
	});

	it.each([
		['empty', ''],
		['null', null],
		['absent', undefined]
	])('returns the bare identifier when the suffix is %s', (_label, dispSuffix) => {
		// Interpolating unconditionally used to leave "Phone A " / "Phone A null".
		expect(curveBaseName(obj({ dispSuffix }))).toBe('Phone A');
	});
});

describe('curveDisplayName', () => {
	it('tags non-targets with the channel', () => {
		expect(curveDisplayName(obj({ dispSuffix: 'Stock' }), 'L')).toBe('Phone A Stock (L)');
	});

	it('gives targets no channel tag', () => {
		expect(curveDisplayName(obj({ type: 'target', identifier: 'Harman' }), 'AVG')).toBe('Harman');
	});

	it('appends the adjustment summary on targets', () => {
		const target = obj({
			type: 'target',
			identifier: 'Harman',
			adjustmentLabel: '(Tilt: -0.8dB/oct, Bass: +6.0dB)'
		});
		expect(curveDisplayName(target, 'AVG')).toBe('Harman (Tilt: -0.8dB/oct, Bass: +6.0dB)');
	});

	it('combines suffix and adjustment summary on a target', () => {
		const target = obj({
			type: 'target',
			identifier: 'Harman',
			dispSuffix: '2019',
			adjustmentLabel: '(Bass: +6.0dB)'
		});
		expect(curveDisplayName(target, 'AVG')).toBe('Harman 2019 (Bass: +6.0dB)');
	});

	it('ignores the adjustment summary on non-targets', () => {
		expect(curveDisplayName(obj({ adjustmentLabel: '(Bass: +6.0dB)' }), 'AVG')).toBe(
			'Phone A (AVG)'
		);
	});

	// Before the sample concepts were unified, every run of a set rendered as the
	// same string, so the graph could not say which measurement a curve was.

	it('puts the run label ahead of the channel', () => {
		expect(curveDisplayName(obj({ dispSuffix: 'Leather Pad' }), 'R', 'Center')).toBe(
			'Phone A Leather Pad (Center, R)'
		);
	});

	it('still ignores a run label on a target', () => {
		expect(curveDisplayName(obj({ type: 'target', identifier: 'Harman' }), 'AVG', 'Center')).toBe(
			'Harman'
		);
	});
});

describe('sampleKeyParts', () => {
	const withRuns = () =>
		obj({ samples: [{ label: 'Center' }, { label: 'Front' }, {}] } as Partial<FRDataObject>);

	it('resolves the label and channel of a run key', () => {
		expect(sampleKeyParts(withRuns(), 'sample1_R')).toEqual({
			label: 'Front',
			channel: 'R',
			index: 1
		});
	});

	it('falls back to a 1-based ordinal for an unlabelled run', () => {
		// Keys are 0-based internally; "Sample 3" is how the operator numbered it.
		expect(sampleKeyParts(withRuns(), 'sample2_AVG')!.label).toBe('Sample 3');
	});

	it('falls back to the ordinal for an index past the end of the set', () => {
		expect(sampleKeyParts(withRuns(), 'sample9_L')!.label).toBe('Sample 10');
	});

	it('returns null for a key it cannot parse', () => {
		expect(sampleKeyParts(withRuns(), 'L1')).toBeNull();
		expect(sampleKeyParts(withRuns(), 'garbage')).toBeNull();
		expect(sampleKeyParts(withRuns(), 'sample0_X')).toBeNull();
	});
});
