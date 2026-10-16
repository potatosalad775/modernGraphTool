import * as m from '#lib/paraglide/messages.js';
import type { FRDataObject, ParsedFRData, SampleData } from '#lib/types/data-types.js';

/**
 * Which curves the EQ is applied to.
 *
 * A sample set's `channels` are the average across its runs, and that average
 * is a fit nobody wears: across insertion depths it smears the treble peaks
 * into one gentle bump. Picking a run EQs that run instead. Everything that
 * reads "the source" — the EQ curve, AutoEQ, the overlay's nodes, the graph's
 * ghost — goes through `eqSourceChannels`, so the rule lives in one place.
 */

/** A picked run, tagged with the variant it was picked on. */
export interface EqSourceSample {
	index: number;
	/** The source's `dispSuffix` when picked (`''` for none). */
	variant: string;
}

/**
 * The picked run, or null when the average applies.
 *
 * A pick is stale once the source shows another variant — switching (or
 * undoing a switch) replaces the runs, and index 1 of "Pad Positions" is not
 * index 1 of "Repeat Runs" — or when the run has no channel data. Checking it
 * here rather than resetting it on every path that can change a variant means
 * no path can be missed.
 */
export function eqSourceRun(
	item: FRDataObject | null | undefined,
	sample: EqSourceSample | null
): SampleData | null {
	if (!item || !sample) return null;
	if (sample.variant !== (item.dispSuffix ?? '')) return null;
	const run = item.samples?.[sample.index];
	return run && (run.L || run.R || run.AVG) ? run : null;
}

/** Same pick — both the average, or the same run of the same variant. */
export function sameEqSourceSample(a: EqSourceSample | null, b: EqSourceSample | null): boolean {
	if (!a || !b) return a === b;
	return a.index === b.index && a.variant === b.variant;
}

/** The channels the EQ applies to: the picked run's, or the item's own. */
export function eqSourceChannels(item: FRDataObject, sample: EqSourceSample | null): ParsedFRData {
	const run = eqSourceRun(item, sample);
	if (!run) return item.channels;
	return {
		...(run.L && { L: run.L }),
		...(run.R && { R: run.R }),
		...(run.AVG && { AVG: run.AVG })
	};
}

/** A run's display name — its declared label, else "Sample n". */
export function sampleRunLabel(run: SampleData, index: number): string {
	return run.label ?? `${m.selection_list_samples_run()} ${index + 1}`;
}
