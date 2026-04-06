//
// Copyright 2024 : Pragmatic Audio
//
// Edifier USB Serial handler — TypeScript port of the legacy edifierUsbSerial.js
// Write-only SPP handler for Edifier W830NB. 4-band PEQ with lookup-table frequency encoding.
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const EDIFIER = {
	HEADER_TX: 0xaa,
	APP_CODE: 0xec,
	CMD_CUSTOM_EQ_SET_BAND: 0x44,

	GAIN_BASELINE: 0xa9,
	GAIN_SCALE: 4,
	Q_BASELINE: 0x95,
	Q_SCALE: 14,

	BAND_IDS: [0xa5, 0xa4, 0xa7, 0xa6],
	NUM_BANDS: 4,
	DEFAULT_FREQS: [100, 500, 2000, 8000],

	FREQ_TABLE: {
		20: [0xa5, 0xb1],
		50: [0xa5, 0x97],
		75: [0xa5, 0xee],
		76: [0xa5, 0xe9],
		77: [0xa5, 0xe8],
		100: [0xa5, 0xc1],
		150: [0xa5, 0x33],
		175: [0xa5, 0x0a],
		200: [0xa5, 0x6d],
		400: [0xa4, 0x35],
		500: [0xa4, 0x51],
		1000: [0xa6, 0x4d],
		1500: [0xa0, 0x79],
		2000: [0xa2, 0x75],
		3000: [0xae, 0x1d],
		3078: [0xa9, 0xa3],
		4000: [0xaa, 0x05],
		5000: [0xb6, 0x2d],
		6000: [0xb2, 0xd5],
		8000: [0xba, 0xe5],
		10000: [0x82, 0xb5],
	} as Record<number, [number, number]>,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function calculateCRC(packet: number[]): number {
	return packet.reduce((sum, b) => (sum + b) & 0xff, 0);
}

function buildCommand(command: number, payload: number[] = []): Uint8Array {
	const len = payload.length;
	const pkt: number[] = [
		EDIFIER.HEADER_TX,
		EDIFIER.APP_CODE,
		command,
		(len >> 8) & 0xff,
		len & 0xff,
		...payload,
	];
	pkt.push(calculateCRC(pkt));
	return new Uint8Array(pkt);
}

function encodeGain(gainDb: number): number {
	const clamped = Math.max(-6.0, Math.min(6.0, gainDb));
	return Math.round(EDIFIER.GAIN_BASELINE + clamped * EDIFIER.GAIN_SCALE) & 0xff;
}

function encodeQ(qValue: number): number {
	const clamped = Math.max(0.5, Math.min(5.0, qValue));
	return Math.round(EDIFIER.Q_BASELINE + clamped * EDIFIER.Q_SCALE) & 0xff;
}

function encodeFrequency(freqHz: number): [number, number] {
	const tableFreqs = Object.keys(EDIFIER.FREQ_TABLE).map((f) => parseInt(f, 10));
	const nearest = tableFreqs.reduce((prev, curr) =>
		Math.abs(curr - freqHz) < Math.abs(prev - freqHz) ? curr : prev
	);
	return EDIFIER.FREQ_TABLE[nearest];
}

// ── Handler implementation ───────────────────────────────────────────────────

async function getCurrentSlot(_device: ConnectedDevice): Promise<number> {
	return 0;
}

async function pullFromDevice(
	_device: ConnectedDevice,
	_slot: number
): Promise<PullResult> {
	const filters: DeviceFilter[] = EDIFIER.DEFAULT_FREQS.map((freq) => ({
		freq,
		gain: 0.0,
		q: 1.4,
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
	for (let i = 0; i < EDIFIER.NUM_BANDS; i++) {
		const f = filters[i] || {
			freq: EDIFIER.DEFAULT_FREQS[i],
			gain: 0,
			q: 1.4,
		};
		const bandId = EDIFIER.BAND_IDS[i];
		const [freqB2, freqB3] = encodeFrequency(f.freq ?? EDIFIER.DEFAULT_FREQS[i]);
		const gainByte = encodeGain(f.gain ?? 0);
		const qByte = encodeQ(f.q ?? 1.4);
		const payload = [bandId, 0xa5, freqB2, freqB3, gainByte, qByte];
		const packet = buildCommand(EDIFIER.CMD_CUSTOM_EQ_SET_BAND, payload);
		await device.writable!.write(packet);
		await new Promise((r) => setTimeout(r, 50));
	}
	return false;
}

async function enablePEQ(
	_device: ConnectedDevice,
	_enabled: boolean,
	_slotId: number
): Promise<void> {
	// Edifier W830NB does not support enable/disable toggle
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const edifierUsbSerialHandler: DeviceHandler = {
	getCurrentSlot,
	pullFromDevice,
	pushToDevice,
	enablePEQ,
};

export const registration: UsbSerialVendorConfig = {
	manufacturer: 'Edifier',
	handler: edifierUsbSerialHandler,
	filters: {
		usbVendorId: null,
		allowedBluetoothServiceClassIds: [
			'00001101-0000-1000-8000-00805f9b34fb',
		],
		bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb',
	},
	devices: {
		'Edifier W830NB': {
			modelConfig: {
				baudRate: 115200,
				minGain: -6,
				maxGain: 6,
				maxFilters: 4,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				writeOnly: true,
				flatEQPhoneMeasurement: 'Edifier 830NB Custom EQ 0db',
				availableSlots: [{ id: 0, name: 'Custom EQ' }],
			},
		},
	},
};
