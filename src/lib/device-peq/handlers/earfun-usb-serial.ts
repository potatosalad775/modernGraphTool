//
// Copyright 2024 : Pragmatic Audio
//
// EarFun USB Serial handler — TypeScript port of the legacy earfunUsbSerial.js
// Write-only checksum-based packets for EarFun Tune Pro over Bluetooth SPP.
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

// ── Protocol constants ───────────────────────────────────────────────────────

const EARFUN = {
	NUM_BANDS: 10,
	HEADER: 0xef,
	CMD_CATEGORY: 0x20,
	CMD_SET_PEQ_BAND: 0x95,
	PAYLOAD_LENGTH: 0x0a,
	Q_FACTOR_H: 0x0b,
	Q_FACTOR_L: 0x33,
	FOOTER: 0xfe,
	STANDARD_FREQS: [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
} as const;

// ── Encoding helpers ─────────────────────────────────────────────────────────

function encodeFrequency(hz: number): [number, number] {
	const value = Math.round(hz * 3);
	return [(value >> 8) & 0xff, value & 0xff];
}

function encodeGain(dB: number): [number, number] {
	let value = Math.round((dB * 100) / 3);
	if (value < 0) value = 65536 + value;
	return [(value >> 8) & 0xff, value & 0xff];
}

function calculateChecksum(payload: number[]): number {
	const sum = payload.reduce((a, b) => a + b, 0);
	return (payload[0] + sum) & 0xff;
}

// ── Packet builder ───────────────────────────────────────────────────────────

function buildBandPacket(bandNum: number, frequencyHz: number, gainDb: number): Uint8Array {
	const [freqH, freqL] = encodeFrequency(frequencyHz);
	const [gainH, gainL] = encodeGain(gainDb);

	const payload = [
		EARFUN.PAYLOAD_LENGTH,
		bandNum,
		0xfe,
		0x20,
		freqH,
		freqL,
		gainH,
		gainL,
		EARFUN.Q_FACTOR_H,
		EARFUN.Q_FACTOR_L
	];

	const checksum = calculateChecksum(payload);

	return new Uint8Array([
		EARFUN.HEADER,
		EARFUN.CMD_CATEGORY,
		EARFUN.CMD_SET_PEQ_BAND,
		EARFUN.PAYLOAD_LENGTH,
		...payload,
		checksum,
		EARFUN.FOOTER
	]);
}

// ── Exported handler ─────────────────────────────────────────────────────────

export const earfunUsbSerialHandler: DeviceHandler = {
	async getCurrentSlot(_device: ConnectedDevice): Promise<number> {
		return 0;
	},

	async pullFromDevice(_device: ConnectedDevice, _slot: number): Promise<PullResult> {
		// Write-only device — return default flat EQ
		const filters: DeviceFilter[] = EARFUN.STANDARD_FREQS.map((freq) => ({
			freq,
			gain: 0.0,
			q: 1.0,
			type: 'PK' as const
		}));

		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		device: ConnectedDevice,
		_slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		for (let i = 0; i < EARFUN.NUM_BANDS; i++) {
			const f = filters[i] || { freq: EARFUN.STANDARD_FREQS[i], gain: 0 };
			const packet = buildBandPacket(
				i + 1,
				f.freq ?? EARFUN.STANDARD_FREQS[i],
				f.gain ?? 0
			);
			await device.writable!.write(packet);
			await new Promise((r) => setTimeout(r, 50));
		}

		return false;
	},

	async enablePEQ(
		_device: ConnectedDevice,
		_enabled: boolean,
		_slotId: number
	): Promise<void> {
		// EarFun devices do not support enable/disable PEQ — no-op
	}
};

// ── Registration ─────────────────────────────────────────────────────────────

export const registration: UsbSerialVendorConfig = {
	manufacturer: 'EarFun',
	handler: earfunUsbSerialHandler,
	filters: {
		usbVendorId: null,
		allowedBluetoothServiceClassIds: ['00001101-0000-1000-8000-00805f9b34fb'],
		bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb'
	},
	devices: {
		'EarFun Tune Pro': {
			modelConfig: {
				baudRate: 115200,
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				writeOnly: true,
				flatEQPhoneMeasurement: 'EarfunTunePro-ANC-Default',
				availableSlots: [{ id: 0, name: 'Default' }]
			}
		}
	}
};
