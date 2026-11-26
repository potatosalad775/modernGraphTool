/**
 * Which preset a read or write reaches, and the request that reaches it.
 *
 * Some protocols name the preset in each read or write (`readsSlot` / `writesSlot`). The rest only
 * read or write the one the device is on, so they can reach the target preset only while the
 * device is on it. Answering from the current preset instead would read the wrong memory into the
 * band list, or write over a built-in or bypass preset.
 */
import type { PeqCapabilities } from './types.js';

export interface PresetRequest {
	slot?: number;
}

/**
 * Where the device's EQ is: on a stored preset (its id), on none (`'unsaved'`: changed since a
 * preset was loaded and saved nowhere, as a Qudelix's is after any edit), or null when not known.
 */
export type CurrentSlot = number | 'unsaved' | null;

type SlotReport = Pick<PeqCapabilities, 'readsCurrentSlot' | 'readsEnabled' | 'readsSlot'>;

/**
 * Whether the device's null from `currentSlot()` says its EQ is on no stored preset. Only where
 * nothing else can make it: the protocol asks the device (`readsCurrentSlot`), the EQ switch is its
 * own state (`readsEnabled`), so null isn't a bypass preset's "off", and a read takes no preset
 * (`readsSlot`), so it reads the EQ as it plays. A protocol that reads a named preset (Topping,
 * Fosi) answers null for a preset it couldn't name, and has no EQ apart from its presets to read.
 */
export function tellsUnsaved(caps: SlotReport): boolean {
	return caps.readsCurrentSlot && caps.readsEnabled && !caps.readsSlot;
}

/** What a `currentSlot()` that answered means. One that failed is unknown: null. */
export function currentSlotOf(caps: SlotReport, answer: number | null): CurrentSlot {
	return answer ?? (tellsUnsaved(caps) ? 'unsaved' : null);
}

/**
 * The request that reaches preset `slot` (null: no preset, the EQ where the device is), or null
 * when the device can't reach it from where it is.
 */
function reach(
	namesSlot: boolean,
	slot: number | null,
	deviceSlot: CurrentSlot
): PresetRequest | null {
	if (slot === null) return {};
	if (namesSlot) return { slot };
	return deviceSlot === slot ? {} : null;
}

export function readRequest(
	caps: Pick<PeqCapabilities, 'canRead' | 'readsSlot'>,
	slot: number | null,
	deviceSlot: CurrentSlot
): PresetRequest | null {
	return caps.canRead ? reach(caps.readsSlot, slot, deviceSlot) : null;
}

export function writeRequest(
	caps: Pick<PeqCapabilities, 'canWrite' | 'writesSlot'>,
	slot: number | null,
	deviceSlot: CurrentSlot
): PresetRequest | null {
	return caps.canWrite ? reach(caps.writesSlot, slot, deviceSlot) : null;
}
