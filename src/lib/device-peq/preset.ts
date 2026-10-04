/**
 * Which preset a read or write reaches, and the request that reaches it.
 *
 * Some protocols name the preset in each read or write (`readsSlot` / `writesSlot`). The rest only
 * read or write the one the device is on, so they can reach the target preset only while the
 * device is on it. Answering from the current preset instead would read the wrong memory into the
 * band list, or write over a built-in or bypass preset.
 */
import type { PeqCapabilities } from './types.js';

export type PresetRequest = { slot?: number };

/**
 * The request that reaches preset `slot` (null: the device has no presets, so the only one), or
 * null when the device can't reach it from where it is.
 */
function reach(
	namesSlot: boolean,
	slot: number | null,
	deviceSlot: number | null
): PresetRequest | null {
	if (slot === null) return {};
	if (namesSlot) return { slot };
	return deviceSlot === slot ? {} : null;
}

export function readRequest(
	caps: Pick<PeqCapabilities, 'canRead' | 'readsSlot'>,
	slot: number | null,
	deviceSlot: number | null
): PresetRequest | null {
	return caps.canRead ? reach(caps.readsSlot, slot, deviceSlot) : null;
}

export function writeRequest(
	caps: Pick<PeqCapabilities, 'canWrite' | 'writesSlot'>,
	slot: number | null,
	deviceSlot: number | null
): PresetRequest | null {
	return caps.canWrite ? reach(caps.writesSlot, slot, deviceSlot) : null;
}
