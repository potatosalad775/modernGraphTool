import { describe, it, expect } from 'vitest';
import type { ConnectedDevice, DeviceModelConfig } from './types.js';
import { deriveDeviceConstraint, DEVICE_PEQ_CONSTRAINT_ID } from './derive-constraint.js';

function makeConfig(overrides: Partial<DeviceModelConfig> = {}): DeviceModelConfig {
	return {
		minGain: -12,
		maxGain: 12,
		maxFilters: 10,
		firstWritableEQSlot: 0,
		maxWritableEQSlots: 1,
		disconnectOnSave: false,
		disabledPresetId: -1,
		experimental: false,
		availableSlots: [],
		...overrides
	};
}

function makeDevice(
	manufacturer = 'Acme',
	model = 'Widget',
	cfg: DeviceModelConfig = makeConfig()
): ConnectedDevice {
	return {
		rawDevice: null,
		manufacturer,
		model,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		handler: {} as any,
		modelConfig: cfg,
		connectionType: 'hid'
	};
}

describe('deriveDeviceConstraint', () => {
	it('uses the device-peq sentinel id and a "manufacturer model" label', () => {
		const out = deriveDeviceConstraint(makeDevice('Sony', 'WH-1000XM6'));
		expect(out.id).toBe(DEVICE_PEQ_CONSTRAINT_ID);
		expect(out.label).toBe('Sony WH-1000XM6');
	});

	it('reflects min/max gain and maxFilters from modelConfig', () => {
		const out = deriveDeviceConstraint(
			makeDevice('A', 'B', makeConfig({ minGain: -6, maxGain: 6, maxFilters: 5 }))
		);
		expect(out.gainMin).toBe(-6);
		expect(out.gainMax).toBe(6);
		expect(out.maxBands).toBe(5);
	});

	it('disallows shelves when supportsLSHSFilters is explicitly false', () => {
		const out = deriveDeviceConstraint(
			makeDevice('A', 'B', makeConfig({ supportsLSHSFilters: false }))
		);
		expect(out.allowPk).toBe(true);
		expect(out.allowLsq).toBe(false);
		expect(out.allowHsq).toBe(false);
	});

	it('allows shelves by default when the flag is omitted', () => {
		const out = deriveDeviceConstraint(makeDevice());
		expect(out.allowLsq).toBe(true);
		expect(out.allowHsq).toBe(true);
	});

	it('uses the audible band as freq range and a generous Q window', () => {
		const out = deriveDeviceConstraint(makeDevice());
		expect(out.freqMin).toBe(20);
		expect(out.freqMax).toBe(20000);
		expect(out.qMin).toBe(0.1);
		expect(out.qMax).toBe(10);
	});
});
