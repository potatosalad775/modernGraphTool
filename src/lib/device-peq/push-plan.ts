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
import { complete, fit, type Filter, type Profile } from '@potatosalad775/eqcaps-core';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { toCapsFilter } from '$lib/utils/eq-constraint.js';
import type { PeqCapabilities, PeqDevice } from './types.js';

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
	/** Preamp to send, or undefined when the device takes none (or computes its own). */
	preamp?: number;
	changes: PlanChange[];
	/** Left- or right-only bands: the device has one filter set for both ears. */
	skippedChannel: number;
	/** The bands boost, and the device can't be told to lower its level: it may clip. */
	clipRisk: boolean;
	/** Something can't be met at all (a cross-band rule); the result breaks it. */
	infeasible: boolean;
	/** Device bands nothing on screen fills: `complete` writes them flat, from `hints` if given. */
	emptySlots: number;
}

/** Whether the plan differs from the EQ on screen in a way the user should see first. */
export function needsConfirmation(plan: PushPlan): boolean {
	return plan.changes.length > 0 || plan.skippedChannel > 0 || plan.clipRisk || plan.infeasible;
}

/**
 * Plan a push of the app's filter list to a device described by `profile`.
 *
 * Only shared, complete bands are wanted: a hardware slot has no channel, so an L-only band pushed
 * as is would reach both ears, which is a different EQ from the one on screen. A disabled band is
 * sent flat (0 dB at its own Fc and Q), so it keeps its slot the way vendor apps keep theirs.
 */
export function planPush(
	filters: EQFilter[],
	preamp: number,
	profile: Profile,
	capabilities: Pick<PeqCapabilities, 'writesPreamp'>,
	hints?: readonly (Filter | null)[]
): PushPlan {
	const wanted: Filter[] = [];
	const bandOf: number[] = [];
	filters.forEach((f, i) => {
		if (f.channel != null) return;
		const c = toCapsFilter(f.enabled ? f : { ...f, gain: 0 });
		if (!c) return;
		wanted.push(c);
		bandOf.push(i + 1);
	});
	const skippedChannel = filters.filter((f) => f.channel != null).length;

	const mode = profile.preamp.mode;
	const result = fit(profile, wanted, preamp);
	const changes: PlanChange[] = [];
	const dropped = new Set<number>();
	result.slotOf.forEach((slot, k) => {
		if (slot === null) dropped.add(k);
	});
	for (const c of result.changes) {
		if (c.filter === null) {
			if (c.field === 'preamp' && sendsPreamp(mode, capabilities)) {
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

	const boosts = result.slots.some((f) => f !== null && f.gain > 0);
	return {
		filters: complete(profile, result.slots, hints ? { hints } : {}).filters,
		...(sendsPreamp(mode, capabilities) ? { preamp: result.preamp } : {}),
		changes,
		skippedChannel,
		clipRisk: boosts && mode !== 'auto' && !sendsPreamp(mode, capabilities),
		infeasible: !result.feasible,
		emptySlots: profile.bandCount === null ? 0 : result.slots.filter((f) => f === null).length
	};
}

/**
 * What the preset a push will write holds now, as `planPush` hints, so the bands the push leaves
 * empty keep the device's own frequencies and Qs instead of reading back as neutral fillers. Null
 * when the device can't read that preset (write-only, or it writes a chosen preset it can't read),
 * or the read fails: the push then goes ahead with neutral fillers.
 */
export async function readLayout(
	device: Pick<PeqDevice, 'capabilities' | 'pull'>,
	slot: number | null
): Promise<(Filter | null)[] | null> {
	const { canRead, readsSlot, writesSlot } = device.capabilities;
	const chosen = writesSlot && slot !== null;
	if (!canRead || (chosen && !readsSlot)) return null;
	try {
		return (await device.pull(chosen ? { slot } : {})).filters;
	} catch (e) {
		console.warn('Device PEQ: could not read the layout to keep, writing neutral fillers:', e);
		return null;
	}
}

/** Send a preamp when the device takes one we control and the protocol can write it. */
function sendsPreamp(
	mode: Profile['preamp']['mode'],
	capabilities: Pick<PeqCapabilities, 'writesPreamp'>
): boolean {
	return capabilities.writesPreamp && (mode === 'manual' || mode === 'unknown');
}
