//
// Airoha BLE GATT handler — ported from legacy airohaBleHandler.js
//
// Audeze Maxwell BLE protocol. 05 5A/5B proprietary framing.
// 193-byte read response, 18 bytes per band, 10 bands.
// Write uses mirror command (simpler than multi-sample-rate SPP write).
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult, BleDeviceConfig } from '../types.js';

const NUM_BANDS = 10;
const RESPONSE_HEADER = [0x05, 0x5b, 0xbd];
const READ_RESPONSE_LENGTH = 193;

function buildReadPresetCommand(preset: number): Uint8Array {
	return new Uint8Array([0x05, 0x5a, 0x06, 0x00, 0x00, 0x0a, preset & 0xff, 0xef, 0xe8, 0x03]);
}

interface NormalizedBand {
	freqHz: number;
	gainDb: number;
	qValue: number;
	filterType: number;
}

function buildWritePEQCommandMirror(presetNum: number, filters: NormalizedBand[]): Uint8Array {
	if (presetNum < 0 || presetNum > 3) throw new Error('Preset must be 0-3');
	if (filters.length !== NUM_BANDS) throw new Error(`Must provide exactly ${NUM_BANDS} filters`);

	const cmd: number[] = [];

	// Header: 05 5A BD
	cmd.push(0x05, 0x5a, 0xbd);

	// Length field (2 bytes)
	cmd.push(0x00, 0x01);

	// Header bytes from capture: 0A 00 EF 01 00 00 00 00
	cmd.push(0x0a, 0x00, 0xef, 0x01, 0x00, 0x00, 0x00, 0x00);

	for (const band of filters) {
		const filterType = band.filterType ?? 2;
		cmd.push(0x01);
		cmd.push(filterType);

		const freqVal = Math.round(band.freqHz * 100);
		const freqBytes = new Uint8Array(new Uint32Array([freqVal]).buffer);
		cmd.push(...freqBytes);

		const gainVal = Math.round(band.gainDb * 100);
		const gainBytes = new Uint8Array(new Int32Array([gainVal]).buffer);
		cmd.push(...gainBytes);

		// Bandwidth (unused)
		cmd.push(0x00, 0x00, 0x00, 0x00);

		const qVal = Math.round(band.qValue * 100);
		const qBytes = new Uint8Array(new Uint32Array([qVal]).buffer);
		cmd.push(...qBytes);
	}

	return new Uint8Array(cmd);
}

function parsePEQResponse(data: Uint8Array): { filters: DeviceFilter[] } | null {
	if (data.length < READ_RESPONSE_LENGTH) return null;
	if (data[0] !== RESPONSE_HEADER[0] || data[1] !== RESPONSE_HEADER[1] || data[2] !== RESPONSE_HEADER[2]) {
		return null;
	}

	const numBands = data[5];
	const filters: DeviceFilter[] = [];
	const filterStart = 13;

	for (let i = 0; i < Math.min(NUM_BANDS, numBands); i++) {
		const offset = filterStart + i * 18;
		if (offset + 18 > data.length) break;

		const freqRaw =
			data[offset + 2] | (data[offset + 3] << 8) | (data[offset + 4] << 16) | (data[offset + 5] << 24);
		const freqHz = freqRaw / 100.0;

		let gainRaw =
			((data[offset + 6] | (data[offset + 7] << 8) | (data[offset + 8] << 16) | (data[offset + 9] << 24)) >>>
				0);
		if (gainRaw > 0x7fffffff) gainRaw -= 0x100000000;
		const gainDb = gainRaw / 100.0;

		const qRaw =
			data[offset + 14] | (data[offset + 15] << 8) | (data[offset + 16] << 16) | (data[offset + 17] << 24);
		const qValue = qRaw / 100.0;

		filters.push({ freq: freqHz, gain: gainDb, q: qValue, type: 'PK' });
	}

	return { filters };
}

function normalizeFilters(filters: DeviceFilter[], targetCount: number): NormalizedBand[] {
	const normalized: NormalizedBand[] = [];
	for (const filter of filters) {
		normalized.push({
			freqHz: filter.freq,
			gainDb: filter.gain,
			qValue: filter.q,
			filterType: filter.type === 'LSQ' ? 3 : filter.type === 'HSQ' ? 4 : 2
		});
		if (normalized.length >= targetCount) break;
	}
	while (normalized.length < targetCount) {
		normalized.push({ freqHz: 1000.0, gainDb: 0.0, qValue: 1.0, filterType: 2 });
	}
	return normalized;
}

async function writePacket(device: ConnectedDevice, packet: Uint8Array): Promise<void> {
	const txChar = device.txChar!;
	if (txChar.properties.writeWithoutResponse) {
		await txChar.writeValueWithoutResponse(packet);
	} else {
		await txChar.writeValue(packet);
	}
}

async function readPEQPacket(device: ConnectedDevice, timeoutMs = 5000): Promise<{ filters: DeviceFilter[] } | null> {
	const startTime = Date.now();
	let buffer: number[] = [];

	while (Date.now() - startTime < timeoutMs) {
		const remaining = timeoutMs - (Date.now() - startTime);
		const chunk = await device.readNotification!(remaining);
		if (!chunk) break;

		buffer.push(...Array.from(chunk));

		const headerIndex = buffer.indexOf(RESPONSE_HEADER[0]);
		if (headerIndex > 0) {
			buffer = buffer.slice(headerIndex);
		}

		if (buffer.length >= READ_RESPONSE_LENGTH) {
			const packet = buffer.slice(0, READ_RESPONSE_LENGTH);
			const parsed = parsePEQResponse(new Uint8Array(packet));
			if (parsed) return parsed;
			buffer = buffer.slice(1);
		}
	}

	return null;
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const airohaBleHandler: DeviceHandler = {
	async getCurrentSlot(): Promise<number> {
		console.log('Airoha BLE: defaulting to slot 0');
		return 0;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, slot: number): Promise<PullResult> {
		console.log(`Airoha BLE: pulling EQ from slot ${slot}`);

		try {
			const command = buildReadPresetCommand(slot);
			await writePacket(deviceDetails, command);

			const response = await readPEQPacket(deviceDetails, 5000);
			if (!response) throw new Error('No response from device when reading PEQ');

			console.log(`Airoha BLE: pulled ${response.filters.length} filters from slot ${slot}`);
			return { filters: response.filters, globalGain: 0 };
		} catch (error) {
			console.error('Airoha BLE: pullFromDevice failed:', error);
			return { filters: [], globalGain: 0 };
		}
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		console.log(`Airoha BLE: pushing ${filters.length} filters to slot ${slot}`);

		try {
			const normalized = normalizeFilters(filters, NUM_BANDS);
			const command = buildWritePEQCommandMirror(slot, normalized);
			await writePacket(deviceDetails, command);
			console.log('Airoha BLE: PEQ write command sent');
			return true;
		} catch (error) {
			console.error('Airoha BLE: pushToDevice failed:', error);
			throw error;
		}
	},

	async enablePEQ(
		_device: ConnectedDevice,
		enabled: boolean,
		slotId: number
	): Promise<void> {
		console.log(`Airoha BLE: enable/disable not supported (requested ${enabled} for slot ${slotId})`);
	}
};

// ── Registration ──────────────────────────────────────────────────────────────

export const registration: BleDeviceConfig = {
	manufacturer: 'Audeze',
	handler: airohaBleHandler,
	filters: {
		namePrefix: 'Audeze Maxwell',
		services: ['5052494d-2dab-0341-6972-6f6861424c45']
	},
	gatt: {
		serviceUuid: '5052494d-2dab-0341-6972-6f6861424c45',
		txCharacteristicUuid: '43484152-2dab-3241-6972-6f6861424c45',
		rxCharacteristicUuid: '43484152-2dab-3141-6972-6f6861424c45'
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
