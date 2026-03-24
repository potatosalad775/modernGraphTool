//
// Copyright 2024 : Pragmatic Audio
//
// Walkplay HID device handler — ported from legacy walkplayHidHandler.js
//
// Many thanks to ma0shu for providing a dump
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult } from '../types.js';

const REPORT_ID = 0x4b;
const ALT_REPORT_ID = 0x3c;
const READ = 0x80;
const WRITE = 0x01;
const END = 0x00;

const CMD = {
	PEQ_VALUES: 0x09,
	VERSION: 0x0c,
	TEMP_WRITE: 0x0a,
	FLASH_EQ: 0x01,
	GET_SLOT: 0x0f,
	GLOBAL_GAIN: 0x03
} as const;

const DEFAULT_FILTER_COUNT = 8;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function sendReport(hidDevice: HIDDevice, reportId: number, packet: number[]): Promise<void> {
	if (!hidDevice) throw new Error('Device not connected.');
	const data = new Uint8Array(packet);
	console.log(`USB Device PEQ: Walkplay sending report (ID: ${reportId}):`, data);
	await hidDevice.sendReport(reportId, data);
}

async function waitForResponse(hidDevice: HIDDevice, timeout = 2000): Promise<Uint8Array> {
	return new Promise<Uint8Array>((resolve, reject) => {
		const timer = setTimeout(() => {
			console.log(`USB Device PEQ: Walkplay timeout waiting for response after ${timeout}ms`);
			reject(new Error('Timeout waiting for HID response'));
		}, timeout);

		hidDevice.oninputreport = (event: HIDInputReportEvent) => {
			clearTimeout(timer);
			const response = new Uint8Array(event.data.buffer);
			console.log('USB Device PEQ: Walkplay received response:', response);
			resolve(response);
		};
	});
}

async function readGlobalGain(hidDevice: HIDDevice): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const request = new Uint8Array([READ, CMD.GLOBAL_GAIN, 0x00]);

		const timeout = setTimeout(() => {
			hidDevice.removeEventListener('inputreport', onReport);
			reject(new Error('Timeout reading global gain'));
		}, 100);

		const onReport = (event: HIDInputReportEvent) => {
			const data = new Uint8Array(event.data.buffer);
			console.log('USB Device PEQ: Walkplay onInputReport received global gain data:', data);
			clearTimeout(timeout);
			hidDevice.removeEventListener('inputreport', onReport);
			if (data[0] !== READ || data[1] !== CMD.GLOBAL_GAIN) return;
			const int8 = new Int8Array([data[4]])[0];
			console.log(`USB Device PEQ: Walkplay global gain value: ${int8}`);
			resolve(int8);
		};

		hidDevice.addEventListener('inputreport', onReport as EventListener);
		console.log('USB Device PEQ: Walkplay sending readGlobalGain command:', request);
		hidDevice.sendReport(REPORT_ID, request);
	});
}

async function writeGlobalGain(hidDevice: HIDDevice, value: number): Promise<void> {
	const gainValue = Math.round(value);
	const request = new Uint8Array([WRITE, CMD.GLOBAL_GAIN, 0x02, 0x00, gainValue]);
	console.log('USB Device PEQ: Walkplay sending writeGlobalGain command:', request);
	await hidDevice.sendReport(REPORT_ID, request);
}

function convertToFilterType(byte: number): DeviceFilter['type'] {
	switch (byte) {
		case 1:
			return 'LSQ';
		case 2:
			return 'PK';
		case 3:
			return 'HSQ';
		default:
			return 'PK';
	}
}

function convertFromFilterType(filterType: DeviceFilter['type']): number {
	const mapping: Record<string, number> = { PK: 2, LSQ: 1, HSQ: 3 };
	return mapping[filterType] ?? 2;
}

interface ParsedFilter extends DeviceFilter {
	filterIndex: number;
}

function parseFilterPacket(packet: Uint8Array): ParsedFilter {
	if (packet.length < 32) {
		throw new Error('Packet too short to contain filter data.');
	}

	const filterIndex = packet[4];

	// Frequency (little-endian 16-bit)
	const freq = packet[27] | (packet[28] << 8);

	// Q factor (8.8 fixed-point)
	const qRaw = packet[29] | (packet[30] << 8);
	const q = Math.round((qRaw / 256) * 10) / 10;

	// Gain (8.8 fixed-point signed)
	let gainRaw = packet[31] | (packet[32] << 8);
	if (gainRaw > 32767) gainRaw -= 65536;
	const gain = Math.round((gainRaw / 256) * 10) / 10;

	// Filter type
	const type = convertToFilterType(packet[33]);

	return {
		filterIndex,
		freq,
		q,
		gain,
		type,
		disabled: !(freq || q || gain)
	};
}

// ---------------------------------------------------------------------------
// IIR biquad computation helpers
// ---------------------------------------------------------------------------

function quantizer(dArr: number[], dArr2: number[]): number[] {
	const iArr = dArr.map((d) => Math.round(d * 1073741824));
	const iArr2 = dArr2.map((d) => Math.round(d * 1073741824));
	return [iArr2[0], iArr2[1], iArr2[2], -iArr[1], -iArr[2]];
}

function computeIIRFilter(_index: number, freq: number, gain: number, q: number): number[] {
	const bArr = new Array<number>(20).fill(0);
	const sqrt = Math.sqrt(Math.pow(10, gain / 20));
	const d3 = (freq * 6.283185307179586) / 96000;
	const sin = Math.sin(d3) / (2 * q);
	const d4 = sin * sqrt;
	const d5 = sin / sqrt;
	const d6 = d5 + 1;

	const quantizerData = quantizer(
		[1, (Math.cos(d3) * -2) / d6, (1 - d5) / d6],
		[(d4 + 1) / d6, (Math.cos(d3) * -2) / d6, (1 - d4) / d6]
	);

	let index = 0;
	for (const value of quantizerData) {
		bArr[index] = value & 0xff;
		bArr[index + 1] = (value >> 8) & 0xff;
		bArr[index + 2] = (value >> 16) & 0xff;
		bArr[index + 3] = (value >> 24) & 0xff;
		index += 4;
	}

	return bArr;
}

function convertToByteArray(value: number, length: number): number[] {
	const arr: number[] = [];
	for (let i = 0; i < length; i++) {
		arr.push((value >> (8 * i)) & 0xff);
	}
	return arr;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WaitResult {
	filters: (ParsedFilter | undefined)[];
	globalGain: number;
	currentSlot: number;
	complete: boolean;
	receivedCount?: number;
	expectedCount?: number;
}

function waitForFilters(
	condition: () => boolean,
	hidDevice: HIDDevice,
	timeout: number,
	callback: () => WaitResult
): Promise<WaitResult> {
	return new Promise<WaitResult>((resolve) => {
		const timer = setTimeout(() => {
			clearInterval(interval);
			if (!condition()) {
				console.warn('Timeout: Filters not fully received.');
				const result = callback();
				result.complete = false;
				result.receivedCount = result.filters.filter((f) => f !== undefined).length;
				resolve(result);
			} else {
				const result = callback();
				result.complete = true;
				resolve(result);
			}
		}, timeout);

		const interval = setInterval(() => {
			if (condition()) {
				clearTimeout(timer);
				clearInterval(interval);
				const result = callback();
				result.complete = true;
				resolve(result);
			}
		}, 100);
	});
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

async function getCurrentSlot(device: ConnectedDevice): Promise<number> {
	const hidDevice = device.rawDevice as HIDDevice;
	if (!hidDevice) throw new Error('Device not connected.');

	// Get the version number first
	await sendReport(hidDevice, REPORT_ID, [READ, CMD.VERSION, END]);
	let response = await waitForResponse(hidDevice);
	const versionBytes = response.slice(3, 6);
	const version = String.fromCharCode(...versionBytes);

	console.log('USB Device PEQ: Walkplay firmware version:', version);
	const versionNumber = parseFloat(version);

	if (isNaN(versionNumber)) {
		console.warn('Could not parse firmware version:', versionNumber);
		device.version = null;
		return -1;
	}

	// Save version number to device
	device.version = versionNumber;

	console.log('Fetching current EQ slot...');

	await sendReport(hidDevice, REPORT_ID, [READ, CMD.PEQ_VALUES, END]);
	response = await waitForResponse(hidDevice);
	const slot = response ? response[35] : -1;

	console.log('Walkplay current EQ slot:', slot);
	return slot;
}

async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	preamp: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	const hidDevice = device.rawDevice as HIDDevice;
	if (!hidDevice) throw new Error('Device not connected.');
	console.log('Pushing PEQ settings...');

	const useAltReport = false;

	for (let i = 0; i < filters.length; i++) {
		const filter = filters[i];
		const bArr = computeIIRFilter(i, filter.freq, filter.gain, filter.q);

		const packet = [
			WRITE,
			CMD.PEQ_VALUES,
			0x18,
			0x00,
			i,
			0x00,
			0x00,
			...bArr,
			...convertToByteArray(filter.freq, 2),
			...convertToByteArray(Math.round(filter.q * 256), 2),
			...convertToByteArray(Math.round(filter.gain * 256), 2),
			convertFromFilterType(filter.type),
			0x00,
			device.modelConfig?.defaultIndex !== undefined ? device.modelConfig.defaultIndex : slot,
			END
		];

		await sendReport(hidDevice, useAltReport ? ALT_REPORT_ID : REPORT_ID, packet);
	}

	// Write the global gain
	await writeGlobalGain(hidDevice, preamp);
	console.log(`USB Device PEQ: Walkplay set global gain to ${preamp}`);

	await sendReport(hidDevice, REPORT_ID, [WRITE, CMD.TEMP_WRITE, 0x04, 0x00, 0x00, 0xff, 0xff, END]);
	await sendReport(hidDevice, REPORT_ID, [WRITE, CMD.FLASH_EQ, 0x01, END]);

	console.log('PEQ filters successfully pushed to Walkplay device.');
	return true;
}

async function pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult> {
	const hidDevice = device.rawDevice as HIDDevice;
	if (!hidDevice) throw new Error('Device not connected.');

	const filters: (ParsedFilter | undefined)[] = [];
	let currentSlot = -1;

	hidDevice.oninputreport = (event: HIDInputReportEvent) => {
		const data = new Uint8Array(event.data.buffer);
		console.log('USB Device PEQ: Walkplay pullFromDevice onInputReport received data:', data);

		if (data.length >= 32) {
			const filter = parseFilterPacket(data);
			console.log(`USB Device PEQ: Walkplay parsed filter ${filter.filterIndex}:`, filter);
			filters[filter.filterIndex] = filter;
		}

		if (data.length >= 37) {
			currentSlot = data[35];
			console.log(`USB Device PEQ: Walkplay parsed current slot: ${currentSlot}`);
		}
	};

	const maxFilters = device.modelConfig.maxFilters;

	// Send requests for each filter with delay
	for (let i = 0; i < maxFilters; i++) {
		await sendReport(hidDevice, REPORT_ID, [READ, CMD.PEQ_VALUES, 0x00, 0x00, i, END]);
		await delay(50);
	}

	// Wait a bit after sending all requests
	await delay(100);

	// Wait for filters with timeout
	const result = await waitForFilters(
		() => filters.filter((f) => f !== undefined).length === maxFilters,
		hidDevice,
		10000,
		() => ({
			filters,
			globalGain: 0,
			currentSlot,
			complete: false
		})
	);

	hidDevice.oninputreport = null;

	// Read global gain after collecting filters
	let globalGain = 0;
	try {
		globalGain = await readGlobalGain(hidDevice);
		console.log(`USB Device PEQ: Walkplay read global gain: ${globalGain}dB`);
	} catch (error) {
		console.warn(`USB Device PEQ: Walkplay failed to read global gain: ${error}`);
	}

	// Build PullResult — strip filterIndex from parsed filters
	const deviceFilters: DeviceFilter[] = [];
	for (let i = 0; i < maxFilters; i++) {
		const f = filters[i];
		if (f) {
			deviceFilters.push({
				type: f.type,
				freq: f.freq,
				q: f.q,
				gain: f.gain,
				disabled: f.disabled
			});
		} else {
			// Placeholder for missing filters
			deviceFilters.push({ type: 'PK', freq: 0, q: 0, gain: 0, disabled: true });
		}
	}

	console.log('Pulled PEQ filters from Walkplay:', deviceFilters);
	return { filters: deviceFilters, globalGain };
}

async function enablePEQ(device: ConnectedDevice, enabled: boolean, slotId: number): Promise<void> {
	const hidDevice = device.rawDevice as HIDDevice;
	if (!enabled) {
		slotId = 0x00;
	}
	const packet = [WRITE, CMD.FLASH_EQ, enabled ? 1 : 0, slotId, END];
	await sendReport(hidDevice, REPORT_ID, packet);
}

// ---------------------------------------------------------------------------
// Exported handler
// ---------------------------------------------------------------------------

export const walkplayHidHandler: DeviceHandler = {
	getCurrentSlot,
	pushToDevice,
	pullFromDevice,
	enablePEQ
};
