import { describe, it, expect } from 'vitest';
import { normalizeFiltersForDevice } from './normalize-filters.js';
import type { DeviceFilter, DeviceModelConfig } from './types.js';

function makeConfig(overrides: Partial<DeviceModelConfig> = {}): DeviceModelConfig {
	return {
		minGain: -12,
		maxGain: 12,
		maxFilters: 5,
		firstWritableEQSlot: 0,
		maxWritableEQSlots: 1,
		disconnectOnSave: false,
		disabledPresetId: -1,
		experimental: false,
		availableSlots: [{ id: 0, name: 'Default' }],
		...overrides
	};
}

function makeFilter(overrides: Partial<DeviceFilter> = {}): DeviceFilter {
	return { type: 'PK', freq: 1000, q: 1.0, gain: 3.0, ...overrides };
}

describe('normalizeFiltersForDevice', () => {
	it('truncates filters beyond maxFilters', () => {
		const filters = Array.from({ length: 10 }, () => makeFilter());
		const config = makeConfig({ maxFilters: 5 });
		const result = normalizeFiltersForDevice(filters, config);
		expect(result).toHaveLength(5);
	});

	it('clamps out-of-range frequency to 100', () => {
		const filters = [makeFilter({ freq: 5 }), makeFilter({ freq: 25000 })];
		const config = makeConfig({ maxFilters: 10 });
		const result = normalizeFiltersForDevice(filters, config);
		expect(result[0].freq).toBe(100);
		expect(result[1].freq).toBe(100);
	});

	it('clamps out-of-range Q to 1', () => {
		const filters = [makeFilter({ q: 0.001 }), makeFilter({ q: 200 })];
		const config = makeConfig({ maxFilters: 10 });
		const result = normalizeFiltersForDevice(filters, config);
		expect(result[0].q).toBe(1);
		expect(result[1].q).toBe(1);
	});

	it('converts LS/HS to PK when device does not support them', () => {
		const filters = [makeFilter({ type: 'LSQ', gain: 3 }), makeFilter({ type: 'HSQ', gain: -2 })];
		const config = makeConfig({ maxFilters: 10, supportsLSHSFilters: false });
		const result = normalizeFiltersForDevice(filters, config);
		expect(result[0].type).toBe('PK');
		expect(result[0].gain).toBe(0);
		expect(result[1].type).toBe('PK');
		expect(result[1].gain).toBe(0);
	});

	it('preserves LS/HS when device supports them', () => {
		const filters = [makeFilter({ type: 'LSQ', gain: 3 })];
		const config = makeConfig({ maxFilters: 10, supportsLSHSFilters: true });
		const result = normalizeFiltersForDevice(filters, config);
		expect(result[0].type).toBe('LSQ');
		expect(result[0].gain).toBe(3);
	});

	it('pads with defaults when fewer filters than maxFilters', () => {
		const filters = [makeFilter()];
		const config = makeConfig({
			maxFilters: 3,
			defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }]
		});
		const result = normalizeFiltersForDevice(filters, config);
		expect(result).toHaveLength(3);
		expect(result[1]).toEqual({ type: 'PK', freq: 100, q: 1, gain: 0 });
		expect(result[2]).toEqual({ type: 'PK', freq: 100, q: 1, gain: 0 });
	});

	it('does not mutate original filters', () => {
		const filters = [makeFilter({ freq: 5 })];
		const config = makeConfig({ maxFilters: 10 });
		normalizeFiltersForDevice(filters, config);
		expect(filters[0].freq).toBe(5);
	});
});
