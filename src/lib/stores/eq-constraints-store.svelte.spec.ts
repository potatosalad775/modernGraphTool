import { describe, it, expect, beforeEach } from 'vitest';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import {
	eqConstraintsStore,
	mergePresets,
	sanitizeInlinePresets,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
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

describe('eqConstraintsStore built-ins', () => {
	it('exports built-in presets containing default + generic-10-band', () => {
		const ids = BUILTIN_PRESETS.map((p) => p.id);
		expect(ids).toContain(DEFAULT_CONSTRAINT_ID);
		expect(ids).toContain('generic-10-band');
	});

	it('default constraint id is "default"', () => {
		expect(DEFAULT_CONSTRAINT_ID).toBe('default');
	});
});

describe('eqConstraintsStore applyPhoneMatch', () => {
	const sonyPreset = (): EqConstraintPreset =>
		preset('sony-wh-1000xm6', {
			label: 'Sony WH-1000XM6',
			matchPhones: ['WH-1000XM6', '1000XM6']
		});
	const fiioPreset = (): EqConstraintPreset =>
		preset('fiio-eh11', { label: 'Fiio EH11', matchPhones: ['EH11'] });

	beforeEach(() => {
		eqConstraintsStore.clearDeviceConstraint();
		eqConstraintsStore.presets = [
			preset('default', { label: 'Default' }),
			sonyPreset(),
			fiioPreset()
		];
		// setActive (not direct assignment) to reset the auto-pick flag
		// between tests.
		eqConstraintsStore.setActive('default');
	});

	it('switches to a matching preset when active is default', () => {
		const id = eqConstraintsStore.applyPhoneMatch('Sony WH-1000XM6');
		expect(id).toBe('sony-wh-1000xm6');
		expect(eqConstraintsStore.activeId).toBe('sony-wh-1000xm6');
	});

	it('matches case-insensitive substrings inside larger identifiers', () => {
		const id = eqConstraintsStore.applyPhoneMatch('sony wh-1000xm6 (sample 2)');
		expect(id).toBe('sony-wh-1000xm6');
	});

	it('no-ops when the user manually picked a non-default preset', () => {
		eqConstraintsStore.setActive('fiio-eh11');
		const id = eqConstraintsStore.applyPhoneMatch('Sony WH-1000XM6');
		expect(id).toBeNull();
		expect(eqConstraintsStore.activeId).toBe('fiio-eh11');
	});

	it('no-ops when no preset matches the identifier and active is default', () => {
		const id = eqConstraintsStore.applyPhoneMatch('Some Random Headphone');
		expect(id).toBeNull();
		expect(eqConstraintsStore.activeId).toBe('default');
	});

	it('no-ops on a null/empty identifier when active is default', () => {
		expect(eqConstraintsStore.applyPhoneMatch(null)).toBeNull();
		expect(eqConstraintsStore.applyPhoneMatch('')).toBeNull();
		expect(eqConstraintsStore.activeId).toBe('default');
	});

	it('skips the default preset itself when scanning matches', () => {
		eqConstraintsStore.presets = [
			preset('default', { label: 'Default', matchPhones: ['everything'] }),
			sonyPreset()
		];
		eqConstraintsStore.setActive('default');
		const id = eqConstraintsStore.applyPhoneMatch('everything sony WH-1000XM6');
		expect(id).toBe('sony-wh-1000xm6');
	});

	it('re-routes auto-picked active to the new phone match', () => {
		eqConstraintsStore.applyPhoneMatch('Sony WH-1000XM6');
		expect(eqConstraintsStore.activeId).toBe('sony-wh-1000xm6');
		const id = eqConstraintsStore.applyPhoneMatch('Fiio EH11 (variant 2)');
		expect(id).toBe('fiio-eh11');
		expect(eqConstraintsStore.activeId).toBe('fiio-eh11');
	});

	it('reverts an auto-picked active to default when the new phone has no match', () => {
		eqConstraintsStore.applyPhoneMatch('Sony WH-1000XM6');
		expect(eqConstraintsStore.activeId).toBe('sony-wh-1000xm6');
		const id = eqConstraintsStore.applyPhoneMatch('Demo Variations var2');
		expect(id).toBe('default');
		expect(eqConstraintsStore.activeId).toBe('default');
	});

	it('a manual pick after auto-pick blocks future re-routing', () => {
		eqConstraintsStore.applyPhoneMatch('Sony WH-1000XM6');
		eqConstraintsStore.setActive('fiio-eh11');
		const id = eqConstraintsStore.applyPhoneMatch('Demo Variations var2');
		expect(id).toBeNull();
		expect(eqConstraintsStore.activeId).toBe('fiio-eh11');
	});

	it('does not persist auto-picks to localStorage', () => {
		try {
			localStorage.removeItem('gt-eq-constraint-active-id');
		} catch {
			/* ignore */
		}
		eqConstraintsStore.applyPhoneMatch('Sony WH-1000XM6');
		expect(eqConstraintsStore.activeId).toBe('sony-wh-1000xm6');
		try {
			expect(localStorage.getItem('gt-eq-constraint-active-id')).toBeNull();
		} catch {
			/* ignore in environments without localStorage */
		}
	});

	it('persists explicit picks via setActive', () => {
		try {
			localStorage.removeItem('gt-eq-constraint-active-id');
		} catch {
			/* ignore */
		}
		eqConstraintsStore.setActive('fiio-eh11');
		try {
			expect(localStorage.getItem('gt-eq-constraint-active-id')).toBe('fiio-eh11');
		} catch {
			/* ignore */
		}
	});
});
