import type { ConnectedDevice } from './types.js';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';

/** Synthetic preset id used for the active connected-device constraint. */
export const DEVICE_PEQ_CONSTRAINT_ID = '__device-peq__';

/**
 * Translate a connected device's `modelConfig` into a constraint preset.
 *
 * The Device PEQ Bridge already knows each device's filter count, gain
 * range, and whether shelves are allowed — that metadata IS a constraint
 * preset, just expressed as `DeviceModelConfig`. This helper does the
 * shape translation; the device's preset is then merged into the store
 * under the sentinel id `DEVICE_PEQ_CONSTRAINT_ID` and auto-selected
 * while the device is connected.
 *
 * Frequency/Q ranges aren't part of `DeviceModelConfig` (most parametric
 * EQs accept the full audible range), so we use the audible band and
 * a generous Q window. Operators that need tighter bounds for a specific
 * device can override via the `EQ.CUSTOM_CONSTRAINTS` config inline list
 * keyed by manufacturer/model.
 */
export function deriveDeviceConstraint(device: ConnectedDevice): EqConstraintPreset {
	const cfg = device.modelConfig;
	const supportsShelves = cfg.supportsLSHSFilters !== false;
	return {
		id: DEVICE_PEQ_CONSTRAINT_ID,
		label: `${device.manufacturer} ${device.model}`,
		mode: 'parametric',
		maxBands: cfg.maxFilters,
		allowPk: true,
		allowLsq: supportsShelves,
		allowHsq: supportsShelves,
		freqMin: 20,
		freqMax: 20000,
		gainMin: cfg.minGain,
		gainMax: cfg.maxGain,
		qMin: 0.1,
		qMax: 10
	};
}
