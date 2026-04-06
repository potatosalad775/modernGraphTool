/**
 * Pre-write filter normalization — shared across HID and Serial connectors.
 * Ensures filters conform to device hardware limits before pushing.
 */
import type { DeviceFilter, DeviceModelConfig } from './types.js';

export function normalizeFiltersForDevice(
	filters: DeviceFilter[],
	modelConfig: DeviceModelConfig
): DeviceFilter[] {
	const result = filters.map((f) => ({ ...f }));

	// Truncate to device limit
	if (result.length > modelConfig.maxFilters) {
		console.warn(
			`USB Device PEQ: Truncating ${result.length} filters to ${modelConfig.maxFilters} (device limit)`
		);
		result.splice(modelConfig.maxFilters);
	}

	// Clamp freq/Q ranges
	for (const f of result) {
		if (f.freq < 20 || f.freq > 20000) f.freq = 100;
		if (f.q < 0.01 || f.q > 100) f.q = 1;
	}

	// Convert unsupported LS/HS filters
	const hasLSHSFilters = result.some(
		(f) => (f.type === 'LSQ' || f.type === 'HSQ') && f.gain !== 0
	);
	const needsPreGain = result.some((f) => f.gain > 0);

	if (hasLSHSFilters && modelConfig.supportsLSHSFilters === false) {
		for (const f of result) {
			if ((f.type === 'LSQ' || f.type === 'HSQ') && f.gain !== 0) {
				f.type = 'PK';
				f.gain = 0;
			}
		}

		if (needsPreGain && modelConfig.supportsPregain === false) {
			console.warn(
				"Device doesn't support LS/HS filters and auto pregain - both will be ignored"
			);
		} else {
			console.warn('Device only supports Peak filters - ignoring LS/HS filters');
		}
	} else if (needsPreGain && modelConfig.supportsPregain === false) {
		console.warn('Device does not support auto calculated pregain');
	}

	// Pad with defaults if needed
	if (result.length < modelConfig.maxFilters && modelConfig.defaultResetFiltersValues) {
		const defaultFilter = modelConfig.defaultResetFiltersValues[0];
		for (let i = result.length; i < modelConfig.maxFilters; i++) {
			result.push({
				type: (defaultFilter.filterType as DeviceFilter['type']) || 'PK',
				freq: defaultFilter.freq,
				q: defaultFilter.q,
				gain: defaultFilter.gain
			});
		}
	}

	return result;
}
