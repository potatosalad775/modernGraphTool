/**
 * A device connected in uniPEQ, reached over the uniPEQ link (`services/link-service.svelte.ts`),
 * behind the same `PeqDevice` shape as a USB device. uniPEQ holds the band list and writes the
 * device, so this side only asks: `pull` is uniPEQ's Read, `setEnabled` its Device EQ, `close`
 * unlinks. `push` is never called: a write is the `write` command, planned and reviewed in uniPEQ.
 *
 * Also the conversions between the app's band list and the link's: the link carries eqcaps
 * filters in slot order, one list for both ears or, while uniPEQ's channels are apart, one per
 * ear, with no per-band on/off.
 *
 * Only types come from `peq-link`, so nothing here pulls the client into the boot bundle.
 */
import {
	resolveSlot,
	validateProfile,
	type Filter,
	type Profile
} from '@potatosalad775/eqcaps-core';
import type {
	Channel,
	CommandArgs,
	CommandName,
	CommandResult,
	EditOp,
	Filter as LinkFilter,
	LinkDevice,
	LinkStatus
} from 'peq-link/client';
import { effectiveFilters, type EqChannel } from '#lib/utils/eq-channel.js';
import { fromCapsFilter, toCapsFilter } from '#lib/utils/eq-constraint.js';
import { usesGain, type EQFilter } from '#lib/utils/equalizer.js';
import { isRecord } from '#lib/utils/type-guards.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice, PullResult } from './types.js';

// ── Band lists ──────────────────────────────────────────────────────────────

/** What uniPEQ holds, as far as this page knows. `right !== null` ⇔ uniPEQ's channels are apart. */
export interface LinkLists {
	left: LinkFilter[];
	right: LinkFilter[] | null;
}

/**
 * The app's list as the link carries it: without `ear` the shared bands, with it the shared bands
 * plus that ear's own (`effectiveFilters`), in list order. A disabled band goes flat (0 dB at its
 * own Fc and Q, as a push writes it), incomplete bands are left out. A disabled pass or notch has
 * no flat form, so it is left out too. While linked the list holds no disabled band (per-band
 * on/off is unavailable), but undo can bring back a list from before.
 */
export function toLinkFilters(filters: EQFilter[], ear?: EqChannel): Filter[] {
	const bands = ear ? effectiveFilters(filters, ear) : filters.filter((f) => f.channel == null);
	return bands.flatMap((f) => {
		if (!f.enabled && !usesGain(f.type)) return [];
		const caps = toCapsFilter(f.enabled ? f : { ...f, gain: 0 });
		return caps ? [caps] : [];
	});
}

/** The app's list as uniPEQ holds it: one list for both ears, or each ear's while `apart`. */
export function toLinkLists(filters: EQFilter[], apart: boolean): LinkLists {
	return apart
		? { left: toLinkFilters(filters, 'L'), right: toLinkFilters(filters, 'R') }
		: { left: toLinkFilters(filters), right: null };
}

/**
 * The link's list as app bands. The wire allows any type string; one eqcaps doesn't know has no
 * app row and is left out, though uniPEQ holds no `x-` types either, so none arrive in practice.
 */
export function fromLinkFilters(filters: LinkFilter[]): EQFilter[] {
	return filters.flatMap((f) => fromCapsFilter(f as Filter) ?? []);
}

/**
 * uniPEQ's lists as app bands, in slot order: a slot both ears hold alike is one shared band, any
 * other slot the left ear's band and the right ear's, in its place. So `toLinkLists` gives back the
 * same lists, and a band op names the slot uniPEQ has the band in. `listFromPull` reads a device
 * the same way but groups the bands by ear, which loses the slots.
 */
export function fromLinkLists({ left, right }: LinkLists): EQFilter[] {
	if (!right) return fromLinkFilters(left);
	const ear = (f: LinkFilter | undefined, channel: EqChannel): EQFilter[] =>
		f ? fromLinkFilters([f]).map((band) => ({ ...band, channel })) : [];
	return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => {
		const [l, r] = [left.at(i), right.at(i)];
		return l && r && filtersEqual(l, r) ? fromLinkFilters([l]) : [...ear(l, 'L'), ...ear(r, 'R')];
	}).flat();
}

/**
 * What "Send this EQ to uniPEQ" changes on the way: the start dialog says both counts. One-ear
 * bands are dropped unless uniPEQ's device takes them (`keepsEars`).
 */
export function sendLosses(
	filters: EQFilter[],
	keepsEars: boolean
): { flattened: number; dropped: number } {
	let flattened = 0;
	let dropped = 0;
	for (const f of filters) {
		if ((f.channel != null && !keepsEars) || (!f.enabled && !usesGain(f.type))) dropped++;
		else if (!f.enabled) flattened++;
	}
	return { flattened, dropped };
}

function filtersEqual(a: LinkFilter, b: LinkFilter): boolean {
	return a.type === b.type && a.freq === b.freq && a.q === b.q && a.gain === b.gain;
}

/**
 * The ops that take one of uniPEQ's lists from `before` to `after`, for channel `ch` or, without
 * it, for both. One band changed is a `band` op, so an edit to another band made in uniPEQ
 * meanwhile survives. Anything bigger (a band added or removed, AutoEQ, an import, an undo across
 * several bands) is one `list` op: it means the whole list.
 */
export function linkOps(before: LinkFilter[], after: LinkFilter[], ch?: Channel): EditOp[] {
	const to = ch ? { ch } : {};
	if (before.length !== after.length) return [{ op: 'list', filters: after, ...to }];
	const changed = after.flatMap((f, i) => (filtersEqual(f, before[i]) ? [] : [i]));
	if (changed.length === 0) return [];
	if (changed.length === 1) {
		return [{ op: 'band', i: changed[0], filter: after[changed[0]], ...to }];
	}
	return [{ op: 'list', filters: after, ...to }];
}

/**
 * The ops that take uniPEQ from `before` to `after`, channels included. Setting the channels apart
 * starts the right one as a copy of the left, and joining them keeps the left's (protocol 1.3).
 * While they stay apart, an edit that lands alike on both (a shared band) goes once, for both.
 */
export function linkEdit(before: LinkLists, after: LinkLists): EditOp[] {
	if (!after.right) {
		const ops = linkOps(before.left, after.left);
		return before.right ? [{ op: 'channels', apart: false }, ...ops] : ops;
	}
	if (!before.right) {
		return [
			{ op: 'channels', apart: true },
			...linkOps(before.left, after.left, 'left'),
			...linkOps(before.left, after.right, 'right')
		];
	}
	const both = linkOps(before.left, after.left);
	if (JSON.stringify(both) === JSON.stringify(linkOps(before.right, after.right))) return both;
	return [
		...linkOps(before.left, after.left, 'left'),
		...linkOps(before.right, after.right, 'right')
	];
}

// ── The device ──────────────────────────────────────────────────────────────

/** What the device needs of the link: `HostLink` satisfies it. */
export interface LinkPort {
	readonly status: LinkStatus | null;
	command<N extends CommandName>(
		name: N,
		...args: CommandArgs[N] extends undefined ? [] : [CommandArgs[N]]
	): Promise<CommandResult>;
	unlink(): void;
}

/**
 * A command uniPEQ couldn't carry out, as a `BridgeError` look-alike: `describeDeviceError` and
 * `isConnectionLost` read uniPEQ's eqcaps codes as they read the bridge's own.
 */
export class LinkCommandError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(`uniPEQ: ${code}`);
		this.name = 'BridgeError';
		this.code = code;
	}
}

/** Resolves when uniPEQ says the command is done; its effects arrive as `eq` and `status`. */
async function run(result: Promise<CommandResult>): Promise<void> {
	const { ok, code } = await result;
	if (!ok) throw new LinkCommandError(code ?? 'failed');
}

export class LinkPeqDevice implements PeqDevice {
	readonly capabilities: PeqCapabilities;
	readonly #link: LinkPort;

	constructor(link: LinkPort, capabilities: PeqCapabilities) {
		this.#link = link;
		this.capabilities = capabilities;
	}

	/** uniPEQ reads its target preset into the shared list, which arrives as an `eq`. */
	async pull(): Promise<PullResult> {
		await run(this.#link.command('read'));
		return { filters: [] };
	}

	async push(): Promise<never> {
		throw new LinkCommandError('unsupported');
	}

	async currentSlot(): Promise<number | null> {
		return this.#link.status?.deviceSlot ?? null;
	}

	/** uniPEQ reports it in `status`, which the link service mirrors into the store. */
	async eqEnabled(): Promise<boolean | null> {
		return this.#link.status?.eqEnabled ?? null;
	}

	async setEnabled(enabled: boolean, slot?: number): Promise<void> {
		const value = !enabled ? 'off' : slot !== undefined ? `p${slot}` : 'on';
		await run(this.#link.command('switch', { value }));
	}

	/** Ends the link: the device is uniPEQ's, and only the link reached it. */
	async close(): Promise<void> {
		this.#link.unlink();
	}

	/** uniPEQ plans a write of the shared list; one that needs review shows as `status.review`. */
	write(): Promise<void> {
		return run(this.#link.command('write'));
	}

	/** The answer to `status.review`. uniPEQ re-plans instead if the list moved since. */
	review(rev: number, accept: boolean): Promise<void> {
		return run(this.#link.command('review', { rev, accept }));
	}

	/** Reconnects a device that dropped, or one that restarts to save (`disconnectOnSave`). */
	reconnect(): Promise<void> {
		return run(this.#link.command('reconnect'));
	}

	/**
	 * The answer to uniPEQ's volume warning (`status.consent`); `quiet` turns uniPEQ's off for later
	 * connections. Either side's answer closes both.
	 */
	consent(accept: boolean, quiet: boolean): Promise<void> {
		return run(this.#link.command('consent', { accept, quiet }));
	}

	/** uniPEQ's auto-write setting: one setting, kept in uniPEQ. */
	setAutoWrite(on: boolean): Promise<void> {
		return run(this.#link.command('auto-write', { on }));
	}
}

// ── What uniPEQ says about its device ───────────────────────────────────────

/** Codes that mean the profile can't be used to fit or check a band at all. */
const BROKEN = /^(schema|domain-|bands-|band-index-|slot-incomplete|dependency-cycle|variant-)/;

/**
 * The profile, or null when it isn't one eqcaps can use. It arrives over the wire, and a profile
 * that throws in `resolveSlot` would break every band card while the link lasts.
 */
export function acceptProfile(value: unknown): Profile | null {
	if (!isRecord(value) || !isRecord(value.band)) return null;
	const count = value.bandCount;
	if (count !== null && !(Number.isInteger(count) && (count as number) >= 0)) return null;
	const profile = value as unknown as Profile;
	try {
		if (validateProfile(profile).some((issue) => BROKEN.test(issue.code))) return null;
		resolveSlot(profile, 0);
	} catch {
		return null;
	}
	return profile;
}

/**
 * uniPEQ's capability subset, with anything missing or malformed read as "can't". Of what protocol
 * 1.3 added (`minor`) only `perChannel`: the link routes no command for the device's settings,
 * other EQs or preset list yet, so the UI for them stays off.
 */
export function acceptCapabilities(value: unknown, minor: number): PeqCapabilities {
	const c = isRecord(value) ? value : {};
	const flag = (key: string) => c[key] === true;
	const slots = Array.isArray(c.slots)
		? c.slots.flatMap((s) =>
				isRecord(s) && Number.isInteger(s.id) && typeof s.name === 'string'
					? [
							{
								id: s.id as number,
								name: s.name,
								...(s.bypass === true ? { bypass: true } : {}),
								...(s.writable === true ? { writable: true } : {})
							}
						]
					: []
			)
		: [];
	return {
		canRead: flag('canRead'),
		canWrite: flag('canWrite'),
		readsPreamp: flag('readsPreamp'),
		readsSlot: flag('readsSlot'),
		writesPreamp: flag('writesPreamp'),
		writesSlot: flag('writesSlot'),
		readsCurrentSlot: flag('readsCurrentSlot'),
		// uniPEQ reads the switch and says what it found in `status`.
		readsEnabled: false,
		canEnable: flag('canEnable'),
		slots,
		disconnectOnSave: flag('disconnectOnSave'),
		experimental: flag('experimental'),
		perChannel: minor >= 3 && flag('perChannel')
	};
}

/**
 * uniPEQ's device as a Hardware EQ connection, or null when its profile can't be used. `minor` is
 * the session's (`HostLink.minor`).
 */
export function linkConnection(
	link: LinkPort,
	device: LinkDevice,
	minor: number
): DeviceConnection | null {
	const profile = acceptProfile(device.profile);
	if (!profile) return null;
	return {
		device: new LinkPeqDevice(link, acceptCapabilities(device.capabilities, minor)),
		connectionType: 'link',
		name: device.name,
		profile,
		profileSource: device.profileSource,
		profileId: device.profileId,
		identity: isRecord(device.identity) ? device.identity : {}
	};
}
