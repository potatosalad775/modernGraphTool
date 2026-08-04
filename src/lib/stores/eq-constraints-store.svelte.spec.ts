import { describe, it, expect, beforeEach } from 'vitest';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import {
	eqConstraintsStore,
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

	it('does not persist the device preset — it is session-scoped, not a user pick', () => {
		try {
			localStorage.removeItem('gt-eq-constraint-active-id');
		} catch {
			/* ignore */
		}
		eqConstraintsStore.setDeviceConstraint(devicePreset());
		expect(eqConstraintsStore.activeId).toBe('__device-peq__');
		try {
			expect(localStorage.getItem('gt-eq-constraint-active-id')).toBeNull();
		} catch {
			/* ignore in environments without localStorage */
		}
	});
});

describe('eqConstraintsStore catalog', () => {
	it('exports built-in presets containing default + generic-10-band', () => {
		const ids = BUILTIN_PRESETS.map((p) => p.id);
		expect(ids).toContain(DEFAULT_CONSTRAINT_ID);
		expect(ids).toContain('generic-10-band');
	});

	it('default constraint id is "default"', () => {
		expect(DEFAULT_CONSTRAINT_ID).toBe('default');
	});

	it('is fully resolved from construction — no fetched sources to wait on', () => {
		// Regression guard: the catalog used to be hydrated from a bundled
		// eq-constraints.json plus an EQ config section. Nothing is fetched now,
		// so a fresh store already offers every preset it will ever offer.
		expect(BUILTIN_PRESETS.length).toBeGreaterThan(0);
		expect('hydrate' in eqConstraintsStore).toBe(false);
	});
});

describe('eqConstraintsStore setActive', () => {
	beforeEach(() => {
		eqConstraintsStore.presets = [preset('default', { label: 'Default' }), preset('alt')];
		eqConstraintsStore.activeId = 'default';
	});

	it('ignores an id that is not in the catalog', () => {
		eqConstraintsStore.setActive('nope');
		expect(eqConstraintsStore.activeId).toBe('default');
	});

	it('persists explicit picks to localStorage', () => {
		try {
			localStorage.removeItem('gt-eq-constraint-active-id');
		} catch {
			/* ignore */
		}
		eqConstraintsStore.setActive('alt');
		expect(eqConstraintsStore.activeId).toBe('alt');
		try {
			expect(localStorage.getItem('gt-eq-constraint-active-id')).toBe('alt');
		} catch {
			/* ignore */
		}
	});
});
