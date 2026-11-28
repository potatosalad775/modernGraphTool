import type { FilterForm } from './configDefaults';

/**
 * What the app does with a Target Customizer filter's `min` / `max` / `step`, restated for the
 * generator so it can say so before the config ships. The rules are `filterGainRange`'s, in
 * `src/lib/stores/target-adjustment-store.svelte.ts`: keep the two in step.
 */

const FINEST_STEP = 0.001;

interface Range {
	min: number;
	max: number;
	step: number;
}

function defaultRange(type: string): Range {
	return type === 'TILT' ? { min: -2, max: 2, step: 0.1 } : { min: -20, max: 20, step: 0.5 };
}

function isMultipleOf(value: number, step: number): boolean {
	const count = value / step;
	return Math.abs(count - Math.round(count)) < 1e-6;
}

/** What is wrong with the range as entered, or `null`. The app would ignore the key it names. */
export function filterRangeProblem(f: FilterForm): string | null {
	const base = defaultRange(f.type);
	if (f.min !== undefined && f.min > 0) return 'Min gain cannot be above 0.';
	if (f.max !== undefined && f.max < 0) return 'Max gain cannot be below 0.';
	const min = f.min ?? base.min;
	const max = f.max ?? base.max;
	if (min === max) return 'Min and max gain cannot both be 0.';
	if (f.step === undefined) return null;
	if (f.step < FINEST_STEP) return `Step has to be at least ${FINEST_STEP}.`;
	if (f.step > max - min) return 'Step is larger than the range from min to max.';
	if (!isMultipleOf(min, f.step) || !isMultipleOf(max, f.step)) {
		return 'Step has to divide both min and max evenly, or the slider cannot sit on 0 or reach max.';
	}
	return null;
}

/**
 * The limits and step for an input that holds a gain of this filter. A range with a problem
 * counts as unset, as it does in the app; `step` is `'any'` when the app would choose it.
 */
export function filterGainLimits(f: FilterForm): {
	min: number;
	max: number;
	step: number | 'any';
} {
	const base = defaultRange(f.type);
	if (filterRangeProblem(f)) return base;
	const min = f.min ?? base.min;
	const max = f.max ?? base.max;
	const fitsDefault =
		base.step <= max - min && isMultipleOf(min, base.step) && isMultipleOf(max, base.step);
	return { min, max, step: f.step ?? (fitsDefault ? base.step : 'any') };
}

/** Whether a preset or initial gain lies outside the filter's slider. */
export function isGainOutsideRange(f: FilterForm, gain: number | undefined): boolean {
	if (gain === undefined) return false;
	const { min, max } = filterGainLimits(f);
	return gain < min || gain > max;
}
