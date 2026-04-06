//
// Copyright 2024 : Pragmatic Audio
//
// Moondrop Edge USB Serial handler — TypeScript port of the legacy moondropEdgeUsbSerial.js
// SPP handler for Moondrop Edge ANC. 5-band PEQ with shifted-gain encoding.
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const MOONDROP = {
	NUM_BANDS: 5,
	PACKET_START: 0xff,
	PROTOCOL_VERSION: 0x04,
	DEVICE_ID: [0x00, 0x1d] as const,
	DIRECTION_TO_DEVICE: 0x0a,
	DIRECTION_FROM_DEVICE: 0x0b,
	CMD_ENABLE_EQ: 0x03,
	CMD_QUERY_EQ: 0x05,
	CMD_SET_EQ: 0x06,
} as const;

// ── Parsed band from device response ─────────────────────────────────────────

interface ParsedBand {
	rawBytes: number[];
	frequency: number;
	qFactor: number;
	gain: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createPacket(command: number, payload: Uint8Array): Uint8Array {
	const len = payload.length;
	const packet = new Uint8Array(8 + len);
	packet[0] = MOONDROP.PACKET_START;
	packet[1] = MOONDROP.PROTOCOL_VERSION;
	packet[2] = (len >> 8) & 0xff;
	packet[3] = len & 0xff;
	packet[4] = MOONDROP.DEVICE_ID[0];
	packet[5] = MOONDROP.DEVICE_ID[1];
	packet[6] = MOONDROP.DIRECTION_TO_DEVICE;
	packet[7] = command;
	packet.set(payload, 8);
	return packet;
}

function parseEQData(payload: Uint8Array): ParsedBand[] | null {
	if (payload.length < 2) return null;

	const bandData = payload.slice(2);
	const bandOffsets = [0, 7, 14, 21, 28];
	const bands: ParsedBand[] = [];

	for (let i = 0; i < MOONDROP.NUM_BANDS; i++) {
		const off = bandOffsets[i];
		const slotLen = i === MOONDROP.NUM_BANDS - 1 ? 6 : 7;
		if (off + slotLen > bandData.length) return null;
		const bytes = bandData.slice(off, off + slotLen);
		const freqHz = (bytes[2] << 8) | bytes[3];
		const qRaw = (bytes[4] << 8) | bytes[5];
		bands.push({
			rawBytes: Array.from(bytes),
			frequency: freqHz,
			qFactor: qRaw / 4096.0,
			gain: null,
		});
	}

	// Second pass: shifted gain — each band's gain is encoded in the first two
	// bytes of the *next* band's raw data.
	for (let i = 0; i < bands.length; i++) {
		if (i < MOONDROP.NUM_BANDS - 1) {
			const raw = (bands[i + 1].rawBytes[0] << 8) | bands[i + 1].rawBytes[1];
			const signed = raw > 32767 ? raw - 65536 : raw;
			bands[i].gain = signed / 60.0;
		} else {
			// Last band gain sits in padding after all band slots
			const paddingOffset = 34;
			if (bandData.length >= paddingOffset + 2) {
				const raw = (bandData[paddingOffset] << 8) | bandData[paddingOffset + 1];
				const signed = raw > 32767 ? raw - 65536 : raw;
				bands[MOONDROP.NUM_BANDS - 1].gain = signed / 60.0;
			} else {
				bands[MOONDROP.NUM_BANDS - 1].gain = 0;
			}
		}
	}

	return bands;
}

function encodeEQBands(
	bands: { freq: number; gain: number; q: number }[]
): Uint8Array {
	const payload: number[] = [];

	// Header: mode byte + band count
	payload.push(0x00, 0x04);

	// Band 1: no preceding gain
	payload.push(0x00, 0x00);
	const f1 = Math.max(0, Math.min(0xffff, Math.round(bands[0].freq)));
	payload.push((f1 >> 8) & 0xff, f1 & 0xff);
	const q1 = Math.round(bands[0].q * 4096);
	payload.push((q1 >> 8) & 0xff, q1 & 0xff);
	payload.push(0x00);

	// Bands 2..4: preceding band's gain encoded as first 2 bytes
	for (let i = 1; i < MOONDROP.NUM_BANDS - 1; i++) {
		const prevGainRaw = Math.round(bands[i - 1].gain * 60);
		const prevGainU16 = prevGainRaw < 0 ? prevGainRaw + 65536 : prevGainRaw;
		payload.push((prevGainU16 >> 8) & 0xff, prevGainU16 & 0xff);

		const f = Math.max(0, Math.min(0xffff, Math.round(bands[i].freq)));
		payload.push((f >> 8) & 0xff, f & 0xff);

		const q = Math.round(bands[i].q * 4096);
		payload.push((q >> 8) & 0xff, q & 0xff);

		payload.push(0x00);
	}

	// Last band (6 bytes — no trailing separator)
	const lastIdx = MOONDROP.NUM_BANDS - 1;
	const prevIdx = MOONDROP.NUM_BANDS - 2;

	const prevGainRaw = Math.round(bands[prevIdx].gain * 60);
	const prevGainU16 = prevGainRaw < 0 ? prevGainRaw + 65536 : prevGainRaw;
	payload.push((prevGainU16 >> 8) & 0xff, prevGainU16 & 0xff);

	const fLast = Math.max(0, Math.min(0xffff, Math.round(bands[lastIdx].freq)));
	payload.push((fLast >> 8) & 0xff, fLast & 0xff);

	const qLast = Math.round(bands[lastIdx].q * 4096);
	payload.push((qLast >> 8) & 0xff, qLast & 0xff);

	// Padding: last band's gain + trailing zero
	const lastGainRaw = Math.round(bands[lastIdx].gain * 60);
	const lastGainU16 = lastGainRaw < 0 ? lastGainRaw + 65536 : lastGainRaw;
	payload.push((lastGainU16 >> 8) & 0xff, lastGainU16 & 0xff);
	payload.push(0x00);

	return new Uint8Array(payload);
}

async function readResponse(
	device: ConnectedDevice,
	expectedCmd: number,
	timeoutMs: number = 5000
): Promise<Uint8Array | null> {
	const buf: number[] = [];
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const { value, done } = await device.readable!.read();
		if (done) break;
		if (value) {
			buf.push(...Array.from(value));
			if (
				buf.length >= 8 &&
				buf[0] === 0xff &&
				buf[6] === MOONDROP.DIRECTION_FROM_DEVICE &&
				buf[7] === expectedCmd
			) {
				return new Uint8Array(buf);
			}
		}
	}
	return null;
}

// ── Handler implementation ───────────────────────────────────────────────────

async function getCurrentSlot(_device: ConnectedDevice): Promise<number> {
	return 0;
}

async function pullFromDevice(
	device: ConnectedDevice,
	_slot: number
): Promise<PullResult> {
	const queryPayload = new Uint8Array([0x00, 0x04]);
	const queryPacket = createPacket(MOONDROP.CMD_QUERY_EQ, queryPayload);
	await device.writable!.write(queryPacket);

	const resp = await readResponse(device, MOONDROP.CMD_QUERY_EQ, 5000);
	if (!resp || resp.length <= 8) {
		throw new Error('Moondrop Edge: no response from device');
	}

	const bands = parseEQData(resp.slice(8));
	if (!bands) {
		throw new Error('Moondrop Edge: failed to parse EQ response');
	}

	const filters: DeviceFilter[] = bands.map((b) => ({
		freq: b.frequency,
		gain: Math.round((b.gain ?? 0) * 100) / 100,
		q: Math.round(b.qFactor * 1000) / 1000,
		type: 'PK' as const,
	}));

	return { filters, globalGain: 0 };
}

async function pushToDevice(
	device: ConnectedDevice,
	_slot: number,
	_preamp: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	const bands: { freq: number; gain: number; q: number }[] = [];
	for (let i = 0; i < MOONDROP.NUM_BANDS; i++) {
		const f = filters[i] || { freq: 1000, gain: 0, q: 1.0 };
		bands.push({
			freq: f.freq ?? 1000,
			gain: f.gain ?? 0,
			q: f.q ?? 1.0,
		});
	}

	const payload = encodeEQBands(bands);
	const packet = createPacket(MOONDROP.CMD_SET_EQ, payload);
	await device.writable!.write(packet);
	return false;
}

async function enablePEQ(
	device: ConnectedDevice,
	enabled: boolean,
	_slotId: number
): Promise<void> {
	const payload = new Uint8Array([enabled ? 0x01 : 0x00]);
	const packet = createPacket(MOONDROP.CMD_ENABLE_EQ, payload);
	await device.writable!.write(packet);
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const moondropEdgeUsbSerialHandler: DeviceHandler = {
	getCurrentSlot,
	pullFromDevice,
	pushToDevice,
	enablePEQ,
};

export const registration: UsbSerialVendorConfig = {
	manufacturer: 'Moondrop',
	handler: moondropEdgeUsbSerialHandler,
	filters: {
		usbVendorId: null,
		allowedBluetoothServiceClassIds: [
			'00001101-0000-1000-8000-00805f9b34fb',
		],
		bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb',
	},
	devices: {
		'Moondrop Edge': {
			modelConfig: {
				baudRate: 115200,
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				flatEQPhoneMeasurement: 'Moondrop Edge Default',
				availableSlots: [{ id: 0, name: 'Custom EQ' }],
			},
		},
	},
};
