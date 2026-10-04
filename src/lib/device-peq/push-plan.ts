/**
 * What a push to a device will actually send, worked out before anything is sent.
 *
 * The bridge writes exactly what it is given — no clamping, padding or type conversion — so every
 * push goes through eqcaps' `fit` (the wanted bands, moved onto the device's slots and domains)
 * and `complete` (every slot filled, unused ones with neutral filters). Whatever `fit` had to
 * change is listed here, so the UI can show it before writing instead of the device quietly
 * holding a different EQ from the one on screen.
 */
import { complete, fit, type Filter, type Profile } from '@potatosalad775/eqcaps-core';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { toCapsFilter } from '$lib/utils/eq-constraint.js';
import type { PeqCapabilities } from './types.js';

export type PlanChange =
	| {
			kind: 'field';
			/** 1-based band number, as the band list shows it. */
			band: number;
			field: 'type' | 'freq' | 'q' | 'gain';
			wanted: number | string;
			written: number | string;
	  }
	/** The band has no slot left on the device, or its gain projected to 0: not sent. */
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
}

/** Whether the plan differs from the EQ on screen in a way the user should see first. */
export function needsConfirmation(plan: PushPlan): boolean {
	return plan.changes.length > 0 || plan.skippedChannel > 0 || plan.clipRisk || plan.infeasible;
}

/**
 * Plan a push of the app's filter list to a device described by `profile`.
 *
 * Only shared, enabled, complete bands are wanted: a hardware slot has no channel, so an L-only
 * band pushed as is would reach both ears, which is a different EQ from the one on screen.
 */
export function planPush(
	filters: EQFilter[],
	preamp: number,
	profile: Profile,
	capabilities: Pick<PeqCapabilities, 'writesPreamp'>
): PushPlan {
	const wanted: Filter[] = [];
	const bandOf: number[] = [];
	filters.forEach((f, i) => {
		if (f.channel != null || !f.enabled) return;
		const c = toCapsFilter(f);
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
		filters: complete(profile, result.slots).filters,
		...(sendsPreamp(mode, capabilities) ? { preamp: result.preamp } : {}),
		changes,
		skippedChannel,
		clipRisk: boosts && mode !== 'auto' && !sendsPreamp(mode, capabilities),
		infeasible: !result.feasible
	};
}

/** Send a preamp when the device takes one we control and the protocol can write it. */
function sendsPreamp(
	mode: Profile['preamp']['mode'],
	capabilities: Pick<PeqCapabilities, 'writesPreamp'>
): boolean {
	return capabilities.writesPreamp && (mode === 'manual' || mode === 'unknown');
}
