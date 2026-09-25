/**
 * End-to-end round trip through the AutoEQ web worker.
 *
 * Runs in the `client` project because it needs a real `Worker` — the point of
 * the spec is that `?worker&url` resolves, the worker boots, the wasm module
 * behind it loads, and the request/reply protocol (id matching, result vs
 * error, listener teardown) actually works. A mocked `Worker` would only
 * re-assert the shape of the mock.
 *
 * **The exact band count is the proof the wasm loaded.** The TypeScript
 * fallback drops bands in its prune pass — ask for eight, get seven — so a run
 * that returns precisely what it asked for, and says `engine: 'turboeq'`, could
 * not have come from anywhere else.
 */
import { describe, it, expect } from 'vitest';
import { runAutoEQInWorker } from './autoeq-client.js';

/** A log-spaced curve, 1/12-octave from 20 Hz to 20 kHz. */
function curve(shape: (freq: number) => number): [number, number][] {
	const points: [number, number][] = [];
	const step = Math.pow(2, 1 / 12);
	for (let freq = 20; freq <= 20000; freq *= step) {
		points.push([freq, shape(freq)]);
	}
	return points;
}

const FLAT = curve(() => 80);
/** Flat plus a 6 dB bump around 3 kHz — something AutoEQ has a reason to correct. */
const BUMPED = curve((f) => 80 + 6 * Math.exp(-Math.pow(Math.log2(f / 3000), 2) / 0.5));
/** Structured-cloneable, passes the emptiness guard, blows up in both engines. */
const NOT_ITERABLE = { length: 1 } as unknown as [number, number][];

/** Three peaking bands, no shelves — the smallest request worth asserting on. */
const THREE = { kind: 'parametric', peaking: 3, shelves: false } as const;

describe('runAutoEQInWorker', () => {
	it('runs the wasm engine and returns exactly the bands asked for', async () => {
		const outcome = await runAutoEQInWorker(BUMPED, FLAT, THREE);

		expect(outcome.engine).toBe('turboeq');
		expect(outcome.filters).toHaveLength(3);
	});

	it('returns filters whose fields survive structured cloning intact', async () => {
		const { filters } = await runAutoEQInWorker(BUMPED, FLAT, THREE);

		for (const filter of filters) {
			expect(typeof filter.type).toBe('string');
			expect(Number.isFinite(filter.freq)).toBe(true);
			expect(Number.isFinite(filter.q)).toBe(true);
			expect(Number.isFinite(filter.gain)).toBe(true);
		}
	});

	it('carries the fit error and preamp back across the boundary', async () => {
		const outcome = await runAutoEQInWorker(BUMPED, FLAT, THREE);

		expect(outcome.rmse).toBeGreaterThan(0);
		expect(outcome.preamp).toBeLessThanOrEqual(0);
	});

	it('aims a correction at the band that actually differs', async () => {
		const { filters } = await runAutoEQInWorker(BUMPED, FLAT, {
			kind: 'parametric',
			peaking: 4,
			shelves: false
		});

		// The only deviation is the 3 kHz bump, so at least one filter must sit
		// near it and pull down.
		const nearBump = filters.filter((f) => f.freq != null && f.freq > 1500 && f.freq < 6000);
		expect(nearBump.length).toBeGreaterThan(0);
		expect(nearBump.some((f) => (f.gain ?? 0) < 0)).toBe(true);
	});

	it('puts the shelves outside the peaking count', async () => {
		const { filters } = await runAutoEQInWorker(BUMPED, FLAT, {
			kind: 'parametric',
			peaking: 6,
			shelves: true
		});

		expect(filters).toHaveLength(8);
		expect(filters.filter((f) => f.type === 'LSQ')).toHaveLength(1);
		expect(filters.filter((f) => f.type === 'HSQ')).toHaveLength(1);
	});

	it('keeps every band inside the bounds it was given', async () => {
		const { filters } = await runAutoEQInWorker(BUMPED, FLAT, {
			kind: 'parametric',
			peaking: 4,
			shelves: false,
			limits: { minFc: 1000, maxFc: 8000, minGain: -2, maxGain: 2 }
		});

		for (const filter of filters) {
			expect(filter.freq).toBeGreaterThanOrEqual(1000);
			expect(filter.freq).toBeLessThanOrEqual(8000);
			expect(filter.gain).toBeGreaterThanOrEqual(-2.001);
			expect(filter.gain).toBeLessThanOrEqual(2.001);
		}
	});

	it('reaches a treble peak in exact mode, which only turboEQ can place there', async () => {
		// The exact-match options include `Infinity`, which has to survive the
		// trip into the wasm's option slots; a band above 10 kHz proves it did.
		const peak = curve((f) => 80 + 6 * Math.exp(-Math.pow(Math.log2(f / 14000), 2) / 0.02));
		const { engine, filters } = await runAutoEQInWorker(peak, FLAT, { ...THREE, fit: 'exact' });

		expect(engine).toBe('turboeq');
		expect(filters.some((f) => f.freq != null && f.freq > 11000 && (f.gain ?? 0) < -2)).toBe(true);
	});

	it('fits a graphic grid without moving a band off its slider', async () => {
		const sliders = [125, 250, 500, 1000, 2000, 4000];
		const { filters } = await runAutoEQInWorker(BUMPED, FLAT, {
			kind: 'graphic',
			bands: sliders.map((freq) => ({ freq, q: 1.4 }))
		});

		expect(filters.map((f) => f.freq)).toEqual(sliders);
		expect(filters.every((f) => f.q === 1.4)).toBe(true);
	});

	it('rejects with the worker-side message when both engines throw', async () => {
		// A non-iterable with a length gets past the emptiness guard in each
		// engine and blows up inside. The worker catches, posts `autoeq-error`,
		// and the client turns that back into a rejection rather than hanging.
		await expect(runAutoEQInWorker(NOT_ITERABLE, FLAT, THREE)).rejects.toThrow();
	});

	it('keeps concurrent requests apart by id', async () => {
		const [three, six] = await Promise.all([
			runAutoEQInWorker(BUMPED, FLAT, THREE),
			runAutoEQInWorker(BUMPED, FLAT, { kind: 'parametric', peaking: 6, shelves: false })
		]);

		expect(three.filters).toHaveLength(3);
		expect(six.filters).toHaveLength(6);
	});

	it('stays usable after a rejected run — the worker is reused, not torn down', async () => {
		await expect(runAutoEQInWorker(NOT_ITERABLE, FLAT, THREE)).rejects.toThrow();

		const { filters } = await runAutoEQInWorker(BUMPED, FLAT, THREE);
		expect(filters).toHaveLength(3);
	});
});
