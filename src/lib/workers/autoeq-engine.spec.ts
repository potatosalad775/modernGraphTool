/**
 * The AutoEQ engine, driven against the real wasm module.
 *
 * The module is loaded with `TurboEQ.load()` here rather than through
 * `loadTurboEq`, which fetches a Vite-emitted URL that only exists in a browser. That keeps the
 * mapping — row budget to bands, preset ranges to bounds, a slider grid to a
 * pinned bank — checkable in the fast node project, and leaves
 * `autoeq-client.svelte.spec.ts` to prove the browser path resolves.
 *
 * What is asserted is what a wrong mapping would break *silently*: a fit still
 * comes back, it is just fitted to something other than what was asked for.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { MAX_FILTERS, TurboEQ } from '@potatosalad775/turboeq';
import { buildBanks, runAutoEq } from './autoeq-engine.js';
import { bandCount, planBands, MAX_BANDS } from './autoeq-request.js';

let engine: TurboEQ;
const loadEngine = () => Promise.resolve(engine);

/** A bumpy 1/12-octave curve — something an optimizer has a reason to correct. */
function curve(shape: (freq: number) => number): [number, number][] {
	const points: [number, number][] = [];
	for (let freq = 20; freq <= 20000; freq *= Math.pow(2, 1 / 12)) {
		points.push([freq, shape(freq)]);
	}
	return points;
}

const BUMPED = curve((f) => 6 * Math.exp(-Math.pow(Math.log2(f / 3000), 2) / 0.5));
const FLAT = curve(() => 0);

beforeAll(async () => {
	// Node reads the wasm beside the package from disk.
	engine = await TurboEQ.load();
});

describe('planBands', () => {
	it('puts the shelves outside the peaking count', () => {
		expect(planBands(10, true)).toEqual({ peaking: 8, shelves: true });
	});

	it('keeps every row a peaking band when shelves are not wanted', () => {
		expect(planBands(10, false)).toEqual({ peaking: 10, shelves: false });
	});

	it('drops the shelves rather than spending the whole budget on them', () => {
		// Two rows with shelves asked for would be two shelves and no peaking
		// band, which corrects nothing that is not bass or treble tilt.
		expect(planBands(2, true)).toEqual({ peaking: 2, shelves: false });
		expect(planBands(3, true)).toEqual({ peaking: 3, shelves: false });
		expect(planBands(4, true)).toEqual({ peaking: 2, shelves: true });
	});

	it('never asks for nothing', () => {
		expect(planBands(0, true)).toEqual({ peaking: 1, shelves: false });
		expect(planBands(-5, false)).toEqual({ peaking: 1, shelves: false });
	});
});

describe('buildBanks', () => {
	it('takes the user Q and gain windows as given in either mode', () => {
		// A device profile allows Q 0.1 to 10 and AutoEq 0.18248 to 6. The user's
		// window is the constraint; narrowing it to AutoEq's used to turn Q 10
		// into 6 without a word.
		for (const fit of ['exact', 'autoeq'] as const) {
			const [bank] = buildBanks(engine, {
				kind: 'parametric',
				peaking: 4,
				shelves: false,
				fit,
				limits: { minQ: 0.1, maxQ: 10, minGain: -40, maxGain: 40, minFc: 20, maxFc: 20000 }
			});

			expect(bank.filters).toHaveLength(4);
			expect(bank.filters[0]).toMatchObject({ minQ: 0.1, maxQ: 10, minGain: -40, maxGain: 40 });
		}
	});

	it('keeps treble-safe bands at or below 10 kHz and lets exact-match ones past it', () => {
		// AutoEq's loss sees only the level above 10 kHz, so bands up there
		// would cancel each other. Exact match scores the shape to the top.
		const limits = { minFc: 20, maxFc: 16000 };
		const [safe] = buildBanks(engine, {
			kind: 'parametric',
			peaking: 2,
			shelves: false,
			fit: 'autoeq',
			limits
		});
		const [exact] = buildBanks(engine, {
			kind: 'parametric',
			peaking: 2,
			shelves: false,
			fit: 'exact',
			limits
		});

		expect(safe.filters[0]).toMatchObject({ minFc: 20, maxFc: 10000 });
		expect(exact.filters[0]).toMatchObject({ minFc: 20, maxFc: 16000 });
	});

	it('fits exactly unless told otherwise', () => {
		const [bank] = buildBanks(engine, { kind: 'parametric', peaking: 2, shelves: false });

		expect(bank.filters[0].maxFc).toBe(20000);
	});

	it('keeps a narrower host range', () => {
		const [bank] = buildBanks(engine, {
			kind: 'parametric',
			peaking: 2,
			shelves: false,
			limits: { minGain: -6, maxGain: 6 }
		});

		expect(bank.filters[0]).toMatchObject({ minGain: -6, maxGain: 6 });
	});

	it('lets both shelves move, inside AutoEq shelf Q window', () => {
		// Pinned at 105 Hz and 10 kHz, the shelves were two fixed bands out of
		// every budget: 40% of five.
		const [bank] = buildBanks(engine, {
			kind: 'parametric',
			peaking: 3,
			shelves: true,
			limits: { minFc: 20, maxFc: 18000, minQ: 0.1, maxQ: 10, minGain: -15, maxGain: 15 }
		});

		expect(bank.filters).toHaveLength(5);
		for (const [i, type] of (['low_shelf', 'high_shelf'] as const).entries()) {
			expect(bank.filters[i]).toMatchObject({
				type,
				minFc: 20,
				maxFc: 18000,
				minQ: 0.4,
				maxQ: 0.7,
				minGain: -15,
				maxGain: 15
			});
			expect(bank.filters[i].fc).toBeUndefined();
			expect(bank.filters[i].q).toBeUndefined();
		}
	});

	it('pins shelf Q at the nearest value the user allows when the windows miss', () => {
		const [bank] = buildBanks(engine, {
			kind: 'parametric',
			peaking: 3,
			shelves: true,
			limits: { minQ: 1, maxQ: 4 }
		});

		expect(bank.filters[0]).toMatchObject({ minQ: 1, maxQ: 1 });
	});

	it('pins a graphic grid band by band, each with its own Q', () => {
		const [bank] = buildBanks(engine, {
			kind: 'graphic',
			bands: [{ freq: 100, q: 1.4 }, { freq: 1000 }, { freq: 10000, q: 0.8 }],
			gain: { min: -12, max: 12 }
		});

		expect(bank.filters.map((f) => f.fc)).toEqual([100, 1000, 10000]);
		expect(bank.filters.map((f) => f.q)).toEqual([1.4, Math.SQRT2, 0.8]);
		expect(bank.filters[0]).toMatchObject({ minGain: -12, maxGain: 12 });
	});

	it('carries a loss band through, which is not the same as an fc bound', () => {
		const [bank] = buildBanks(engine, {
			kind: 'parametric',
			peaking: 2,
			shelves: false,
			loss: { minF: 100, maxF: 8000 }
		});

		expect(bank).toMatchObject({ minF: 100, maxF: 8000 });
	});
});

describe('runAutoEq', () => {
	it('returns exactly the bands it was asked for', async () => {
		// The cheapest proof the wasm engine ran: the TypeScript one drops bands
		// in its prune pass, so "ask 8, get 7" is normal there and impossible here.
		const request = { kind: 'parametric' as const, peaking: 6, shelves: true };
		const outcome = await runAutoEq(BUMPED, FLAT, request, { loadEngine });

		expect(outcome.engine).toBe('turboeq');
		expect(outcome.filters).toHaveLength(bandCount(request));
		expect(outcome.filters.filter((f) => f.type === 'LSQ')).toHaveLength(1);
		expect(outcome.filters.filter((f) => f.type === 'HSQ')).toHaveLength(1);
	});

	it('corrects the band that actually differs', async () => {
		const outcome = await runAutoEq(BUMPED, FLAT, {
			kind: 'parametric',
			peaking: 4,
			shelves: false
		});

		const nearBump = outcome.filters.filter((f) => f.freq! > 1500 && f.freq! < 6000);
		expect(nearBump.length).toBeGreaterThan(0);
		expect(nearBump.some((f) => f.gain! < 0)).toBe(true);
	});

	it('lands inside the bounds instead of being clamped into them afterwards', async () => {
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{
				kind: 'parametric',
				peaking: 5,
				shelves: false,
				limits: { minGain: -3, maxGain: 3, minQ: 1, maxQ: 3 }
			},
			{ loadEngine }
		);

		for (const filter of outcome.filters) {
			expect(filter.gain!).toBeGreaterThanOrEqual(-3.001);
			expect(filter.gain!).toBeLessThanOrEqual(3.001);
			expect(filter.q!).toBeGreaterThanOrEqual(0.999);
			expect(filter.q!).toBeLessThanOrEqual(3.001);
		}
	});

	it('returns bands low to high, at the precision a filter card edits', async () => {
		// The solver's doubles would otherwise reach the list, the export and the
		// device as-is, and turboEQ lists its shelves first.
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'parametric', peaking: 6, shelves: true },
			{ loadEngine }
		);

		const freqs = outcome.filters.map((f) => f.freq!);
		expect(freqs).toEqual([...freqs].sort((a, b) => a - b));
		for (const f of outcome.filters) {
			expect(Number.isInteger(f.freq)).toBe(true);
			expect(f.q).toBe(Math.round(f.q! * 100) / 100);
			expect(f.gain).toBe(Math.round(f.gain! * 10) / 10);
		}
	});

	it('leaves a graphic fit on its own grid, with nothing to snap', async () => {
		const sliders = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'graphic', bands: sliders.map((freq) => ({ freq, q: 1.4 })) },
			{ loadEngine }
		);

		// 31.25 Hz stays 31.25: fc and Q are the preset's, so only gain is rounded.
		expect(outcome.filters.map((f) => f.freq)).toEqual(sliders);
		expect(outcome.filters.every((f) => f.q === 1.4)).toBe(true);
		expect(outcome.filters.every((f) => f.type === 'PK')).toBe(true);
		expect(outcome.filters.every((f) => f.gain === Math.round(f.gain! * 10) / 10)).toBe(true);
	});

	it('corrects a treble peak in exact mode that AutoEq mode leaves alone', async () => {
		// A 6 dB peak at 14 kHz: AutoEq smooths it over two octaves, scores only
		// the mean up there and keeps every band below 10 kHz. Exact match is
		// the mode for a user lining the curve up against the target on screen.
		const TREBLE_PEAK = curve((f) => 6 * Math.exp(-Math.pow(Math.log2(f / 14000), 2) / 0.02));
		const request = { kind: 'parametric' as const, peaking: 4, shelves: false };

		const exact = await runAutoEq(TREBLE_PEAK, FLAT, { ...request, fit: 'exact' }, { loadEngine });
		const autoeq = await runAutoEq(
			TREBLE_PEAK,
			FLAT,
			{ ...request, fit: 'autoeq' },
			{ loadEngine }
		);

		expect(exact.engine).toBe('turboeq');
		const cut = exact.filters.find((f) => f.freq! > 11000 && f.freq! < 18000 && f.gain! < -2);
		expect(cut).toBeDefined();
		expect(autoeq.filters.every((f) => f.freq! <= 10000)).toBe(true);
	});

	it('caps boost at the user ceiling in either mode, at 6 dB without one', async () => {
		// AutoEq clips the correction's largest boost at 6 dB unless told
		// otherwise; the gain range's maximum is the user telling it otherwise.
		// The preamp is minus the largest boost, so it reads the cap back out —
		// give or take the half decibel by which bands overshoot a clipped
		// correction.
		const DIP = curve((f) => -10 * Math.exp(-Math.pow(Math.log2(f / 2000), 2) / 0.5));
		const fit = (maxGain: number | undefined, mode: 'exact' | 'autoeq') =>
			runAutoEq(
				DIP,
				FLAT,
				{ kind: 'parametric', peaking: 4, shelves: false, limits: { maxGain }, fit: mode },
				{ loadEngine }
			);

		for (const mode of ['exact', 'autoeq'] as const) {
			expect((await fit(12, mode)).preamp!).toBeLessThan(-7);
			expect((await fit(3, mode)).preamp!).toBeGreaterThanOrEqual(-3.5);
			expect((await fit(undefined, mode)).preamp!).toBeGreaterThanOrEqual(-6.5);
		}
	});

	it('reports the fit error and a preamp that is never positive', async () => {
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'parametric', peaking: 6, shelves: true },
			{ loadEngine }
		);

		expect(outcome.rmse).toBeGreaterThan(0);
		expect(outcome.preamp).toBeLessThanOrEqual(0);
	});

	// ── The fallback ─────────────────────────────────────────────────────────

	it('falls back to the TypeScript engine when the module will not load', async () => {
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'parametric', peaking: 3, shelves: false },
			{ loadEngine: () => Promise.reject(new Error('no wasm here')) }
		);

		expect(outcome.engine).toBe('typescript');
		expect(outcome.fallback).toBe('unavailable');
		expect(outcome.fallbackReason).toMatch(/no wasm here/);
		expect(outcome.filters.length).toBeGreaterThan(0);
	});

	it('fits the same way in either fit mode once it has fallen back', async () => {
		// The old engine has one mode, and it is the one exact match reproduces.
		// Treble-safe is turboEQ's, so without it the request gets what it always got.
		const unavailable = () => Promise.reject(new Error('no wasm here'));
		const request = { kind: 'parametric', peaking: 4, shelves: false } as const;

		const exact = await runAutoEq(
			BUMPED,
			FLAT,
			{ ...request, fit: 'exact' },
			{
				loadEngine: unavailable
			}
		);
		const trebleSafe = await runAutoEq(
			BUMPED,
			FLAT,
			{ ...request, fit: 'autoeq' },
			{
				loadEngine: unavailable
			}
		);

		expect(trebleSafe.filters).toEqual(exact.filters);
	});

	it('says turboEQ refused, not that it failed to load, when a request is out of its reach', async () => {
		// Treble-safe keeps every band at or below 10 kHz, so a window above it
		// has no answer there. The UI keeps the fit mode for this case, since
		// switching to exact match is what brings turboEQ back.
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{
				kind: 'parametric',
				peaking: 2,
				shelves: false,
				limits: { minFc: 12000, maxFc: 20000 },
				fit: 'autoeq'
			},
			{ loadEngine }
		);

		expect(outcome.engine).toBe('typescript');
		expect(outcome.fallback).toBe('rejected');
	});

	it('fits no graphic EQ without turboEQ', async () => {
		// The old engine places bands freely, so its answer would sit off the
		// preset's sliders. AutoEQ was unavailable in graphic mode before turboEQ,
		// and without it that is still the answer.
		const outcome = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'graphic', bands: [125, 1000, 8000].map((freq) => ({ freq })) },
			{ loadEngine: () => Promise.reject(new Error('no wasm here')) }
		);

		expect(outcome).toMatchObject({ engine: 'none', fallback: 'unavailable', filters: [] });
	});

	it('falls back on input turboEQ refuses but the old engine tolerates', async () => {
		// A null source optimizes against silence there rather than throwing, and
		// callers depend on that: a half-loaded UI sends things the soak never did.
		const outcome = await runAutoEq(
			null as unknown as [number, number][],
			FLAT,
			{ kind: 'parametric', peaking: 3, shelves: false },
			{ loadEngine }
		);

		// Against silence there is nothing to correct, so the answer is an empty
		// EQ rather than an error — which is exactly the tolerance callers rely on.
		expect(outcome.engine).toBe('typescript');
		expect(outcome.fallback).toBe('rejected');
		expect(outcome.filters).toEqual([]);
	});

	it('throws when both engines fail, rather than returning nothing', async () => {
		await expect(
			runAutoEq(
				{ length: 1 } as unknown as [number, number][],
				FLAT,
				{ kind: 'parametric', peaking: 2, shelves: false },
				{ loadEngine }
			)
		).rejects.toThrow();
	});

	it('caps an unlimited preset at a number the solver can answer', () => {
		// Not enforced by `runAutoEq` — a caller that spelled out 40 bands means
		// it — but the constant the UI uses has to exist and be finite.
		expect(MAX_BANDS).toBe(32);
		expect(MAX_BANDS).toBe(MAX_FILTERS);
	});

	it('does not cache a failed instantiation', async () => {
		// A transient fetch error would otherwise pin the rest of the session to
		// the fallback.
		const failing = vi
			.fn<() => Promise<TurboEQ>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue(engine);

		const first = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'parametric', peaking: 2, shelves: false },
			{ loadEngine: failing }
		);
		const second = await runAutoEq(
			BUMPED,
			FLAT,
			{ kind: 'parametric', peaking: 2, shelves: false },
			{ loadEngine: failing }
		);

		expect(first.engine).toBe('typescript');
		expect(second.engine).toBe('turboeq');
	});
});
