/**
 * Reusable bidirectional filter-type mappings for device handlers.
 * Each device family encodes PK/LSQ/HSQ as different numeric codes.
 */
import type { DeviceFilterType } from '../types.js';

export interface FilterTypeMap {
	toCode(filterType: DeviceFilterType): number;
	fromCode(code: number): DeviceFilterType;
}

export function createFilterTypeMap(
	mapping: Record<DeviceFilterType, number>,
	fallbackType: DeviceFilterType = 'PK'
): FilterTypeMap {
	const reverse = new Map<number, DeviceFilterType>();
	for (const [type, code] of Object.entries(mapping)) {
		reverse.set(code, type as DeviceFilterType);
	}
	const fallbackCode = mapping[fallbackType];
	return {
		toCode: (ft) => mapping[ft] ?? fallbackCode,
		fromCode: (c) => reverse.get(c) ?? fallbackType
	};
}

/** FiiO HID + FiiO Serial: PK=0, LSQ=1, HSQ=2 */
export const FIIO_FILTER_MAP = createFilterTypeMap({ PK: 0, LSQ: 1, HSQ: 2 });

/** Walkplay + Moondrop + Nothing: PK=2, LSQ=1, HSQ=3 */
export const WALKPLAY_FILTER_MAP = createFilterTypeMap({ PK: 2, LSQ: 1, HSQ: 3 });

/** KTMicro: PK=0, LSQ=3, HSQ=4 */
export const KTMICRO_FILTER_MAP = createFilterTypeMap({ PK: 0, LSQ: 3, HSQ: 4 });

/** Qudelix: PK=13, LSQ=10, HSQ=11 */
export const QUDELIX_FILTER_MAP = createFilterTypeMap({ PK: 13, LSQ: 10, HSQ: 11 });

/** WiiM Network: PK=1, LSQ=0, HSQ=2 */
export const WIIM_FILTER_MAP = createFilterTypeMap({ PK: 1, LSQ: 0, HSQ: 2 });
