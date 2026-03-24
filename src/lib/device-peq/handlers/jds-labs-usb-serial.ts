//
// Copyright 2024 : Pragmatic Audio
//
// JDS Labs USB Serial handler — TypeScript port of the legacy jdsLabsUsbSerialHandler.js
// JSON-over-serial protocol with null terminator for Element IV devices.
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	DeviceFilterType,
	PullResult
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const DESCRIBE_COMMAND = { Product: 'JDS Labs Element IV', Action: 'Describe' };

const FILTER_12_BAND_ORDER = [
	'Lowshelf 1',
	'Lowshelf 2',
	'Peaking 1',
	'Peaking 2',
	'Peaking 3',
	'Peaking 4',
	'Peaking 5',
	'Peaking 6',
	'Peaking 7',
	'Peaking 8',
	'Highshelf 1',
	'Highshelf 2'
];

// ── Encoding/decoding helpers ─────────────────────────────────────────────────

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ── Serial communication ──────────────────────────────────────────────────────

async function sendJsonCommand(
	device: ConnectedDevice,
	json: Record<string, unknown>
): Promise<void> {
	const payload = JSON.stringify(json) + '\0';
	const encoded = textEncoder.encode(payload);

	if (!device.writable) {
		throw new Error('JDS Labs: Device writable stream not available');
	}

	await device.writable.write(encoded);
	console.log('JDS Labs: Sent command:', json);
}

async function readJsonResponse(device: ConnectedDevice): Promise<Record<string, unknown>> {
	if (!device.readable) {
		throw new Error('JDS Labs: Device readable stream not available');
	}

	let buffer = '';
	const startTime = Date.now();
	const timeout = 10000;

	while (Date.now() - startTime < timeout) {
		const result = await device.readable.read();
		if (result.done) break;

		const chunk = textDecoder.decode(result.value);
		buffer += chunk;

		// Check for null terminator
		const nullIndex = buffer.indexOf('\0');
		if (nullIndex !== -1) {
			const jsonStr = buffer.substring(0, nullIndex);
			console.log('JDS Labs: Received response:', jsonStr);
			return JSON.parse(jsonStr);
		}
	}

	throw new Error('JDS Labs: Timeout waiting for response');
}

// ── Filter-type converters ────────────────────────────────────────────────────

function transformFilterType(bandName: string): DeviceFilterType {
	const lower = bandName.toLowerCase();
	if (lower.startsWith('lowshelf')) return 'LSQ';
	if (lower.startsWith('highshelf')) return 'HSQ';
	return 'PK';
}

function getFilterBandName(filterType: DeviceFilterType, index: number): string {
	switch (filterType) {
		case 'LSQ':
			return `Lowshelf ${index + 1}`;
		case 'HSQ':
			return `Highshelf ${index + 1}`;
		case 'PK':
		default:
			return `Peaking ${index + 1}`;
	}
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const jdsLabsUsbSerialHandler: DeviceHandler = {
	async getCurrentSlot(deviceDetails: ConnectedDevice): Promise<number> {
		await sendJsonCommand(deviceDetails, DESCRIBE_COMMAND);
		const response = await readJsonResponse(deviceDetails);

		const general = response['General'] as Record<string, { Current: string }> | undefined;
		if (general && general['Input Mode']) {
			const inputMode = general['Input Mode'].Current;
			if (inputMode === 'USB') {
				return 0;
			}
			return 1;
		}

		return 0;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, _slot: number): Promise<PullResult> {
		await sendJsonCommand(deviceDetails, DESCRIBE_COMMAND);
		const response = await readJsonResponse(deviceDetails);

		const filters: DeviceFilter[] = [];
		let globalGain = 0;

		const dsp = response['DSP'] as Record<string, Record<string, unknown>> | undefined;
		if (!dsp) {
			console.warn('JDS Labs: No DSP data in response');
			return { filters, globalGain };
		}

		const headphone = dsp['Headphone'] as Record<string, unknown> | undefined;
		if (!headphone) {
			console.warn('JDS Labs: No Headphone config in DSP');
			return { filters, globalGain };
		}

		// Parse preamp
		const preamp = headphone['Preamp'] as { Current: number } | undefined;
		if (preamp) {
			globalGain = preamp.Current;
		}

		// Parse 12-band EQ
		for (const bandName of FILTER_12_BAND_ORDER) {
			const band = headphone[bandName] as
				| { Frequency: number; Gain: number; Q: number }
				| undefined;
			if (band) {
				const filterType = transformFilterType(bandName);
				filters.push({
					type: filterType,
					freq: band.Frequency,
					q: band.Q,
					gain: band.Gain,
					disabled: band.Gain === 0
				});
			}
		}

		return { filters, globalGain };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		// Group filters by type for the 12-band structure
		const lsqFilters: DeviceFilter[] = [];
		const pkFilters: DeviceFilter[] = [];
		const hsqFilters: DeviceFilter[] = [];

		for (const filter of filters) {
			switch (filter.type) {
				case 'LSQ':
					if (lsqFilters.length < 2) lsqFilters.push(filter);
					break;
				case 'HSQ':
					if (hsqFilters.length < 2) hsqFilters.push(filter);
					break;
				case 'PK':
				default:
					if (pkFilters.length < 8) pkFilters.push(filter);
					break;
			}
		}

		// Build the aligned 12-band update payload
		const dspConfig: Record<string, { Frequency: number; Gain: number; Q: number }> = {};

		// Lowshelf bands (max 2)
		for (let i = 0; i < 2; i++) {
			const bandName = `Lowshelf ${i + 1}`;
			if (i < lsqFilters.length && !lsqFilters[i].disabled) {
				dspConfig[bandName] = {
					Frequency: lsqFilters[i].freq,
					Gain: lsqFilters[i].gain,
					Q: lsqFilters[i].q
				};
			} else {
				dspConfig[bandName] = { Frequency: 100, Gain: 0, Q: 0.707 };
			}
		}

		// Peaking bands (max 8)
		for (let i = 0; i < 8; i++) {
			const bandName = `Peaking ${i + 1}`;
			if (i < pkFilters.length && !pkFilters[i].disabled) {
				dspConfig[bandName] = {
					Frequency: pkFilters[i].freq,
					Gain: pkFilters[i].gain,
					Q: pkFilters[i].q
				};
			} else {
				dspConfig[bandName] = { Frequency: 1000, Gain: 0, Q: 1.0 };
			}
		}

		// Highshelf bands (max 2)
		for (let i = 0; i < 2; i++) {
			const bandName = `Highshelf ${i + 1}`;
			if (i < hsqFilters.length && !hsqFilters[i].disabled) {
				dspConfig[bandName] = {
					Frequency: hsqFilters[i].freq,
					Gain: hsqFilters[i].gain,
					Q: hsqFilters[i].q
				};
			} else {
				dspConfig[bandName] = { Frequency: 10000, Gain: 0, Q: 0.707 };
			}
		}

		const updatePayload = {
			Product: 'JDS Labs Element IV',
			Action: 'Update',
			DSP: {
				Headphone: {
					Preamp: preamp,
					...dspConfig
				}
			}
		};

		await sendJsonCommand(deviceDetails, updatePayload);
		const response = await readJsonResponse(deviceDetails);
		console.log('JDS Labs: Update response:', response);

		return deviceDetails.modelConfig.disconnectOnSave;
	},

	async enablePEQ(
		_deviceDetails: ConnectedDevice,
		_enabled: boolean,
		_slotId: number
	): Promise<void> {
		// JDS Labs Element IV does not support enable/disable PEQ — no-op
	}
};
