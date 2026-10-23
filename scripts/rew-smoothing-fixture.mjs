// Regenerates src/lib/utils/__fixtures__/rew-smoothing.json, the REW output fr-smoother.spec.ts
// holds FRSmoother to.
//
//     node scripts/rew-smoothing-fixture.mjs [FILE ...]
//
// Needs REW with its API running on localhost:4735 — REW 5.40 beta or later (the API is not in
// the 5.31 release), started with `-api` or with the API enabled in its preferences. Each FILE
// (default: a few of defaults/data/phones) goes through the shipped FRParser, and that 1/48oct
// grid is imported into REW as-is, so REW smooths exactly what the app does. The fixture keeps
// the grid as REW received it (float32) next to REW's result at every smoothing the app offers.
// Measurements the script imports are deleted again; nothing else in REW is touched.

import { register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

register(new URL('./bench-autoeq/ts-hooks.mjs', import.meta.url));
// fr-parser reaches config.ts, which reads SvelteKit's `$app/env`; outside Kit there is none
const appEnv = 'data:text/javascript,export const browser = false;';
register(
	'data:text/javascript,' +
		encodeURIComponent(
			`export const resolve = (s, c, next) =>
				s === '$app/env' ? { url: '${appEnv}', shortCircuit: true } : next(s, c);`
		)
);
const { default: FRParser } = await import('#lib/utils/fr-parser.js');
const { default: FRSmoother } = await import('#lib/utils/fr-smoother.js');

const API = 'http://127.0.0.1:4735';
const OUT = new URL('../src/lib/utils/__fixtures__/rew-smoothing.json', import.meta.url);
const PHONES = new URL('../defaults/data/phones/', import.meta.url);
// A deep, narrow treble notch, a headphone's large swings, and an ordinary IEM
const DEFAULTS = ['B27 L.txt', 'HpTF Demo Up L.txt', 'CE L.txt'].map((f) => new URL(f, PHONES));

const files = process.argv.length > 2 ? process.argv.slice(2) : DEFAULTS;
// REW never smooths narrower than two of the data's points, so on this 48ppo grid its 1/48 comes
// back identical to its 1/24. The app doesn't copy that floor — unclamped 1/48 tracks REW's
// 1/48 on denser source data more closely — so 1/48 has no fixture.
const SMOOTHINGS = Object.entries(FRSmoother.OCTAVE_BANDS)
	.filter(([, fraction]) => fraction >= 2 / 48)
	.map(([smoothing]) => smoothing);
const round = (v) => Math.round(v * 1e4) / 1e4;

async function api(method, path, body) {
	const response = await fetch(API + path, {
		method,
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
}

// REW's arrays are base64 of big-endian float32
function encode(values) {
	const buffer = Buffer.alloc(values.length * 4);
	values.forEach((v, i) => buffer.writeFloatBE(v, i * 4));
	return buffer.toString('base64');
}
function decode(base64) {
	const buffer = Buffer.from(base64, 'base64');
	return Array.from({ length: buffer.length / 4 }, (_, i) => buffer.readFloatBE(i * 4));
}

const { message: version } = await api('GET', '/version');
const fixture = { rew: version, generatedBy: 'scripts/rew-smoothing-fixture.mjs', curves: [] };

for (const file of files) {
	const name = basename(file instanceof URL ? fileURLToPath(file) : file);
	const parsed = await FRParser.parseFRData(readFileSync(file, 'utf8'));
	const input = parsed.data.map(([, db]) => Math.fround(db));
	const identifier = `mGT fixture ${name}`;

	// The import is asynchronous (202): poll until the measurement shows up
	await api('POST', '/import/frequency-response-data', {
		identifier,
		isImpedance: false,
		startFreq: FRParser._standardFrequencies[0],
		ppo: 48,
		magnitude: encode(input)
	});
	let uuid;
	for (let attempt = 0; attempt < 80 && !uuid; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
		const measurements = await api('GET', '/measurements');
		uuid = Object.values(measurements).find((m) => m.title === identifier)?.uuid;
	}
	if (!uuid) throw new Error(`REW never listed the import of ${name}`);

	const smoothed = {};
	try {
		for (const smoothing of SMOOTHINGS) {
			const response = await api(
				'GET',
				`/measurements/${uuid}/frequency-response?smoothing=${encodeURIComponent(smoothing)}`
			);
			const magnitude = decode(response.magnitude);
			if (response.ppo !== 48 || magnitude.length !== input.length) {
				throw new Error(
					`${name} ${smoothing}: REW answered ${magnitude.length} points at ppo ${response.ppo}`
				);
			}
			smoothed[smoothing] = magnitude.map(round);
		}
	} finally {
		await api('DELETE', `/measurements/${uuid}`);
	}
	fixture.curves.push({ name, input: input.map(round), smoothed });
	console.log(`${name}: ${input.length} points`);
}

// Formatted as Prettier leaves it, so a regenerated fixture passes `npm run lint` as written
const prettier = await import('prettier');
const json = JSON.stringify(fixture);
const options = await prettier.resolveConfig(fileURLToPath(OUT));
writeFileSync(OUT, await prettier.format(json, { ...options, filepath: fileURLToPath(OUT) }));
console.log(`wrote ${fileURLToPath(OUT)} (${fixture.rew})`);
