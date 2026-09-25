// Scores what run.mjs and upstream.py recorded and prints the tables as Markdown.
//
//     node scripts/bench-autoeq/score.mjs --curves FILE.curves.json FILE.jsonl [FILE.jsonl...]
//
// Every engine is scored the same way, whatever it was fed: its filters' response at 48 kHz,
// through mGT's own biquads, added to the raw L+R average of the measurement and compared with
// the raw target, both on a 1/48-octave grid.
//
// - **Error** is the RMS of (measurement + EQ − target) after removing its mean, so the level
//   each engine happened to align at doesn't count. Over 20 Hz–20 kHz and over 20 Hz–10 kHz,
//   because AutoEq deliberately stops fitting the shape above 10 kHz.
// - **Deviation** is the RMS difference between an engine's EQ curve and upstream AutoEq's for
//   the same measurement, mean removed, 20 Hz–20 kHz — how far from "what AutoEq would give".
// - **Boost** is the EQ curve's largest positive gain, which is what the preamp gives back.

import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register(new URL('./ts-hooks.mjs', import.meta.url));
const { Equalizer } = await import('$lib/utils/equalizer.js');

const argv = process.argv.slice(2);
const curvesPath = argv[argv.indexOf('--curves') + 1];
const files = argv.filter((a, i) => a !== '--curves' && argv[i - 1] !== '--curves');

const ORDER = [
	'cringraph',
	'mgt-typescript',
	'turboeq-exact',
	'turboeq-treble-safe',
	'upstream',
	'upstream-converged'
];

const grid = [20];
while (grid[grid.length - 1] < 20000) grid.push(grid[grid.length - 1] * Math.pow(2, 1 / 48));
const below10k = grid.map((f) => f <= 10000);

function interp(points) {
	let i = 0;
	return grid.map((f) => {
		while (i < points.length - 2 && points[i + 1][0] < f) i++;
		const [f0, v0] = points[i];
		const [f1, v1] = points[i + 1];
		if (f <= f0) return v0;
		if (f >= f1) return v1;
		const t = Math.log(f / f0) / Math.log(f1 / f0);
		return v0 + t * (v1 - v0);
	});
}

/** RMS of `xs` after removing its mean, over the points `mask` keeps. */
function rmsLevelFree(xs, mask) {
	const kept = mask ? xs.filter((_, i) => mask[i]) : xs;
	const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
	return Math.sqrt(kept.reduce((a, x) => a + (x - mean) ** 2, 0) / kept.length);
}

const eq = new Equalizer();
const response = (filters) =>
	eq.calculateGainsFromFilter(
		grid,
		filters.map((f) => ({ enabled: true, type: f.type, freq: f.fc, q: f.q, gain: f.gain }))
	);

const { target: rawTarget, curves } = JSON.parse(readFileSync(curvesPath, 'utf8'));
const target = interp(rawTarget);
const source = new Map(curves.map((c) => [c.name, interp(c.raw)]));

const records = files.flatMap((file) =>
	readFileSync(file, 'utf8')
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line))
);
const eqCurve = new Map(); // `${engine}|${bands}|${curve}` → response
for (const r of records) eqCurve.set(`${r.engine}|${r.bands}|${r.curve}`, response(r.filters));

const quantile = (xs, q) => {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const median = (xs) => quantile(xs, 0.5);
const ms = (x) =>
	x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${x < 10 ? x.toFixed(1) : x.toFixed(0)} ms`;
const db = (x) => x.toFixed(2);

const bandCounts = [...new Set(records.map((r) => r.bands))].sort((a, b) => a - b);
const seen = [...new Set(records.map((r) => r.engine))];
const engines = [
	...ORDER.filter((e) => seen.includes(e)),
	...seen.filter((e) => !ORDER.includes(e))
];
const refs = ['upstream', 'upstream-converged'].filter((e) => engines.includes(e));

console.log(`${curves.length} measurements\n`);
for (const bands of bandCounts) {
	console.log(`### ${bands} bands\n`);
	console.log(
		'| Engine | p50 | p90 | max | Exact count | Error 20k p50 | p90 | Error 10k p50 | ' +
			refs.map((r) => `Dev. ${r} p50 | p90`).join(' | ') +
			' | Boost p50 |'
	);
	console.log('|' + ' --- |'.repeat(9 + refs.length * 2));
	for (const engine of engines) {
		const rows = records.filter((r) => r.engine === engine && r.bands === bands);
		if (rows.length === 0) continue;
		const err20 = [];
		const err10 = [];
		const boost = [];
		const dev = Object.fromEntries(refs.map((r) => [r, []]));
		for (const r of rows) {
			const e = eqCurve.get(`${engine}|${bands}|${r.curve}`);
			const s = source.get(r.curve);
			const residual = grid.map((_, i) => s[i] + e[i] - target[i]);
			err20.push(rmsLevelFree(residual));
			err10.push(rmsLevelFree(residual, below10k));
			boost.push(Math.max(0, ...e));
			for (const ref of refs) {
				const u = eqCurve.get(`${ref}|${bands}|${r.curve}`);
				if (u) dev[ref].push(rmsLevelFree(e.map((x, i) => x - u[i])));
			}
		}
		const times = rows.map((r) => r.ms);
		const exact = rows.filter((r) => r.filters.length === bands).length / rows.length;
		const devCells = refs.map((ref) =>
			engine === ref ? '— | —' : `${db(median(dev[ref]))} | ${db(quantile(dev[ref], 0.9))}`
		);
		console.log(
			`| ${engine} | ${ms(median(times))} | ${ms(quantile(times, 0.9))} | ${ms(Math.max(...times))} | ` +
				`${(exact * 100).toFixed(0)}% | ${db(median(err20))} | ${db(quantile(err20, 0.9))} | ` +
				`${db(median(err10))} | ${devCells.join(' | ')} | ${db(median(boost))} |`
		);
	}
	console.log();
}

// Without the measurement, as a floor: what doing nothing scores.
const none = curves.map((c) => source.get(c.name));
const flat20 = none.map((s) => rmsLevelFree(s.map((x, i) => x - target[i])));
const flat10 = none.map((s) =>
	rmsLevelFree(
		s.map((x, i) => x - target[i]),
		below10k
	)
);
console.log(`No EQ: error 20k p50 ${db(median(flat20))}, 10k p50 ${db(median(flat10))}`);
