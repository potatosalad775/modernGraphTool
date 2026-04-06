//
// Copyright 2024 : Pragmatic Audio
//
// FiiO SPP Serial handler — TypeScript port of the legacy fiioSppSerial.js
// F1 10 packet framing for EH11/EH13 Bluetooth SPP devices.
//

import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceFilterType,
	DeviceHandler,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

// ── Protocol constants ───────────────────────────────────────────────────────

const FIIO = {
	NUM_BANDS: 10,
	GAIN_MIN: -20,
	GAIN_MAX: 20
} as const;

// ── Filter-type helpers ──────────────────────────────────────────────────────

function typeToString(t: number): DeviceFilterType {
	return t === 1 ? 'LSQ' : t === 2 ? 'HSQ' : 'PK';
}

function typeFromString(s: DeviceFilterType): number {
	return s === 'LSQ' ? 1 : s === 'HSQ' ? 2 : 0;
}

// ── Packet helpers ───────────────────────────────────────────────────────────

function buildPacket(cmd1: number, cmd2: number, payload: number[] = []): Uint8Array {
	const total = 2 + 2 + 2 + payload.length + 1;
	return new Uint8Array([
		0xf1,
		0x10,
		(total >> 8) & 0xff,
		total & 0xff,
		cmd1,
		cmd2,
		...payload,
		0xff
	]);
}

function encGain(db: number): [number, number] {
	let raw = Math.round(db * 10);
	if (raw < 0) raw += 0x10000;
	return [(raw >> 8) & 0xff, raw & 0xff];
}

function decGain(hi: number, lo: number): number {
	let raw = (hi << 8) | lo;
	if (raw > 0x7fff) raw -= 0x10000;
	return raw / 10.0;
}

// ── EQ response parsing ─────────────────────────────────────────────────────

interface FiioBand {
	gain: number;
	freqHz: number;
	q: number;
	rawType: number;
}

function parseEQResponse(data: Uint8Array): FiioBand[] | null {
	if (data.length < 80) return null;
	if (data[0] !== 0xf1 || data[1] !== 0x10) return null;
	if (data[4] !== 0x03 || data[5] !== 0x0d) return null;

	const bands: FiioBand[] = [];
	const base = 9;
	for (let i = 0; i < FIIO.NUM_BANDS; i++) {
		const o = base + i * 7;
		if (o + 7 > data.length - 1) break;
		bands.push({
			gain: decGain(data[o], data[o + 1]),
			freqHz: (data[o + 2] << 8) | data[o + 3],
			q: ((data[o + 4] << 8) | data[o + 5]) / 100.0,
			rawType: data[o + 6]
		});
	}

	return bands.length === FIIO.NUM_BANDS ? bands : null;
}

// ── Serial communication ─────────────────────────────────────────────────────

async function readFiioPacket(
	device: ConnectedDevice,
	timeoutMs: number = 6000
): Promise<Uint8Array | null> {
	const buf: number[] = [];
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const remaining = Math.max(100, deadline - Date.now());
		const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((r) =>
			setTimeout(() => r({ value: undefined as unknown as Uint8Array, done: true }), remaining)
		);
		const { value, done } = await Promise.race([device.readable!.read(), timeoutPromise]);
		if (done || !value) break;

		for (const b of value) buf.push(b);

		if (buf.length >= 4) {
			const expected = (buf[2] << 8) | buf[3];
			if (buf.length >= expected) return new Uint8Array(buf.slice(0, expected));
		}
	}

	return null;
}

async function sendAndReceive(
	device: ConnectedDevice,
	packet: Uint8Array,
	timeoutMs: number = 4000
): Promise<Uint8Array | null> {
	await device.writable!.write(packet);
	return await readFiioPacket(device, timeoutMs);
}

// ── Exported handler ─────────────────────────────────────────────────────────

export const fiioSppSerialHandler: DeviceHandler = {
	async getCurrentSlot(_device: ConnectedDevice): Promise<number> {
		return 0;
	},

	async pullFromDevice(device: ConnectedDevice, _slot: number): Promise<PullResult> {
		// Attempt version handshake (non-critical)
		try {
			const verPkt = buildPacket(0x00, 0x02, [0x01]);
			await sendAndReceive(device, verPkt, 2000);
		} catch (_) {
			/* ignore */
		}

		const readPkt = buildPacket(0x03, 0x0d, [0x01, 0x00, 0x09]);
		const resp = await sendAndReceive(device, readPkt, 6000);
		if (!resp) throw new Error('FiiO SPP: no response');

		const bands = parseEQResponse(resp);
		if (!bands) throw new Error('FiiO SPP: parse failed');

		const filters: DeviceFilter[] = bands.map((b) => ({
			freq: b.freqHz,
			gain: b.gain,
			q: b.q,
			type: typeToString(b.rawType)
		}));

		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		device: ConnectedDevice,
		_slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		for (let i = 0; i < FIIO.NUM_BANDS; i++) {
			const f = filters[i] || { freq: 1000, gain: 0, q: 0.72, type: 'PK' as DeviceFilterType };
			const gainDb = Math.max(FIIO.GAIN_MIN, Math.min(FIIO.GAIN_MAX, f.gain ?? 0));
			const freqRaw = Math.max(0, Math.min(0xffff, Math.round(f.freq ?? 1000)));
			const qRaw = Math.round((f.q ?? 0.72) * 100);
			const type = typeFromString(f.type ?? 'PK');
			const [gHi, gLo] = encGain(gainDb);

			const pkt = buildPacket(0x13, 0x0d, [
				0x01,
				i,
				i,
				gHi,
				gLo,
				(freqRaw >> 8) & 0xff,
				freqRaw & 0xff,
				(qRaw >> 8) & 0xff,
				qRaw & 0xff,
				type
			]);

			try {
				await sendAndReceive(device, pkt, 2000);
			} catch (_) {
				/* ignore per-band errors */
			}
			await new Promise((r) => setTimeout(r, 50));
		}

		return false;
	},

	async enablePEQ(
		_device: ConnectedDevice,
		_enabled: boolean,
		_slotId: number
	): Promise<void> {
		// FiiO SPP devices do not support enable/disable PEQ — no-op
	}
};

// ── Registration ─────────────────────────────────────────────────────────────

export const registration: UsbSerialVendorConfig = {
	manufacturer: 'FiiO',
	handler: fiioSppSerialHandler,
	filters: {
		usbVendorId: null,
		allowedBluetoothServiceClassIds: ['00001101-0000-1000-8000-00805f9b34fb'],
		bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb'
	},
	devices: {
		'FiiO EH11': {
			modelConfig: {
				baudRate: 115200,
				minGain: -20,
				maxGain: 20,
				maxFilters: 10,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				flatEQPhoneMeasurement: 'FiiO EH11 NeutralEQ',
				availableSlots: [{ id: 0, name: 'Default' }]
			}
		},
		'FiiO EH13': {
			modelConfig: {
				baudRate: 115200,
				minGain: -20,
				maxGain: 20,
				maxFilters: 10,
				firstWritableEQSlot: 0,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				disabledPresetId: -1,
				experimental: false,
				flatEQPhoneMeasurement: 'FiiO EH13 NeutralEQ',
				availableSlots: [{ id: 0, name: 'Default' }]
			}
		}
	}
};
