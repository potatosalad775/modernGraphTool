//
// FiiO BLE GATT handler — ported from legacy fiioBleHandler.js
//
// F1 10 packet framing (same as FiiO SPP, different transport).
// BLE notification accumulation for multi-chunk responses.
// Supports FiiO EH11 (write-without-response) and EH13 (write-with-response).
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult, BleDeviceConfig } from '../types.js';

const NUM_BANDS = 10;
const GAIN_MIN = -20;
const GAIN_MAX = 20;

function typeToString(t: number): 'PK' | 'LSQ' | 'HSQ' {
	return t === 1 ? 'LSQ' : t === 2 ? 'HSQ' : 'PK';
}

function typeFromString(s: string): number {
	return s === 'LSQ' ? 1 : s === 'HSQ' ? 2 : 0;
}

function buildPacket(cmd1: number, cmd2: number, payload: number[] = []): Uint8Array {
	const total = 2 + 2 + 2 + payload.length + 1;
	return new Uint8Array([
		0xf1, 0x10,
		(total >> 8) & 0xff, total & 0xff,
		cmd1, cmd2,
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

function parseEQResponse(data: Uint8Array): { gain: number; freqHz: number; q: number; rawType: number }[] | null {
	if (data.length < 80) return null;
	if (data[0] !== 0xf1 || data[1] !== 0x10) return null;
	if (data[4] !== 0x03 || data[5] !== 0x0d) return null;

	const bands: { gain: number; freqHz: number; q: number; rawType: number }[] = [];
	const base = 9;
	for (let i = 0; i < NUM_BANDS; i++) {
		const o = base + i * 7;
		if (o + 7 > data.length - 1) break;
		bands.push({
			gain: decGain(data[o], data[o + 1]),
			freqHz: (data[o + 2] << 8) | data[o + 3],
			q: ((data[o + 4] << 8) | data[o + 5]) / 100.0,
			rawType: data[o + 6]
		});
	}
	return bands.length === NUM_BANDS ? bands : null;
}

async function readFiioPacket(device: ConnectedDevice, timeoutMs = 6000): Promise<Uint8Array | null> {
	const buf: number[] = [];
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const remaining = Math.max(100, deadline - Date.now());
		const chunk = await device.readNotification!(remaining);
		if (!chunk) break;

		for (const b of chunk) buf.push(b);

		if (buf.length >= 4) {
			const expected = (buf[2] << 8) | buf[3];
			if (buf.length >= expected) {
				return new Uint8Array(buf.slice(0, expected));
			}
		}
	}
	return null;
}

async function sendAndReceive(device: ConnectedDevice, packet: Uint8Array, timeoutMs = 4000): Promise<Uint8Array | null> {
	const txChar = device.txChar!;
	const useWriteWithResponse = !!txChar.properties.write && !txChar.properties.writeWithoutResponse;
	if (useWriteWithResponse) {
		await txChar.writeValueWithResponse(packet);
	} else {
		await txChar.writeValueWithoutResponse(packet);
	}
	return await readFiioPacket(device, timeoutMs);
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const fiioBleHandler: DeviceHandler = {
	async getCurrentSlot(): Promise<number> {
		return 0;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice): Promise<PullResult> {
		console.log('FiiO BLE: reading EQ from device');

		// Version handshake (best-effort)
		try {
			const verPkt = buildPacket(0x00, 0x02, [0x01]);
			await sendAndReceive(deviceDetails, verPkt, 2000);
		} catch {
			console.log('FiiO BLE: version handshake skipped');
		}

		const readPkt = buildPacket(0x03, 0x0d, [0x01, 0x00, 0x09]);
		const resp = await sendAndReceive(deviceDetails, readPkt, 6000);

		if (!resp) throw new Error('FiiO BLE: no response to EQ read command');

		const bands = parseEQResponse(resp);
		if (!bands) throw new Error(`FiiO BLE: could not parse EQ response (${resp.length} bytes)`);

		const filters: DeviceFilter[] = bands.map((b) => ({
			freq: b.freqHz,
			gain: b.gain,
			q: b.q,
			type: typeToString(b.rawType)
		}));

		console.log(`FiiO BLE: pulled ${filters.length} bands`);
		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		console.log(`FiiO BLE: writing ${filters.length} bands to device`);

		for (let i = 0; i < NUM_BANDS; i++) {
			const f = filters[i] || { freq: 1000, gain: 0, q: 0.72, type: 'PK' };
			const gainDb = Math.max(GAIN_MIN, Math.min(GAIN_MAX, f.gain ?? 0));
			const freqRaw = Math.max(0, Math.min(0xffff, Math.round(f.freq ?? 1000)));
			const qRaw = Math.round((f.q ?? 0.72) * 100);
			const type = typeFromString(f.type ?? 'PK');

			const [gHi, gLo] = encGain(gainDb);

			const pkt = buildPacket(0x13, 0x0d, [
				0x01, i, i,
				gHi, gLo,
				(freqRaw >> 8) & 0xff, freqRaw & 0xff,
				(qRaw >> 8) & 0xff, qRaw & 0xff,
				type
			]);

			try {
				await sendAndReceive(deviceDetails, pkt, 2000);
			} catch {
				console.log(`FiiO BLE: no ACK for band ${i + 1}, continuing`);
			}

			await new Promise((r) => setTimeout(r, 50));
		}

		console.log('FiiO BLE: all EQ bands written');
		return false;
	},

	async enablePEQ(): Promise<void> {
		console.log('FiiO BLE: EQ enable/disable not supported via BLE protocol');
	}
};

// ── Registration ──────────────────────────────────────────────────────────────

export const registration: BleDeviceConfig = {
	manufacturer: 'FiiO',
	handler: fiioBleHandler,
	filters: { namePrefix: 'FIIO' },
	gatt: {
		serviceUuid: '00001100-04a5-1000-1000-40ed981a04a5',
		txCharacteristicUuid: '00001101-04a5-1000-1000-40ed981a04a5',
		rxCharacteristicUuid: '00001102-04a5-1000-1000-40ed981a04a5'
	},
	defaultModelConfig: {
		minGain: -20,
		maxGain: 20,
		maxFilters: 10,
		firstWritableEQSlot: 0,
		maxWritableEQSlots: 1,
		disconnectOnSave: false,
		disabledPresetId: -1,
		experimental: false,
		availableSlots: [{ id: 0, name: 'Custom EQ' }]
	},
	devices: {
		'FIIO EH11': { modelConfig: {} },
		'FIIO EH13': { modelConfig: {} }
	}
};
