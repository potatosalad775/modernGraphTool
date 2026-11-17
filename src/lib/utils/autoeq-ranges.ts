export type AutoEqRangeKey = 'freqMin' | 'freqMax' | 'gainMin' | 'gainMax' | 'qMin' | 'qMax';

export type AutoEqRangeField = {
	min: number;
	max: number;
	step?: number;
	integer?: boolean;
	partner: AutoEqRangeKey;
};

/**
 * What each AutoEQ bound may hold, and its pair partner. The single source for the number boxes in
 * `EqAutoEq` (their `min` / `max` and the clamp on commit) and for the clamp `settingsStore`
 * applies to stored options on hydrate, so a stored value can't sit outside what the form allows.
 */
export const AUTOEQ_RANGE_FIELDS: Record<AutoEqRangeKey, AutoEqRangeField> = {
	freqMin: { min: 20, max: 20000, integer: true, partner: 'freqMax' },
	freqMax: { min: 20, max: 20000, integer: true, partner: 'freqMin' },
	gainMin: { min: -40, max: 0, partner: 'gainMax' },
	gainMax: { min: 0, max: 40, partner: 'gainMin' },
	qMin: { min: 0.1, max: 10, step: 0.1, partner: 'qMax' },
	qMax: { min: 0.1, max: 10, step: 0.1, partner: 'qMin' }
};
