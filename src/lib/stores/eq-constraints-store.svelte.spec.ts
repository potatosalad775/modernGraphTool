import { describe, it, expect, beforeEach } from 'vitest';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import {
	eqConstraintsStore,
	mergePresets,
	sanitizeInlinePresets
} from './eq-constraints-store.svelte.js';

function preset(id: string, overrides: Partial<EqConstraintPreset> = {}): EqConstraintPreset {
	return {
		id,
		label: id,
		mode: 'parametric',
		maxBands: 0,
		allowPk: true,
		allowLsq: true,
		allowHsq: true,
		freqMin: 20,
		freqMax: 20000,
		gainMin: -12,
		gainMax: 12,
		qMin: 0.1,
		qMax: 10,
		...overrides
	};
}

describe('mergePresets', () => {
	it('returns an empty array when no sources are provided', () => {
		expect(mergePresets([])).toEqual([]);
	});

	it('preserves source order for distinct ids', () => {
		const out = mergePresets([[preset('a'), preset('b')], [preset('c')], [preset('d')]]);
		expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('overrides earlier entries with later ones for the same id, keeping slot', () => {
		const out = mergePresets([
			[preset('a', { label: 'A1' }), preset('b', { label: 'B1' })],
			[preset('a', { label: 'A2 (later wins)' })]
		]);
		expect(out.map((p) => p.id)).toEqual(['a', 'b']);
		expect(out[0].label).toBe('A2 (later wins)');
		expect(out[1].label).toBe('B1');
	});

	it('drops entries with non-string ids defensively', () => {
		const out = mergePresets([
			[preset('a'), { ...preset('b'), id: undefined as unknown as string }, preset('c')]
		]);
		expect(out.map((p) => p.id)).toEqual(['a', 'c']);
	});
});

describe('sanitizeInlinePresets', () => {
	it('keeps well-formed presets', () => {
		const input = [preset('a'), preset('b', { label: 'Bee' })];
		const out = sanitizeInlinePresets(input);
		expect(out).toHaveLength(2);
		expect(out[1].label).toBe('Bee');
	});

	it('drops null/undefined entries', () => {
		const out = sanitizeInlinePresets([null, undefined, preset('a')]);
		expect(out.map((p) => p.id)).toEqual(['a']);
	});

	it('drops entries missing id or label', () => {
		const out = sanitizeInlinePresets([
			{ id: 'a', label: 'A', mode: 'parametric' },
			{ id: 'b' }, // missing label
			{ label: 'C' }, // missing id
			'not an object'
		]);
		expect(out.map((p) => p.id)).toEqual(['a']);
	});
});

describe('eqConstraintsStore device preset', () => {
	const devicePreset = (overrides: Partial<EqConstraintPreset> = {}): EqConstraintPreset =>
		preset('will-be-overridden', {
			label: 'Connected Device',
			maxBands: 5,
			gainMin: -6,
			gainMax: 6,
			...overrides
		});

	beforeEach(() => {
		// Seed a small catalog and a known active id
		eqConstraintsStore.presets = [preset('default', { label: 'Default' }), preset('alt')];
		eqConstraintsStore.activeId = 'alt';
		// Drop any leftover device preset from a previous test
		eqConstraintsStore.clearDeviceConstraint();
	});

	it('appends the device preset under the sentinel id and auto-selects it', () => {
		eqConstraintsStore.setDeviceConstraint(devicePreset());
		const ids = eqConstraintsStore.presets.map((p) => p.id);
		expect(ids).toContain('__device-peq__');
		expect(eqConstraintsStore.activeId).toBe('__device-peq__');
		expect(eqConstraintsStore.active?.label).toBe('Connected Device');
	});

	it('replaces a prior device preset on reconnect under a different model', () => {
		eqConstraintsStore.setDeviceConstraint(devicePreset({ label: 'Device A' }));
		eqConstraintsStore.setDeviceConstraint(devicePreset({ label: 'Device B' }));
		const matches = eqConstraintsStore.presets.filter((p) => p.id === '__device-peq__');
		expect(matches).toHaveLength(1);
		expect(matches[0].label).toBe('Device B');
	});

	it('restores the user’s prior selection on disconnect', () => {
		eqConstraintsStore.setDeviceConstraint(devicePreset());
		eqConstraintsStore.clearDeviceConstraint();
		expect(eqConstraintsStore.activeId).toBe('alt');
		expect(eqConstraintsStore.presets.find((p) => p.id === '__device-peq__')).toBeUndefined();
	});

	it('falls back to first preset if the prior id is gone', () => {
		eqConstraintsStore.setDeviceConstraint(devicePreset());
		// Simulate the prior preset disappearing while the device was connected
		eqConstraintsStore.presets = eqConstraintsStore.presets.filter((p) => p.id !== 'alt');
		eqConstraintsStore.clearDeviceConstraint();
		expect(eqConstraintsStore.activeId).toBe('default');
	});
});
