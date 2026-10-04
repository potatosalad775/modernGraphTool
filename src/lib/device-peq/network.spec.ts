import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { connectNetworkDevice, luxDecode, luxEncode } from './network.js';

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let responses: string[];

beforeEach(() => {
	calls = [];
	responses = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return { ok: true, status: 200, statusText: 'OK', text: async () => responses.shift() ?? '' };
		})
	);
});
afterEach(() => vi.unstubAllGlobals());

describe('WiiM', () => {
	it('reads bands in eqcaps units, skipping bands that are off', async () => {
		const conn = connectNetworkDevice(' 192.168.0.9 ', 'WiiM');
		responses.push(
			JSON.stringify({
				EQBand: [
					{ mode: 0, freq: 100, q: 0.7, gain: 3 },
					{ mode: -1, freq: 1000, q: 1, gain: 0 },
					{ mode: 1, freq: 2000, q: 2, gain: -2 }
				]
			})
		);
		const { filters } = await conn.device.pull();
		expect(filters).toEqual([
			{ type: 'LSC', freq: 100, q: 0.7, gain: 3 },
			null,
			{ type: 'PK', freq: 2000, q: 2, gain: -2 }
		]);
		expect(calls[0].url).toMatch(/^https:\/\/192\.168\.0\.9\/httpapi\.asp\?command=/);
	});

	it('writes the bands, then saves', async () => {
		const conn = connectNetworkDevice('10.0.0.2', 'WiiM');
		await conn.device.push({ filters: [{ type: 'HSC', freq: 8000, q: 0.7, gain: -1 }] });
		expect(calls).toHaveLength(2);
		const sent = decodeURIComponent(calls[0].url.split('command=')[1]);
		expect(sent).toContain('EQSetLV2SourceBand');
		expect(sent).toContain('"mode":2');
		expect(decodeURIComponent(calls[1].url)).toContain('EQSourceSave');
	});

	it('describes itself as a 10-band EQ with no preamp control', () => {
		const conn = connectNetworkDevice('10.0.0.2', 'WiiM');
		expect(conn.profile.bandCount).toBe(10);
		expect(conn.profile.preamp.mode).toBe('none');
		expect(conn.device.capabilities.writesPreamp).toBe(false);
	});
});

describe('Luxsin X9', () => {
	it('round-trips its shuffled base64, non-ASCII included', () => {
		const text = JSON.stringify({ name: 'Ü-profile', peqSelect: 2 });
		expect(luxEncode(text)).not.toBe(btoa(text));
		expect(luxDecode(luxEncode(text))).toBe(text);
	});

	it('reads the selected profile with its preamp', async () => {
		const conn = connectNetworkDevice('10.0.0.3', 'LuxsinX9');
		const profile = {
			preamp: -3,
			filters: JSON.stringify([
				{ type: 5, fc: 100, q: 0.7, gain: 4 },
				{ type: 4, fc: 1000, q: 1, gain: -2 },
				{ type: 99, fc: 1, q: 1, gain: 0 }
			])
		};
		responses.push(
			luxEncode(JSON.stringify({ peqSelect: 1, peq: [{}, profile] })),
			luxEncode(JSON.stringify({ peqSelect: 1, peq: [{}, profile] }))
		);
		const result = await conn.device.pull();
		expect(result.preamp).toBe(-3);
		expect(result.slot).toBe(1);
		expect(result.filters).toEqual([
			{ type: 'LSC', freq: 100, q: 0.7, gain: 4 },
			{ type: 'PK', freq: 1000, q: 1, gain: -2 },
			null
		]);
	});

	it('writes into the selected profile, preamp included', async () => {
		const conn = connectNetworkDevice('10.0.0.3', 'LuxsinX9');
		const current = luxEncode(JSON.stringify({ peqSelect: 0, peq: [{ name: 'Mine', canDel: 0 }] }));
		responses.push(current, current, '');
		await conn.device.push({ filters: [{ type: 'PK', freq: 1000, q: 1, gain: 2 }], preamp: -2 });
		const body = calls.at(-1)!.init!.body as URLSearchParams;
		const payload = JSON.parse(luxDecode(body.get('json')!));
		expect(payload.peq[0]).toMatchObject({ index: 0, name: 'Mine', canDel: 0, preamp: -2 });
		expect(JSON.parse(payload.peq[0].filters)).toEqual([{ type: 4, fc: 1000, gain: 2, q: 1 }]);
	});
});
