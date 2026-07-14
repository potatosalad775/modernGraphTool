//
// Copyright 2024 : Pragmatic Audio
//
// Qudelix USB HID handler — TypeScript port of the legacy qudelixUsbHidHandler.js
// NOTE: This handler is experimental.
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	DeviceFilterType,
	PullResult
} from '../types.js';

// ── HID Report IDs ────────────────────────────────────────────────────────────

const HID_REPORT_ID = {
	DATA_TRANSFER: 1,
	RESPONSE: 2,
	COMMAND: 3,
	CONTROL: 4,
	QX_OUT: 7,
	QX_HOST_TO_DEVICE: 8,
	QX_DEVICE_TO_HOST: 9
} as const;

// ── Qudelix filter-type codes ─────────────────────────────────────────────────

const FILTER_TYPES = {
	BYPASS: 0,
	LPF: 7,
	HPF: 8,
	PEQ: 13,
	LS: 10,
	HS: 11
} as const;

// ── Application command codes ─────────────────────────────────────────────────

const APP_CMD = {
	ReqInitData: 0x0001,
	ReqDevConfig: 0x0003,
	ReqEqPreset: 0x0004,
	SetEqEnable: 0x0102,
	SetEqPreGain: 0x0105,
	SetEqGain: 0x0106,
	SetEqFilter: 0x0107,
	SetEqFreq: 0x0108,
	SetEqQ: 0x0109,
	SaveEqPreset: 0x0202
} as const;

// ── Filter-type converters ────────────────────────────────────────────────────

function mapFilterTypeToQudelix(filterType: DeviceFilterType): number {
	switch (filterType) {
		case 'LSQ':
			return FILTER_TYPES.LS;
		case 'HSQ':
			return FILTER_TYPES.HS;
		case 'PK':
		default:
			return FILTER_TYPES.PEQ;
	}
}

function mapQudelixToFilterType(code: number): DeviceFilterType {
	switch (code) {
		case FILTER_TYPES.LS:
			return 'LSQ';
		case FILTER_TYPES.HS:
			return 'HSQ';
		case FILTER_TYPES.PEQ:
		default:
			return 'PK';
	}
}

// ── HID report initialization ─────────────────────────────────────────────────

interface HidReportInfo {
	hostToDevice: number | null;
	deviceToHost: number | null;
}

function initHidReports(device: HIDDevice): HidReportInfo {
	const result: HidReportInfo = {
		hostToDevice: null,
		deviceToHost: null
	};

	if (!device.collections) return result;

	for (const collection of device.collections) {
		// Look for vendor-defined usage page (0xFF00)
		if (collection.usagePage !== 0xff00) continue;

		if (collection.outputReports) {
			for (const report of collection.outputReports) {
				if (report.reportId === HID_REPORT_ID.QX_HOST_TO_DEVICE) {
					result.hostToDevice = report.reportId;
				}
			}
		}

		if (collection.inputReports) {
			for (const report of collection.inputReports) {
				if (report.reportId === HID_REPORT_ID.QX_DEVICE_TO_HOST) {
					result.deviceToHost = report.reportId;
				}
			}
		}
	}

	return result;
}

// ── Command helpers ───────────────────────────────────────────────────────────

function encodeUint16LE(value: number): [number, number] {
	return [value & 0xff, (value >> 8) & 0xff];
}

function encodeInt16LE(value: number): [number, number] {
	const signed = value < 0 ? value + 65536 : value;
	return [signed & 0xff, (signed >> 8) & 0xff];
}

async function sendCommand(device: HIDDevice, cmdType: number, payload: number[]): Promise<void> {
	const len = payload.length + 2; // +2 for the 0x80 marker and length byte
	const packet = new Uint8Array(64);
	packet[0] = len;
	packet[1] = 0x80;

	for (let i = 0; i < payload.length; i++) {
		packet[i + 2] = payload[i];
	}

	console.log(`Qudelix: sendCommand type=0x${cmdType.toString(16)}`, packet);
	await device.sendReport(HID_REPORT_ID.QX_HOST_TO_DEVICE, packet);
}

async function sendAppCommand(
	device: HIDDevice,
	cmd: number,
	params: number[] = []
): Promise<void> {
	const [cmdLow, cmdHigh] = encodeUint16LE(cmd);
	const payload = [cmdLow, cmdHigh, ...params];
	await sendCommand(device, cmd, payload);
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const qudelixUsbHidHandler: DeviceHandler = {
	async getCurrentSlot(_deviceDetails: ConnectedDevice): Promise<number> {
		// Qudelix always returns a fixed slot
		return 101;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, _slot: number): Promise<PullResult> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const reports = initHidReports(device);

		console.warn('Qudelix: pullFromDevice is EXPERIMENTAL. HID reports:', reports);

		const filters: DeviceFilter[] = [];
		const globalGain = 0;

		// Experimental: attempt to request data from the device
		// Try multiple communication methods
		return new Promise<PullResult>((resolve, reject) => {
			const timeout = setTimeout(() => {
				device.removeEventListener('inputreport', onReport);
				console.warn('Qudelix: pullFromDevice timed out, returning empty result');
				resolve({ filters, globalGain });
			}, 10000);

			const onReport = (event: HIDInputReportEvent): void => {
				const data = new Uint8Array(event.data.buffer);
				console.log('Qudelix: received input report', event.reportId, data);

				// Attempt to parse EQ data from response
				// This is experimental and may not work with all firmware versions
			};

			device.addEventListener('inputreport', onReport);

			// Try requesting init data
			sendAppCommand(device, APP_CMD.ReqInitData).catch((err) => {
				console.warn('Qudelix: ReqInitData failed:', err);
			});

			// Try requesting EQ preset
			sendAppCommand(device, APP_CMD.ReqEqPreset).catch((err) => {
				console.warn('Qudelix: ReqEqPreset failed:', err);
			});

			// Try requesting device config
			sendAppCommand(device, APP_CMD.ReqDevConfig).catch((err) => {
				console.warn('Qudelix: ReqDevConfig failed:', err);
				clearTimeout(timeout);
				device.removeEventListener('inputreport', onReport);
				resolve({ filters, globalGain });
			});
		});
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const device = deviceDetails.rawDevice as HIDDevice;
		initHidReports(device);

		// Enable EQ
		await sendAppCommand(device, APP_CMD.SetEqEnable, [1]);

		// Set pregain for both channels (left=0, right=1)
		const preampValue = Math.round(preamp * 10);
		const [preampLow, preampHigh] = encodeInt16LE(preampValue);
		// Channel 0 (left)
		await sendAppCommand(device, APP_CMD.SetEqPreGain, [0, preampLow, preampHigh]);
		// Channel 1 (right)
		await sendAppCommand(device, APP_CMD.SetEqPreGain, [1, preampLow, preampHigh]);

		// Write each filter
		const maxFilters = deviceDetails.modelConfig.maxFilters;
		const filtersToWrite = Math.min(filters.length, maxFilters);

		for (let i = 0; i < filtersToWrite; i++) {
			const filter = filters[i];
			const gain = filter.disabled ? 0 : filter.gain;
			const filterTypeCode = filter.disabled
				? FILTER_TYPES.BYPASS
				: mapFilterTypeToQudelix(filter.type);

			// Set filter type
			await sendAppCommand(device, APP_CMD.SetEqFilter, [i, filterTypeCode]);

			// Set frequency
			const [freqLow, freqHigh] = encodeUint16LE(filter.freq);
			await sendAppCommand(device, APP_CMD.SetEqFreq, [i, freqLow, freqHigh]);

			// Set gain (gain * 10 as signed 16-bit)
			const gainRaw = Math.round(gain * 10);
			const [gainLow, gainHigh] = encodeInt16LE(gainRaw);
			await sendAppCommand(device, APP_CMD.SetEqGain, [i, gainLow, gainHigh]);

			// Set Q (Q * 100 as unsigned 16-bit)
			const qRaw = Math.round(filter.q * 100);
			const [qLow, qHigh] = encodeUint16LE(qRaw);
			await sendAppCommand(device, APP_CMD.SetEqQ, [i, qLow, qHigh]);
		}

		// Save preset
		await sendAppCommand(device, APP_CMD.SaveEqPreset);

		console.log('Qudelix: PEQ filters pushed successfully.');
		return deviceDetails.modelConfig.disconnectOnSave;
	},

	async enablePEQ(
		deviceDetails: ConnectedDevice,
		enabled: boolean,
		_slotId: number
	): Promise<void> {
		const device = deviceDetails.rawDevice as HIDDevice;
		initHidReports(device);

		// SetEqEnable: 1 = enabled, 0 = disabled
		await sendAppCommand(device, APP_CMD.SetEqEnable, [enabled ? 1 : 0]);

		// Save the preset state
		await sendAppCommand(device, APP_CMD.SaveEqPreset);
	}
};
