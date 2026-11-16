import { describe, it, expect } from 'vitest';
import {
	NetworkHostError,
	addressSpaceOf,
	parseNetworkHost,
	requireNetworkHost
} from './network-host.js';

const host = (input: string) => {
	const parsed = parseNetworkHost(input);
	return parsed.ok ? parsed.host : parsed.problem;
};

describe('parseNetworkHost', () => {
	it('accepts IPv4 literals, with an optional port', () => {
		expect(host('192.168.1.20')).toBe('192.168.1.20');
		expect(host('  10.0.0.2  ')).toBe('10.0.0.2');
		expect(host('192.168.1.20:8080')).toBe('192.168.1.20:8080');
	});

	it('does not restrict address ranges', () => {
		for (const ip of ['10.8.0.4', '172.20.1.1', '100.64.1.2', '8.8.8.8', '127.0.0.1']) {
			expect(host(ip)).toBe(ip);
		}
	});

	it('accepts IPv6 literals, bracketed or bare', () => {
		expect(host('[fe80::1]')).toBe('[fe80::1]');
		expect(host('[FE80::A]:8080')).toBe('[fe80::a]:8080');
		expect(host('fd00::1234')).toBe('[fd00::1234]');
		expect(host('::1')).toBe('[::1]');
	});

	it('accepts single-label and .local names, lower-cased', () => {
		expect(host('wiim')).toBe('wiim');
		expect(host('WiiM-Mini.local')).toBe('wiim-mini.local');
		expect(host('living-room.local:8443')).toBe('living-room.local:8443');
	});

	it('reports the parts', () => {
		expect(parseNetworkHost('[::1]:81')).toEqual({
			ok: true,
			host: '[::1]:81',
			hostname: '[::1]',
			port: 81
		});
	});

	it('refuses nothing typed', () => {
		expect(host('')).toBe('empty');
		expect(host('   ')).toBe('empty');
	});

	it('refuses schemes, paths, queries, credentials and whitespace', () => {
		for (const bad of [
			'http://192.168.1.20',
			'https://wiim.local',
			'192.168.1.20/admin',
			'192.168.1.20?x=1',
			'192.168.1.20#top',
			'user@192.168.1.20',
			'user:pw@192.168.1.20',
			'evil.example/x@192.168.1.20',
			'192.168.1.20\\x',
			'192.168.1.20 8080',
			'wiim .local',
			'fe80::1%eth0'
		]) {
			expect(host(bad), bad).toBe('invalid');
		}
	});

	it('refuses public hostnames', () => {
		for (const bad of [
			'example.com',
			'wiim.example.com',
			'wiim.local.example.com',
			'a.b.localhost'
		]) {
			expect(host(bad), bad).toBe('public');
		}
	});

	it('refuses malformed addresses', () => {
		for (const bad of [
			'999.1.1.1',
			'1.2.3',
			'1.2.3.4.5',
			'3232235777',
			'192.168.1.20.',
			'.local',
			'-wiim',
			'wi_im',
			'[192.168.1.20]',
			'[::1',
			'[fe80::1]x',
			'[gggg::1]',
			'1:2:3:4:5:6:7:8:9',
			'wiim.local:',
			'wiim.local:http'
		]) {
			expect(host(bad), bad).toBe('invalid');
		}
	});

	it('refuses a port outside 1-65535', () => {
		expect(host('192.168.1.20:0')).toBe('port');
		expect(host('192.168.1.20:65536')).toBe('port');
		expect(host('[::1]:99999')).toBe('port');
		expect(host('192.168.1.20:65535')).toBe('192.168.1.20:65535');
	});
});

describe('addressSpaceOf', () => {
	it('names the space of private, link-local and mDNS hosts', () => {
		for (const h of ['192.168.1.20', '10.0.0.2', '172.16.0.1', '172.31.9.9', '169.254.1.1']) {
			expect(addressSpaceOf(h), h).toBe('local');
		}
		for (const h of ['wiim.local', 'wiim', '[fd00::1]', '[fe80::1]', '[fc12::5]']) {
			expect(addressSpaceOf(h), h).toBe('local');
		}
	});

	it('names loopback', () => {
		for (const h of ['127.0.0.1', '127.1.2.3', '[::1]', 'localhost']) {
			expect(addressSpaceOf(h), h).toBe('loopback');
		}
	});

	it('declares nothing for VPN, CGNAT and public addresses, so they are not aborted', () => {
		for (const h of ['100.64.1.2', '172.32.0.1', '172.15.0.1', '8.8.8.8', '[2001:db8::1]']) {
			expect(addressSpaceOf(h), h).toBeUndefined();
		}
	});
});

describe('requireNetworkHost', () => {
	it('returns the URL host', () => {
		expect(requireNetworkHost(' Wiim.LOCAL ')).toBe('wiim.local');
	});

	it('throws a NetworkHostError carrying the problem', () => {
		expect(() => requireNetworkHost('example.com')).toThrow(NetworkHostError);
		try {
			requireNetworkHost('a/b');
		} catch (e) {
			expect((e as NetworkHostError).problem).toBe('invalid');
		}
	});
});
