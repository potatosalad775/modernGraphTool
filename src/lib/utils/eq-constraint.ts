import {
	assign,
	domainBounds,
	isGraphic,
	isLockedDomain,
	project,
	resolveSlot,
	validateList,
	type Domain,
	type EffectiveSlot,
	type Filter,
	type FilterType,
	type Profile
} from '@potatosalad775/eqcaps-core';
import type { EQFilter } from './equalizer.js';
import { countBandsPerOutput, hasPerChannelFilters, trimToBandsPerOutput } from './eq-channel.js';

/**
 * Pure helpers between the app's `EQFilter` list and an eqcaps `Profile`.
 *
 * The engine (`fit`, `validateList`, `resolveSlot`, `project`) is eqcaps core's; this module only
 * translates. Two things need translating:
 *
 * - **Types.** The app writes `LSQ`/`HSQ`, eqcaps (Equalizer APO codes) `LSC`/`HSC`. The app has
 *   no gainless types, so a slot that only takes `LPQ` or `NO` holds nothing the app can express.
 * - **Lists.** A profile describes one output's slots. With per-channel bands each ear realizes
 *   the shared bands plus its own, so every check runs once per ear.
 *
 * The store is the source of truth; everything here is stateless.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

const TO_CAPS: Record<EQFilter['type'], FilterType> = { PK: 'PK', LSQ: 'LSC', HSQ: 'HSC' };

/** App type → eqcaps type. */
export function toCapsType(type: EQFilter['type']): FilterType {
	return TO_CAPS[type];
}

/** eqcaps type → app type, or null for a type the app has no row for. */
export function fromCapsType(type: FilterType): EQFilter['type'] | null {
	if (type === 'PK') return 'PK';
	if (type === 'LSC') return 'LSQ';
	if (type === 'HSC') return 'HSQ';
	return null;
}

/** A complete band in eqcaps units, or null while any field is still unset. */
export function toCapsFilter(f: EQFilter): Filter | null {
	if (f.freq == null || f.q == null || f.gain == null) return null;
	return { type: toCapsType(f.type), freq: f.freq, q: f.q, gain: f.gain };
}

/** A filter read from a device or produced by `fit`, or null for a type the app can't hold. */
export function fromCapsFilter(f: Filter): EQFilter | null {
	const type = fromCapsType(f.type);
	if (!type) return null;
	return { enabled: true, type, freq: f.freq, q: f.q, gain: f.gain };
}

/** The app types a slot accepts, in the slot's preference order. */
export function appTypesOf(types: readonly FilterType[]): EQFilter['type'][] {
	const out: EQFilter['type'][] = [];
	for (const t of types) {
		const app = fromCapsType(t);
		if (app && !out.includes(app)) out.push(app);
	}
	return out;
}

// ─── Building profiles ──────────────────────────────────────────────────────

const APP_META: Profile['meta'] = { status: 'maintainer-verified', sources: [] };

/** A software profile whose every slot is the same — the shape of every non-device preset. */
export function uniformProfile(opts: {
	id: string;
	model: string;
	bandCount: number | null;
	types?: FilterType[];
	freq: Domain;
	q: Domain;
	gain: Domain;
}): Profile {
	return {
		schemaVersion: '1.0',
		id: opts.id,
		kind: 'software',
		device: { brand: 'modernGraphTool', model: opts.model },
		bandCount: opts.bandCount,
		band: {
			types: opts.types ?? ['PK', 'LSC', 'HSC'],
			freq: opts.freq,
			q: opts.q,
			gain: opts.gain
		},
		preamp: { mode: 'manual', gain: { min: -30, max: 30 } },
		meta: APP_META
	};
}

/** A graphic EQ: one PK slot per band, frequency and Q locked. */
export function graphicProfile(opts: {
	id: string;
	model: string;
	bands: { freq: number; q: number }[];
	gain: Domain;
}): Profile {
	return {
		schemaVersion: '1.0',
		id: opts.id,
		kind: 'software',
		device: { brand: 'modernGraphTool', model: opts.model },
		bandCount: opts.bands.length,
		band: {
			types: ['PK'],
			freq: { value: opts.bands[0]?.freq ?? 1000 },
			q: { value: opts.bands[0]?.q ?? 1 },
			gain: opts.gain
		},
		bands: opts.bands.map((b, index) => ({
			index,
			freq: { value: b.freq },
			q: { value: b.q }
		})),
		preamp: { mode: 'manual', gain: { min: -30, max: 30 } },
		meta: APP_META
	};
}

// ─── Reading profiles ───────────────────────────────────────────────────────

/** Band cap per output; 0 = unlimited. */
export function maxBandsOf(profile: Profile): number {
	return profile.bandCount ?? 0;
}

/**
 * A fixed-band graphic EQ: a bounded profile whose every slot has a locked frequency. The UI then
 * shows one row per band and only gain moves.
 */
export function isGraphicProfile(profile: Profile): boolean {
	return profile.bandCount !== null && isGraphic(profile);
}

/** Domains of slot `slot`, or the template when the profile has no such slot. */
export function slotOf(profile: Profile, slot: number, filter?: EQFilter): EffectiveSlot {
	const i = profile.bandCount === null ? Math.max(0, slot) : clampSlot(profile, slot);
	const full = filter ? toCapsFilter(filter) : null;
	return full ? resolveSlot(profile, i, full) : resolveSlot(profile, i);
}

function clampSlot(profile: Profile, slot: number): number {
	const n = profile.bandCount ?? 1;
	return Math.min(Math.max(0, slot), Math.max(0, n - 1));
}

/** Locked value of a domain, or its value nearest `fallback`. */
function pinned(d: Domain, field: 'freq' | 'q' | 'gain', fallback: number): number {
	return isLockedDomain(d) ? domainBounds(d).min : project(fallback, d, field);
}

/** The bands of a graphic profile, in slot order. Empty for anything else. */
export function graphicBandsOf(profile: Profile): { freq: number; q: number }[] {
	if (!isGraphicProfile(profile)) return [];
	const out: { freq: number; q: number }[] = [];
	for (let i = 0; i < (profile.bandCount ?? 0); i++) {
		const s = resolveSlot(profile, i);
		out.push({ freq: pinned(s.freq, 'freq', 1000), q: pinned(s.q, 'q', 1.41) });
	}
	return out;
}

/** Smallest and largest value any slot allows for `field` — the envelope AutoEQ is bounded by. */
export function envelopeOf(
	profile: Profile,
	field: 'freq' | 'q' | 'gain',
	types?: readonly FilterType[]
): { min: number; max: number } | null {
	let min = Infinity;
	let max = -Infinity;
	const count = profile.bandCount ?? 1;
	for (let i = 0; i < count; i++) {
		const s = resolveSlot(profile, i);
		if (types && !s.types.some((t) => types.includes(t))) continue;
		const b = domainBounds(s[field]);
		min = Math.min(min, b.min);
		max = Math.max(max, b.max);
	}
	return min <= max ? { min, max } : null;
}

/** Whether some slot takes a low shelf and some slot a high shelf. */
export function allowsShelves(profile: Profile): boolean {
	const count = profile.bandCount ?? 1;
	let low = false;
	let high = false;
	for (let i = 0; i < count; i++) {
		const { types } = resolveSlot(profile, i);
		low ||= types.includes('LSC');
		high ||= types.includes('HSC');
	}
	return low && high;
}

/** Whether the profile accepts the app type in at least one slot. */
export function allowsType(profile: Profile, type: EQFilter['type']): boolean {
	const caps = toCapsType(type);
	const count = profile.bandCount ?? 1;
	for (let i = 0; i < count; i++) {
		if (resolveSlot(profile, i).types.includes(caps)) return true;
	}
	return false;
}

// ─── Per-output slot analysis ───────────────────────────────────────────────

/** Flat indices of the bands one output realizes: all of them, or the shared ones plus one ear. */
function outputs(filters: EQFilter[]): number[][] {
	if (!hasPerChannelFilters(filters)) return [filters.map((_, i) => i)];
	return (['L', 'R'] as const).map((ch) =>
		filters.flatMap((f, i) => (f.channel == null || f.channel === ch ? [i] : []))
	);
}

/**
 * The slot each band sits in, by flat index. Active, complete, enabled bands get the slot eqcaps'
 * `assign` gives them (a band that needs a low-shelf slot finds it); the rest take their position
 * among the output's bands, which is what any slot of a uniform profile would be anyway. A shared
 * band takes the slot it gets on the left ear.
 */
export function assignSlots(filters: EQFilter[], profile: Profile): number[] {
	const slots: (number | null)[] = filters.map(() => null);
	for (const indices of outputs(filters)) {
		const live: number[] = [];
		const caps: Filter[] = [];
		for (const i of indices) {
			const f = filters[i];
			const c = f.enabled ? toCapsFilter(f) : null;
			if (c) {
				live.push(i);
				caps.push(c);
			}
		}
		const assigned = caps.length && profile.bandCount !== null ? assign(profile, caps).slotOf : [];
		live.forEach((i, k) => {
			const s = assigned[k];
			if (slots[i] === null && s != null) slots[i] = s;
		});
		indices.forEach((i, position) => {
			if (slots[i] === null) slots[i] = position;
		});
	}
	return slots.map((s) => (profile.bandCount === null ? 0 : clampSlot(profile, s ?? 0)));
}

/** What's wrong with a band, per field. All `false` means it's valid. */
export interface FilterViolation {
	type: boolean;
	freq: boolean;
	q: boolean;
	gain: boolean;
}

const PASS: FilterViolation = { type: false, freq: false, q: false, gain: false };

/**
 * Per-band field flags from eqcaps' `validateList`, run once per output. Disabled and incomplete
 * bands are never flagged; neither is a band past the cap, which `isPastMaxBands` greys instead.
 * A broken cross-band rule (ascending frequency, minimum spacing) is a frequency problem.
 */
export function filterViolations(filters: EQFilter[], profile: Profile): FilterViolation[] {
	const out: FilterViolation[] = filters.map(() => ({ ...PASS }));
	for (const indices of outputs(filters)) {
		const live: number[] = [];
		const caps: Filter[] = [];
		for (const i of indices) {
			const f = filters[i];
			const c = f.enabled ? toCapsFilter(f) : null;
			if (c) {
				live.push(i);
				caps.push(c);
			}
		}
		if (!caps.length) continue;
		for (const v of validateList(profile, caps)) {
			if (v.filter === undefined || v.code === 'too-many-bands') continue;
			const flags = out[live[v.filter]];
			if (v.field === 'type') flags.type = true;
			else if (v.field === 'q') flags.q = true;
			else if (v.field === 'gain') flags.gain = true;
			else flags.freq = true;
		}
	}
	return out;
}

/** A violation-free band list. */
export function hasViolations(violations: FilterViolation[]): boolean {
	return violations.some((v) => v.type || v.freq || v.q || v.gain);
}

/**
 * Whether the band at `index` is past the profile's band cap.
 *
 * Pass `filters` to count per output rather than by flat position: with per-channel bands the
 * array is longer than any one ear has to realise, so position alone greys out rows a device can
 * still take. Without it the answer is the plain positional one.
 */
export function isPastMaxBands(index: number, profile: Profile, filters?: EQFilter[]): boolean {
	const max = maxBandsOf(profile);
	if (max <= 0) return false;
	// A list that doesn't reach `index` isn't describing this band — fall back to the positional
	// answer rather than reporting an empty list as "fits".
	if (!filters || index >= filters.length) return index >= max;
	return countBandsPerOutput(filters.slice(0, index + 1)) > max;
}

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Move one band onto slot `slot`'s domains (eqcaps `project`): the type to the slot's first type
 * the app can hold if its own isn't allowed, then frequency, Q and gain, each resolved against the
 * fields already settled so conditional domains apply. Null fields stay null. The input is not
 * mutated.
 */
export function projectFilter(filter: EQFilter, profile: Profile, slot: number): EQFilter {
	const out: EQFilter = { ...filter };
	const types = slotOf(profile, slot).types;
	if (!types.includes(toCapsType(out.type))) {
		const allowed = appTypesOf(types);
		if (allowed.length) out.type = allowed[0];
	}
	for (const field of ['freq', 'q', 'gain'] as const) {
		const value = out[field];
		if (value == null) continue;
		out[field] = project(value, slotOf(profile, slot, out)[field], field);
	}
	return out;
}

/**
 * Fold a whole list onto the profile: trim it to the band cap (per output, the tail goes first),
 * then project every band onto the slot it sits in. Graphic profiles are a special case: the
 * result is always one row per band, in band order, each taking the gain of the nearest source
 * band within an octave. That keeps the 1:1 row-to-band mapping the UI relies on, and flattens
 * per-channel bands into shared ones, since a graphic EQ has no per-ear structure to keep.
 */
export function conformFilters(filters: EQFilter[], profile: Profile): EQFilter[] {
	if (isGraphicProfile(profile)) return foldOntoGraphicBands(filters, profile);
	const kept = trimToBandsPerOutput(filters, maxBandsOf(profile));
	const slots = assignSlots(kept, profile);
	return kept.map((f, i) => projectFilter(f, profile, slots[i]));
}

/**
 * Fill a hardware device's list up to its band count with flat bands, so the list holds one row
 * per band the device has and a push reads back as it was written. Each new band is a 0 dB PK at
 * Q 1, at the log centre of the widest gap between the bands already there (or the frequency
 * range's ends), projected onto its slot. They are appended, so existing rows keep their place.
 * Software presets and graphic EQs come back unchanged: a preset's cap is a limit, not a layout,
 * and a graphic fold already has one row per band.
 */
export function padToBandCount(filters: EQFilter[], profile: Profile): EQFilter[] {
	if (profile.kind !== 'hardware' || profile.bandCount === null || isGraphicProfile(profile)) {
		return filters;
	}
	const missing = profile.bandCount - countBandsPerOutput(filters);
	if (missing <= 0) return filters;
	const { min, max } = domainBounds(slotOf(profile, 0).freq);
	const taken = filters.flatMap((f) =>
		f.freq != null && f.freq > min && f.freq < max ? [f.freq] : []
	);
	const added: EQFilter[] = [];
	for (let n = 0; n < missing; n++) {
		const edges = [min, ...taken, max].sort((a, b) => a - b);
		let widest = 0;
		for (let i = 1; i + 1 < edges.length; i++) {
			if (edges[i + 1] / edges[i] > edges[widest + 1] / edges[widest]) widest = i;
		}
		const freq = Math.sqrt(edges[widest] * edges[widest + 1]);
		taken.push(freq);
		added.push({ enabled: true, type: 'PK', freq, q: 1, gain: 0 });
	}
	const slots = assignSlots([...filters, ...added], profile);
	const flat = added
		.map((f, k) => projectFilter(f, profile, slots[filters.length + k]))
		.filter((f) => f.gain === 0);
	return [...filters, ...flat];
}

const GRAPHIC_FOLD_LOG_THRESHOLD = Math.log(2); // ±1 octave

function foldOntoGraphicBands(filters: EQFilter[], profile: Profile): EQFilter[] {
	const bands = graphicBandsOf(profile);
	const sources = filters.filter((f) => f.enabled && f.freq != null && f.gain != null);
	return bands.map((band, slot): EQFilter => {
		let bestGain = 0;
		let bestDelta = Infinity;
		for (const f of sources) {
			const delta = Math.abs(Math.log(f.freq! / band.freq));
			if (delta < bestDelta && delta < GRAPHIC_FOLD_LOG_THRESHOLD) {
				bestDelta = delta;
				bestGain = f.gain!;
			}
		}
		return projectFilter(
			{ enabled: true, type: 'PK', freq: band.freq, q: band.q, gain: bestGain },
			profile,
			slot
		);
	});
}
