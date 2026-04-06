/**
 * Shared FiiO protocol constants and byte helpers.
 * Used by both fiio-usb-hid.ts and fiio-usb-serial.ts.
 *
 * Constant names match the originals in both handlers to minimize diff.
 */

// ── Protocol command codes ──────────────────────────────��───────────────────

export const PEQ_FILTER_PARAMS = 0x15;
export const PEQ_PRESET_SWITCH = 0x16;
export const PEQ_GLOBAL_GAIN = 0x17;
export const PEQ_FILTER_COUNT = 0x18;
export const PEQ_SAVE_TO_DEVICE = 0x19;
export const PEQ_RESET_DEVICE = 0x1b;
export const PEQ_RESET_ALL = 0x1c;
export const PEQ_FIRMWARE_VERSION = 0x0b;
export const PEQ_NAME_DEVICE = 0x30;

// ── Frame delimiters ────────────────────────────────────────���───────────────

export const SET_HEADER1 = 0xaa;
export const SET_HEADER2 = 0x0a;
export const GET_HEADER1 = 0xbb;
export const GET_HEADER2 = 0x0b;
export const END_HEADERS = 0xee;

// ── Byte-manipulation helpers ───────────────────────────────────────────────

export function toBytePair(value: number): [number, number] {
	return [value & 0xff, (value & 0xff00) >> 8];
}

export function splitSignedValue(value: number): [number, number] {
	const signedValue = value < 0 ? value + 65536 : value;
	return [(signedValue >> 8) & 0xff, signedValue & 0xff];
}

export function splitUnsignedValue(value: number): [number, number] {
	return [(value >> 8) & 0xff, value & 0xff];
}

export function combineBytes(lowByte: number, highByte: number): number {
	return (lowByte << 8) | highByte;
}

// ── Gain encoding/decoding ─────────────────────────��────────────────────────

/** Encode a gain dB value into two bytes (FiiO format: gain * 10 as signed). */
export function fiioGainBytesFromValue(e: number): [number, number] {
	let t = e * 10;
	if (t < 0) {
		t = (Math.abs(t) ^ 65535) + 1;
	}
	const r = (t >> 8) & 255;
	const n = t & 255;
	return [r, n];
}

/** Decode two gain bytes back into a dB value. */
export function handleGain(lowByte: number, highByte: number): number {
	let r = combineBytes(lowByte, highByte);
	const gain = r & 32768 ? ((r = (r ^ 65535) + 1), -r / 10) : r / 10;
	return gain;
}
