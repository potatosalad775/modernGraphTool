//
// Copyright 2024 : Pragmatic Audio
//
// Luxsin X9 Network handler — ported from legacy luxsinNetworkHandler.js
// HTTP API with custom base64 alphabet encoding via /dev/info.cgi
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, DeviceModelConfig, PullResult } from '../types.js';

// ── Custom base64 encoding ──────────────────────────────────────────────────

const RC = 'KLMPQRSTUVWXYZABCGHdefIJjkNOlmnopqrstuvwxyzabcghiDEF34501289+67/';
const PC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeCustom(text: string): string {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(text);
	let binaryString = '';
	for (let i = 0; i < bytes.length; i++) binaryString += String.fromCharCode(bytes[i]);
	const base64 = btoa(binaryString);
	let encoded = '';
	for (let i = 0; i < base64.length; i++) {
		const ch = base64.charAt(i);
		const idx = PC.indexOf(ch);
		encoded += idx !== -1 ? RC.charAt(idx) : ch;
	}
	return encoded;
}

function decodeCustom(encoded: string): string {
	let base64 = '';
	for (let i = 0; i < encoded.length; i++) {
		const ch = encoded.charAt(i);
		const idx = RC.indexOf(ch);
		base64 += idx !== -1 ? PC.charAt(idx) : ch;
	}
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
	return new TextDecoder('utf-8').decode(bytes);
}

// ── Filter type mapping ─────────────────────────────────────────────────────

function toLuxsinType(type: string): number {
	const map: Record<string, number> = {
		LPF: 0, HPF: 1, BPF: 2, Notch: 3,
		Peak: 4, PK: 4, LSQ: 5, HSQ: 6, AllPass: 7
	};
	return map[type] ?? 4; // default to Peak
}

function fromLuxsinType(code: number): string {
	switch (code) {
		case 0: return 'PK'; // LPF — not in our type system, map to PK
		case 1: return 'PK'; // HPF
		case 2: return 'PK'; // BPF
		case 3: return 'PK'; // Notch
		case 4: return 'PK';
		case 5: return 'LSQ';
		case 6: return 'HSQ';
		case 7: return 'PK'; // AllPass
		default: return 'PK';
	}
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function httpGet(ip: string, pathAndQuery: string): Promise<string> {
	const url = `http://${ip}${pathAndQuery}`;
	const response = await fetch(url, { method: 'GET' });
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	return response.text();
}

async function httpPostJsonEncoded(ip: string, path: string, obj: unknown): Promise<boolean> {
	const jsonStr = JSON.stringify(obj);
	const encodedJson = encodeCustom(jsonStr);
	const body = new URLSearchParams();
	body.append('json', encodedJson);
	const url = `http://${ip}${path}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
		body
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	return true;
}

// ── Exported handler ────────────────────────────────────────────────────────

export const luxsinNetworkHandler: DeviceHandler = {
	async getCurrentSlot(device: ConnectedDevice): Promise<number> {
		try {
			const text = await httpGet(device.ip!, '/dev/info.cgi?action=syncPeq');
			const data = JSON.parse(decodeCustom(text));
			return data.peqSelect ?? 0;
		} catch (err) {
			console.warn('Luxsin: getCurrentSlot failed, defaulting to 0', err);
			return 0;
		}
	},

	async pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult> {
		try {
			const [syncDataText, syncPeqText] = await Promise.all([
				httpGet(device.ip!, '/dev/info.cgi?action=syncData'),
				httpGet(device.ip!, '/dev/info.cgi?action=syncPeq').catch(() => '')
			]);

			const deviceData = JSON.parse(decodeCustom(syncDataText));
			if (syncPeqText) {
				const peqData = JSON.parse(decodeCustom(syncPeqText));
				if (peqData.peq) deviceData.peq = peqData.peq;
				if (peqData.peqSelect !== undefined) deviceData.peqSelect = peqData.peqSelect;
			}

			let filters: DeviceFilter[] = [];
			let preamp = 0;
			const currentIndex = deviceData.peqSelect ?? 0;
			const currentProfile = Array.isArray(deviceData.peq) ? deviceData.peq[currentIndex] : null;

			if (currentProfile) {
				preamp = Number(currentProfile.preamp) || 0;
				try {
					const rawFilters = JSON.parse(currentProfile.filters || '[]');
					filters = rawFilters.map((f: { type: number; fc: number; q: number; gain: number }) => ({
						type: fromLuxsinType(Number(f.type)),
						freq: Number(f.fc),
						q: Number(f.q),
						gain: Number(f.gain)
					}));
				} catch (e) {
					console.warn('Luxsin: failed to parse filters JSON', e);
				}
			}

			return { filters, globalGain: preamp };
		} catch (err) {
			console.error('Luxsin: error pulling from device', err);
			throw err;
		}
	},

	async pushToDevice(
		device: ConnectedDevice,
		slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		try {
			const deviceIp = device.ip!;

			// Get current data to fetch profile metadata
			const syncDataText = await httpGet(deviceIp, '/dev/info.cgi?action=syncData');
			const deviceData = JSON.parse(decodeCustom(syncDataText));
			const currentIndex = slot ?? (deviceData.peqSelect ?? 0);
			const profile = Array.isArray(deviceData.peq) ? deviceData.peq[currentIndex] : null;

			const luxFilters = (filters || []).map((f) => ({
				type: toLuxsinType(f.type),
				fc: Number(f.freq),
				gain: Number(f.gain),
				q: Number(f.q)
			}));

			const payload = {
				peq: [
					{
						index: currentIndex,
						name: profile?.name || device.model || `Profile ${currentIndex}`,
						canDel: profile?.canDel ?? 1,
						preamp: Number(preamp ?? profile?.preamp ?? 0),
						filters: JSON.stringify(luxFilters)
					}
				]
			};

			await httpPostJsonEncoded(deviceIp, '/dev/info.cgi', payload);
			console.log('Luxsin: PEQ updated successfully');
			return false;
		} catch (err) {
			console.error('Luxsin: error pushing to device', err);
			throw err;
		}
	},

	async enablePEQ(device: ConnectedDevice, enabled: boolean, slotId: number): Promise<void> {
		try {
			const payload: { peqEnable: number; peqSelect?: number } = { peqEnable: enabled ? 1 : 0 };
			if (slotId !== undefined && slotId !== null) payload.peqSelect = Number(slotId);
			await httpPostJsonEncoded(device.ip!, '/dev/info.cgi', payload);
			console.log(`Luxsin: PEQ ${enabled ? 'enabled' : 'disabled'} on slot ${slotId}`);
		} catch (err) {
			console.error('Luxsin: error toggling PEQ', err);
			throw err;
		}
	}
};

// ── Registration ────────────────────────────────────────────────────────────

export const networkRegistration = {
	deviceType: 'LuxsinX9',
	manufacturer: 'Luxsin',
	handler: luxsinNetworkHandler,
	defaultModelConfig: {
		minGain: -12,
		maxGain: 12,
		maxFilters: 10,
		firstWritableEQSlot: 0,
		maxWritableEQSlots: 1,
		disconnectOnSave: false,
		disabledPresetId: -1,
		experimental: false,
		availableSlots: [{ id: 0, name: 'Custom' }]
	} satisfies DeviceModelConfig
};
