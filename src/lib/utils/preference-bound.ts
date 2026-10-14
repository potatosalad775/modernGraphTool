import type { ChannelData, FRDataPoint } from '$lib/types/data-types.js';
import { lookupFRValueAtFreq } from './fr-lookup.js';
import { normalizeAgainst } from './fr-normalizer.js';

/**
 * Normalize the base DF target so the preference band's **center** — not the DF itself —
 * lands at the alignment reference.
 *
 * The bound files are offsets from the DF, but the DF is not inside the band: at 50 Hz it
 * sits ~3 dB under the lower edge. Anchoring the DF at the alignment frequency therefore
 * pushes the band off every device aligned there, so a device at the band's center reads as
 * failing across the whole range. Deriving the offset from DF + (upper + lower) / 2 keeps it
 * inside at any alignment. At a midrange anchor, where the band straddles the DF, the two
 * agree to a fraction of a dB, so the default look is unchanged.
 *
 * The bounds are looked up by frequency rather than by index, so they need not share the
 * DF's grid.
 */
export function alignDFToBoundCenter(
	df: ChannelData,
	upper: FRDataPoint[],
	lower: FRDataPoint[],
	type: string,
	hzValue: number
): ChannelData {
	const center: ChannelData = {
		...df,
		data: df.data.map(([freq, db]) => {
			const u = lookupFRValueAtFreq(upper, freq) ?? 0;
			const d = lookupFRValueAtFreq(lower, freq) ?? 0;
			return [freq, db + (u + d) / 2] as FRDataPoint;
		})
	};
	return normalizeAgainst(df, center, type, hzValue);
}

/** One selectable preference bound: a base target plus the offset files drawn around it. */
export interface PreferenceBoundEntry {
	/** Chip label and selection key; unique across entries. */
	name: string;
	/** Target identifier, always ending in ` Target` — the file is `${target}.txt`. */
	target: string;
	/** Bound offset files, relative to the `data/` folder. */
	upper: string;
	lower: string;
}

export const DEFAULT_BOUND_UPPER = 'Bounds U.txt';
export const DEFAULT_BOUND_LOWER = 'Bounds D.txt';

type I18nName = string | { default: string; i18n: Record<string, string> };

interface RawBoundEntry {
	name?: I18nName;
	target?: string;
	upper?: string;
	lower?: string;
}

function resolveName(name: I18nName | undefined, lang: string): string {
	if (typeof name === 'string') return name.trim();
	if (name && typeof name === 'object') return (name.i18n?.[lang] ?? name.default ?? '').trim();
	return '';
}

function nonEmpty(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Resolve `PREFERENCE_BOUND` into the list of selectable bounds.
 *
 * `BOUND_LIST` wins when present. Otherwise the legacy `BASE_DF_TARGET_FILE` string becomes a
 * single entry with the default bound files, so configs written before the list existed keep
 * working unchanged. Entries without a target, or whose name repeats an earlier one, are
 * dropped with a warning — the name is the selection key.
 */
export function resolvePreferenceBoundEntries(
	config: { BOUND_LIST?: unknown; BASE_DF_TARGET_FILE?: unknown } | undefined,
	lang: string
): PreferenceBoundEntry[] {
	let raw: RawBoundEntry[] = [];
	if (Array.isArray(config?.BOUND_LIST)) {
		raw = config.BOUND_LIST as RawBoundEntry[];
	} else {
		const legacy = nonEmpty(config?.BASE_DF_TARGET_FILE);
		if (legacy) raw = [{ target: legacy }];
	}

	const entries: PreferenceBoundEntry[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		const file = nonEmpty(item?.target)?.replace(/\.txt$/, '');
		if (!file) {
			console.warn('PreferenceBound: skipping a BOUND_LIST entry without a target', item);
			continue;
		}
		const target = file.endsWith(' Target') ? file : `${file} Target`;
		const name = resolveName(item.name, lang) || target.replace(/ Target$/, '');
		if (seen.has(name)) {
			console.warn(`PreferenceBound: skipping duplicate BOUND_LIST name "${name}"`);
			continue;
		}
		seen.add(name);
		entries.push({
			name,
			target,
			upper: nonEmpty(item.upper) ?? DEFAULT_BOUND_UPPER,
			lower: nonEmpty(item.lower) ?? DEFAULT_BOUND_LOWER
		});
	}
	return entries;
}
