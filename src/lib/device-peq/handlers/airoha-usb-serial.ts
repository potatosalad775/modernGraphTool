//
// Copyright 2024 : Pragmatic Audio
//
// Airoha USB Serial handler — TypeScript port of the legacy airohaUsbSerial.js
// SPP handler for Audeze Maxwell. Multi-sample-rate write, 193-byte read response.
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const AIROHA = {
	NUM_BANDS: 10,
	RESPONSE_HEADER: [0x05, 0x5b, 0xbd] as const,
	READ_RESPONSE_LENGTH: 193
} as const;

// ── Internal filter representation for write encoding ─────────────────────────

interface NormalizedFilter {
	freqHz: number;
	gainDb: number;
	qValue: number;
	filterType: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildReadPresetCommand(preset: number): Uint8Array {
	return new Uint8Array([0x05, 0x5a, 0x06, 0x00, 0x00, 0x0a, preset & 0xff, 0xef, 0xe8, 0x03]);
}

function buildWritePEQCommandFull(presetNum: number, filters: NormalizedFilter[]): Uint8Array {
	if (presetNum < 0 || presetNum > 3) {
		throw new Error('Preset must be 0-3');
	}
	if (filters.length !== AIROHA.NUM_BANDS) {
		throw new Error('Must provide 10 filters');
	}

	const cmd: number[] = [];

	// Header
	cmd.push(0x05, 0x5a, 0x4f);

	// Length placeholder (2 bytes, filled in below)
	const lengthPos = cmd.length;
	cmd.push(0x00, 0x00);

	// Sub-header
	cmd.push(0x03, 0x0e, 0x00);

	// Preset number as little-endian uint32
	const presetBytes = new Uint8Array(new Uint32Array([presetNum]).buffer);
	cmd.push(...Array.from(presetBytes));

	// Number of sample-rate blocks
	cmd.push(0x06);

	const sampleRates = [44100, 48000, 88200, 96000, 44100, 48000];

	for (const sampleRate of sampleRates) {
		cmd.push(0x00, 0x67, 0x00, 0x0a, 0x00);

		const srBytes = new Uint8Array(new Uint32Array([sampleRate]).buffer);
		cmd.push(...Array.from(srBytes));

		for (const band of filters) {
			const filterType = band.filterType;
			cmd.push(0x01, filterType);

			// Frequency: Hz * 100, little-endian uint32
			const freqVal = Math.round(band.freqHz * 100);
			cmd.push(freqVal & 0xff, (freqVal >> 8) & 0xff, 0x00, 0x00);

			// Gain: dB * 100, little-endian int32
			const gainVal = Math.round(band.gainDb * 100);
			const gainBytes = new Uint8Array(new Int32Array([gainVal]).buffer);
			cmd.push(...Array.from(gainBytes));

			// Q: value * 100, little-endian uint32
			const qVal = Math.round(band.qValue * 100);
			const qBytes = new Uint8Array(new Uint32Array([qVal]).buffer);
			cmd.push(...Array.from(qBytes));

			// Trailing constant
			cmd.push(0xc8, 0x00, 0x00, 0x00);
		}
	}

	// Fill in payload length (everything after the 3-byte header)
	const payloadLen = cmd.length - 3;
	cmd[lengthPos] = payloadLen & 0xff;
	cmd[lengthPos + 1] = (payloadLen >> 8) & 0xff;

	return new Uint8Array(cmd);
}

function parsePEQResponse(
	data: Uint8Array
): { numBands: number; eqEnabled: boolean; filters: DeviceFilter[] } | null {
	if (data.length < AIROHA.READ_RESPONSE_LENGTH) return null;
	if (data[0] !== 0x05 || data[1] !== 0x5b || data[2] !== 0xbd) {
		return null;
	}

	const result = {
		numBands: data[5],
		eqEnabled: data[8] === 1,
		filters: [] as DeviceFilter[]
	};

	const filterStart = 13;
	for (let i = 0; i < Math.min(AIROHA.NUM_BANDS, result.numBands); i++) {
		const offset = filterStart + i * 18;
		if (offset + 18 > data.length) break;

		// Frequency: little-endian uint32 / 100
		const freqRaw =
			data[offset + 2] |
			(data[offset + 3] << 8) |
			(data[offset + 4] << 16) |
			(data[offset + 5] << 24);
		const freqHz = freqRaw / 100.0;

		// Gain: little-endian int32 / 100
		let gainRaw =
			(data[offset + 6] |
				(data[offset + 7] << 8) |
				(data[offset + 8] << 16) |
				(data[offset + 9] << 24)) >>>
			0;
		if (gainRaw > 0x7fffffff) gainRaw -= 0x100000000;
		const gainDb = gainRaw / 100.0;

		// Q: little-endian uint32 / 100
		const qRaw =
			data[offset + 14] |
			(data[offset + 15] << 8) |
			(data[offset + 16] << 16) |
			(data[offset + 17] << 24);
		const qValue = qRaw / 100.0;

		result.filters.push({
			freq: freqHz,
			gain: gainDb,
			q: qValue,
			type: 'PK' as const
		});
	}

	return result;
}

function normalizeFilters(filters: DeviceFilter[], targetCount: number): NormalizedFilter[] {
	const normalized: NormalizedFilter[] = [];

	for (const filter of filters) {
		const filterType = filter.type === 'LSQ' ? 3 : filter.type === 'HSQ' ? 4 : 2;
		normalized.push({
			freqHz: filter.freq,
			gainDb: filter.gain,
			qValue: filter.q,
			filterType
		});
		if (normalized.length >= targetCount) break;
	}

	// Pad with flat peaking filters if fewer than targetCount
	while (normalized.length < targetCount) {
		normalized.push({
			freqHz: 1000.0,
			gainDb: 0.0,
			qValue: 1.0,
			filterType: 2
		});
	}

	return normalized;
}

async function readPEQPacket(
	device: ConnectedDevice,
	timeoutMs: number = 5000
): Promise<{ numBands: number; eqEnabled: boolean; filters: DeviceFilter[] } | null> {
	const startTime = Date.now();
	let buffer: number[] = [];

	while (Date.now() - startTime < timeoutMs) {
		const { value, done } = await device.readable!.read();
		if (done || !value) {
			await new Promise((r) => setTimeout(r, 50));
			continue;
		}

		buffer.push(...Array.from(value));

		// Align to header start
		const headerIndex = buffer.indexOf(AIROHA.RESPONSE_HEADER[0]);
		if (headerIndex > 0) buffer = buffer.slice(headerIndex);

		if (buffer.length >= AIROHA.READ_RESPONSE_LENGTH) {
			const packet = buffer.slice(0, AIROHA.READ_RESPONSE_LENGTH);
			const parsed = parsePEQResponse(new Uint8Array(packet));
			if (parsed) return parsed;
			// False header match — skip one byte and keep scanning
			buffer = buffer.slice(1);
		}
	}

	return null;
}

// ── Handler implementation ───────────────────────────────────────────────────

async function getCurrentSlot(_device: ConnectedDevice): Promise<number> {
	return 0;
}

async function pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult> {
	try {
		const command = buildReadPresetCommand(slot);
		await device.writable!.write(command);

		const response = await readPEQPacket(device, 5000);
		if (!response) {
			throw new Error('Airoha: no response from device');
		}

		return { filters: response.filters, globalGain: 0 };
	} catch (error) {
		console.error('Airoha pull failed:', error);
		return { filters: [], globalGain: 0 };
	}
}

async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	_preamp: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	const normalized = normalizeFilters(filters, AIROHA.NUM_BANDS);
	const command = buildWritePEQCommandFull(slot, normalized);
	await device.writable!.write(command);
	return true;
}

async function enablePEQ(
	_device: ConnectedDevice,
	_enabled: boolean,
	_slotId: number
): Promise<void> {
	// Airoha/Audeze Maxwell does not support enable/disable toggle
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const airohaUsbSerialHandler: DeviceHandler = {
	getCurrentSlot,
	pullFromDevice,
	pushToDevice,
	enablePEQ
};

export const registration: UsbSerialVendorConfig = {
	manufacturer: 'Audeze',
	handler: airohaUsbSerialHandler,
	filters: {
		usbVendorId: null,
		allowedBluetoothServiceClassIds: ['00001101-0000-1000-8000-00805f9b34fb'],
		bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb'
	},
	devices: {
		'Audeze Maxwell': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 4,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				flatEQPhoneMeasurement: 'Audeze Maxwell Flat',
				availableSlots: [
					{ id: 0, name: 'Preset 1' },
					{ id: 1, name: 'Preset 2' },
					{ id: 2, name: 'Preset 3' },
					{ id: 3, name: 'Preset 4' }
				]
			}
		}
	}
};
