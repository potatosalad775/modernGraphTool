import { describe, it, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	CATALOG_PREFIX,
	DEFAULT_CONSTRAINT_ID,
	DEVICE_CONSTRAINT_ID,
	profileLabel
} from './eq-constraints-store.svelte.js';
import { eqStore } from './eq-store.svelte.js';
import { hardwareProfile, parametricPreset } from '#lib/utils/__fixtures__/eq-profiles.js';

const deviceProfile = (model = 'Connected Device') => ({
	...hardwareProfile('spec-device', {
		bandCount: 5,
		band: {
			types: ['PK'],
			freq: { min: 20, max: 20000 },
			q: { min: 0.1, max: 10 },
			gain: { min: -6, max: 6 }
		}
	}),
	device: { brand: 'Spec', model }
});

describe('eqConstraintsStore device preset', () => {
	beforeEach(() => {
		// Seed a small catalog and a known active id
		eqConstraintsStore.presets = [
			parametricPreset('default', { label: 'Default' }),
			parametricPreset('alt')
		];
		eqConstraintsStore.activeId = 'alt';
		// Drop any leftover device preset from a previous test
		eqConstraintsStore.clearDeviceConstraint();
	});

	it('appends the device preset under the sentinel id and auto-selects it', () => {
		eqConstraintsStore.setDeviceConstraint(deviceProfile(), 'Connected Device');
		const ids = eqConstraintsStore.presets.map((p) => p.id);
		expect(ids).toContain(DEVICE_CONSTRAINT_ID);
		expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
		expect(eqConstraintsStore.active.label).toBe('Connected Device');
		expect(eqConstraintsStore.maxBands).toBe(5);
	});

	it('labels the device by its profile when no name is given', () => {
		eqConstraintsStore.setDeviceConstraint(deviceProfile('KA17'));
		expect(eqConstraintsStore.active.label).toBe('Spec KA17');
	});

	it('replaces a prior device preset on reconnect under a different model', () => {
		eqConstraintsStore.setDeviceConstraint(deviceProfile(), 'Device A');
		eqConstraintsStore.setDeviceConstraint(deviceProfile(), 'Device B');
		const matches = eqConstraintsStore.presets.filter((p) => p.id === DEVICE_CONSTRAINT_ID);
		expect(matches).toHaveLength(1);
		expect(matches[0].label).toBe('Device B');
	});

	it('restores the user’s prior selection on disconnect', () => {
		eqConstraintsStore.setDeviceConstraint(deviceProfile());
		eqConstraintsStore.clearDeviceConstraint();
		expect(eqConstraintsStore.activeId).toBe('alt');
		expect(eqConstraintsStore.presets.find((p) => p.id === DEVICE_CONSTRAINT_ID)).toBeUndefined();
	});

	it('falls back to first preset if the prior id is gone', () => {
		eqConstraintsStore.setDeviceConstraint(deviceProfile());
		// Simulate the prior preset disappearing while the device was connected
		eqConstraintsStore.presets = eqConstraintsStore.presets.filter((p) => p.id !== 'alt');
		eqConstraintsStore.clearDeviceConstraint();
		expect(eqConstraintsStore.activeId).toBe('default');
	});

	it('does not persist the device preset — it is session-scoped, not a user pick', () => {
		localStorage.removeItem('gt-eq-constraint-active-id');
		eqConstraintsStore.setDeviceConstraint(deviceProfile());
		expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
		expect(localStorage.getItem('gt-eq-constraint-active-id')).toBeNull();
	});

	it('never edits the filters on connect — bands that do not fit are only flagged', () => {
		eqStore.filters = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 9 }];
		eqConstraintsStore.setDeviceConstraint(deviceProfile());
		expect(eqStore.filters[0].gain).toBe(9);
		expect(eqConstraintsStore.violations[0].gain).toBe(true);
		expect(eqConstraintsStore.violationCount).toBe(1);
		eqStore.filters = [];
	});
});

describe('eqConstraintsStore catalog picks', () => {
	beforeEach(() => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		localStorage.removeItem('gt-eq-constraint-catalog');
	});

	it('adds a database profile under its eqcaps id, selects it and remembers it', () => {
		const profile = {
			...deviceProfile('Poweramp'),
			id: 'poweramp-equalizer',
			kind: 'software' as const
		};
		const id = eqConstraintsStore.addCatalogProfile(profile);
		expect(id).toBe(`${CATALOG_PREFIX}poweramp-equalizer`);
		expect(eqConstraintsStore.activeId).toBe(id);
		expect(eqConstraintsStore.active.source).toBe('catalog');
		const stored = JSON.parse(localStorage.getItem('gt-eq-constraint-catalog') ?? 'null');
		expect(stored.profile.id).toBe('poweramp-equalizer');
		expect(localStorage.getItem('gt-eq-constraint-active-id')).toBe(id);
	});

	it('replaces the stored copy when the same profile is picked again', () => {
		eqConstraintsStore.addCatalogProfile({ ...deviceProfile('A'), id: 'same' });
		eqConstraintsStore.addCatalogProfile({ ...deviceProfile('B'), id: 'same' });
		const picks = eqConstraintsStore.presets.filter((p) => p.id === `${CATALOG_PREFIX}same`);
		expect(picks).toHaveLength(1);
		expect(picks[0].label).toBe('Spec B');
	});
});

describe('eqConstraintsStore built-ins', () => {
	it('exports built-in presets containing default + generic-10-band', () => {
		const ids = BUILTIN_PRESETS.map((p) => p.id);
		expect(ids).toContain(DEFAULT_CONSTRAINT_ID);
		expect(ids).toContain('generic-10-band');
	});

	it('default is unlimited and generic-10-band is a graphic EQ', () => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		expect(eqConstraintsStore.maxBands).toBe(0);
		expect(eqConstraintsStore.isGraphic).toBe(false);
		expect(eqConstraintsStore.isLimiting).toBe(false);
		eqConstraintsStore.activeId = 'generic-10-band';
		expect(eqConstraintsStore.maxBands).toBe(10);
		expect(eqConstraintsStore.isGraphic).toBe(true);
		expect(eqConstraintsStore.isLimiting).toBe(true);
	});

	it('labels profiles by brand, model and engine', () => {
		expect(profileLabel({ device: { brand: 'RME', model: 'ADI-2' }, engine: 'PEQ' })).toBe(
			'RME ADI-2 · PEQ'
		);
		expect(profileLabel({ device: { brand: 'FiiO', model: 'KA17' } })).toBe('FiiO KA17');
	});
});

describe('eqConstraintsStore channel scope lock', () => {
	beforeEach(() => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		eqStore.filters = [];
		eqStore.channelScope = 'L';
	});

	it('holds the list on L+R under any restriction — eqcaps v1 profiles are linked', () => {
		eqConstraintsStore.activeId = 'generic-10-band';
		expect(eqConstraintsStore.supportsPerChannel).toBe(false);
		expect(eqStore.channelScopeLocked).toBe(true);
		expect(eqStore.channelScope).toBe('BOTH');
		eqConstraintsStore.setDeviceConstraint(deviceProfile());
		expect(eqStore.channelScope).toBe('BOTH');
		eqConstraintsStore.clearDeviceConstraint();
	});

	it('returns to the ear the user was on once the restriction is lifted', () => {
		eqConstraintsStore.activeId = 'generic-10-band';
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		expect(eqStore.channelScope).toBe('L');
	});

	it('never locks under the unlimited default', () => {
		expect(eqConstraintsStore.supportsPerChannel).toBe(true);
		expect(eqStore.channelScopeLocked).toBe(false);
		expect(eqStore.channelScope).toBe('L');
	});
});

describe('eqConstraintsStore setActive', () => {
	beforeEach(() => {
		eqConstraintsStore.presets = [
			parametricPreset('default', { label: 'Default' }),
			parametricPreset('alt')
		];
		eqConstraintsStore.activeId = 'default';
	});

	it('ignores an id that is not in the catalog', () => {
		eqConstraintsStore.setActive('nope');
		expect(eqConstraintsStore.activeId).toBe('default');
	});

	it('persists explicit picks to localStorage', () => {
		localStorage.removeItem('gt-eq-constraint-active-id');
		eqConstraintsStore.setActive('alt');
		expect(eqConstraintsStore.activeId).toBe('alt');
		expect(localStorage.getItem('gt-eq-constraint-active-id')).toBe('alt');
	});
});

// Last in the file: `install()` is page-lifetime, so it stays on for anything after it.
describe('eqConstraintsStore graphic rows', () => {
	beforeEach(() => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		eqStore.filters = [];
		eqConstraintsStore.install();
		flushSync();
	});

	it('seeds flat fixed bands when a graphic profile comes back over an empty list', () => {
		eqConstraintsStore.activeId = 'generic-10-band';
		flushSync();
		expect(eqStore.filters.map((f) => f.freq)).toEqual([
			31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000
		]);
		expect(eqStore.filters.every((f) => f.gain === 0 && f.enabled)).toBe(true);
	});

	it('refills the rows when the list empties under a graphic profile', () => {
		eqConstraintsStore.activeId = 'generic-10-band';
		flushSync();
		eqStore.filters = [];
		flushSync();
		expect(eqStore.filters).toHaveLength(10);
	});

	it('leaves an existing list and the unlimited default alone', () => {
		flushSync();
		expect(eqStore.filters).toEqual([]);
		const filters = [{ enabled: true, type: 'PK' as const, freq: 1000, q: 1, gain: 3 }];
		eqStore.filters = filters;
		eqConstraintsStore.activeId = 'generic-10-band';
		flushSync();
		expect(eqStore.filters).toEqual(filters);
	});
});
