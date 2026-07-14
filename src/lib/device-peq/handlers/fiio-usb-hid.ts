//
// Copyright 2024 : Pragmatic Audio
//
// FiiO USB HID handler — TypeScript port of the legacy fiioUsbHidHandler.js
// Shared logic for JadeAudio / SnowSky / FiiO devices.
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	PullResult,
	UsbHidVendorConfig
} from '../types.js';
import { FIIO_FILTER_MAP } from '../utils/filter-type-maps.js';
import {
	PEQ_FILTER_COUNT,
	PEQ_GLOBAL_GAIN,
	PEQ_FILTER_PARAMS,
	PEQ_PRESET_SWITCH,
	PEQ_SAVE_TO_DEVICE,
	SET_HEADER1,
	SET_HEADER2,
	GET_HEADER1,
	GET_HEADER2,
	END_HEADERS,
	toBytePair,
	splitUnsignedValue,
	combineBytes,
	fiioGainBytesFromValue,
	handleGain
} from '../utils/fiio-protocol.js';

const convertFromFilterType = FIIO_FILTER_MAP.toCode;
const convertToFilterType = FIIO_FILTER_MAP.fromCode;

// ── Report-ID helper ──────────────────────────────────────────────────────────

function getFiioReportId(deviceDetails: ConnectedDevice): number {
	if (
		deviceDetails &&
		deviceDetails.modelConfig &&
		deviceDetails.modelConfig.reportId !== undefined
	) {
		console.log(
			`Using reportId ${deviceDetails.modelConfig.reportId} from modelConfig for ${deviceDetails.model || 'unknown device'}`
		);
		return deviceDetails.modelConfig.reportId;
	}

	// Default reportId for FiiO devices is 7
	console.log(`Using default reportId 7 for ${deviceDetails.model || 'unknown device'}`);
	return 7;
}

// ── HID send helpers (SET / GET packets) ──────────────────────────────────────

async function setPeqParams(
	device: HIDDevice,
	filterIndex: number,
	fc: number,
	gain: number,
	q: number,
	filterType: number,
	reportId: number
): Promise<void> {
	const [frequencyLow, frequencyHigh] = splitUnsignedValue(fc);
	const [gainLow, gainHigh] = fiioGainBytesFromValue(gain);
	const qFactorValue = Math.round(q * 100);
	const [qFactorLow, qFactorHigh] = splitUnsignedValue(qFactorValue);

	const packet = [
		SET_HEADER1,
		SET_HEADER2,
		0,
		0,
		PEQ_FILTER_PARAMS,
		8,
		filterIndex,
		gainLow,
		gainHigh,
		frequencyLow,
		frequencyHigh,
		qFactorLow,
		qFactorHigh,
		filterType,
		0,
		END_HEADERS
	];

	const data = new Uint8Array(packet);
	console.log(
		`USB Device PEQ: setPeqParams() sending filter ${filterIndex} - Freq: ${fc}Hz, Gain: ${gain}dB, Q: ${q}, Type: ${filterType}`,
		data
	);
	await device.sendReport(reportId, data);
}

async function setPresetPeq(device: HIDDevice, presetId: number, reportId: number): Promise<void> {
	const packet = [SET_HEADER1, SET_HEADER2, 0, 0, PEQ_PRESET_SWITCH, 1, presetId, 0, END_HEADERS];

	const data = new Uint8Array(packet);
	console.log(`USB Device PEQ: setPresetPeq() switching to preset ${presetId}`, data);
	await device.sendReport(reportId, data);
}

async function setGlobalGain(device: HIDDevice, gain: number, reportId: number): Promise<void> {
	const globalGain = Math.round(gain * 10);
	const gainBytes = toBytePair(globalGain);

	const packet = [
		SET_HEADER1,
		SET_HEADER2,
		0,
		0,
		PEQ_GLOBAL_GAIN,
		2,
		gainBytes[1],
		gainBytes[0],
		0,
		END_HEADERS
	];

	const data = new Uint8Array(packet);
	console.log(`USB Device PEQ: setGlobalGain() setting global gain to ${gain}dB`, data);
	await device.sendReport(reportId, data);
}

async function setPeqCounter(device: HIDDevice, counter: number, reportId: number): Promise<void> {
	const packet = [SET_HEADER1, SET_HEADER2, 0, 0, PEQ_FILTER_COUNT, 1, counter, 0, END_HEADERS];

	const data = new Uint8Array(packet);
	console.log(`USB Device PEQ: setPeqCounter() setting filter count to ${counter}`, data);
	await device.sendReport(reportId, data);
}

function saveToDevice(device: HIDDevice, slotId: number, reportId: number): void {
	const packet = [SET_HEADER1, SET_HEADER2, 0, 0, PEQ_SAVE_TO_DEVICE, 1, slotId, 0, END_HEADERS];

	const data = new Uint8Array(packet);
	console.log(`USB Device PEQ: saveToDevice() using reportId ${reportId} for slot ${slotId}`, data);
	device.sendReport(reportId, data);
}

// ── HID send helpers (GET requests) ──────────────────────────────────────────

function getGlobalGain(device: HIDDevice, reportId: number): void {
	const packet = [GET_HEADER1, GET_HEADER2, 0, 0, PEQ_GLOBAL_GAIN, 0, 0, END_HEADERS];
	const data = new Uint8Array(packet);
	console.log('getGlobalGain() Send data:', data);
	device.sendReport(reportId, data);
}

function getPeqCounter(device: HIDDevice, reportId: number): void {
	const packet = [GET_HEADER1, GET_HEADER2, 0, 0, PEQ_FILTER_COUNT, 0, 0, END_HEADERS];
	const data = new Uint8Array(packet);
	console.log('getPeqCounter() Send data:', data);
	device.sendReport(reportId, data);
}

function getPeqParams(device: HIDDevice, filterIndex: number, reportId: number): void {
	const packet = [
		GET_HEADER1,
		GET_HEADER2,
		0,
		0,
		PEQ_FILTER_PARAMS,
		1,
		filterIndex,
		0,
		END_HEADERS
	];
	const data = new Uint8Array(packet);
	console.log('getPeqParams() Send data:', data);
	device.sendReport(reportId, data);
}

function getPresetPeq(device: HIDDevice, reportId: number): void {
	const packet = [GET_HEADER1, GET_HEADER2, 0, 0, PEQ_PRESET_SWITCH, 0, 0, END_HEADERS];
	const data = new Uint8Array(packet);
	console.log('getPresetPeq() Send data:', data);
	device.sendReport(reportId, data);
}

// ── Input-report response handlers ───────────────────────────────────────────

function handlePeqCounter(data: Uint8Array, device: HIDDevice, reportId: number): number {
	const peqCount = data[6];
	console.log('***********oninputreport peq counter=', peqCount);
	if (peqCount > 0) {
		processPeqCount(device, peqCount, reportId);
	}
	return peqCount;
}

function processPeqCount(device: HIDDevice, peqCount: number, reportId: number): void {
	console.log('PEQ Counter:', peqCount);

	// Fetch individual PEQ settings based on count
	for (let i = 0; i < peqCount; i++) {
		getPeqParams(device, i, reportId);
	}
}

function handlePeqParams(data: Uint8Array, device: HIDDevice, filters: DeviceFilter[]): void {
	const filter = data[6];
	const gain = handleGain(data[7], data[8]);
	const frequency = combineBytes(data[9], data[10]);
	const qFactor = combineBytes(data[11], data[12]) / 100 || 1;
	const filterType = convertToFilterType(data[13]);

	console.log(
		`Filter ${filter}: Gain=${gain}, Frequency=${frequency}, Q=${qFactor}, Type=${filterType}`
	);

	filters[filter] = {
		type: filterType,
		freq: frequency,
		q: qFactor,
		gain: gain,
		disabled: gain || frequency || qFactor ? false : true
	};
}

function handleEqPreset(data: Uint8Array, deviceDetails: ConnectedDevice): number {
	const presetId = data[6];
	console.log('EQ Preset ID:', presetId);

	if (presetId === deviceDetails.modelConfig.disabledPresetId) {
		return -1; // with JA11 slot 4 == Off
	}
	// Handle preset switch if necessary
	return presetId;
}

function savedEQ(data: Uint8Array, device: HIDDevice): void {
	const slotId = data[6];
	console.log('EQ Slot ID:', slotId);
	// Handle slot enablement if necessary
}

// ── Polling helper ────────────────────────────────────────────────────────────

function waitForFilters<T>(
	condition: () => boolean,
	device: HIDDevice,
	timeout: number,
	callback: (device: HIDDevice) => T
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			if (!condition()) {
				console.warn('Timeout reached before data returned?');
				reject(callback(device));
			} else {
				resolve(callback(device));
			}
		}, timeout);

		// Check every 100 milliseconds if everything is ready based on condition method
		const interval = setInterval(() => {
			if (condition()) {
				clearTimeout(timer);
				clearInterval(interval);
				resolve(callback(device));
			}
		}, 100);
	});
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const fiioUsbHidHandler: DeviceHandler = {
	async getCurrentSlot(deviceDetails: ConnectedDevice): Promise<number> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const reportId = getFiioReportId(deviceDetails);
		try {
			let currentSlot = -99;

			device.oninputreport = async (event: HIDInputReportEvent) => {
				const data = new Uint8Array(event.data.buffer);
				console.log(`USB Device PEQ: getCurrentSlot() onInputReport received data:`, data);
				if (data[0] === GET_HEADER1 && data[1] === GET_HEADER2) {
					switch (data[4]) {
						case PEQ_PRESET_SWITCH:
							currentSlot = handleEqPreset(data, deviceDetails);
							break;
						default:
							console.log('USB Device PEQ: Unhandled data type:', data[4], data);
					}
				}
			};

			getPresetPeq(device, reportId);

			// Wait at most 10 seconds for filters to be populated
			const result = await waitForFilters(
				() => {
					return currentSlot > -99;
				},
				device,
				10000,
				() => currentSlot
			);

			return result;
		} catch (error) {
			console.error('Failed to pull data from FiiO Device:', error);
			throw error;
		}
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		slot: number,
		preamp_gain: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		try {
			const device = deviceDetails.rawDevice as HIDDevice;
			const reportId = getFiioReportId(deviceDetails);

			// FiiO devices will automatically cut the max SPL by the maxGain (typically -12)
			// So, we can safely apply a +12 gain - the largest preamp_gain needed
			// e.g. if we need to +5dB for a filter then we can still make the globalGain 7dB
			await setGlobalGain(device, deviceDetails.modelConfig.maxGain + preamp_gain, reportId);
			const maxFilters = deviceDetails.modelConfig.maxFilters;
			const maxFiltersToUse = Math.min(filters.length, maxFilters);
			await setPeqCounter(device, maxFiltersToUse, reportId);
			await new Promise((resolve) => setTimeout(resolve, 100)); // Added 100ms delay

			for (let filterIdx = 0; filterIdx < maxFiltersToUse; filterIdx++) {
				const filter = filters[filterIdx];
				let gain = 0; // If disabled we still need to reset to 0 gain as previous gain value will
				// still be active
				if (!filter.disabled) {
					gain = filter.gain;
				}
				await setPeqParams(
					device,
					filterIdx,
					filter.freq,
					gain,
					filter.q,
					convertFromFilterType(filter.type),
					reportId
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 100)); // Added 100ms delay

			saveToDevice(device, slot, reportId);

			console.log('PEQ filters pushed successfully.');

			if (deviceDetails.modelConfig.disconnectOnSave) {
				return true; // Disconnect
			}
			return false;
		} catch (error) {
			console.error('Failed to push data to FiiO Device:', error);
			throw error;
		}
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, slot: number): Promise<PullResult> {
		try {
			const filters: DeviceFilter[] = [];
			let peqCount = 0;
			let globalGain = 0;
			let currentSlot = 0;
			const device = deviceDetails.rawDevice as HIDDevice;
			const reportId = getFiioReportId(deviceDetails);

			device.oninputreport = async (event: HIDInputReportEvent) => {
				const data = new Uint8Array(event.data.buffer);
				console.log(`USB Device PEQ: pullFromDevice() onInputReport received data:`, data);
				if (data[0] === GET_HEADER1 && data[1] === GET_HEADER2) {
					switch (data[4]) {
						case PEQ_FILTER_COUNT:
							peqCount = handlePeqCounter(data, device, reportId);
							break;
						case PEQ_FILTER_PARAMS:
							handlePeqParams(data, device, filters);
							break;
						case PEQ_GLOBAL_GAIN:
							globalGain = handleGain(data[6], data[7]);
							console.log(`USB Device PEQ: Global gain received: ${globalGain}dB`);
							break;
						case PEQ_PRESET_SWITCH:
							currentSlot = handleEqPreset(data, deviceDetails);
							break;
						case PEQ_SAVE_TO_DEVICE:
							savedEQ(data, device);
							break;
						default:
							console.log('USB Device PEQ: Unhandled data type:', data[4], data);
					}
				}
			};

			getPresetPeq(device, reportId);
			getPeqCounter(device, reportId);
			getGlobalGain(device, reportId);

			// Wait at most 10 seconds for filters to be populated
			const result = await waitForFilters(
				() => {
					return filters.length === peqCount;
				},
				device,
				10000,
				() => ({
					filters: filters,
					globalGain: globalGain
				})
			);

			return result;
		} catch (error) {
			console.error('Failed to pull data from FiiO Device:', error);
			throw error;
		}
	},

	async enablePEQ(deviceDetails: ConnectedDevice, enable: boolean, slotId: number): Promise<void> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const reportId = getFiioReportId(deviceDetails);

		if (enable) {
			// take the slotId we are given and switch to it
			await setPresetPeq(device, slotId, reportId);
		} else {
			await setPresetPeq(device, deviceDetails.modelConfig.maxFilters, reportId);
		}
	}
};

// ── Registration ──────────────────────────────────────────────────────────────

const FIIO_DEFAULT_SLOTS = [
	{ id: 0, name: 'Jazz' },
	{ id: 1, name: 'Pop' },
	{ id: 2, name: 'Rock' },
	{ id: 3, name: 'Dance' },
	{ id: 4, name: 'R&B' },
	{ id: 5, name: 'Classic' },
	{ id: 6, name: 'Hip-hop' },
	{ id: 7, name: 'Monitor' },
	{ id: 160, name: 'USER1' },
	{ id: 161, name: 'USER2' },
	{ id: 162, name: 'USER3' },
	{ id: 163, name: 'USER4' },
	{ id: 164, name: 'USER5' },
	{ id: 165, name: 'USER6' },
	{ id: 166, name: 'USER7' },
	{ id: 167, name: 'USER8' },
	{ id: 168, name: 'USER9' },
	{ id: 169, name: 'USER10' }
];

const FIIO_KA17_SLOTS = [
	{ id: 0, name: 'Jazz' },
	{ id: 1, name: 'Pop' },
	{ id: 2, name: 'Rock' },
	{ id: 3, name: 'Dance' },
	{ id: 5, name: 'R&B' },
	{ id: 6, name: 'Classic' },
	{ id: 7, name: 'Hip-hop' },
	{ id: 4, name: 'USER1' },
	{ id: 8, name: 'USER2' },
	{ id: 9, name: 'USER3' }
];

export const registration: UsbHidVendorConfig = {
	vendorIds: [0x2972, 0x0a12],
	manufacturer: 'FiiO',
	handler: fiioUsbHidHandler,
	defaultModelConfig: {
		minGain: -12,
		maxGain: 12,
		maxFilters: 5,
		firstWritableEQSlot: -1,
		maxWritableEQSlots: 0,
		disconnectOnSave: true,
		disabledPresetId: -1,
		experimental: true,
		supportsLSHSFilters: true,
		supportsPregain: true,
		defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }],
		reportId: 7,
		availableSlots: FIIO_DEFAULT_SLOTS
	},
	devices: {
		'FIIO QX13': { modelConfig: { maxFilters: 10, experimental: false, disconnectOnSave: false } },
		'SNOWSKY Melody': {
			manufacturer: 'FiiO',
			handler: fiioUsbHidHandler,
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: -1,
				maxWritableEQSlots: 0,
				disconnectOnSave: true
			}
		},
		'JadeAudio JIEZI': {
			manufacturer: 'FiiO',
			handler: fiioUsbHidHandler,
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: 3,
				maxWritableEQSlots: 1,
				disconnectOnSave: true,
				disabledPresetId: 4,
				experimental: false,
				reportId: 2
			}
		},
		'JadeAudio JA11': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: 3,
				maxWritableEQSlots: 1,
				disconnectOnSave: true,
				disabledPresetId: 4,
				experimental: false,
				reportId: 2,
				availableSlots: [
					{ id: 0, name: 'Vocal' },
					{ id: 1, name: 'Classic' },
					{ id: 2, name: 'Bass' },
					{ id: 3, name: 'USER1' }
				]
			}
		},
		'FIIO KA17': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				reportId: 1,
				availableSlots: FIIO_KA17_SLOTS
			}
		},
		'FIIO Q7': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				reportId: 1,
				availableSlots: FIIO_KA17_SLOTS
			}
		},
		'FIIO KA17 (MQA HID)': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				reportId: 1,
				availableSlots: FIIO_KA17_SLOTS
			}
		},
		'FIIO BT11 (UAC1.0)': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				reportId: 1,
				availableSlots: FIIO_KA17_SLOTS
			}
		},
		'FIIO Air Link': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				reportId: 1,
				availableSlots: FIIO_KA17_SLOTS
			}
		},
		'FIIO BTR13': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 12,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 7, name: 'USER1' },
					{ id: 8, name: 'USER2' },
					{ id: 9, name: 'USER3' }
				]
			}
		},
		BTR17: {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false
			}
		},
		'FIIO KA15': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 3,
				disconnectOnSave: false,
				disabledPresetId: 11,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 7, name: 'USER1' },
					{ id: 8, name: 'USER2' },
					{ id: 9, name: 'USER3' }
				]
			}
		},
		'LS-TC2': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: 3,
				maxWritableEQSlots: 1,
				disconnectOnSave: true,
				disabledPresetId: 11,
				experimental: true,
				availableSlots: [
					{ id: 0, name: 'Vocal' },
					{ id: 1, name: 'Classic' },
					{ id: 2, name: 'Bass' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 160, name: 'USER1' }
				]
			}
		},
		'FIIO K13 R2R': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 160,
				maxWritableEQSlots: 10,
				disconnectOnSave: false,
				disabledPresetId: 240,
				experimental: false,
				reportId: 1,
				availableSlots: [
					{ id: 240, name: 'BYPASS' },
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 8, name: 'Retro' },
					{ id: 9, name: 'sDamp-1' },
					{ id: 10, name: 'sDamp-2' },
					{ id: 160, name: 'USER1' },
					{ id: 161, name: 'USER2' },
					{ id: 162, name: 'USER3' },
					{ id: 163, name: 'USER4' },
					{ id: 164, name: 'USER5' },
					{ id: 165, name: 'USER6' },
					{ id: 166, name: 'USER7' },
					{ id: 167, name: 'USER8' },
					{ id: 168, name: 'USER9' },
					{ id: 169, name: 'USER10' }
				]
			}
		},
		'FIIO BR15 R2R': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 160,
				maxWritableEQSlots: 10,
				disconnectOnSave: false,
				disabledPresetId: 240,
				experimental: false,
				availableSlots: [
					{ id: 240, name: 'BYPASS' },
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 8, name: 'Retro' },
					{ id: 9, name: 'sDamp-1' },
					{ id: 10, name: 'sDamp-2' },
					{ id: 160, name: 'USER1' },
					{ id: 161, name: 'USER2' },
					{ id: 162, name: 'USER3' },
					{ id: 163, name: 'USER4' },
					{ id: 164, name: 'USER5' },
					{ id: 165, name: 'USER6' },
					{ id: 166, name: 'USER7' },
					{ id: 167, name: 'USER8' },
					{ id: 168, name: 'USER9' },
					{ id: 169, name: 'USER10' }
				]
			}
		},
		'FIIO FP3': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 160,
				maxWritableEQSlots: 1,
				disconnectOnSave: false,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 160, name: 'USER1' }
				]
			}
		},
		'FIIO FG3': {
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 10,
				firstWritableEQSlot: 160,
				maxWritableEQSlots: 10,
				disconnectOnSave: false,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 12, name: 'Cinema' },
					{ id: 13, name: 'FPS' },
					{ id: 14, name: 'MOBA' },
					{ id: 15, name: 'ACT' },
					{ id: 16, name: 'MUG' },
					{ id: 160, name: 'USER1' },
					{ id: 161, name: 'USER2' },
					{ id: 162, name: 'USER3' },
					{ id: 163, name: 'USER4' },
					{ id: 164, name: 'USER5' },
					{ id: 165, name: 'USER6' },
					{ id: 166, name: 'USER7' },
					{ id: 167, name: 'USER8' },
					{ id: 168, name: 'USER9' },
					{ id: 169, name: 'USER10' }
				]
			}
		},
		'SNOWSKY TINY A': {
			manufacturer: 'FiiO',
			handler: fiioUsbHidHandler,
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: 160,
				maxWritableEQSlots: 3,
				disconnectOnSave: true,
				disabledPresetId: 240,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 160, name: 'USER1' },
					{ id: 161, name: 'USER2' },
					{ id: 162, name: 'USER3' },
					{ id: 240, name: 'Close EQ' }
				]
			}
		},
		'SNOWSKY TINY B': {
			manufacturer: 'FiiO',
			handler: fiioUsbHidHandler,
			modelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: 160,
				maxWritableEQSlots: 3,
				disconnectOnSave: true,
				disabledPresetId: 240,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Jazz' },
					{ id: 1, name: 'Pop' },
					{ id: 2, name: 'Rock' },
					{ id: 3, name: 'Dance' },
					{ id: 4, name: 'R&B' },
					{ id: 5, name: 'Classic' },
					{ id: 6, name: 'Hip-hop' },
					{ id: 160, name: 'USER1' },
					{ id: 161, name: 'USER2' },
					{ id: 162, name: 'USER3' },
					{ id: 240, name: 'Close EQ' }
				]
			}
		}
	}
};
