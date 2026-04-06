//
// Copyright 2025 : Pragmatic Audio
//
// Fosi Audio USB HID Protocol Handler
// Protocol based on actual packet captures from Fosi Audio DS3 webapp
//
// Packet structure: [0x77, CMD, INDEX, ...zeros to 63 bytes]
// Uses Feature Reports (sendFeatureReport/receiveFeatureReport)
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	PullResult,
	UsbHidVendorConfig
} from '../types.js';

// Protocol constants
const HEADER = 0x77;
const CMD = {
	SET_EQ_MODE: 0x8a,
	GET_EQ_MODE: 0x8b,
	SET_EQ_PARAMS: 0x8d,
	GET_EQ_PARAMS: 0x8e,
	RESET_EQ_PARAMS: 0x90,
	GET_EQ_MODE_COUNT: 0x91,
	SET_AND_SAVE_EQ_MODE: 0x92,
	SET_EQ_ENABLE: 0x9d,
	GET_EQ_ENABLE: 0x9e,
	SET_VOLUME: 0x93,
	GET_VOLUME: 0x94,
	GET_FIRMWARE_VERSION: 0xa6
} as const;

const REPORT_ID = 0x01;
const PACKET_SIZE = 63;

function waitMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePacket(cmd: number, index = 0): Uint8Array {
	const packet = new Uint8Array(PACKET_SIZE);
	packet[0] = HEADER;
	packet[1] = cmd;
	packet[2] = index;
	return packet;
}

function convertFromFilterType(filterType: string): number {
	const mapping: Record<string, number> = { PK: 2, LSQ: 1, HSQ: 3 };
	return mapping[filterType] ?? 2;
}

function convertToFilterType(value: number): 'PK' | 'LSQ' | 'HSQ' {
	switch (value) {
		case 1:
			return 'LSQ';
		case 3:
			return 'HSQ';
		default:
			return 'PK';
	}
}

function encodeBandParams(
	presetId: number,
	bandIndex: number,
	filter: DeviceFilter
): Uint8Array {
	const packet = new Uint8Array(PACKET_SIZE);
	const view = new DataView(packet.buffer);

	packet[0] = HEADER;
	packet[1] = CMD.SET_EQ_PARAMS;
	packet[2] = presetId;
	packet[3] = bandIndex;
	packet[4] = convertFromFilterType(filter.type || 'PK');

	view.setFloat32(5, filter.freq || 1000, true);
	view.setFloat32(9, filter.q || 1.0, true);
	view.setFloat32(13, 0, true); // Bandwidth (unused)
	view.setFloat32(17, filter.gain || 0, true);

	return packet;
}

function parseBandParams(
	data: Uint8Array
): {
	presetId: number;
	bandIndex: number;
	type: 'PK' | 'LSQ' | 'HSQ';
	freq: number;
	q: number;
	gain: number;
	disabled: boolean;
} | null {
	if (data.length < 22) return null;

	const view = new DataView(data.buffer, data.byteOffset);

	// WebHID responses include reportId as byte 0, so actual data starts at byte 1
	if (data[1] !== HEADER) return null;

	const presetId = data[3];
	const bandIndex = data[4];
	const filterType = data[5];

	const freq = view.getFloat32(6, true);
	const q = view.getFloat32(10, true);
	const gain = view.getFloat32(18, true);

	return {
		presetId,
		bandIndex,
		type: convertToFilterType(filterType),
		freq,
		q,
		gain,
		disabled: gain === 0 && freq === 0
	};
}

async function sendCommand(
	device: HIDDevice,
	reportId: number,
	cmd: number,
	index = 0,
	delay = 0
): Promise<void> {
	const packet = makePacket(cmd, index);
	console.log(
		`USB Device PEQ: Fosi Audio sending feature [0x${packet[0].toString(16)}, 0x${packet[1].toString(16)}, ${packet[2]}]`
	);
	await device.sendFeatureReport(reportId, packet);
	if (delay > 0) await waitMs(delay);
}

async function receiveFeatureReport(
	device: HIDDevice,
	reportId: number
): Promise<DataView | null> {
	try {
		const dataView = await device.receiveFeatureReport(reportId);
		console.log(
			`USB Device PEQ: Fosi Audio received feature report:`,
			Array.from(new Uint8Array(dataView.buffer).slice(0, 25))
		);
		return dataView;
	} catch (e) {
		console.error('USB Device PEQ: Fosi Audio receiveFeatureReport failed:', e);
		return null;
	}
}

async function sendBandCommit(
	device: HIDDevice,
	reportId: number,
	presetId: number,
	bandIndex: number
): Promise<void> {
	const packet = new Uint8Array(PACKET_SIZE);
	packet[0] = HEADER;
	packet[1] = CMD.GET_EQ_PARAMS;
	packet[2] = presetId;
	packet[3] = bandIndex;
	console.log(`USB Device PEQ: Fosi Audio commit band ${bandIndex} of preset ${presetId}`);
	await device.sendReport(reportId, packet);
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const fosiAudioUsbHidHandler: DeviceHandler = {
	async getCurrentSlot(_deviceDetails: ConnectedDevice): Promise<number> {
		console.log('USB Device PEQ: Fosi Audio getCurrentSlot - returning Custom 1 (7)');
		return 7;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, slot: number): Promise<PullResult> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const reportId = deviceDetails.modelConfig.reportId || REPORT_ID;
		const maxFilters = deviceDetails.modelConfig.maxFilters || 10;

		try {
			console.log(`USB Device PEQ: Fosi Audio pulling from device (mode ${slot})...`);

			const filters: DeviceFilter[] = [];
			let responseCount = 0;

			// Switch to the preset we want to read
			await sendCommand(device, reportId, CMD.SET_EQ_MODE, slot);

			// Request each band's parameters via Feature Reports
			for (let i = 0; i < maxFilters; i++) {
				const packet = new Uint8Array(PACKET_SIZE);
				packet[0] = HEADER;
				packet[1] = CMD.GET_EQ_PARAMS;
				packet[2] = slot;
				packet[3] = i;

				await device.sendFeatureReport(reportId, packet);

				const response = await receiveFeatureReport(device, reportId);
				if (response) {
					const data = new Uint8Array(response.buffer);
					const parsed = parseBandParams(data);

					if (parsed && parsed.bandIndex === i) {
						filters[i] = {
							type: parsed.type,
							freq: parsed.freq,
							q: parsed.q,
							gain: parsed.gain,
							disabled: parsed.disabled
						};
						responseCount++;
						console.log(
							`USB Device PEQ: Fosi Audio band ${i}: ${parsed.freq}Hz ${parsed.gain}dB Q=${parsed.q}`
						);
					}
				}

				await waitMs(20);
			}

			console.log(`USB Device PEQ: Fosi Audio received ${responseCount} band responses`);

			// Fill missing bands with defaults
			for (let i = 0; i < maxFilters; i++) {
				if (!filters[i]) {
					filters[i] = { type: 'PK', freq: 1000, q: 1.0, gain: 0, disabled: true };
				}
			}

			return { filters, globalGain: 0 };
		} catch (error) {
			console.error('USB Device PEQ: Fosi Audio pullFromDevice failed:', error);
			throw error;
		}
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const reportId = deviceDetails.modelConfig.reportId || REPORT_ID;
		const maxFilters = Math.min(filters.length, deviceDetails.modelConfig.maxFilters || 10);

		try {
			console.log(`USB Device PEQ: Fosi Audio pushing ${maxFilters} filters to preset ${slot}...`);

			// Initial handshake
			await sendCommand(device, reportId, CMD.GET_EQ_MODE_COUNT, 0, 50);

			// Switch to the target preset
			await sendCommand(device, reportId, CMD.SET_EQ_MODE, slot, 30);

			// Write each band's parameters followed by per-band commit
			for (let i = 0; i < maxFilters; i++) {
				const filter = filters[i];
				const filterToWrite = filter.disabled
					? { type: 'PK' as const, freq: 1000, q: 1.0, gain: 0 }
					: filter;

				const packet = encodeBandParams(slot, i, filterToWrite as DeviceFilter);
				console.log(
					`USB Device PEQ: Fosi Audio writing band ${i}: freq=${filterToWrite.freq}Hz gain=${filterToWrite.gain}dB q=${filterToWrite.q}`
				);
				await device.sendFeatureReport(reportId, packet);
				await waitMs(20);

				await sendBandCommit(device, reportId, slot, i);
				await waitMs(20);
			}

			// Final global commit/save
			await sendCommand(device, reportId, CMD.SET_AND_SAVE_EQ_MODE, slot, 50);

			console.log('USB Device PEQ: Fosi Audio push complete');
			return deviceDetails.modelConfig.disconnectOnSave || false;
		} catch (error) {
			console.error('USB Device PEQ: Fosi Audio pushToDevice failed:', error);
			throw error;
		}
	},

	async enablePEQ(
		deviceDetails: ConnectedDevice,
		enable: boolean,
		slotId: number
	): Promise<void> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const reportId = deviceDetails.modelConfig.reportId || REPORT_ID;

		console.log(
			`USB Device PEQ: Fosi Audio ${enable ? 'enabling' : 'disabling'} PEQ (preset ${slotId})`
		);

		await sendCommand(device, reportId, CMD.GET_EQ_MODE_COUNT, 0, 30);

		if (enable) {
			await sendCommand(device, reportId, CMD.SET_EQ_MODE, slotId, 30);
		} else {
			// Switch to bypass (preset 0)
			await sendCommand(device, reportId, CMD.SET_EQ_MODE, 0, 30);
		}
	}
};

// ── Registration ──────────────────────────────────────────────────────────────

export const registration: UsbHidVendorConfig = {
	vendorIds: [0x152a],
	manufacturer: 'Fosi Audio',
	handler: fosiAudioUsbHidHandler,
	defaultModelConfig: {
		minGain: -12,
		maxGain: 12,
		maxFilters: 10,
		firstWritableEQSlot: 7,
		maxWritableEQSlots: 5,
		disconnectOnSave: false,
		disabledPresetId: 0,
		experimental: true,
		supportsPregain: false,
		supportsLSHSFilters: true,
		defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }],
		reportId: 1,
		availableSlots: [
			{ id: 0, name: 'Bypass' },
			{ id: 7, name: 'Custom 1' },
			{ id: 8, name: 'Custom 2' },
			{ id: 9, name: 'Custom 3' },
			{ id: 10, name: 'Custom 4' },
			{ id: 11, name: 'Custom 5' }
		]
	},
	devices: {
		'Fosi Audio DS3': {
			modelConfig: {
				maxFilters: 10,
				disconnectOnSave: false,
				firstWritableEQSlot: 7,
				maxWritableEQSlots: 5,
				experimental: false,
				availableSlots: [
					{ id: 0, name: 'Bypass' },
					{ id: 7, name: 'Custom 1' },
					{ id: 8, name: 'Custom 2' },
					{ id: 9, name: 'Custom 3' },
					{ id: 10, name: 'Custom 4' },
					{ id: 11, name: 'Custom 5' }
				]
			}
		}
	}
};
