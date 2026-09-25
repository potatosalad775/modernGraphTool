// Runs every in-browser AutoEQ engine over a squig.link-style measurement set, all under the same
// constraints, and records what each returned and how long it took. `upstream.py` adds AutoEq's
// own; `score.mjs` turns the records into the tables in
// docs/src/content/docs/features/autoeq-benchmarks.mdx.
//
//     node scripts/bench-autoeq/run.mjs --data DIR --target FILE --lab LAB_REPO \
//         [--q 0.1,10] [--gain -20,20] [--fc 20,20000] [--bands 5,8,10] \
//         [--engines a,b] [--lab-branch main] [--every N] [--all-files] --out FILE.jsonl
//
// DIR holds `phone_book.json` and `phones/`. One measurement per phone_book entry — its first
// file — unless `--all-files`; a database re-measures the same unit under many names, and
// every one of those would weigh on the medians. `--every N` keeps every Nth of those.
//
// **This compares algorithms, not tools' defaults.** Every engine gets the same per-band Q and
// gain window and the same range to place bands in; the AutoEq-family engines, whose limit on
// boost is for the whole EQ, get the gain window's top as that limit. What can't be made equal
// is structural and stays: CrinGraph has no shelves, the TypeScript optimizer places its own,
// and treble-safe places no band above 10 kHz, because it scores only the level up there. The constraints are written into the
// `.curves.json` beside the output, which is where upstream.py reads them from.
//
// Each engine's curves are prepared the way its own app prepares them:
//
// - `cringraph`: `equalizer.js` from `--lab-branch` of LAB_REPO, read with `git show` so the
//   checkout can stay on anything. Channels interpolated onto lab's 1/48-octave grid,
//   power-averaged, both curves offset to 60 phon with lab's own ISO 226 `find_offset` — what
//   graphtool.js does on its default "dB" normalization.
// - `mgt-typescript`: the shipped `runAutoEq` with the wasm made to fail, so the fallback
//   answers. Channels averaged in dB (fr-parser), then `DataProcessor.processChannels` at
//   1/48 octave and 500 Hz, the app's defaults.
// - `turboeq-exact`, `turboeq-treble-safe`: the shipped `runAutoEq` on those same curves, in
//   the two fit modes, with turboEQ answering: exactly what the panel runs.
//
// Timing covers the engine call only, after one warm-up fit per engine.

import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

register(new URL('./ts-hooks.mjs', import.meta.url));
const { runAutoEq } = await import('$lib/workers/autoeq-engine.js');
const { planBands } = await import('$lib/workers/autoeq-request.js');
const { DataProcessor } = await import('$lib/utils/data-processor.js');

const ENGINES = ['cringraph', 'mgt-typescript', 'turboeq-exact', 'turboeq-treble-safe'];

const args = parseArgs(process.argv.slice(2));
const bands = (args.bands ?? '5,8,10').split(',').map(Number);
const engines = args.engines ? args.engines.split(',') : ENGINES;
for (const e of engines) if (!ENGINES.includes(e)) fail(`unknown engine ${e}`);
if (!args.data || !args.target || !args.out) {
	fail('usage: run.mjs --data DIR --target FILE --lab LAB_REPO --out FILE.jsonl [...]');
}
if (engines.includes('cringraph') && !args.lab) fail('--lab is required');

const range = (value, fallback) => (value ?? fallback).split(',').map(Number);
const [minQ, maxQ] = range(args.q, '0.1,10');
const [minGain, maxGain] = range(args.gain, '-20,20');
const [minFc, maxFc] = range(args.fc, '20,20000');
/** The one constraint set every engine runs under. */
const LIMITS = { minFc, maxFc, minQ, maxQ, minGain, maxGain };

// ─── Curves ──────────────────────────────────────────────────────────────────

function parseCurve(text) {
	const points = [];
	for (const raw of text.split('\n')) {
		const parts = raw.trim().split(/[\s,]+/);
		const f = Number(parts[0]);
		const db = Number(parts[1]);
		if (parts.length >= 2 && Number.isFinite(f) && Number.isFinite(db) && f > 0) {
			points.push([f, db]);
		}
	}
	return points;
}

/** Every channel file of one measurement: `X L.txt` / `X R.txt`, or numbered samples. */
function channelFiles(dir, file) {
	const out = { L: [], R: [] };
	for (const side of ['L', 'R']) {
		for (const n of ['', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
			const path = join(dir, 'phones', `${file} ${side}${n}.txt`);
			if (existsSync(path)) out[side].push(parseCurve(readFileSync(path, 'utf8')));
		}
	}
	return out;
}

/** mGT's reading of a sample set: each side the dB mean of its runs. */
function dbMean(curves) {
	return curves[0].map(([f], i) => [f, curves.reduce((s, c) => s + c[i][1], 0) / curves.length]);
}

function selectMeasurements(dir) {
	const book = JSON.parse(readFileSync(join(dir, 'phone_book.json'), 'utf8'));
	const picked = [];
	for (const brand of book) {
		for (const phone of brand.phones) {
			const files = Array.isArray(phone.file) ? phone.file : [phone.file];
			for (const file of args['all-files'] ? files : files.slice(0, 1)) {
				const ch = channelFiles(dir, file);
				if (ch.L.length === 0 || ch.R.length === 0) continue;
				if (ch.L.some((c) => c.length !== ch.L[0].length)) continue;
				picked.push({ name: file, ...ch });
			}
		}
	}
	const every = Number(args.every ?? 1);
	return picked.filter((_, i) => i % every === 0);
}

// ─── CrinGraph ───────────────────────────────────────────────────────────────

/** lab's `Equalizer` and loudness normalization, as that branch ships them. */
function loadLab(branch) {
	const git = (path) =>
		execFileSync('git', ['-C', args.lab, 'show', `${branch}:${path}`], {
			encoding: 'utf8',
			maxBuffer: 64 << 20
		});
	const graphtool = git('graphtool.js');
	const start = graphtool.indexOf('// Normalization with target loudness');
	const end = graphtool.indexOf('return x;\n}', start);
	if (start < 0 || end < 0) fail(`${branch}: find_offset not found in graphtool.js`);
	// A sloppy-mode function in this realm, not `vm`: every global a contextified sandbox
	// resolves (`Math` in the inner loop, above all) goes through an interceptor, which made
	// lab ~14x slower than it runs in a browser. The two `let`s catch its implicit globals.
	const lab = new Function(
		`let Equalizer, ffi;
		let f_values = (function() {
			let f = [20];
			let step = Math.pow(2, 1/48);
			while (f[f.length-1] < 20000) { f.push(f[f.length-1] * step) }
			return f;
		})();
		${graphtool.slice(start, end + 'return x;\n}'.length)}
		${git('equalizer.js')}
		return { Equalizer, f_values, find_offset };`
	)();
	// What graphtool.js writes here from its AutoEQ inputs before every run.
	lab.Equalizer.config.AutoEQRange = [minFc, maxFc];
	lab.Equalizer.config.OptimizeQRange = [minQ, maxQ];
	lab.Equalizer.config.OptimizeGainRange = [minGain, maxGain];
	return lab;
}

function labAverage(curves) {
	return curves
		.map((c) => c.map((d) => Math.pow(10, d[1] / 20)))
		.reduce((as, bs) => as.map((a, i) => a + bs[i]))
		.map((x, i) => [curves[0][i][0], 20 * Math.log10(x / curves.length)]);
}

function labInputs(lab, m, target) {
	const channels = [...m.L, ...m.R].map((c) => lab.Equalizer.interp(lab.f_values, c));
	const phone = labAverage(channels);
	const phoneNorm = lab.find_offset(phone, 60);
	const tgt = lab.Equalizer.interp(lab.f_values, target);
	const tgtNorm = lab.find_offset(tgt, 60);
	return {
		source: phone.map(([f, v]) => [f, v + phoneNorm]),
		target: tgt.map(([f, v]) => [f, v + tgtNorm])
	};
}

// ─── modernGraphTool ─────────────────────────────────────────────────────────

const PROCESSING = { smoothValue: '1/48', normType: 'Hz', normHz: 500 };

/** `points` read at `freqs`, linear in log frequency, held flat past either end. */
function resample(points, freqs) {
	let i = 0;
	return freqs.map((f) => {
		while (i < points.length - 2 && points[i + 1][0] < f) i++;
		const [f0, v0] = points[i];
		const [f1, v1] = points[i + 1];
		if (f <= f0) return [f, v0];
		if (f >= f1) return [f, v1];
		return [f, v0 + ((v1 - v0) * Math.log(f / f0)) / Math.log(f1 / f0)];
	});
}

function mgtInputs(m, target) {
	const L = dbMean(m.L);
	// fr-parser averages index by index, which assumes both sides share a grid. Four of the
	// set's measurements are a point apart, so R is read at L's frequencies first.
	const R = resample(
		dbMean(m.R),
		L.map(([f]) => f)
	);
	const AVG = L.map(([f, l], i) => [f, (l + R[i][1]) / 2]);
	const process = (data) =>
		DataProcessor.processChannels({ AVG: { data, metadata: {} } }, PROCESSING).AVG.data;
	return { source: process(AVG), target: process(target), rawAvg: AVG };
}

const unavailable = () => Promise.reject(new Error('benchmark: forced fallback'));

// ─── Run ─────────────────────────────────────────────────────────────────────

const lab = engines.includes('cringraph') ? loadLab(args['lab-branch'] ?? 'main') : null;

const target = parseCurve(readFileSync(args.target, 'utf8'));
const measurements = selectMeasurements(args.data);
console.error(
	`${measurements.length} measurements, bands ${bands}, engines ${engines}, ` +
		`limits ${JSON.stringify(LIMITS)}`
);

/** One fit: `{ filters, ms }`, filters as `{ type, fc, q, gain }` with PK/LSQ/HSQ types. */
async function fit(engine, m, total) {
	if (engine === 'cringraph') {
		const { source, target: tgt } = labInputs(lab, m, target);
		const t0 = performance.now();
		const filters = lab.Equalizer.autoeq(source, tgt, total);
		const ms = performance.now() - t0;
		return {
			ms,
			filters: filters.map((f) => ({ type: f.type, fc: f.freq, q: f.q, gain: f.gain }))
		};
	}
	const { source, target: tgt } = mgtInputs(m, target);
	const typescript = engine === 'mgt-typescript';
	const request = {
		kind: 'parametric',
		...planBands(total, true),
		limits: LIMITS,
		fit: engine === 'turboeq-treble-safe' ? 'autoeq' : 'exact'
	};
	const t0 = performance.now();
	const outcome = await runAutoEq(
		source,
		tgt,
		request,
		typescript ? { loadEngine: unavailable } : {}
	);
	const ms = performance.now() - t0;
	const expected = typescript ? 'typescript' : 'turboeq';
	if (outcome.engine !== expected) fail(`${engine} answered as ${outcome.engine}`);
	return {
		ms,
		filters: outcome.filters.map((f) => ({ type: f.type, fc: f.freq, q: f.q, gain: f.gain }))
	};
}

const lines = [];
for (const engine of engines) {
	await fit(engine, measurements[0], bands[0]); // warm-up
	for (const total of bands) {
		const started = performance.now();
		for (const m of measurements) {
			const { ms, filters } = await fit(engine, m, total);
			lines.push(JSON.stringify({ engine, bands: total, curve: m.name, ms, filters }));
		}
		const s = ((performance.now() - started) / 1000).toFixed(1);
		console.error(`${engine} ${total} bands: ${s} s`);
		writeFileSync(args.out, lines.join('\n') + '\n');
	}
}

// What upstream.py and score.mjs read: the constraints, the dB-averaged raw curve and the raw
// target, with no app's processing on either.
writeFileSync(
	args.out.replace(/\.jsonl$/, '') + '.curves.json',
	JSON.stringify({
		limits: LIMITS,
		target,
		curves: measurements.map((m) => ({ name: m.name, raw: mgtInputs(m, target).rawAvg }))
	})
);

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i].replace(/^--/, '');
		if (key === 'all-files') out[key] = true;
		else out[key] = argv[++i];
	}
	return out;
}

function fail(message) {
	console.error(message);
	process.exit(2);
}
