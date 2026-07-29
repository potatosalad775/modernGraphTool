/**
 * End-to-end round trip through the AutoEQ web worker.
 *
 * Runs in the `client` project because it needs a real `Worker` — the point of
 * the spec is that `?worker&url` resolves, the worker boots, and the request/reply
 * protocol (id matching, result vs error, listener teardown) actually works. A
 * mocked `Worker` would only re-assert the shape of the mock.
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
/** Structured-cloneable, passes the emptiness guard, blows up on the spread. */
const NOT_ITERABLE = { length: 1 } as unknown as [number, number][];

describe('runAutoEQInWorker', () => {
	it('resolves with a filter list for a real source/target pair', async () => {
		const filters = await runAutoEQInWorker(BUMPED, FLAT, { maxFilters: 3 });

		expect(Array.isArray(filters)).toBe(true);
		expect(filters.length).toBeGreaterThan(0);
		expect(filters.length).toBeLessThanOrEqual(3);
	});

	it('returns filters whose fields survive structured cloning intact', async () => {
		const filters = await runAutoEQInWorker(BUMPED, FLAT, { maxFilters: 3 });

		for (const filter of filters) {
			expect(typeof filter.type).toBe('string');
			expect(Number.isFinite(filter.freq)).toBe(true);
			expect(Number.isFinite(filter.q)).toBe(true);
			expect(Number.isFinite(filter.gain)).toBe(true);
		}
	});

	it('aims a correction at the band that actually differs', async () => {
		const filters = await runAutoEQInWorker(BUMPED, FLAT, {
			maxFilters: 4,
			useShelfFilter: false
		});

		// The only deviation is the 3 kHz bump, so at least one filter must sit
		// near it and pull down.
		const nearBump = filters.filter((f) => f.freq > 1500 && f.freq < 6000);
		expect(nearBump.length).toBeGreaterThan(0);
		expect(nearBump.some((f) => f.gain < 0)).toBe(true);
	});

	it('honours maxFilters', async () => {
		const filters = await runAutoEQInWorker(BUMPED, FLAT, { maxFilters: 1 });
		expect(filters.length).toBeLessThanOrEqual(1);
	});

	it('honours freqRange — no filter lands outside the requested band', async () => {
		const filters = await runAutoEQInWorker(BUMPED, FLAT, {
			maxFilters: 4,
			freqRange: [1000, 8000],
			useShelfFilter: false
		});

		for (const filter of filters) {
			expect(filter.freq).toBeGreaterThanOrEqual(1000);
			expect(filter.freq).toBeLessThanOrEqual(8000);
		}
	});

	it('honours gainRange', async () => {
		const filters = await runAutoEQInWorker(BUMPED, FLAT, {
			maxFilters: 4,
			gainRange: [-2, 2],
			useShelfFilter: false
		});

		for (const filter of filters) {
			expect(filter.gain).toBeGreaterThanOrEqual(-2.001);
			expect(filter.gain).toBeLessThanOrEqual(2.001);
		}
	});

	it('rejects with the worker-side message when the run throws', async () => {
		// A non-iterable with a length reaches `_interpolatePoints`, which spreads it.
		// The worker catches, posts `autoeq-error`, and the client turns that back
		// into a rejection rather than hanging or dying.
		await expect(runAutoEQInWorker(NOT_ITERABLE, FLAT, {})).rejects.toThrow(/iterable/);
	});

	it('keeps concurrent requests apart by id', async () => {
		const [one, four] = await Promise.all([
			runAutoEQInWorker(BUMPED, FLAT, { maxFilters: 1 }),
			runAutoEQInWorker(BUMPED, FLAT, { maxFilters: 4, useShelfFilter: false })
		]);

		expect(one.length).toBeLessThanOrEqual(1);
		expect(four.length).toBeLessThanOrEqual(4);
	});

	it('stays usable after a rejected run — the worker is reused, not torn down', async () => {
		await expect(runAutoEQInWorker(NOT_ITERABLE, FLAT, {})).rejects.toThrow();

		const filters = await runAutoEQInWorker(BUMPED, FLAT, { maxFilters: 2 });
		expect(filters.length).toBeGreaterThan(0);
	});
});
