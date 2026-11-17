//
// The address typed for a network device. It goes straight into `https://${host}/…` and
// `http://${host}/…`, so anything that isn't a bare host (a path, credentials, a scheme, a public
// name) would send device commands somewhere else. Pure, so the UI and `network.ts` share it.
//
// Accepted, each with an optional `:port`:
//   - an IPv4 literal (`192.168.1.20`)
//   - an IPv6 literal, bracketed (`[fe80::1]:8080`) or, without a port, bare (`fe80::1`)
//   - a single-label name (`wiim`) or an mDNS name (`wiim.local`)
//
// Private ranges are deliberately not enforced: devices are reached over VPNs and routed subnets
// too, and a range check says nothing about who owns the address. What is refused is a name that
// resolves through public DNS, which is how a typo or a pasted URL would leave the network.
//

/** Why an address was refused: nothing typed, malformed, a public hostname, or a bad port. */
export type NetworkHostProblem = 'empty' | 'invalid' | 'public' | 'port';

export type ParsedNetworkHost =
	| {
			ok: true;
			/** What goes after `//` in a URL: lower-cased, IPv6 bracketed, the port kept. */
			host: string;
			/** The name or address alone, IPv6 still bracketed. */
			hostname: string;
			port: number | null;
	  }
	| { ok: false; problem: NetworkHostProblem };

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Nothing here belongs in a host; `%` is an IPv6 zone id, which fetch can't address. */
const FORBIDDEN = /[\s/\\?#@%]/;

const fail = (problem: NetworkHostProblem): ParsedNetworkHost => ({ ok: false, problem });

/** An IPv6 literal in its normalized, bracketed form, or null. */
function normalizeIpv6(literal: string): string | null {
	if (!literal.includes(':') || !/^[0-9a-f:.]+$/i.test(literal)) return null;
	try {
		const { hostname } = new URL(`http://[${literal}]`);
		return hostname.startsWith('[') ? hostname : null;
	} catch {
		return null;
	}
}

function parsePort(text: string): number | 'invalid' | 'port' {
	if (!/^\d{1,5}$/.test(text)) return 'invalid';
	const port = Number(text);
	return port >= 1 && port <= 65535 ? port : 'port';
}

export function parseNetworkHost(input: string): ParsedNetworkHost {
	const text = input.trim();
	if (!text) return fail('empty');
	if (FORBIDDEN.test(text)) return fail('invalid');

	let hostPart: string;
	let portPart: string | null = null;
	let v6: string | null = null;

	if (text.startsWith('[')) {
		const match = /^\[([^\]]+)\](?::(.*))?$/.exec(text);
		if (!match) return fail('invalid');
		v6 = normalizeIpv6(match[1]);
		if (!v6) return fail('invalid');
		hostPart = v6;
		portPart = match[2] ?? null;
		if (portPart === '') return fail('invalid');
	} else if (text.split(':').length > 2) {
		// A bare IPv6 literal: a trailing group can't be told from a port, so none is accepted.
		v6 = normalizeIpv6(text);
		if (!v6) return fail('invalid');
		hostPart = v6;
	} else {
		const colon = text.indexOf(':');
		hostPart = (colon === -1 ? text : text.slice(0, colon)).toLowerCase();
		if (colon !== -1) portPart = text.slice(colon + 1);
	}

	let port: number | null = null;
	if (portPart !== null) {
		const parsed = parsePort(portPart);
		if (typeof parsed !== 'number') return fail(parsed);
		port = parsed;
	}

	if (!v6 && !IPV4.test(hostPart)) {
		const labels = hostPart.split('.');
		if (!labels.every((label) => LABEL.test(label))) return fail('invalid');
		if (labels.length === 1) {
			// All digits is what a URL parser reads as a 32-bit IPv4 address (`3232235777`).
			if (/^\d+$/.test(hostPart)) return fail('invalid');
		} else if (labels.at(-1) !== 'local') {
			// 999.1.1.1 and 1.2.3 are mistyped addresses, not names: say "invalid", not "public".
			return fail(labels.every((label) => /^\d+$/.test(label)) ? 'invalid' : 'public');
		}
	}

	return {
		ok: true,
		host: port === null ? hostPart : `${hostPart}:${port}`,
		hostname: hostPart,
		port
	};
}

/**
 * The Local Network Access address space a host is in, for `fetch`'s `targetAddressSpace`, or
 * undefined when it can't be told from the text. Declaring a space the address isn't in makes the
 * browser abort the request, so a VPN or CGNAT address (Tailscale's 100.64/10 is "public" to the
 * browser) and anything unrecognised declares nothing and takes the browser's own check.
 *
 * For a name the answer is the likely one, not a settled one (`isNamedHost`): a single-label
 * or `.local` name can resolve to a VPN address or, through a hosts file, to this machine.
 */
export function addressSpaceOf(hostname: string): 'local' | 'loopback' | undefined {
	const name = hostname.toLowerCase();
	if (name === 'localhost' || name === '[::1]') return 'loopback';
	if (name.endsWith('.local') || (!name.includes('.') && !name.startsWith('['))) return 'local';
	const v4 = IPV4.test(name) ? name.split('.').map(Number) : null;
	if (v4) {
		const [a, b] = v4;
		if (a === 127) return 'loopback';
		if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'local';
		if (a === 169 && b === 254) return 'local';
		return undefined;
	}
	if (name.startsWith('[')) {
		const first = parseInt(name.slice(1).split(':')[0], 16);
		if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return 'local';
	}
	return undefined;
}

/** A name, not an address literal: what it resolves to is not in its text. */
export function isNamedHost(hostname: string): boolean {
	return !hostname.startsWith('[') && !IPV4.test(hostname);
}

/** Thrown for an address `parseNetworkHost` refuses, before anything is sent. */
export class NetworkHostError extends Error {
	readonly problem: NetworkHostProblem;
	constructor(problem: NetworkHostProblem) {
		super(`Invalid network device address (${problem})`);
		this.name = 'NetworkHostError';
		this.problem = problem;
	}
}

/** The URL host for `input`, or a `NetworkHostError`. */
export function requireNetworkHost(input: string): string {
	const parsed = parseNetworkHost(input);
	if (!parsed.ok) throw new NetworkHostError(parsed.problem);
	return parsed.host;
}
