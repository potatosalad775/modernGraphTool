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
	type Control,
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
	LinkStatus,
	PlanChange as LinkPlanChange
} from 'peq-link/client';
import type { EqChannel } from '#lib/utils/eq-channel.js';
import { fromCapsFilter, toCapsFilter } from '#lib/utils/eq-constraint.js';
import { usesGain, type EQFilter } from '#lib/utils/equalizer.js';
import { isRecord } from '#lib/utils/type-guards.js';
import { byEar, type PlanChange } from './push-plan.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice, PullResult, Slot } from './types.js';

// ── Band lists ──────────────────────────────────────────────────────────────

/** What uniPEQ holds, as far as this page knows. `right !== null` ⇔ uniPEQ's channels are apart. */
export interface LinkLists {
	left: LinkFilter[];
	right: LinkFilter[] | null;
}

/**
 * A band as the link carries it, or null. A disabled band goes flat (0 dB at its own Fc and Q, as
 * a push writes it), incomplete bands are left out. A disabled pass or notch has no flat form, so
 * it is left out too. While linked the list holds no disabled band (per-band on/off is
 * unavailable), but undo can bring back a list from before.
 */
function linkFilter(f: EQFilter): Filter | null {
	if (!f.enabled && !usesGain(f.type)) return null;
	return toCapsFilter(f.enabled ? f : { ...f, gain: 0 });
}

/** The app's shared bands as the link carries them (`linkFilter`), in list order. */
export function toLinkFilters(filters: EQFilter[]): Filter[] {
	return filters.flatMap((f) => (f.channel == null ? (linkFilter(f) ?? []) : []));
}

/**
 * Which band uniPEQ holds in each slot, by its index in `filters`: of the one list, or of each
 * ear's while `apart`. An ear's list is the shared bands plus its own, and a shared band takes the
 * same slot in both, since `fromLinkLists` keeps a band shared only there: a one-ear band waits
 * until the other ear has one to pair it with, and those still waiting go last.
 */
export function linkSlots(
	filters: EQFilter[],
	apart: boolean
): { left: number[]; right: number[] | null } {
	const carried = filters.flatMap((f, i) => (linkFilter(f) ? [i] : []));
	if (!apart) return { left: carried.filter((i) => filters[i].channel == null), right: null };
	const left: number[] = [];
	const right: number[] = [];
	const waiting: Record<EqChannel, number[]> = { L: [], R: [] };
	for (const i of carried) {
		const ear = filters[i].channel;
		if (ear) {
			waiting[ear].push(i);
			continue;
		}
		const paired = Math.min(waiting.L.length, waiting.R.length);
		left.push(...waiting.L.splice(0, paired), i);
		right.push(...waiting.R.splice(0, paired), i);
	}
	return { left: [...left, ...waiting.L], right: [...right, ...waiting.R] };
}

/** The app's list as uniPEQ holds it: one list for both ears, or each ear's while `apart`. */
export function toLinkLists(filters: EQFilter[], apart: boolean): LinkLists {
	const caps = filters.map(linkFilter);
	const at = (slots: number[]) => slots.flatMap((i) => caps[i] ?? []);
	const { left, right } = linkSlots(filters, apart);
	return { left: at(left), right: right && at(right) };
}

/**
 * Whether the list holds one-ear bands the link carries. An incomplete one (just added) or a
 * switched-off pass or notch doesn't count: the link carries neither, so nothing would go apart.
 */
export function carriesEars(filters: EQFilter[]): boolean {
	return filters.some((f) => f.channel != null && linkFilter(f) !== null);
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

/**
 * uniPEQ's write review as this page's review dialog shows it. uniPEQ numbers a band by its place
 * in that channel's own list, and names the channel of every change while it writes them apart.
 * Here a band has its number in this page's list (`linkSlots` back), and a change both channels
 * carry is said once, as `planPush` says it for a device connected here.
 */
export function reviewChanges(changes: LinkPlanChange[], filters: EQFilter[]): PlanChange[] {
	const apart = changes.some((c) => c.channel);
	const slots = linkSlots(filters, apart);
	const ours = (c: LinkPlanChange, ch: Channel): PlanChange => {
		if (c.kind === 'preamp') return { kind: 'preamp', wanted: c.wanted, written: c.written };
		// A slot this page no longer has (its list moved since): uniPEQ's own number.
		const index = (ch === 'right' ? slots.right : slots.left)?.[c.band - 1];
		const band = index === undefined ? c.band : index + 1;
		if (c.kind === 'dropped') return { kind: 'dropped', band };
		return { kind: 'field', band, field: c.field, wanted: c.wanted, written: c.written };
	};
	if (!apart) return changes.map((c) => ours(c, 'left'));
	const of = (ch: Channel) => changes.filter((c) => c.channel === ch).map((c) => ours(c, ch));
	return byEar(of('left'), of('right'));
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

	/**
	 * Adds an empty preset after the last (`editsSlots`), named by the device. uniPEQ goes over to
	 * it, and the list arrives in `status.slots`.
	 */
	createPreset(): Promise<void> {
		return run(this.#link.command('preset-create', {}));
	}

	/** Fails `invalid-request` when the device can't store `name`, which isn't shortened to fit. */
	renamePreset(slot: number, name: string): Promise<void> {
		return run(this.#link.command('preset-rename', { slot, name }));
	}

	/** The presets after it move down by one: every id held here is stale until the next `status`. */
	deletePreset(slot: number): Promise<void> {
		return run(this.#link.command('preset-delete', { slot }));
	}

	/**
	 * Sets one of `capabilities.controls`. The value arrives in `status.controls`; one that makes
	 * the device reconnect sets `status.needsReconnect`, and uniPEQ reopens it.
	 */
	setControl(id: string, value: number): Promise<void> {
		return run(this.#link.command('control', { id, value }));
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
 * A list of presets from uniPEQ (`capabilities.slots`, `status.slots`), or null when it isn't a
 * list. A malformed preset is left out; `bypass` and `writable` are kept only when true.
 */
export function acceptSlots(value: unknown): Slot[] | null {
	if (!Array.isArray(value)) return null;
	return value.flatMap((s) =>
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
	);
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => Number.isFinite(v);
/** Absent, or `check` holds. */
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const listOf = (check: (v: unknown) => boolean) => (v: unknown) =>
	Array.isArray(v) && v.every(check);
const isOption = (v: unknown) => isRecord(v) && isNumber(v.value) && isString(v.name);
const isRange = (v: unknown) =>
	isRecord(v) && isNumber(v.min) && isNumber(v.max) && optional(v.step, isNumber);

/** A setting's widget: a toggle, a choice with its values, a range with its bounds. */
function hasWidget(c: Record<string, unknown>): boolean {
	if (!optional(c.values, listOf(isOption)) || !optional(c.range, isRange)) return false;
	if (c.kind === 'choice') return c.values !== undefined;
	if (c.kind === 'range') return c.range !== undefined;
	return c.kind === 'toggle';
}

/**
 * One of uniPEQ's device settings, checked for every field this page reads: its name and widget,
 * where it is shown (`eq`), whether it restarts the device, and which values turn the EQ off.
 */
function isControl(value: unknown): value is Control {
	return (
		isRecord(value) &&
		isString(value.id) &&
		isString(value.name) &&
		hasWidget(value) &&
		optional(value.role, isString) &&
		optional(value.unit, isString) &&
		optional(value.eq, (v) => v === true || isString(v)) &&
		optional(value.reconnect, (v) => typeof v === 'boolean') &&
		optional(value.disablesEq, listOf(isNumber))
	);
}

/**
 * `status.controls`: each setting by id, in the device's own numbers, or null where the device
 * lacks it now. Anything else is left out, and the row with it.
 */
export function acceptControlValues(value: unknown): Record<string, number | null> {
	if (!isRecord(value)) return {};
	const known = (entry: [string, unknown]): entry is [string, number | null] =>
		entry[1] === null || isNumber(entry[1]);
	return Object.fromEntries(Object.entries(value).filter(known));
}

/**
 * uniPEQ's capability subset, with anything missing or malformed read as "can't". Of what protocol
 * 1.3 added (`minor`): `perChannel`, the preset list (`listsSlots`, `editsSlots`) and the device's
 * settings (`controls`, a malformed one left out). The device's other EQs aren't routed over the
 * link yet, so the UI for them stays off.
 */
export function acceptCapabilities(value: unknown, minor: number): PeqCapabilities {
	const c = isRecord(value) ? value : {};
	const flag = (key: string) => c[key] === true;
	// An older uniPEQ sends none of these, which says nothing about the device.
	const late = (key: string) => minor >= 3 && flag(key);
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
		// For a device that keeps a list, the room it has: the list itself is `status.slots`.
		slots: acceptSlots(c.slots) ?? [],
		disconnectOnSave: flag('disconnectOnSave'),
		experimental: flag('experimental'),
		perChannel: late('perChannel'),
		listsSlots: late('listsSlots'),
		editsSlots: late('editsSlots'),
		// Their values are in `status.controls`.
		controls: minor >= 3 && Array.isArray(c.controls) ? c.controls.filter(isControl) : []
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
