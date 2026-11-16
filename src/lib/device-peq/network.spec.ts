import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	MAX_RESPONSE_BYTES,
	NetworkAccessError,
	NetworkResponseError,
	connectNetworkDevice,
	luxDecode,
	luxEncode,
	readBoundedText
} from './network.js';
import { NetworkHostError } from './network-host.js';

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
			return new Response(responses.shift() ?? '');
		})
	);
});
afterEach(() => vi.unstubAllGlobals());

describe('the device address', () => {
	it('is refused before anything is sent', async () => {
		for (const bad of ['example.com', 'evil.example/x', 'user@10.0.0.2', 'http://10.0.0.2', '']) {
			expect(() => connectNetworkDevice(bad, 'WiiM'), bad).toThrow(NetworkHostError);
			expect(() => connectNetworkDevice(bad, 'LuxsinX9'), bad).toThrow(NetworkHostError);
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it('keeps the port and brackets an IPv6 literal in the URL', async () => {
		await connectNetworkDevice('[FD00::5]:8080', 'LuxsinX9').device.setEnabled(true);
		expect(calls[0].url).toBe('http://[fd00::5]:8080/dev/info.cgi');
	});

	it('declares the local address space where the host settles it', async () => {
		await connectNetworkDevice('192.168.0.9', 'LuxsinX9').device.setEnabled(true);
		await connectNetworkDevice('wiim.local', 'LuxsinX9').device.setEnabled(true);
		await connectNetworkDevice('127.0.0.1', 'LuxsinX9').device.setEnabled(true);
		await connectNetworkDevice('100.64.1.2', 'LuxsinX9').device.setEnabled(true);
		const space = (i: number) =>
			(calls[i].init as { targetAddressSpace?: string }).targetAddressSpace;
		expect([space(0), space(1), space(2), space(3)]).toEqual([
			'local',
			'local',
			'loopback',
			undefined
		]);
	});

	it('turns a failed fetch (mixed content, a denied prompt, nothing there) into one error', async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await expect(connectNetworkDevice('10.0.0.2', 'WiiM').device.pull()).rejects.toBeInstanceOf(
			NetworkAccessError
		);
	});
});

describe('a device answer that is too large', () => {
	const big = 'x'.repeat(MAX_RESPONSE_BYTES + 1);

	it('is refused by its Content-Length without reading the body', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({ cancel });
		const response = new Response(body, { headers: { 'Content-Length': String(big.length) } });
		await expect(readBoundedText(response)).rejects.toBeInstanceOf(NetworkResponseError);
		expect(cancel).toHaveBeenCalled();
	});

	it('is refused by counting bytes when no length is declared', async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const chunk = new Uint8Array(256 * 1024);
				for (let i = 0; i < 5; i++) controller.enqueue(chunk);
				controller.close();
			}
		});
		await expect(readBoundedText(new Response(stream))).rejects.toBeInstanceOf(
			NetworkResponseError
		);
	});

	it('reads an ordinary answer, multi-byte text included', async () => {
		expect(await readBoundedText(new Response('{"name":"Ü-profile"}'))).toBe(
			'{"name":"Ü-profile"}'
		);
		expect(await readBoundedText(new Response(null))).toBe('');
	});

	it('fails a device read rather than parsing it', async () => {
		responses.push(big);
		await expect(connectNetworkDevice('10.0.0.2', 'WiiM').device.pull()).rejects.toBeInstanceOf(
			NetworkResponseError
		);
	});
});

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
