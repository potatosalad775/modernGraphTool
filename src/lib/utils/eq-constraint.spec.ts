import { describe, it, expect } from 'vitest';
import type { EQFilter } from './equalizer.js';
import {
	allowsShelves,
	appTypesOf,
	assignSlots,
	conformFilters,
	envelopeOf,
	filterViolations,
	fromCapsFilter,
	fromCapsType,
	graphicBandsOf,
	isGraphicProfile,
	isPastMaxBands,
	maxBandsOf,
	padToBandCount,
	projectFilter,
	toCapsFilter,
	toCapsType
} from './eq-constraint.js';
import { graphicPreset, hardwareProfile, parametricPreset } from './__fixtures__/eq-profiles.js';

const pk = (freq: number, gain: number, q = 1, extra: Partial<EQFilter> = {}): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q,
	gain,
	...extra
});

const PARAM = parametricPreset('param', {
	maxBands: 3,
	types: ['PK'],
	freq: { min: 100, max: 10000 },
	q: { min: 0.5, max: 5 },
	gain: { min: -6, max: 6 }
}).profile;

const GRAPHIC = graphicPreset('graphic', [
	{ freq: 100, q: 1.4 },
	{ freq: 1000, q: 1.4 },
	{ freq: 10000, q: 1.4 }
]).profile;

/** JDS-style: a low-shelf-only first slot, then peaking slots. */
const PARTITIONED = hardwareProfile('partitioned', {
	bandCount: 3,
	band: {
		types: ['PK'],
		freq: { min: 20, max: 20000 },
		q: { min: 0.1, max: 10 },
		gain: { min: -12, max: 12, step: 0.5 }
	},
	bands: [{ index: 0, types: ['LSC'], freq: { min: 20, max: 300 } }]
});

describe('type mapping', () => {
	it('maps the app’s shelves to Equalizer APO codes and back', () => {
		expect(toCapsType('LSQ')).toBe('LSC');
		expect(toCapsType('HSQ')).toBe('HSC');
		expect(fromCapsType('HSC')).toBe('HSQ');
		expect(fromCapsType('LPQ')).toBeNull();
	});

	it('converts complete bands only', () => {
		expect(toCapsFilter(pk(1000, 3))).toEqual({ type: 'PK', freq: 1000, q: 1, gain: 3 });
		expect(toCapsFilter({ ...pk(1000, 3), gain: null })).toBeNull();
		expect(fromCapsFilter({ type: 'NO', freq: 1000, q: 1, gain: 0 })).toBeNull();
	});

	it('lists the app types a slot takes, in its order', () => {
		expect(appTypesOf(['HSC', 'LPQ', 'PK'])).toEqual(['HSQ', 'PK']);
	});
});

describe('reading profiles', () => {
	it('reads the band cap, 0 meaning unlimited', () => {
		expect(maxBandsOf(PARAM)).toBe(3);
		expect(maxBandsOf(parametricPreset('free').profile)).toBe(0);
	});

	it('recognizes a graphic EQ and lists its bands', () => {
		expect(isGraphicProfile(GRAPHIC)).toBe(true);
		expect(isGraphicProfile(PARAM)).toBe(false);
		expect(graphicBandsOf(GRAPHIC)).toEqual([
			{ freq: 100, q: 1.4 },
			{ freq: 1000, q: 1.4 },
			{ freq: 10000, q: 1.4 }
		]);
		expect(graphicBandsOf(PARAM)).toEqual([]);
	});

	it('takes the envelope over slots, optionally only those taking some types', () => {
		expect(envelopeOf(PARTITIONED, 'freq')).toEqual({ min: 20, max: 20000 });
		expect(envelopeOf(PARTITIONED, 'freq', ['LSC'])).toEqual({ min: 20, max: 300 });
		expect(envelopeOf(PARTITIONED, 'freq', ['HSC'])).toBeNull();
	});

	it('allows shelves only where a low and a high shelf both have a slot', () => {
		expect(allowsShelves(PARTITIONED)).toBe(false);
		expect(allowsShelves(parametricPreset('all').profile)).toBe(true);
	});
});

describe('projectFilter', () => {
	it('clamps every field into its range', () => {
		expect(projectFilter(pk(50, 9, 8), PARAM, 0)).toEqual(pk(100, 6, 5));
	});

	it('snaps onto a stepped grid', () => {
		expect(projectFilter(pk(1000, 3.3), PARTITIONED, 1).gain).toBe(3.5);
	});

	it('moves a disallowed type to the slot’s first type the app can hold', () => {
		expect(projectFilter({ ...pk(1000, 3), type: 'HSQ' }, PARAM, 0).type).toBe('PK');
		expect(projectFilter(pk(100, 3), PARTITIONED, 0).type).toBe('LSQ');
	});

	it('locks frequency and Q on a graphic band', () => {
		const out = projectFilter(pk(900, 3, 4), GRAPHIC, 1);
		expect(out.freq).toBe(1000);
		expect(out.q).toBe(1.4);
	});

	it('leaves unset fields unset', () => {
		const out = projectFilter({ ...pk(50, 9), q: null }, PARAM, 0);
		expect(out.q).toBeNull();
		expect(out.freq).toBe(100);
	});
});

describe('assignSlots', () => {
	it('puts a low shelf in the low-shelf slot whatever its list position', () => {
		const filters = [pk(1000, 3), { ...pk(80, 4), type: 'LSQ' as const }];
		expect(assignSlots(filters, PARTITIONED)).toEqual([1, 0]);
	});

	it('places inactive and incomplete bands by position', () => {
		const filters = [pk(1000, 0), { ...pk(2000, 1), gain: null }];
		expect(assignSlots(filters, PARAM)).toEqual([0, 1]);
	});
});

describe('conformFilters', () => {
	it('trims to the band cap and projects what stays', () => {
		const out = conformFilters([pk(50, 9), pk(1000, 1), pk(2000, 2), pk(4000, 3)], PARAM);
		expect(out).toHaveLength(3);
		expect(out[0]).toEqual(pk(100, 6));
	});

	it('does not trim when unlimited', () => {
		const free = parametricPreset('free').profile;
		expect(conformFilters([pk(100, 1), pk(200, 1), pk(400, 1), pk(800, 1)], free)).toHaveLength(4);
	});

	it('folds onto a graphic EQ: one row per band, nearest source gain within an octave', () => {
		const out = conformFilters([pk(950, 4), pk(9000, -3), pk(30, 5)], GRAPHIC);
		expect(out.map((f) => [f.freq, f.gain])).toEqual([
			[100, 0],
			[1000, 4],
			[10000, -3]
		]);
		expect(out.every((f) => f.type === 'PK' && f.q === 1.4)).toBe(true);
	});

	it('clamps folded gains to the graphic EQ’s gain range', () => {
		expect(conformFilters([pk(1000, 30)], GRAPHIC)[1].gain).toBe(10);
	});
});

describe('padToBandCount', () => {
	const DEVICE = hardwareProfile('device', {
		bandCount: 5,
		band: {
			types: ['PK'],
			freq: { min: 20, max: 20000, step: 1 },
			q: { min: 0.1, max: 10, step: 0.01 },
			gain: { min: -12, max: 12, step: 0.5 }
		}
	});

	it('appends flat bands in the widest log-frequency gaps until every device band has a row', () => {
		const out = padToBandCount([pk(1000, 3)], DEVICE);
		expect(out).toHaveLength(5);
		expect(out[0]).toEqual(pk(1000, 3));
		expect(out.slice(1).map((f) => [f.freq, f.q, f.gain])).toEqual([
			[80, 1, 0],
			[250, 1, 0],
			[2500, 1, 0],
			[8000, 1, 0]
		]);
	});

	it('fills an empty list with ascending nominal frequencies', () => {
		const eight = hardwareProfile('eight', { bandCount: 8, band: DEVICE.band });
		expect(padToBandCount([], eight).map((f) => f.freq)).toEqual([
			40, 100, 200, 400, 1000, 2000, 4000, 10000
		]);
	});

	it('keeps the order where nominal frequencies run out', () => {
		const narrow = hardwareProfile('narrow', {
			bandCount: 3,
			band: { ...DEVICE.band, freq: { min: 100, max: 140, step: 1 } }
		});
		expect(padToBandCount([], narrow).map((f) => f.freq)).toEqual([125, 132, 136]);
	});

	it('counts per output, so per-channel bands leave fewer to add', () => {
		const filters = [pk(1000, 3), pk(200, 1, 1, { channel: 'L' }), pk(300, 1, 1, { channel: 'R' })];
		expect(padToBandCount(filters, DEVICE)).toHaveLength(6);
	});

	it('leaves presets, graphic EQs and full lists alone', () => {
		const five = [100, 200, 400, 800, 1600].map((f) => pk(f, 1));
		expect(padToBandCount(five, DEVICE)).toBe(five);
		expect(padToBandCount([pk(1000, 3)], PARAM)).toHaveLength(1);
		const graphic = hardwareProfile('geq', {
			bandCount: 2,
			band: { types: ['PK'], freq: { value: 100 }, q: { value: 1 }, gain: { min: -6, max: 6 } },
			bands: [{ index: 1, freq: { value: 1000 } }]
		});
		expect(padToBandCount([pk(100, 3)], graphic)).toHaveLength(1);
	});

	it('adds nothing a slot can only hold active', () => {
		const noZero = hardwareProfile('no-zero', {
			bandCount: 3,
			band: {
				types: ['PK'],
				freq: { min: 20, max: 20000 },
				q: { min: 0.1, max: 10 },
				gain: { min: 1, max: 6 }
			}
		});
		expect(padToBandCount([pk(1000, 3)], noZero)).toHaveLength(1);
	});
});

describe('filterViolations', () => {
	it('flags out-of-domain fields per band', () => {
		const v = filterViolations([pk(50, 3), pk(1000, 9)], PARAM);
		expect(v[0]).toEqual({ type: false, freq: true, q: false, gain: false });
		expect(v[1]).toEqual({ type: false, freq: false, q: false, gain: true });
	});

	it('flags a type no slot takes', () => {
		expect(filterViolations([{ ...pk(1000, 3), type: 'HSQ' }], PARAM)[0].type).toBe(true);
	});

	it('flags an off-band frequency on a graphic EQ', () => {
		expect(filterViolations([pk(900, 3)], GRAPHIC)[0].freq).toBe(true);
	});

	it('never flags a disabled or incomplete band', () => {
		const v = filterViolations(
			[pk(50, 9, 1, { enabled: false }), { ...pk(50, 9), q: null }],
			PARAM
		);
		expect(v.every((f) => !f.type && !f.freq && !f.q && !f.gain)).toBe(true);
	});

	it('checks each ear on its own when bands are pinned', () => {
		// Two shared + one per ear = 3 per output: fits a 3-band profile.
		const filters = [
			pk(200, 1),
			pk(400, 1),
			pk(800, 1, 1, { channel: 'L' }),
			pk(1600, 9, 1, { channel: 'R' })
		];
		const v = filterViolations(filters, PARAM);
		expect(v[3].gain).toBe(true);
		expect(v.slice(0, 3).every((f) => !f.gain)).toBe(true);
	});
});

describe('isPastMaxBands', () => {
	it('flags indices past the cap', () => {
		expect(isPastMaxBands(2, PARAM)).toBe(false);
		expect(isPastMaxBands(3, PARAM)).toBe(true);
	});

	it('counts per output when given the list', () => {
		const filters = [
			pk(200, 1),
			pk(400, 1),
			pk(800, 1, 1, { channel: 'L' }),
			pk(1600, 1, 1, { channel: 'R' })
		];
		expect(isPastMaxBands(3, PARAM, filters)).toBe(false);
	});

	it('returns false when unlimited', () => {
		expect(isPastMaxBands(99, parametricPreset('free').profile)).toBe(false);
	});
});
