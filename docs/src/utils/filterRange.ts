import type { FilterForm } from './configDefaults';

/**
 * What the app does with a Target Customizer filter's `min` / `max` / `step`, restated for the
 * generator so it can say so before the config ships. The rules are `filterGainRange`'s, in
 * `src/lib/stores/target-adjustment-store.svelte.ts`: keep the two in step.
 */

const FINEST_STEP = 0.001;
const FALLBACK_STEPS = [0.1, 0.01, FINEST_STEP];

export interface FilterRange {
	min: number;
	max: number;
	step: number;
}

function defaultRange(type: string): FilterRange {
	return type === 'TILT' ? { min: -2, max: 2, step: 0.1 } : { min: -20, max: 20, step: 0.5 };
}

function isMultipleOf(value: number, step: number): boolean {
	const count = value / step;
	return Math.abs(count - Math.round(count)) < 1e-6;
}

function stepFits(step: number, min: number, max: number): boolean {
	return (
		step >= FINEST_STEP && step <= max - min && isMultipleOf(min, step) && isMultipleOf(max, step)
	);
}

/**
 * The range the app gives this filter's slider, and what it would ignore to get there. Each key
 * falls back on its own, as in the app: a bad step does not cost the filter its limits.
 */
export function resolveFilterRange(f: FilterForm): { range: FilterRange; problems: string[] } {
	const base = defaultRange(f.type);
	const problems: string[] = [];
	let { min, max } = base;
	if (f.min !== undefined) {
		if (f.min <= 0) min = f.min;
		else problems.push('Min gain cannot be above 0.');
	}
	if (f.max !== undefined) {
		if (f.max >= 0) max = f.max;
		else problems.push('Max gain cannot be below 0.');
	}
	if (min === max) {
		problems.push('Min and max gain cannot both be 0.');
		({ min, max } = base);
	}

	if (f.step !== undefined) {
		if (stepFits(f.step, min, max)) return { range: { min, max, step: f.step }, problems };
		problems.push(
			`Step has to be at least ${FINEST_STEP}, no larger than the range from min to max, and ` +
				'divide both evenly, or the slider cannot sit on 0 or reach max.'
		);
	}
	const step = [base.step, ...FALLBACK_STEPS].find((candidate) => stepFits(candidate, min, max));
	if (step === undefined) {
		problems.push(`Min and max gain cannot be finer than ${FINEST_STEP}.`);
		return { range: base, problems };
	}
	return { range: { min, max, step }, problems };
}

/** What is wrong with the range as entered, or `null`. The app would ignore the keys it names. */
export function filterRangeProblem(f: FilterForm): string | null {
	const { problems } = resolveFilterRange(f);
	return problems.length > 0 ? problems.join(' ') : null;
}

/** Whether a preset or initial gain lies outside the filter's slider. */
export function isGainOutsideRange(f: FilterForm, gain: number | undefined): boolean {
	if (gain === undefined) return false;
	const { min, max } = resolveFilterRange(f).range;
	return gain < min || gain > max;
}
