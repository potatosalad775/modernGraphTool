import { describe, it, expect } from 'vitest';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import type { EQFilter } from './equalizer.js';
import {
	clampFilterToConstraint,
	clampFiltersToConstraint,
	getFilterViolation,
	isPastMaxBands,
	isTypeAllowed,
	pickAllowedType,
	snapToGraphicBand
} from './eq-constraint-clamp.js';

const PARAMETRIC: EqConstraintPreset = {
	id: 'p',
	label: 'P',
	mode: 'parametric',
	maxBands: 5,
	allowPk: true,
	allowLsq: true,
	allowHsq: true,
	freqMin: 50,
	freqMax: 10000,
	gainMin: -6,
	gainMax: 6,
	qMin: 0.5,
	qMax: 4
};

const PK_ONLY: EqConstraintPreset = {
	...PARAMETRIC,
	id: 'pk-only',
	allowLsq: false,
	allowHsq: false
};

const GRAPHIC: EqConstraintPreset = {
	id: 'g',
	label: 'G',
	mode: 'graphic',
	maxBands: 3,
	allowPk: true,
	allowLsq: false,
	allowHsq: false,
	graphicBands: [
		{ freq: 100, q: 1.4 },
		{ freq: 1000, q: 1.0 },
		{ freq: 10000, q: 0.8 }
	],
	gainMin: -12,
	gainMax: 12
};

function pk(o: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 0, ...o };
}

describe('isTypeAllowed / pickAllowedType', () => {
	it('returns true only for explicitly-allowed types', () => {
		expect(isTypeAllowed('PK', PARAMETRIC)).toBe(true);
		expect(isTypeAllowed('LSQ', PK_ONLY)).toBe(false);
	});

	it('keeps the existing type when allowed', () => {
		expect(pickAllowedType('LSQ', PARAMETRIC)).toBe('LSQ');
	});

	it('falls back to the first allowed type when current is disallowed', () => {
		expect(pickAllowedType('LSQ', PK_ONLY)).toBe('PK');
	});

	it('returns the original type for a pathological preset that allows nothing', () => {
		const noTypes = { ...PARAMETRIC, allowPk: false, allowLsq: false, allowHsq: false };
		expect(pickAllowedType('LSQ', noTypes)).toBe('LSQ');
	});
});

describe('snapToGraphicBand', () => {
	it('snaps to the nearest band on a log scale', () => {
		expect(snapToGraphicBand(120, GRAPHIC).freq).toBe(100);
		expect(snapToGraphicBand(900, GRAPHIC).freq).toBe(1000);
		expect(snapToGraphicBand(8000, GRAPHIC).freq).toBe(10000);
	});

	it('returns the snapped band’s Q', () => {
		expect(snapToGraphicBand(100, GRAPHIC).q).toBe(1.4);
		expect(snapToGraphicBand(10000, GRAPHIC).q).toBe(0.8);
	});

	it('passes freq through and uses qDefault when the preset has no bands', () => {
		const noBands = { ...GRAPHIC, graphicBands: undefined, qDefault: 2 };
		expect(snapToGraphicBand(120, noBands)).toEqual({ freq: 120, q: 2 });
	});
});

describe('clampFilterToConstraint — parametric', () => {
	it('clamps freq into range', () => {
		expect(clampFilterToConstraint(pk({ freq: 20 }), PARAMETRIC).freq).toBe(50);
		expect(clampFilterToConstraint(pk({ freq: 20000 }), PARAMETRIC).freq).toBe(10000);
	});

	it('clamps gain into range', () => {
		expect(clampFilterToConstraint(pk({ gain: 20 }), PARAMETRIC).gain).toBe(6);
		expect(clampFilterToConstraint(pk({ gain: -20 }), PARAMETRIC).gain).toBe(-6);
	});

	it('clamps Q into range', () => {
		expect(clampFilterToConstraint(pk({ q: 0.1 }), PARAMETRIC).q).toBe(0.5);
		expect(clampFilterToConstraint(pk({ q: 10 }), PARAMETRIC).q).toBe(4);
	});

	it('coerces a disallowed type into an allowed one', () => {
		expect(clampFilterToConstraint(pk({ type: 'LSQ' }), PK_ONLY).type).toBe('PK');
	});
});

describe('clampFilterToConstraint — graphic', () => {
	it('snaps freq + Q to the closest band', () => {
		const out = clampFilterToConstraint(pk({ freq: 850, q: 0.3 }), GRAPHIC);
		expect(out.freq).toBe(1000);
		expect(out.q).toBe(1.0);
	});

	it('forces type to PK in graphic mode (when PK is allowed)', () => {
		const out = clampFilterToConstraint(pk({ type: 'LSQ', freq: 1000 }), GRAPHIC);
		expect(out.type).toBe('PK');
	});

	it('clamps gain even in graphic mode', () => {
		const out = clampFilterToConstraint(pk({ freq: 1000, gain: 30 }), GRAPHIC);
		expect(out.gain).toBe(12);
	});
});

describe('clampFiltersToConstraint', () => {
	it('trims to maxBands in parametric mode', () => {
		const filters = Array.from({ length: 8 }, () => pk());
		const out = clampFiltersToConstraint(filters, { ...PARAMETRIC, maxBands: 4 });
		expect(out).toHaveLength(4);
	});

	it('does not trim when maxBands is 0 (unlimited)', () => {
		const unlimited = { ...PARAMETRIC, maxBands: 0 };
		const filters = Array.from({ length: 12 }, () => pk());
		expect(clampFiltersToConstraint(filters, unlimited)).toHaveLength(12);
	});

	it('produces exactly bands.length rows in graphic mode (one per band)', () => {
		const out = clampFiltersToConstraint([pk({ freq: 1100, gain: 4 })], GRAPHIC);
		expect(out).toHaveLength(3); // GRAPHIC has 3 bands
	});

	it('folds existing gains onto the nearest band in graphic mode', () => {
		const out = clampFiltersToConstraint(
			[pk({ freq: 1050, gain: 5 }), pk({ freq: 9500, gain: -2 })],
			GRAPHIC
		);
		// band 0 (100 Hz): no nearby source → 0 dB
		expect(out[0].freq).toBe(100);
		expect(out[0].gain).toBe(0);
		// band 1 (1000 Hz): nearest to 1050 → 5 dB
		expect(out[1].freq).toBe(1000);
		expect(out[1].gain).toBe(5);
		// band 2 (10000 Hz): nearest to 9500 → -2 dB
		expect(out[2].freq).toBe(10000);
		expect(out[2].gain).toBe(-2);
	});

	it('leaves a band at 0 dB when no source filter is within ±1 octave', () => {
		// 300 Hz is >1 octave from every band (100 / 1000 / 10000) → all reject it.
		const out = clampFiltersToConstraint([pk({ freq: 300, gain: 8 })], GRAPHIC);
		expect(out.map((f) => f.gain)).toEqual([0, 0, 0]);
	});

	it('clamps folded gains to the preset’s gain bounds', () => {
		const out = clampFiltersToConstraint([pk({ freq: 1000, gain: 30 })], GRAPHIC);
		expect(out[1].gain).toBe(12); // GRAPHIC.gainMax = 12
	});

	it('locks freq + Q to band template in graphic mode regardless of source filters', () => {
		const out = clampFiltersToConstraint([pk({ freq: 50, q: 5 })], GRAPHIC);
		// All output bands carry the template's freq + q, not the source's.
		out.forEach((f, i) => {
			expect(f.freq).toBe(GRAPHIC.graphicBands![i].freq);
			expect(f.q).toBe(GRAPHIC.graphicBands![i].q);
		});
	});
});

describe('getFilterViolation', () => {
	it('flags out-of-range freq as a violation', () => {
		const v = getFilterViolation(pk({ freq: 12000 }), PARAMETRIC);
		expect(v.freq).toBe(true);
	});

	it('flags non-graphic-band freq as a violation in graphic mode', () => {
		const v = getFilterViolation(pk({ freq: 500 }), GRAPHIC);
		expect(v.freq).toBe(true);
	});

	it('returns all-false for a disabled filter (no point flagging)', () => {
		const v = getFilterViolation(pk({ enabled: false, freq: 12000 }), PARAMETRIC);
		expect(v).toEqual({ type: false, freq: false, q: false, gain: false });
	});

	it('flags disallowed type', () => {
		const v = getFilterViolation(pk({ type: 'LSQ' }), PK_ONLY);
		expect(v.type).toBe(true);
	});
});

describe('isPastMaxBands', () => {
	it('flags indices past the cap', () => {
		expect(isPastMaxBands(0, GRAPHIC)).toBe(false);
		expect(isPastMaxBands(2, GRAPHIC)).toBe(false);
		expect(isPastMaxBands(3, GRAPHIC)).toBe(true);
	});

	it('returns false when maxBands is 0 (unlimited)', () => {
		const unlimited = { ...PARAMETRIC, maxBands: 0 };
		expect(isPastMaxBands(999, unlimited)).toBe(false);
	});
});
