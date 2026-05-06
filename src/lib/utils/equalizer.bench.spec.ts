import { describe, it, expect } from 'vitest';
import { Equalizer } from './equalizer.js';

type FreqPoint = [number, number];

function flatCurve(db = 0, count = 480): FreqPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const points: FreqPoint[] = [];
	for (let i = 0; i < count; i++) {
		points.push([freq, db]);
		freq *= step;
	}
	return points;
}

function shapedCurve(count = 480): FreqPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const points: FreqPoint[] = [];
	for (let i = 0; i < count; i++) {
		const db = 5 * Math.exp(-((Math.log10(freq) - 2.5) ** 2));
		points.push([freq, db]);
		freq *= step;
	}
	return points;
}

function timeOnce(fn: () => void): number {
	const t0 = performance.now();
	fn();
	return performance.now() - t0;
}

function meanOf(runs: number, fn: () => void): number {
	let total = 0;
	for (let i = 0; i < runs; i++) total += timeOnce(fn);
	return total / runs;
}

describe.skip('Equalizer benchmark', () => {
	const sizes = [480, 2000, 5000];

	for (const size of sizes) {
		it(`autoEQ on ${size}-point input (mean of 3 runs)`, () => {
			const eq = new Equalizer();
			const source = flatCurve(0, size);
			const target = shapedCurve(size);

			eq.autoEQ(source, target, { maxFilters: 8 });

			const mean = meanOf(3, () => {
				eq.autoEQ(source, target, { maxFilters: 8 });
			});

			console.log(`[bench] autoEQ ${size}pt: ${mean.toFixed(1)}ms`);

			const filters = eq.autoEQ(source, target, { maxFilters: 8 });
			expect(filters.length).toBeGreaterThan(0);
		});
	}
});
