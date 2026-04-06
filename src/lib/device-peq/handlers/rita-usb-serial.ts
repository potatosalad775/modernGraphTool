//
// Copyright 2024 : Pragmatic Audio
//
// Tanchjim Rita USB Serial handler — TypeScript port of the legacy ritaUsbSerial.js
// FF A1/A2 framing protocol, 12 bands, 9600 baud over Bluetooth SPP.
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

// ── Protocol constants ───────────────────────────────────────────────────────

const RITA = {
	NUM_BANDS: 12,
	CMD_GET_ALL_EQ: new Uint8Array([0xff, 0xa1, 0x01, 0x0b, 0xaa]),
	CMD_RESET_EQ: new Uint8Array([0xff, 0xa1, 0x01, 0x2d, 0xaa]),
	SET_EQ_HEADER: new Uint8Array([0xff, 0xa1, 0x56, 0x2b, 0x0c]),
	EQ_RESPONSE_LEN: 89
} as const;

// ── Encoding/decoding helpers ────────────────────────────────────────────────

function encodeBand(
	gainDb: number,
	freqHz: number,
	q: number,
	filterType: number = 0x01
): number[] {
	const rawGain =
		gainDb >= 0
			? Math.round(gainDb * 100)
			: (65536 + Math.round(gainDb * 100)) & 0xffff;
	const rawFreq = Math.round(freqHz) & 0xffff;
	const rawQ = Math.max(1, Math.round(q * 100)) & 0xffff;

	return [
		filterType,
		(rawGain >> 8) & 0xff,
		rawGain & 0xff,
		(rawFreq >> 8) & 0xff,
		rawFreq & 0xff,
		(rawQ >> 8) & 0xff,
		rawQ & 0xff
	];
}

interface DecodedBand {
	filterType: number;
	gainDb: number;
	freqHz: number;
	q: number;
}

function decodeBand(bytes: number[] | Uint8Array): DecodedBand {
	const filterType = bytes[0];
	const rawGain = (bytes[1] << 8) | bytes[2];
	const gainDb = bytes[1] < 0x80 ? rawGain / 100 : -(65536 - rawGain) / 100;
	const freqHz = (bytes[3] << 8) | bytes[4];
	const rawQ = (bytes[5] << 8) | bytes[6];
	const q = rawQ / 100;

	return { filterType, gainDb, freqHz, q };
}

// ── Response extraction ──────────────────────────────────────────────────────

interface ExtractResult {
	bytes: number[];
	end: number;
}

function extractResponse(buf: number[]): ExtractResult | null {
	for (let i = 0; i < buf.length - 3; i++) {
		if (buf[i] === 0xff && buf[i + 1] === 0xa2) {
			const len = buf[i + 2];
			const total = 3 + len;
			if (buf.length >= i + total) {
				return { bytes: buf.slice(i, i + total), end: i + total };
			}
		}
	}
	return null;
}

// ── Serial communication ─────────────────────────────────────────────────────

async function readResponse(
	device: ConnectedDevice,
	timeoutMs: number = 8000
): Promise<number[] | null> {
	const buf: number[] = [];
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const { value, done } = await device.readable!.read();
		if (done) break;
		if (value) {
			for (const b of value) buf.push(b);
			const result = extractResponse(buf);
			if (result) return result.bytes;
		}
	}

	return null;
}

// ── Exported handler ─────────────────────────────────────────────────────────

export const ritaUsbSerialHandler: DeviceHandler = {
	async getCurrentSlot(_device: ConnectedDevice): Promise<number> {
		return 0;
	},

	async pullFromDevice(device: ConnectedDevice, _slot: number): Promise<PullResult> {
		await device.writable!.write(RITA.CMD_GET_ALL_EQ);

		const resp = await readResponse(device, 8000);
		if (!resp || resp.length < RITA.EQ_RESPONSE_LEN) {
			throw new Error('Rita: bad response');
		}

		const filters: DeviceFilter[] = [];
		for (let i = 0; i < RITA.NUM_BANDS; i++) {
			const off = 5 + i * 7;
			const band = decodeBand(resp.slice(off, off + 7));
			filters.push({
				freq: band.freqHz,
				gain: Math.round(band.gainDb * 100) / 100,
				q: Math.round(band.q * 100) / 100,
				type: 'PK'
			});
		}

		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		device: ConnectedDevice,
		_slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const bands: { gainDb: number; freqHz: number; q: number; filterType: number }[] = [];
		for (let i = 0; i < RITA.NUM_BANDS; i++) {
			const f = filters[i] || { freq: 1000, gain: 0, q: 1.0 };
			bands.push({
				gainDb: f.gain ?? 0,
				freqHz: f.freq ?? 1000,
				q: f.q ?? 1.0,
				filterType: 0x01
			});
		}

		const body = bands.flatMap((b) => encodeBand(b.gainDb, b.freqHz, b.q, b.filterType));
		const packet = new Uint8Array([...RITA.SET_EQ_HEADER, ...body, 0xaa]);
		await device.writable!.write(packet);

		return false;
	},

	async enablePEQ(
		_device: ConnectedDevice,
		_enabled: boolean,
		_slotId: number
	): Promise<void> {
		// Rita does not support enable/disable PEQ — no-op
	}
};

// ── Registration ─────────────────────────────────────────────────────────────

export const registration: UsbSerialVendorConfig = {
	manufacturer: 'Tanchjim',
	handler: ritaUsbSerialHandler,
	filters: {
		usbVendorId: null,
		allowedBluetoothServiceClassIds: ['00001101-0000-1000-8000-00805f9b34fb'],
		bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb'
	},
	devices: {
		'Tanchjim Rita': {
			modelConfig: {
				baudRate: 9600,
				minGain: -15,
				maxGain: 15,
				maxFilters: 12,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				flatEQPhoneMeasurement: 'Tanchjim Rita Default ANC',
				availableSlots: [{ id: 0, name: 'Default' }]
			}
		}
	}
};
