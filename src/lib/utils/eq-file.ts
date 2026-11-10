import type { FRDataObject } from '#lib/types/data-types.js';
import { curveBaseName } from './curve-name.js';
import { formatApoFilters, parseApoConfig } from './eq-apo.js';
import { Equalizer, type EQFilter } from './equalizer.js';

/**
 * What an EQ file import or export decides, apart from doing it: which bands a file carries, what
 * it is called, and what an imported file amounts to. `EqFilterList` owns the effects — the file
 * reader, the download, the toasts, the store writes.
 */

/** The file name of an export with no source label, per format. The two styles differ on purpose. */
const PARAMETRIC_FALLBACK_NAME = 'filters.txt';
const GRAPHIC_EQ_FALLBACK_NAME = 'graphic_eq.txt';

/** Characters a file name cannot hold on Windows. */
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * The device part of an export's file name: the source's name with its variant, then the picked
 * run's label, joined by single spaces and stripped of characters a file name cannot hold. `null`
 * with no source, or when nothing is left.
 *
 * `runLabel` is the picked run's display name, `null` or empty when the average applies.
 */
export function eqFileLabel(
	source: Pick<FRDataObject, 'identifier' | 'dispSuffix'> | null,
	runLabel: string | null
): string | null {
	if (!source) return null;
	const label = [curveBaseName(source), runLabel].filter(Boolean).join(' ');
	return label.replace(FORBIDDEN_FILENAME_CHARS, '').trim() || null;
}

export interface EqFileExport {
	filename: string;
	text: string;
}

/**
 * The Equalizer APO parametric file for `filters`, or `null` when no band is complete.
 *
 * **The band filter here has no `enabled` check, on purpose.** A disabled band is exported, and
 * `formatApoFilters` writes it `OFF`, so the file describes the EQ on screen and round-trips. This
 * is not `isPlayableBand`: folding it in would drop the parked bands from the file.
 */
export function parametricExport(
	filters: EQFilter[],
	preamp: number,
	label: string | null
): EqFileExport | null {
	const complete = filters.filter((f) => f.freq != null && f.q != null && f.gain != null);
	if (!complete.length) return null;
	return {
		filename: label ? `${label} filters.txt` : PARAMETRIC_FALLBACK_NAME,
		text: formatApoFilters(complete, preamp)
	};
}

/**
 * The bands a Graphic EQ export writes. A `GraphicEQ:` line is one summed curve with no per-band
 * ON/OFF and no channel syntax — Wavelet applies it to both ears — so disabled bands and
 * left/right-only bands are left out rather than baked in.
 */
export function graphicEqBands(filters: EQFilter[]): EQFilter[] {
	return filters.filter((f) => f.enabled && f.channel == null);
}

/** How many live left/right-only bands {@link graphicEqBands} leaves out. Disabled ones don't count. */
export function omittedPerEarCount(filters: EQFilter[]): number {
	return filters.filter((f) => f.enabled && f.channel != null).length;
}

/**
 * The Wavelet `GraphicEQ:` file for `filters`, or `null` when no enabled shared band is left.
 * `omitted` is the number of live per-ear bands the file does not carry.
 */
export function graphicEqExport(
	filters: EQFilter[],
	label: string | null
): (EqFileExport & { omitted: number }) | null {
	const bands = graphicEqBands(filters);
	if (!bands.length) return null;
	const curve = new Equalizer().convertFilterAsGraphicEQ(bands);
	return {
		filename: label ? `${label} GraphicEQ.txt` : GRAPHIC_EQ_FALLBACK_NAME,
		text: 'GraphicEQ: ' + curve.map(([f, g]) => `${f.toFixed(0)} ${g.toFixed(1)}`).join('; '),
		omitted: omittedPerEarCount(filters)
	};
}

export type ImportOutcome =
	{ kind: 'filters'; filters: EQFilter[]; skipped: number } | { kind: 'none' };

/**
 * What an imported file amounts to. `none` when no filter could be read, even if lines were
 * skipped: a file of only unsupported bands has nothing to import. Otherwise the filters, and how
 * many `Filter` lines were left out.
 */
export function importOutcome(text: string): ImportOutcome {
	const { filters, skipped } = parseApoConfig(text);
	return filters.length ? { kind: 'filters', filters, skipped } : { kind: 'none' };
}
