//
// Copyright 2024 : Pragmatic Audio
//
// KTMicro USB HID handler — TypeScript port of the legacy ktmicroUsbHidHandler.js
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	DeviceFilterType,
	PullResult
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const REPORT_ID = 0x4b;
const COMMAND_READ = 0x52;
const COMMAND_WRITE = 0x57;
const COMMAND_COMMIT = 0x53;
const COMMAND_CLEAR = 0x43;

// ── Packet builders ───────────────────────────────────────────────────────────

function buildReadPacket(fieldId: number): Uint8Array {
	return new Uint8Array([fieldId, 0, 0, 0, COMMAND_READ, 0, 0, 0, 0]);
}

function buildEnableEQPacket(slotId: number): Uint8Array {
	return new Uint8Array([0x24, 0, 0, 0, COMMAND_WRITE, 0, slotId, 0, 0, 0]);
}

function buildReadEQPacket(): Uint8Array {
	return new Uint8Array([0x24, 0, 0, 0, COMMAND_READ, 0, 0x03, 0, 0, 0]);
}

function buildWriteGlobalPacket(value: number): Uint8Array {
	// value is a signed byte for pregain
	const signedByte = value < 0 ? value + 256 : value;
	return new Uint8Array([0x66, 0, 0, 0, COMMAND_WRITE, 0, signedByte, 0, 0, 0]);
}

function buildReadGlobalPacket(): Uint8Array {
	return new Uint8Array([0x66, 0, 0, 0, COMMAND_READ, 0, 0, 0, 0]);
}

function buildWriteGainFreqPacket(
	filterIndex: number,
	gain: number,
	freq: number,
	compensate2X: boolean
): Uint8Array {
	const fieldId = 0x26 + filterIndex * 2;
	const adjustedFreq = compensate2X ? Math.round(freq / 2) : freq;
	// gain is signed 16-bit value (gain * 10)
	const gainRaw = Math.round(gain * 10);
	const gainSigned = gainRaw < 0 ? gainRaw + 65536 : gainRaw;
	const gainLow = gainSigned & 0xff;
	const gainHigh = (gainSigned >> 8) & 0xff;
	const freqLow = adjustedFreq & 0xff;
	const freqHigh = (adjustedFreq >> 8) & 0xff;

	return new Uint8Array([
		fieldId, 0, 0, 0, COMMAND_WRITE, 0,
		gainLow, gainHigh,
		freqLow, freqHigh
	]);
}

function buildWriteQPacket(
	filterIndex: number,
	q: number,
	filterType: DeviceFilterType
): Uint8Array {
	const fieldId = 0x26 + filterIndex * 2 + 1;
	const qRaw = Math.round(q * 1000);
	const qLow = qRaw & 0xff;
	const qHigh = (qRaw >> 8) & 0xff;
	const typeCode = convertFromFilterType(filterType);

	return new Uint8Array([
		fieldId, 0, 0, 0, COMMAND_WRITE, 0,
		qLow, qHigh,
		typeCode, 0
	]);
}

function buildCommitPacket(): Uint8Array {
	return new Uint8Array([0, 0, 0, 0, COMMAND_COMMIT, 0, 0, 0, 0]);
}

// ── Decode helpers ────────────────────────────────────────────────────────────

function decodeGainFreqResponse(
	data: Uint8Array,
	compensate2X: boolean
): { gain: number; freq: number } {
	// gain is signed 16-bit at bytes [6,7]
	const gainRaw = data[6] | (data[7] << 8);
	const gain = gainRaw > 32767 ? (gainRaw - 65536) / 10 : gainRaw / 10;

	let freq = data[8] | (data[9] << 8);
	if (compensate2X) {
		freq = freq * 2;
	}

	return { gain, freq };
}

function decodeQResponse(data: Uint8Array): { q: number; type: DeviceFilterType } {
	const qRaw = data[6] | (data[7] << 8);
	const q = qRaw / 1000;
	const typeCode = data[8];
	const type = convertToFilterType(typeCode);

	return { q, type };
}

// ── Filter-type converters ────────────────────────────────────────────────────

function convertToFilterType(code: number): DeviceFilterType {
	switch (code) {
		case 3:
			return 'LSQ';
		case 0:
			return 'PK';
		case 4:
			return 'HSQ';
		default:
			return 'PK';
	}
}

function convertFromFilterType(filterType: DeviceFilterType): number {
	const mapping: Record<DeviceFilterType, number> = { PK: 0, LSQ: 3, HSQ: 4 };
	return mapping[filterType] ?? 0;
}

// ── HID communication helpers ─────────────────────────────────────────────────

function waitForReport(
	device: HIDDevice,
	matchFieldId: number,
	timeout: number
): Promise<Uint8Array> {
	return new Promise<Uint8Array>((resolve, reject) => {
		const timer = setTimeout(() => {
			device.removeEventListener('inputreport', onReport);
			reject(new Error(`Timeout waiting for response to field 0x${matchFieldId.toString(16)}`));
		}, timeout);

		const onReport = (event: HIDInputReportEvent): void => {
			const data = new Uint8Array(event.data.buffer);
			if (data[0] === matchFieldId) {
				clearTimeout(timer);
				device.removeEventListener('inputreport', onReport);
				resolve(data);
			}
		};

		device.addEventListener('inputreport', onReport);
	});
}

async function readFullFilter(
	device: HIDDevice,
	filterIndex: number,
	compensate2X: boolean
): Promise<DeviceFilter> {
	const gainFreqFieldId = 0x26 + filterIndex * 2;
	const qFieldId = gainFreqFieldId + 1;

	// Send both read requests
	const gainFreqPromise = waitForReport(device, gainFreqFieldId, 5000);
	const qPromise = waitForReport(device, qFieldId, 5000);

	const gainFreqPacket = buildReadPacket(gainFreqFieldId);
	const qPacket = buildReadPacket(qFieldId);

	await device.sendReport(REPORT_ID, gainFreqPacket);
	await device.sendReport(REPORT_ID, qPacket);

	const [gainFreqData, qData] = await Promise.all([gainFreqPromise, qPromise]);

	const { gain, freq } = decodeGainFreqResponse(gainFreqData, compensate2X);
	const { q, type } = decodeQResponse(qData);

	return {
		type,
		freq,
		q,
		gain,
		disabled: gain === 0 && freq === 0
	};
}

async function readPregain(device: HIDDevice): Promise<number> {
	const promise = waitForReport(device, 0x66, 5000);
	const packet = buildReadGlobalPacket();
	await device.sendReport(REPORT_ID, packet);
	const data = await promise;

	// data[6] as signed byte
	const raw = data[6];
	return raw > 127 ? raw - 256 : raw;
}

async function writePregain(device: HIDDevice, value: number): Promise<void> {
	const packet = buildWriteGlobalPacket(value);
	await device.sendReport(REPORT_ID, packet);
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const ktmicroUsbHidHandler: DeviceHandler = {
	async getCurrentSlot(deviceDetails: ConnectedDevice): Promise<number> {
		const device = deviceDetails.rawDevice as HIDDevice;

		const promise = waitForReport(device, 0x24, 5000);
		const packet = buildReadEQPacket();
		await device.sendReport(REPORT_ID, packet);
		const data = await promise;

		return data[6];
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, _slot: number): Promise<PullResult> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const compensate2X = deviceDetails.modelConfig.compensate2X ?? false;
		const maxFilters = deviceDetails.modelConfig.maxFilters;
		const filters: DeviceFilter[] = [];

		for (let i = 0; i < maxFilters; i++) {
			const filter = await readFullFilter(device, i, compensate2X);
			filters.push(filter);
		}

		let globalGain = 0;
		if (deviceDetails.modelConfig.supportsPregain) {
			globalGain = await readPregain(device);
		}

		return { filters, globalGain };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const compensate2X = deviceDetails.modelConfig.compensate2X ?? false;
		const maxFilters = deviceDetails.modelConfig.maxFilters;

		// Check if PEQ is disabled and enable if needed
		const currentSlot = await ktmicroUsbHidHandler.getCurrentSlot(deviceDetails);
		if (currentSlot === deviceDetails.modelConfig.disabledPresetId) {
			await ktmicroUsbHidHandler.enablePEQ(deviceDetails, true, slot);
		}

		// Write each filter
		const filtersToWrite = Math.min(filters.length, maxFilters);
		for (let i = 0; i < filtersToWrite; i++) {
			const filter = filters[i];
			const gain = filter.disabled ? 0 : filter.gain;

			const gainFreqPacket = buildWriteGainFreqPacket(i, gain, filter.freq, compensate2X);
			await device.sendReport(REPORT_ID, gainFreqPacket);

			const qPacket = buildWriteQPacket(i, filter.q, filter.type);
			await device.sendReport(REPORT_ID, qPacket);
		}

		// Write pregain if supported
		if (deviceDetails.modelConfig.supportsPregain) {
			await writePregain(device, preamp);
		}

		// Send commit
		const commitPacket = buildCommitPacket();
		await device.sendReport(REPORT_ID, commitPacket);

		console.log('KTMicro: PEQ filters pushed successfully.');

		return deviceDetails.modelConfig.disconnectOnSave;
	},

	async enablePEQ(
		deviceDetails: ConnectedDevice,
		enabled: boolean,
		slotId: number
	): Promise<void> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const targetSlot = enabled ? slotId : deviceDetails.modelConfig.disabledPresetId;
		const packet = buildEnableEQPacket(targetSlot);
		await device.sendReport(REPORT_ID, packet);
	}
};
