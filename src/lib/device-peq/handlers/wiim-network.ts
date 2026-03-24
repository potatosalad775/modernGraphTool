//
// Copyright 2024 : Pragmatic Audio
//
// WiiM Network handler — TypeScript port of the legacy wiimNetworkHandler.js
// HTTP API with JSON payloads over network.
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	DeviceFilterType,
	PullResult
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const PLUGIN_URI = 'http://moddevices.com/plugins/caps/EqNp';
const SOURCE_NAME = 'wifi';

// ── WiiM mode converters ──────────────────────────────────────────────────────

/** Convert our DeviceFilterType to WiiM mode number: LSQ=0, PK=1, HSQ=2, Off=-1 */
function convertToWiimMode(filterType: DeviceFilterType, disabled: boolean): number {
	if (disabled) return -1;
	switch (filterType) {
		case 'LSQ':
			return 0;
		case 'PK':
			return 1;
		case 'HSQ':
			return 2;
		default:
			return 1;
	}
}

/** Convert WiiM mode number to our DeviceFilterType: 0=LSQ, 1=PK, 2=HSQ */
function convertFromWiimMode(mode: number): DeviceFilterType {
	switch (mode) {
		case 0:
			return 'LSQ';
		case 1:
			return 'PK';
		case 2:
			return 'HSQ';
		default:
			return 'PK';
	}
}

// ── HTTP communication helpers ────────────────────────────────────────────────

async function sendHttpCommand(ip: string, command: string): Promise<string> {
	const url = `https://${ip}/httpapi.asp?command=${command}`;
	console.log('WiiM: Sending HTTP command:', url);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`WiiM: HTTP error ${response.status}: ${response.statusText}`);
	}

	const text = await response.text();
	console.log('WiiM: Received response:', text);
	return text;
}

async function sendHttpCommandJson(
	ip: string,
	command: string,
	payload: Record<string, unknown>
): Promise<string> {
	const jsonStr = JSON.stringify(payload);
	const fullCommand = `${command}:${jsonStr}`;
	return sendHttpCommand(ip, encodeURIComponent(fullCommand));
}

// ── EQ band conversion ───────────────────────────────────────────────────────

interface WiimEQBand {
	mode: number;
	freq: number;
	q: number;
	gain: number;
}

function filtersToWiimBands(filters: DeviceFilter[]): WiimEQBand[] {
	const bands: WiimEQBand[] = [];

	for (const filter of filters) {
		// Each filter produces 4 entries: mode, freq, q, gain
		bands.push({
			mode: convertToWiimMode(filter.type, filter.disabled ?? false),
			freq: filter.freq,
			q: filter.q,
			gain: filter.disabled ? 0 : filter.gain
		});
	}

	return bands;
}

function wiimBandsToFilters(bands: WiimEQBand[]): DeviceFilter[] {
	const filters: DeviceFilter[] = [];

	for (const band of bands) {
		const disabled = band.mode === -1;
		const type = disabled ? 'PK' : convertFromWiimMode(band.mode);

		filters.push({
			type,
			freq: band.freq,
			q: band.q,
			gain: band.gain,
			disabled
		});
	}

	return filters;
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const wiimNetworkHandler: DeviceHandler = {
	async getCurrentSlot(_deviceDetails: ConnectedDevice): Promise<number> {
		return 0;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, _slot: number): Promise<PullResult> {
		const ip = deviceDetails.ip!;

		const payload = {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME
		};

		const responseText = await sendHttpCommandJson(ip, 'EQGetLV2SourceBandEx', payload);

		let responseData: { EQBand?: WiimEQBand[] };
		try {
			responseData = JSON.parse(responseText);
		} catch {
			console.warn('WiiM: Failed to parse pull response:', responseText);
			return { filters: [], globalGain: 0 };
		}

		const eqBands = responseData.EQBand ?? [];
		const filters = wiimBandsToFilters(eqBands);

		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const ip = deviceDetails.ip!;

		const eqBands = filtersToWiimBands(filters);

		const setPayload = {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME,
			EQBand: eqBands
		};

		await sendHttpCommandJson(ip, 'EQSetLV2SourceBand', setPayload);

		// Save the configuration
		const savePayload = {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME
		};
		await sendHttpCommandJson(ip, 'EQSourceSave', savePayload);

		console.log('WiiM: PEQ filters pushed and saved successfully.');
		return deviceDetails.modelConfig.disconnectOnSave;
	},

	async enablePEQ(
		deviceDetails: ConnectedDevice,
		enabled: boolean,
		_slotId: number
	): Promise<void> {
		const ip = deviceDetails.ip!;

		if (enabled) {
			const payload = {
				PluginUri: PLUGIN_URI,
				SourceName: SOURCE_NAME
			};
			await sendHttpCommandJson(ip, 'EQChangeSourceFX', payload);
		} else {
			const payload = {
				PluginUri: PLUGIN_URI,
				SourceName: SOURCE_NAME
			};
			await sendHttpCommandJson(ip, 'EQSourceOff', payload);
		}
	}
};
