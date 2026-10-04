/**
 * Connecting a device: the browser's chooser, then the eqcaps database says which device it is
 * (`matchDevice`), what it accepts (its profile) and how to drive it (the profile's `protocol`).
 *
 * Only ever reached through a dynamic `import()` from `DevicePeq.svelte`, so neither the bridge nor
 * the client is in the boot bundle.
 */
import type { IndexEntry, Profile } from '@potatosalad775/eqcaps-core';
import type { DeviceMatch } from '@potatosalad775/eqcaps-client';
import {
	analyzeCodec,
	guessProtocol,
	HANDLERS,
	identityOf,
	openDevice,
	protocolForMatches,
	protocolOf,
	transportsOf,
	type DeviceIdentity,
	type Protocol,
	type Transport
} from '@potatosalad775/eqcaps-device-bridge';
import {
	grantedHidDevice,
	requestBleDevice,
	requestHidDevice,
	requestSerialPort
} from '@potatosalad775/eqcaps-device-bridge/browser';
import { eqcapsClient } from '$lib/services/eqcaps-client.js';
import type { DeviceCandidate, DeviceConnection, ProfileSource } from './types.js';

export type BridgeConnectionType = 'hid' | 'serial' | 'ble';

/**
 * What a connect attempt came to.
 *
 * - `connected`: open and ready.
 * - `cancelled`: the user closed the browser's chooser.
 * - `choose`: the device's identity fits several profiles (or a Bluetooth serial port, which
 *   names no device at all): the user picks one, then `finish` opens it.
 * - `unsupported`: no profile and no protocol this bridge speaks. `identity` is for an issue.
 */
export type ConnectResult =
	| { kind: 'connected'; connection: DeviceConnection }
	| { kind: 'cancelled' }
	| {
			kind: 'choose';
			candidates: DeviceCandidate[];
			finish(id: string): Promise<ConnectResult>;
			cancel(): Promise<void>;
	  }
	| { kind: 'unsupported'; identity: DeviceIdentity };

function entryLabel(e: Pick<IndexEntry, 'brand' | 'model' | 'engine'>): string {
	const name = `${e.brand} ${e.model}`;
	return e.engine ? `${name} · ${e.engine}` : name;
}

/** Hardware entries a transport kind can drive, for the user to pick from. */
function drivable(entries: IndexEntry[], kind: Transport['kind']): IndexEntry[] {
	return entries.filter((e) => {
		if (e.kind !== 'hardware' || e.status === 'deprecated') return false;
		const p = protocolOf(e);
		return !!p && transportsOf(HANDLERS[p.handler]).includes(kind);
	});
}

/** Matches tied at the top, the ones `matchDevice` refused to choose between. */
function topTies(matches: DeviceMatch<IndexEntry>[]): DeviceMatch<IndexEntry>[] {
	const top = matches[0];
	if (!top) return [];
	return matches.filter((m) => m.specificity === top.specificity && m.group === top.group);
}

/**
 * Limits for a device with no profile: what its protocol's write frames can carry
 * (`analyzeCodec`), so a push never asks for a value the wire would refuse. The band count is the
 * protocol's own when it fixes one, else ten.
 */
export function guessedProfile(protocol: Protocol, name: string): Profile {
	const a = analyzeCodec(protocol);
	const bandCount = a.bands.min === a.bands.max ? a.bands.min : Math.min(10, a.bands.max);
	const types = a.types.filter((t) => t === 'PK' || t === 'LSC' || t === 'HSC');
	return {
		schemaVersion: '1.0',
		id: `guess-${protocol.handler}`,
		kind: 'hardware',
		device: { brand: name, model: '' },
		bandCount: Math.max(1, bandCount),
		band: {
			types: types.length ? types : ['PK'],
			freq: a.freq ?? { min: 20, max: 20000 },
			q: a.q ?? { min: 0.1, max: 10 },
			gain: a.gain ?? { min: -12, max: 12 }
		},
		preamp: a.preamp ? { mode: 'manual', gain: a.preamp } : { mode: 'unknown' },
		meta: { status: 'draft', sources: [] }
	};
}

interface Resolved {
	protocol: Protocol;
	profile: Profile;
	profileSource: ProfileSource;
	profileId: string | null;
	name: string;
}

/**
 * The protocol and profile for a chosen profile id, or for the best of `matches`. The protocol
 * comes from the most specific match that has one (a device profile under a group profile is
 * driven by the group's); the limits from the chosen profile itself.
 */
async function resolve(
	matches: DeviceMatch<IndexEntry>[],
	chosen: IndexEntry | null,
	fallbackName: string,
	vendorId: number | null
): Promise<Resolved | null> {
	const client = eqcapsClient();
	const protocol =
		(chosen && protocolOf(chosen)) ??
		protocolForMatches(chosen ? [{ id: chosen.id, entry: chosen }, ...matches] : matches)?.protocol;
	if (chosen && protocol) {
		const profile = await client.loadProfile(chosen.id);
		if (profile) {
			return {
				protocol,
				profile,
				profileSource: chosen.group ? 'group' : 'device',
				profileId: chosen.id,
				name: entryLabel(chosen)
			};
		}
		// Index reachable, profile not: drive it on its protocol with the protocol's own limits.
		return {
			protocol,
			profile: guessedProfile(protocol, entryLabel(chosen)),
			profileSource: 'guess',
			profileId: null,
			name: entryLabel(chosen)
		};
	}
	const guess = vendorId !== null ? guessProtocol(vendorId) : undefined;
	if (!guess) return null;
	return {
		protocol: guess,
		profile: guessedProfile(guess, fallbackName),
		profileSource: 'guess',
		profileId: null,
		name: fallbackName
	};
}

function connection(
	transportKind: BridgeConnectionType,
	transport: Transport,
	r: Resolved,
	reopen?: () => Promise<DeviceConnection | null>
): DeviceConnection {
	const device = openDevice(transport, r.protocol, { profile: { bandCount: r.profile.bandCount } });
	return {
		device,
		connectionType: transportKind,
		name: r.name,
		profile: r.profile,
		profileSource: r.profileSource,
		profileId: r.profileId,
		identity: device.identity,
		...(reopen ? { reopen } : {})
	};
}

/**
 * Walks one chosen device from its identity to an open connection. `open` turns the resolved
 * protocol into a transport (HID is open already; serial and BLE open once the protocol is known,
 * since it sets the baud rate or GATT layout). `pickFrom` is what to offer when nothing matched.
 */
async function identify(opts: {
	kind: BridgeConnectionType;
	identity: DeviceIdentity;
	fallbackName: string;
	vendorId: number | null;
	open: (protocol: Protocol) => Promise<Transport>;
	close: () => Promise<void>;
	pickFrom: IndexEntry[];
	reopen?: (r: Resolved) => () => Promise<DeviceConnection | null>;
}): Promise<ConnectResult> {
	const { best, matches, ambiguous } = await eqcapsClient().matchDevice(opts.identity);

	const finishWith = async (chosen: IndexEntry | null): Promise<ConnectResult> => {
		const r = await resolve(matches, chosen, opts.fallbackName, opts.vendorId);
		if (!r) {
			await opts.close();
			return { kind: 'unsupported', identity: opts.identity };
		}
		const transport = await opts.open(r.protocol);
		return {
			kind: 'connected',
			connection: connection(opts.kind, transport, r, opts.reopen?.(r))
		};
	};

	const offer = ambiguous ? topTies(matches).map((m) => m.entry) : best ? [] : opts.pickFrom;
	if (best) return finishWith(best.entry);
	if (offer.length > 0 && (ambiguous || opts.vendorId === null || !guessProtocol(opts.vendorId))) {
		return {
			kind: 'choose',
			candidates: offer.map((e) => ({ id: e.id, label: entryLabel(e) })),
			finish: (id) => finishWith(offer.find((e) => e.id === id) ?? null),
			cancel: opts.close
		};
	}
	return finishWith(null);
}

let indexLoad: Promise<IndexEntry[]> | null = null;

/**
 * Start loading the index ahead of a click. The browser's choosers need the click's user
 * activation, which a slow fetch in between can use up, so the connect buttons call this on hover
 * and focus. Only the request in flight is shared; the client caches the answer itself.
 */
export function warmUp(): Promise<IndexEntry[]> {
	indexLoad ??= eqcapsClient()
		.loadIndex()
		.then((index) => index?.profiles ?? [])
		.finally(() => {
			indexLoad = null;
		});
	return indexLoad;
}

/** How long a click waits for the index before opening the chooser without it, ms. */
const INDEX_WAIT_MS = 1500;

/**
 * The index entries, or none if they take longer than `INDEX_WAIT_MS`: the HID chooser then offers
 * the vendors the bridge can guess, and the device is still matched once the index arrives.
 */
async function indexEntries(): Promise<IndexEntry[]> {
	const timeout = new Promise<null>((r) => setTimeout(() => r(null), INDEX_WAIT_MS));
	return (await Promise.race([warmUp(), timeout])) ?? [];
}

/** USB HID: the chooser offers the database's devices plus the vendors the bridge can guess. */
export async function connectHid(): Promise<ConnectResult> {
	const entries = await indexEntries();
	const transport = await requestHidDevice({ entries });
	if (!transport || transport.kind !== 'hid') return { kind: 'cancelled' };
	const identity = identityOf(transport);
	const usb = identity.usb;
	return identify({
		kind: 'hid',
		identity,
		fallbackName: usb?.productName?.trim() || 'USB device',
		vendorId: usb ? parseInt(usb.vendorId, 16) : null,
		open: async () => transport,
		close: () => transport.close().catch(() => {}),
		pickFrom: [],
		reopen: (r) => async () => {
			if (!usb?.productId || usb.productName === undefined) return null;
			const again = await grantedHidDevice({
				vendorId: parseInt(usb.vendorId, 16),
				productId: parseInt(usb.productId, 16),
				productName: usb.productName
			});
			return again ? connection('hid', again, r) : null;
		}
	});
}

/**
 * USB or Bluetooth serial. A Bluetooth port shows only its service class, which several devices
 * share, so an unmatched port asks which device it is.
 */
export async function connectSerial(): Promise<ConnectResult> {
	const entries = await indexEntries();
	const choice = await requestSerialPort({ entries });
	if (!choice) return { kind: 'cancelled' };
	return identify({
		kind: 'serial',
		identity: choice.identity,
		fallbackName: 'Serial device',
		vendorId: null,
		open: (protocol) => choice.open(protocol),
		close: async () => {},
		pickFrom: drivable(entries, 'serial')
	});
}

/** Bluetooth LE: matched by advertised name. */
export async function connectBle(): Promise<ConnectResult> {
	const entries = await indexEntries();
	const choice = await requestBleDevice({ entries });
	if (!choice) return { kind: 'cancelled' };
	return identify({
		kind: 'ble',
		identity: choice.identity,
		fallbackName: choice.identity.bluetooth?.name ?? 'Bluetooth device',
		vendorId: null,
		open: (protocol) => choice.open(protocol),
		close: async () => {},
		pickFrom: drivable(entries, 'ble')
	});
}
