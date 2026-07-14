//
// Copyright 2024 : Pragmatic Audio
//
// FiiO USB Serial handler — TypeScript port of the legacy fiioUsbSerialHandler.js
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';
import { FIIO_FILTER_MAP } from '../utils/filter-type-maps.js';
import {
	SET_HEADER1,
	SET_HEADER2,
	GET_HEADER1,
	GET_HEADER2,
	END_HEADERS,
	PEQ_FILTER_COUNT,
	PEQ_GLOBAL_GAIN,
	PEQ_FILTER_PARAMS,
	PEQ_PRESET_SWITCH,
	PEQ_RESET_DEVICE,
	PEQ_FIRMWARE_VERSION,
	PEQ_NAME_DEVICE
} from '../utils/fiio-protocol.js';

// Mutex to prevent concurrent serial access
let __serialIsSending = false;

/**
 * Send data to the serial port and listen for a response.
 * Acquires writer, writes data, then acquires reader and reads until the
 * END byte is found or a 5000ms timeout is reached.
 */
async function sendReportAndListen(
	device: ConnectedDevice,
	data: Uint8Array,
	endByte: number = END_HEADERS
): Promise<Uint8Array> {
	if (__serialIsSending) throw new Error('Port is busy');
	__serialIsSending = true;

	const port = device.rawDevice as SerialPort;
	if (!port || !port.readable || !port.writable) {
		__serialIsSending = false;
		throw new Error('Serial port not available');
	}

	let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	const buffer: number[] = [];
	const overallTimeoutMs = 5000;
	const startedAt = Date.now();
	let timerId: ReturnType<typeof setTimeout> | null = null;

	// Track expected total frame length once we have the header and LEN byte
	let expectedTotal: number | null = null;

	try {
		// Acquire writer per call, write, then release (replicating reference write())
		writer = port.writable!.getWriter();
		await writer.write(data);
		try {
			writer.releaseLock();
		} catch {
			/* ignore */
		}

		// Acquire reader per call and read until done/terminator/timeout
		reader = port.readable!.getReader();

		await Promise.all([
			Promise.resolve(),
			(async () => {
				while (true) {
					const elapsed = Date.now() - startedAt;
					if (elapsed >= overallTimeoutMs) return; // stop reading on overall timeout

					const remaining = overallTimeoutMs - elapsed;
					const race = await Promise.race([
						reader!.read(),
						new Promise<never>((_, reject) => {
							timerId = setTimeout(() => {
								// cancel in-flight read to unblock
								reader!.cancel().catch(() => {});
								reject(new Error('Timeout'));
							}, remaining);
						})
					]);

					const { value, done } = race as ReadableStreamReadResult<Uint8Array>;
					if (done) break;
					const chunk = Array.from(value || []);
					if (chunk.length > 0) {
						buffer.push(...chunk);

						// Determine expected total frame length once we have at least 6 bytes
						if (expectedTotal == null && buffer.length >= 6) {
							const len = buffer[5] || 0; // LEN field
							// Frame layout: [H1,H2,0,0,CMD,LEN, (LEN data...), 0, END]
							expectedTotal = 6 + len + 2;
						}

						// If we already know how long the frame should be, only stop once all bytes are in
						if (expectedTotal != null && buffer.length >= expectedTotal) {
							// Only accept if the last byte is the terminator; otherwise keep reading
							if (buffer[expectedTotal - 1] === endByte) {
								// Trim any extra bytes beyond expectedTotal (shouldn't happen often)
								buffer.splice(expectedTotal);
								return;
							}
						}
					}
					clearTimeout(timerId!); // clear per-iteration timer
					timerId = null;
				}
			})()
		]);

		return buffer.length > 0 ? new Uint8Array(buffer) : new Uint8Array(0);
	} catch (e: unknown) {
		if (e instanceof Error && e.message === 'Timeout') {
			// On timeout, return empty buffer like original
			return new Uint8Array(0);
		}
		throw e;
	} finally {
		if (timerId) clearTimeout(timerId);
		try {
			if (reader) reader.releaseLock();
		} catch (_) {
			/* ignore */
		}
		__serialIsSending = false;
	}
}

/**
 * Build a command packet with the given headers, command byte, and optional data payload.
 */
function createCommandPacket(
	header1: number,
	header2: number,
	command: number,
	data: number[] = []
): Uint8Array {
	const packet: number[] = [header1, header2, 0, 0, command];
	if (data.length > 0) {
		packet.push(data.length);
		packet.push(...data);
		// Reserved byte before terminator in examples
		packet.push(0);
	} else {
		packet.push(0, 0);
	}
	packet.push(END_HEADERS); // End header
	return new Uint8Array(packet);
}

/** Convert a string to a byte array of char codes. */
function stringToByteArray(str: string): number[] {
	return Array.from(str, (char) => char.charCodeAt(0));
}

// ---- Command factory functions ----

const createGetEqCountCmd = (): Uint8Array =>
	createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_FILTER_COUNT);

const createSetEqBandWithNameCmd = (bandIndex: number, name: string): Uint8Array =>
	createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_NAME_DEVICE, [
		bandIndex,
		...stringToByteArray(name.padEnd(8, '\0').slice(0, 8))
	]);

const createGetEqBandCmd = (bandIndex: number): Uint8Array =>
	createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_FILTER_PARAMS, [bandIndex]);

const createSetEqBandCmd = (bandIndex: number): Uint8Array =>
	createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_FILTER_PARAMS, [bandIndex]);

const createGetEqPresetCmd = (): Uint8Array =>
	createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_PRESET_SWITCH);

const createGetGlobalGainCmd = (): Uint8Array =>
	createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_GLOBAL_GAIN);

const createSetGlobalGainCmd = (gain: number): Uint8Array => {
	// Encode gain in tenths (0.1 dB) as two bytes (signed big-endian)
	const value = Math.round(gain * 10);
	const v16 = ((value % 0x10000) + 0x10000) % 0x10000;
	const hi = (v16 >> 8) & 0xff;
	const lo = v16 & 0xff;
	return createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_GLOBAL_GAIN, [hi, lo]);
};

const createSetEqPresetCmd = (presetValue: number): Uint8Array =>
	createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_PRESET_SWITCH, [presetValue & 0xff]);

const createGetEqStatusCmd = (): Uint8Array =>
	createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_FILTER_COUNT);

const createGetDeviceInfoCmd = (): Uint8Array =>
	createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_FIRMWARE_VERSION);

const createResetEqCmd = (): Uint8Array =>
	createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_RESET_DEVICE);

// ---- Data parsing helpers ----

/** Parse a signed 16-bit big-endian gain value in tenths (0.1 dB units). */
function parseGain(byte1: number, byte2: number): number {
	let v = ((byte1 << 8) | byte2) & 0xffff;
	if (v & 0x8000) v = v - 0x10000;
	return v / 10.0;
}

/** Parse an unsigned 16-bit big-endian Q value in hundredths. */
function parseQValue(byte1: number, byte2: number): number {
	const v = ((byte1 << 8) | byte2) & 0xffff;
	return v / 100.0;
}

// ---- Encoding helpers ----

/** Encode a gain value (dB) as signed tenths in two big-endian bytes. */
function encodeSignedHundredths(value: number): [number, number] {
	// For gain: device uses tenths (0.1 dB)
	const v = Math.round(value * 10);
	const v16 = ((v % 0x10000) + 0x10000) % 0x10000;
	return [(v16 >> 8) & 0xff, v16 & 0xff];
}

/** Encode a Q value as unsigned hundredths in two big-endian bytes. */
function encodeUnsignedHundredths(value: number): [number, number] {
	const v = Math.round(value * 100);
	const v16 = v & 0xffff;
	return [(v16 >> 8) & 0xff, v16 & 0xff];
}

/**
 * Build a full-band set command packet.
 * Data layout: [index, gain_hi, gain_lo, freq_hi, freq_lo, q_hi, q_lo, type]
 */
function createSetEqBandCommand(
	bandIndex: number,
	frequency: number,
	gain: number,
	qValue: number,
	filterType: number
): Uint8Array {
	const [gHi, gLo] = encodeSignedHundredths(gain);
	const freq = Math.round(frequency) & 0xffff;
	const fHi = (freq >> 8) & 0xff;
	const fLo = freq & 0xff;
	const [qHi, qLo] = encodeUnsignedHundredths(qValue);
	const data = [bandIndex & 0xff, gHi, gLo, fHi, fLo, qHi, qLo, (filterType ?? 0) & 0xff];
	return createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_FILTER_PARAMS, data);
}

/** EQ switch command (on/off). */
const createSetEqSwitchCommand = (enabled: boolean): Uint8Array =>
	createCommandPacket(SET_HEADER1, SET_HEADER2, 0x1a, [enabled ? 1 : 0]);

/** Set preset command. */
const createSetEqPreCommand = (presetValue: number): Uint8Array =>
	createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_PRESET_SWITCH, [presetValue & 0xff]);

// ---- Filter type mapping (from shared map) ----

const toDeviceFilterType = FIIO_FILTER_MAP.fromCode;
const fromDeviceFilterType = FIIO_FILTER_MAP.toCode;

// ---- Main handler functions ----

async function getCurrentSlot(device: ConnectedDevice): Promise<number> {
	try {
		// Get current EQ preset
		const cmd = createGetEqPresetCmd();
		console.debug('[FiiO Serial] SEND get preset:', Array.from(cmd));
		const response = await sendReportAndListen(device, cmd);
		console.debug('[FiiO Serial] RECV get preset:', Array.from(response));
		if (response.length > 6) {
			return response[6]; // Preset ID is at byte 6
		}
		return 0;
	} catch (error) {
		console.error('Failed to get current slot:', error);
		throw error;
	}
}

async function pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult> {
	try {
		// Get EQ count
		const countResponse = await sendReportAndListen(device, createGetEqCountCmd());
		let eqCount = 0;
		if (countResponse.length > 6) {
			eqCount = countResponse[6];
			if (eqCount === 0) {
				throw new Error('No PEQ band found.');
			}
		}

		// Get global gain
		const gainResponse = await sendReportAndListen(device, createGetGlobalGainCmd());
		let eqGlobalGain = 0;
		if (gainResponse.length > 7) {
			eqGlobalGain = parseGain(gainResponse[6], gainResponse[7]);
		}

		// Get EQ bands
		const filters: DeviceFilter[] = [];
		for (let i = 0; i < eqCount; i++) {
			const bandResponse = await sendReportAndListen(device, createGetEqBandCmd(i));
			if (bandResponse.length >= 14) {
				// Data layout: [index, gain_hi, gain_lo, freq_hi, freq_lo, q_hi, q_lo, type]
				const gain = parseGain(bandResponse[7], bandResponse[8]);
				const frequency = (bandResponse[9] << 8) | bandResponse[10];
				const qValue = parseQValue(bandResponse[11], bandResponse[12]);
				const filterType = bandResponse[13];

				filters.push({
					freq: frequency,
					gain: gain,
					q: qValue,
					type: toDeviceFilterType(filterType)
				});
			}
		}

		// Sort filters by frequency
		filters.sort((a, b) => a.freq - b.freq);

		return {
			filters: filters,
			globalGain: eqGlobalGain
		};
	} catch (error) {
		console.error('Failed to pull data from FiiO device:', error);
		throw error;
	}
}

async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	globalGain: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	try {
		// Set global gain
		await sendReportAndListen(device, createSetGlobalGainCmd(globalGain));

		// Set each EQ band
		for (let i = 0; i < filters.length; i++) {
			const filter = filters[i];
			const filterType = fromDeviceFilterType(filter.type);

			await sendReportAndListen(
				device,
				createSetEqBandCommand(i, filter.freq, filter.gain, filter.q, filterType)
			);
		}

		console.log('FiiO settings applied successfully');
		// Return whether we should disconnect after saving, mirroring HID handler behavior
		return !!(device && device.modelConfig && device.modelConfig.disconnectOnSave);
	} catch (error) {
		console.error('Failed to push data to FiiO device:', error);
		throw error;
	}
}

async function enablePEQ(device: ConnectedDevice, enabled: boolean, slotId: number): Promise<void> {
	try {
		if (enabled) {
			// Enable EQ and set to specified slot/preset
			await sendReportAndListen(device, createSetEqSwitchCommand(true));
			if (slotId !== undefined) {
				await sendReportAndListen(device, createSetEqPreCommand(slotId));
			}
		} else {
			// Disable EQ
			await sendReportAndListen(device, createSetEqSwitchCommand(false));
		}

		console.log(`FiiO EQ ${enabled ? 'enabled' : 'disabled'}`);
	} catch (error) {
		console.error('Failed to enable/disable FiiO EQ:', error);
		throw error;
	}
}

// ---- Exported handler ----

export const fiioUsbSerialHandler: DeviceHandler = {
	getCurrentSlot,
	pullFromDevice,
	pushToDevice,
	enablePEQ
};

// ── Registration ──────────────────────────────────────────────────────────────

export const registration: UsbSerialVendorConfig = {
	vendorId: 6790,
	manufacturer: 'FiiO',
	handler: fiioUsbSerialHandler,
	devices: {
		'FiiO Audio DSP': {
			usbProductId: 21971,
			modelConfig: {
				baudRate: 57600,
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 21,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				availableSlots: [
					{ id: 240, name: 'BYPASS' },
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip Hop' },
					{ id: 8, name: 'Retro' },
					{ id: 9, name: 'De-essing-1' },
					{ id: 10, name: 'De-essing-2' },
					{ id: 160, name: 'USER1' },
					{ id: 161, name: 'USER2' },
					{ id: 162, name: 'USER3' },
					{ id: 163, name: 'USER4' },
					{ id: 164, name: 'USER5' },
					{ id: 165, name: 'USER6' },
					{ id: 166, name: 'USER7' },
					{ id: 167, name: 'USER8' },
					{ id: 168, name: 'USER9' },
					{ id: 169, name: 'USER10' }
				]
			}
		}
	}
};
