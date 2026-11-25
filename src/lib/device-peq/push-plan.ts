/**
 * What a push to a device will actually send, worked out before anything is sent.
 *
 * The bridge writes exactly what it is given — no clamping, padding or type conversion — so every
 * push goes through eqcaps' `fit` (the wanted bands, moved onto the device's slots and domains)
 * and `complete` (every slot filled: unused ones with what the device held there, written flat,
 * when it could be read first — `readLayout` — otherwise with neutral filters). Whatever `fit` had to
 * change is listed here, so the UI can show it before writing instead of the device quietly
 * holding a different EQ from the one on screen.
 */
import {
	complete,
	fit,
	type Filter,
	type FitResult,
	type Profile
} from '@potatosalad775/eqcaps-core';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { indexedEffectiveFilters } from '#lib/utils/eq-channel.js';
import { fromCapsFilter, toCapsFilter } from '#lib/utils/eq-constraint.js';
import type { PresetRequest } from './preset.js';
import type { PeqCapabilities, PeqDevice, PullResult } from './types.js';

export type PlanChange =
	| {
			kind: 'field';
			/** 1-based band number, as the band list shows it. */
			band: number;
			field: 'type' | 'freq' | 'q' | 'gain';
			wanted: number | string;
			written: number | string;
	  }
	/** The band has no slot left on the device, or the device's rules left no room for it: not sent. */
	| { kind: 'dropped'; band: number }
	| { kind: 'preamp'; wanted: number; written: number };

export interface PushPlan {
	/** Exactly what to send: one written filter per device band. */
	filters: Filter[];
	/** The right channel's, where the device drives its channels apart; `filters` are then the left's. */
	right?: Filter[];
	/** Preamp to send, or undefined when the device takes none (or computes its own). */
	preamp?: number;
	changes: PlanChange[];
	/** Left- or right-only bands not sent: the device has one filter set for both ears. */
	skippedChannel: number;
	/** The bands boost, and the device can't be told to lower its level: it may clip. */
	clipRisk: boolean;
	/** Something can't be met at all (a cross-band rule); the result breaks it. */
	infeasible: boolean;
	/** Device bands nothing on screen fills: `complete` writes them flat, from `hints` if given. */
	emptySlots: number;
}

/**
 * Whether the plan sends something other than the EQ on screen, so only a reviewed write may send
 * it. Auto-write pauses on this; clip risk isn't part of it, or every device that takes no preamp
 * would pause for good.
 */
export function needsReview(plan: PushPlan): boolean {
	return plan.changes.length > 0 || plan.skippedChannel > 0 || plan.infeasible;
}

/** Whether the plan differs from the EQ on screen in a way the user should see first. */
export function needsConfirmation(plan: PushPlan): boolean {
	return needsReview(plan) || plan.clipRisk;
}

/** What the target preset holds now, by slot: the left channel's, and the right's where read apart. */
export interface Layout {
	filters: readonly (Filter | null)[];
	right?: readonly (Filter | null)[];
}

type Capabilities = Pick<PeqCapabilities, 'writesPreamp' | 'perChannel'>;

/**
 * Whether a write drives the left and right channels apart: the profile says the EQ has a filter
 * set per channel, and the bridge can send the right one. Then per-ear bands are written, each ear
 * getting the shared bands plus its own; anywhere else one filter set drives both ears.
 */
export function drivesChannelsApart(
	profile: Pick<Profile, 'channels'>,
	capabilities: Pick<PeqCapabilities, 'perChannel'>
): boolean {
	return profile.channels === 'independent' && capabilities.perChannel === true;
}

/**
 * Plan a push of the app's filter list to a device described by `profile`.
 *
 * Where one filter set drives both ears, only shared, complete bands are wanted: a hardware slot
 * has no channel, so an L-only band pushed as is would reach both ears, which is a different EQ
 * from the one on screen. Where the device drives its channels apart (`drivesChannelsApart`), each
 * ear is planned on its own, from the shared bands plus that ear's, and both are sent, alike or
 * not. A disabled band is sent flat (0 dB at its own Fc and Q), so it keeps its slot the way
 * vendor apps keep theirs.
 */
export function planPush(
	filters: EQFilter[],
	preamp: number,
	profile: Profile,
	capabilities: Capabilities,
	hints?: readonly (Filter | null)[] | Layout
): PushPlan {
	const held: Layout | undefined =
		hints && 'filters' in hints ? hints : hints && { filters: hints };
	if (!drivesChannelsApart(profile, capabilities)) {
		const shared = filters.flatMap((filter, index) =>
			filter.channel == null ? [{ filter, index }] : []
		);
		const one = planChannel(shared, preamp, profile, capabilities, held?.filters);
		return { ...one, skippedChannel: filters.length - shared.length };
	}
	const left = planChannel(
		indexedEffectiveFilters(filters, 'L'),
		preamp,
		profile,
		capabilities,
		held?.filters
	);
	const right = planChannel(
		indexedEffectiveFilters(filters, 'R'),
		preamp,
		profile,
		capabilities,
		held?.right ?? held?.filters
	);
	// A shared band is planned once per ear and changes the same way in both: said once.
	const seen = new Set<string>();
	const changes = [...left.changes, ...right.changes].filter((change) => {
		const key = JSON.stringify(change);
		return !seen.has(key) && seen.add(key);
	});
	return {
		filters: left.filters,
		right: right.filters,
		...(left.preamp !== undefined ? { preamp: left.preamp } : {}),
		changes,
		skippedChannel: 0,
		clipRisk: left.clipRisk || right.clipRisk,
		infeasible: left.infeasible || right.infeasible,
		emptySlots: Math.max(left.emptySlots, right.emptySlots)
	};
}

/** What `fit` changed, as the review lists it: by the band's number in the list on screen. */
function changesOf(
	result: FitResult,
	wanted: Filter[],
	bandOf: number[],
	preampSent: boolean
): PlanChange[] {
	const changes: PlanChange[] = [];
	const dropped = new Set<number>();
	result.slotOf.forEach((slot, k) => {
		if (slot === null) dropped.add(k);
	});
	for (const c of result.changes) {
		if (c.filter === null) {
			if (c.field === 'preamp' && preampSent) {
				changes.push({ kind: 'preamp', wanted: Number(c.wanted), written: Number(c.written) });
			}
			continue;
		}
		if (dropped.has(c.filter) || c.field === 'preamp') continue;
		changes.push({
			kind: 'field',
			band: bandOf[c.filter],
			field: c.field,
			wanted: c.wanted,
			written: c.written
		});
	}
	for (const k of [...dropped].sort((a, b) => a - b)) {
		// A wanted band that was flat to begin with isn't a loss.
		if (wanted[k].gain !== 0) changes.push({ kind: 'dropped', band: bandOf[k] });
	}
	return changes;
}

/** One filter set, planned: the bands of one ear, or of both where they are driven alike. */
function planChannel(
	bands: { filter: EQFilter; index: number }[],
	preamp: number,
	profile: Profile,
	capabilities: Capabilities,
	hints?: readonly (Filter | null)[]
): Omit<PushPlan, 'skippedChannel' | 'right'> {
	const wanted: Filter[] = [];
	const bandOf: number[] = [];
	for (const { filter: f, index } of bands) {
		const c = toCapsFilter(f.enabled ? f : { ...f, gain: 0 });
		if (!c) continue;
		wanted.push(c);
		bandOf.push(index + 1);
	}

	const mode = profile.preamp.mode;
	const result = fit(profile, wanted, preamp);
	const changes = changesOf(result, wanted, bandOf, sendsPreamp(mode, capabilities));

	const boosts = result.slots.some((f) => f !== null && f.gain > 0);
	return {
		filters: complete(profile, result.slots, hints ? { hints } : {}).filters,
		...(sendsPreamp(mode, capabilities) ? { preamp: result.preamp } : {}),
		changes,
		clipRisk: boosts && mode !== 'auto' && !sendsPreamp(mode, capabilities),
		infeasible: !result.feasible,
		emptySlots: profile.bandCount === null ? 0 : result.slots.filter((f) => f === null).length
	};
}

/** Send a preamp when the device takes one we control and the protocol can write it. */
function sendsPreamp(
	mode: Profile['preamp']['mode'],
	capabilities: Pick<PeqCapabilities, 'writesPreamp'>
): boolean {
	return capabilities.writesPreamp && (mode === 'manual' || mode === 'unknown');
}

/**
 * What the preset a push will write holds now, as `planPush` hints, so the bands the push leaves
 * empty keep the device's own frequencies and Qs instead of reading back as neutral fillers.
 * `request` is `readRequest` for that preset: null when the device can't read it from where it is.
 * A failed read is null too, and the push goes ahead with neutral fillers.
 */
export async function readLayout(
	device: Pick<PeqDevice, 'pull'>,
	request: PresetRequest | null
): Promise<Layout | null> {
	if (!request) return null;
	try {
		const held = await device.pull(request);
		return { filters: held.filters, ...(held.right ? { right: held.right.filters } : {}) };
	} catch (e) {
		console.warn('Device PEQ: could not read the layout to keep, writing neutral fillers:', e);
		return null;
	}
}

/**
 * The band list a read gives. Where the device returned its channels apart and they differ, a
 * band the two hold alike in the same slot is one shared band, and the rest are the left ear's
 * and the right ear's own; where they are equal, or one filter set drives both, every band is
 * shared. `skipped` counts bands of a type the app has no row for.
 */
export function listFromPull(result: Pick<PullResult, 'filters' | 'right'>): {
	filters: EQFilter[];
	skipped: number;
} {
	const left = result.filters;
	const right = result.right?.filters ?? left;
	const same = (a: Filter | null | undefined, b: Filter | null | undefined) =>
		!!a && !!b && a.type === b.type && a.freq === b.freq && a.q === b.q && a.gain === b.gain;
	const shared: EQFilter[] = [];
	const ears: Record<'L' | 'R', EQFilter[]> = { L: [], R: [] };
	let skipped = 0;
	const take = (f: Filter | null | undefined, into: EQFilter[], channel?: 'L' | 'R') => {
		if (!f) return;
		const band = fromCapsFilter(f);
		if (!band) skipped++;
		else into.push(channel ? { ...band, channel } : band);
	};
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const l = left.at(i);
		const r = right.at(i);
		if (same(l, r) || (!l && !r)) take(l, shared);
		else {
			take(l, ears.L, 'L');
			take(r, ears.R, 'R');
		}
	}
	return { filters: [...shared, ...ears.L, ...ears.R], skipped };
}
