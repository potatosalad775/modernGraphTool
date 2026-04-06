//
// Copyright 2024 : Pragmatic Audio
//
// Walkplay HID device handler — ported from legacy walkplayHidHandler.js
//
// Many thanks to ma0shu for providing a dump
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult, UsbHidVendorConfig } from '../types.js';
import { WALKPLAY_FILTER_MAP } from '../utils/filter-type-maps.js';
import { computeWalkplayBiquad, biquadCoeffsToBytes } from '../utils/biquad.js';

const convertToFilterType = WALKPLAY_FILTER_MAP.fromCode;
const convertFromFilterType = WALKPLAY_FILTER_MAP.toCode;

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
// Byte conversion helper
// ---------------------------------------------------------------------------

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
		const coeffs = computeWalkplayBiquad(filter.freq, filter.gain, filter.q);
		const bArr = [...biquadCoeffsToBytes(coeffs)];

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

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const registration: UsbHidVendorConfig = {
	vendorIds: [0x3302, 0x0762, 0x35d8, 0x2fc6, 0x0104, 0xb445, 0x0661, 0x0666, 0x0d8c],
	manufacturer: 'WalkPlay',
	handler: walkplayHidHandler,
	defaultModelConfig: {
		minGain: -12,
		maxGain: 6,
		maxFilters: 8,
		schemeNo: 10,
		firstWritableEQSlot: -1,
		maxWritableEQSlots: 0,
		disconnectOnSave: false,
		disabledPresetId: -1,
		supportsPregain: true,
		supportsLSHSFilters: false,
		experimental: false,
		defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }],
		availableSlots: [{ id: 101, name: 'Custom' }]
	},
	devices: {
		'Old Fashioned': { manufacturer: 'Moondrop', handlerRef: 'moondrop-old-fashioned-hid', modelConfig: { minGain: -12, maxGain: 3, maxFilters: 5, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: false, disabledPresetId: -1, experimental: false, supportsLSHSFilters: false, supportsPregain: false, defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }], availableSlots: [{ id: 0, name: 'Custom' }] } },
		'FIIO FX17 ': { manufacturer: 'FiiO', handlerRef: 'fiio-usb-hid', modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, availableSlots: [{ id: 0, name: 'Jazz' }, { id: 1, name: 'Pop' }, { id: 2, name: 'Rock' }, { id: 3, name: 'Dance' }, { id: 4, name: 'R&B' }, { id: 5, name: 'Classic' }, { id: 6, name: 'Hip-hop' }, { id: 7, name: 'Monitor' }, { id: 160, name: 'USER1' }, { id: 161, name: 'USER2' }, { id: 162, name: 'USER3' }, { id: 163, name: 'USER4' }, { id: 164, name: 'USER5' }, { id: 165, name: 'USER6' }, { id: 166, name: 'USER7' }, { id: 167, name: 'USER8' }, { id: 168, name: 'USER9' }, { id: 169, name: 'USER10' }] } },
		'Rays': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid', supportsLSHSFilters: true, supportsPregain: true },
		'EPZ TP13 AI ENC audio': { manufacturer: 'EPZ', modelConfig: { supportsLSHSFilters: false, supportsPregain: true } },
		'Marigold': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid', modelConfig: { supportsLSHSFilters: false, supportsPregain: true } },
		'FreeDSP Pro': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid', supportsLSHSFilters: true, supportsPregain: true },
		'FreeDSP Mini': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid', supportsLSHSFilters: true, supportsPregain: true },
		'MOONRIVER 3': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid', supportsLSHSFilters: true, supportsPregain: false },
		'ddHiFi DSP IEM - Memory': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid' },
		'Quark2': { manufacturer: 'Moondrop' },
		'ECHO-A': { manufacturer: 'Moondrop' },
		'Truthear KEYX': { manufacturer: 'Truthear', handler: walkplayHidHandler, modelConfig: { minGain: -12, maxGain: 6, maxFilters: 8, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: false, disabledPresetId: -1, supportsPregain: true, supportsLSHSFilters: false, experimental: false, defaultIndex: 0x17, availableSlots: [{ id: 101, name: 'Custom' }] } },
		'Hi-MAX': { modelConfig: { experimental: false } },
		'BGVP MX1': { modelConfig: { schemeNo: 15, experimental: true } },
		'DT04': { manufacturer: 'LETSHUOER', modelConfig: { schemeNo: 15, experimental: true } },
		'MD-QT-042': { manufacturer: 'Moondrop', modelConfig: { schemeNo: 15, experimental: true } },
		'MOONDROP HiFi with PD': { manufacturer: 'Moondrop', modelConfig: { schemeNo: 15, experimental: true } },
		'DAWN PRO 2': { manufacturer: 'Moondrop', modelConfig: { schemeNo: 15, experimental: false } },
		'CS431XX': { modelConfig: { schemeNo: 15, experimental: true } },
		'ES9039 ': { modelConfig: { schemeNo: 15, experimental: true } },
		'TANCHJIM-STARGATE II': { manufacturer: 'Tanchim', modelConfig: { schemeNo: 15, supportsLSHSFilters: false } },
		'didiHiFi DSP Cable - Memory': { manufacturer: 'ddHifi', modelConfig: { schemeNo: 15, experimental: true } },
		'Dual CS43198': { modelConfig: { schemeNo: 15, experimental: true } },
		'ES9039 HiFi DSP Audio': { modelConfig: { schemeNo: 15, experimental: true } },
		'AE6': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
		'KM_HA03': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
		'TP35 Pro': { modelConfig: { schemeNo: 16, maxFilters: 10 } },
		'DA5': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
		'G303': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
		'HiFi DSP Audio with PD': { manufacturer: 'ddHifi', modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
		'Protocol Max': { manufacturer: 'CrinEar', modelConfig: { schemeNo: 16, maxFilters: 10, minGain: -10, maxGain: 10, autoGlobalGain: true, supportsLSHSFilters: true, supportsPregain: true, experimental: false } },
		'CS43198 HiFi DSP Audio': { modelConfig: { schemeNo: 11, maxFilters: 8, minGain: -10, maxGain: 10, autoGlobalGain: true, supportsLSHSFilters: true, supportsPregain: true, experimental: false } }
	},
	deviceGroups: {
		SchemeNo11: {
			productIds: [0x13d4, 0x98c0, 0x93d1, 0x13d7, 0x12c0, 0x1264, 0x43d1, 0x1266, 0x51c0, 0x13c1, 0x13d3, 0x1251, 0x1262, 0x1261, 0x12c1, 0x98d5],
			modelConfig: {
				supportsLSHSFilters: false,
				supportsPregain: true
			}
		},
		SchemeNo16: {
			productIds: [0x4380, 0x43b6, 0x43e1, 0x43d7, 0x43d8, 0x43e4, 0x98d4, 0x43c0, 0x43e8, 0xf808, 0xee10, 0x4352, 0xee20, 0x43c5, 0x43e6, 0x4351, 0x43de, 0x4358, 0x4359, 0x43db, 0x435a, 0x4355, 0x435c, 0x435d, 0x435e, 0x43ef, 0x43ec, 0x4361, 0x4363, 0x4366, 0x4364, 0x4360, 0x4382, 0x4383, 0x4386, 0x43c6, 0x43c7, 0x011d, 0x43c8, 0x43da, 0x43c9, 0x43ca, 0x43cc, 0x43cd, 0x43cf, 0x43b1, 0x43c2, 0x43b7, 0x43b8, 0x39c3],
			modelConfig: {
				schemeNo: 16,
				maxFilters: 10,
				minGain: -10,
				maxGain: 10,
				autoGlobalGain: false,
				supportsLSHSFilters: true,
				supportsPregain: true
			}
		}
	}
};
