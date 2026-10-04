//
// Network PEQ devices: WiiM streamers and the Luxsin X9.
//
// Ported from Pragmatic Audio's devicePEQ (0BSD) wiimNetworkHandler.js and
// luxsinNetworkHandler.js. These are addressed by IP, so there is no USB or
// Bluetooth identity to match against the eqcaps database, and the bridge has
// no network transport. They stay here, behind the same `PeqDevice` shape the
// bridge's devices have, with a profile written from what the handlers accept.
//
import type { Filter, FilterType, Profile } from '@potatosalad775/eqcaps-core';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from './types.js';
import type { NetworkDeviceType } from './network-types.js';

export { NETWORK_DEVICE_TYPES, type NetworkDeviceType } from './network-types.js';

function networkProfile(
	id: string,
	brand: string,
	model: string,
	preamp: Profile['preamp']
): Profile {
	return {
		schemaVersion: '1.0',
		id,
		kind: 'hardware',
		device: { brand, model },
		bandCount: 10,
		band: {
			types: ['PK', 'LSC', 'HSC'],
			freq: { min: 20, max: 20000 },
			q: { min: 0.1, max: 10 },
			gain: { min: -12, max: 12 }
		},
		preamp,
		meta: {
			status: 'draft',
			sources: [
				{
					kind: 'handler-code',
					ref: 'https://github.com/jeromeof/devicePEQ',
					date: '2024-01-01'
				}
			]
		}
	};
}

const BASE_CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: false,
	writesPreamp: false,
	writesSlot: false,
	readsCurrentSlot: false,
	canEnable: true,
	slots: [],
	disconnectOnSave: false,
	experimental: false
};

// ── WiiM ─────────────────────────────────────────────────────────────────────

const WIIM_PLUGIN = { PluginUri: 'http://moddevices.com/plugins/caps/EqNp', SourceName: 'wifi' };

/** WiiM band modes: low shelf 0, peaking 1, high shelf 2, off -1. */
const WIIM_MODE: Partial<Record<FilterType, number>> = { LSC: 0, PK: 1, HSC: 2 };
const WIIM_TYPE: Record<number, FilterType> = { 0: 'LSC', 1: 'PK', 2: 'HSC' };

interface WiimBand {
	mode: number;
	freq: number;
	q: number;
	gain: number;
}

async function wiimCommand(ip: string, command: string, payload: object): Promise<string> {
	const full = encodeURIComponent(`${command}:${JSON.stringify(payload)}`);
	const response = await fetch(`https://${ip}/httpapi.asp?command=${full}`);
	if (!response.ok) throw new Error(`WiiM: HTTP ${response.status} ${response.statusText}`);
	return response.text();
}

function wiimDevice(ip: string): PeqDevice {
	return {
		capabilities: BASE_CAPS,
		async pull() {
			const text = await wiimCommand(ip, 'EQGetLV2SourceBandEx', WIIM_PLUGIN);
			const data = JSON.parse(text) as { EQBand?: WiimBand[] };
			const filters = (data.EQBand ?? []).map((b): Filter | null =>
				b.mode === -1 || WIIM_TYPE[b.mode] === undefined
					? null
					: { type: WIIM_TYPE[b.mode], freq: b.freq, q: b.q, gain: b.gain }
			);
			return { filters };
		},
		async push({ filters }) {
			const EQBand = filters.map((f) => {
				const mode = WIIM_MODE[f.type];
				if (mode === undefined) throw new Error(`WiiM: no mode for filter type ${f.type}`);
				return { mode, freq: f.freq, q: f.q, gain: f.gain };
			});
			await wiimCommand(ip, 'EQSetLV2SourceBand', { ...WIIM_PLUGIN, EQBand });
			await wiimCommand(ip, 'EQSourceSave', WIIM_PLUGIN);
			return { reconnect: false };
		},
		async currentSlot() {
			return null;
		},
		async setEnabled(enabled) {
			await wiimCommand(ip, enabled ? 'EQChangeSourceFX' : 'EQSourceOff', WIIM_PLUGIN);
		},
		async close() {}
	};
}

// ── Luxsin X9 ────────────────────────────────────────────────────────────────

// Luxsin's /dev/info.cgi speaks base64 with a shuffled alphabet.
const LUX_ALPHABET = 'KLMPQRSTUVWXYZABCGHdefIJjkNOlmnopqrstuvwxyzabcghiDEF34501289+67/';
const STD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function luxEncode(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return [...btoa(binary)]
		.map((ch) => {
			const i = STD_ALPHABET.indexOf(ch);
			return i === -1 ? ch : LUX_ALPHABET[i];
		})
		.join('');
}

export function luxDecode(encoded: string): string {
	const base64 = [...encoded]
		.map((ch) => {
			const i = LUX_ALPHABET.indexOf(ch);
			return i === -1 ? ch : STD_ALPHABET[i];
		})
		.join('');
	const binary = atob(base64);
	return new TextDecoder('utf-8').decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** Luxsin filter codes: LPF 0, HPF 1, BPF 2, notch 3, peak 4, low shelf 5, high shelf 6, all-pass 7. */
const LUX_CODE: Partial<Record<FilterType, number>> = {
	LPQ: 0,
	HPQ: 1,
	BP: 2,
	NO: 3,
	PK: 4,
	LSC: 5,
	HSC: 6,
	AP: 7
};
const LUX_TYPE = Object.fromEntries(
	Object.entries(LUX_CODE).map(([type, code]) => [code, type as FilterType])
) as Record<number, FilterType>;

interface LuxProfile {
	name?: string;
	canDel?: number;
	preamp?: number | string;
	filters?: string;
}

async function luxGet(ip: string, action: string): Promise<Record<string, unknown>> {
	const response = await fetch(`http://${ip}/dev/info.cgi?action=${action}`);
	if (!response.ok) throw new Error(`Luxsin: HTTP ${response.status} ${response.statusText}`);
	return JSON.parse(luxDecode(await response.text()));
}

async function luxPost(ip: string, payload: object): Promise<void> {
	const body = new URLSearchParams();
	body.append('json', luxEncode(JSON.stringify(payload)));
	const response = await fetch(`http://${ip}/dev/info.cgi`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
		body
	});
	if (!response.ok) throw new Error(`Luxsin: HTTP ${response.status} ${response.statusText}`);
}

function luxsinDevice(ip: string): PeqDevice {
	async function state() {
		const data = await luxGet(ip, 'syncData');
		const peq = await luxGet(ip, 'syncPeq').catch(() => null);
		const select = Number(peq?.peqSelect ?? data.peqSelect ?? 0);
		const profiles = (Array.isArray(peq?.peq) ? peq.peq : data.peq) as LuxProfile[] | undefined;
		return { select, profile: Array.isArray(profiles) ? profiles[select] : undefined };
	}
	return {
		capabilities: { ...BASE_CAPS, readsPreamp: true, writesPreamp: true },
		async pull() {
			const { select, profile } = await state();
			const raw = JSON.parse(profile?.filters || '[]') as {
				type: number;
				fc: number;
				q: number;
				gain: number;
			}[];
			const filters = raw.map((f): Filter | null => {
				const type = LUX_TYPE[Number(f.type)];
				return type ? { type, freq: Number(f.fc), q: Number(f.q), gain: Number(f.gain) } : null;
			});
			return { filters, preamp: Number(profile?.preamp) || 0, slot: select };
		},
		async push({ filters, preamp }) {
			const { select, profile } = await state();
			const luxFilters = filters.map((f) => {
				const code = LUX_CODE[f.type];
				if (code === undefined) throw new Error(`Luxsin: no code for filter type ${f.type}`);
				return { type: code, fc: f.freq, gain: f.gain, q: f.q };
			});
			await luxPost(ip, {
				peq: [
					{
						index: select,
						name: profile?.name || `Profile ${select}`,
						canDel: profile?.canDel ?? 1,
						preamp: preamp ?? Number(profile?.preamp ?? 0),
						filters: JSON.stringify(luxFilters)
					}
				]
			});
			return { reconnect: false };
		},
		async currentSlot() {
			return (await state()).select;
		},
		async setEnabled(enabled) {
			await luxPost(ip, { peqEnable: enabled ? 1 : 0 });
		},
		async close() {}
	};
}

/** A network device at `ip`. Nothing is sent until the first read or write. */
export function connectNetworkDevice(ip: string, type: NetworkDeviceType): DeviceConnection {
	const host = ip.trim();
	if (type === 'WiiM') {
		return {
			device: wiimDevice(host),
			connectionType: 'network',
			name: 'WiiM',
			profile: networkProfile('moderngraphtool-wiim', 'WiiM', 'Streamer', { mode: 'none' }),
			profileSource: 'builtin',
			profileId: null,
			identity: {}
		};
	}
	return {
		device: luxsinDevice(host),
		connectionType: 'network',
		name: 'Luxsin X9',
		profile: networkProfile('moderngraphtool-luxsin-x9', 'Luxsin', 'X9', { mode: 'unknown' }),
		profileSource: 'builtin',
		profileId: null,
		identity: {}
	};
}
