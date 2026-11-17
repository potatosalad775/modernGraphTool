/**
 * Which source files the main thread runs during a throttled startup, from a CPU profile.
 *
 *   npx vite build --sourcemap && node scripts/bench-startup/setup.mjs mgt map
 *   node scripts/bench-startup/profile.mjs --sites map [--runs 5] [--returning] [--top 40]
 *       [--scenario default|share] [--files]
 *
 * Prints self time by package or source directory between navigation and the last curve,
 * summed over the runs and divided by their number. The site has to be built with source
 * maps. Svelte templates carry no mappings, so their time shows up as unmapped.
 * Sampling slows the page down a little: read the shares, not the totals.
 */
import { decode } from '@jridgewell/sourcemap-codec';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
	BROWSER_ARGS,
	SCENARIOS,
	SITES,
	flag,
	openPage,
	option,
	serve,
	waitForCurves
} from './common.mjs';

const sites = option('sites', '').split(',').filter(Boolean);
const runs = Number(option('runs', '5'));
const top = Number(option('top', '40'));
const scenario = SCENARIOS[option('scenario', 'default')];
const returning = flag('returning');

const tidy = (source) =>
	String(source)
		.replace(/\\/g, '/')
		.replace(/^(\.\.\/)+/, '');

const group = (source) => {
	const at = source.lastIndexOf('node_modules/');
	if (at !== -1) {
		const parts = source.slice(at + 13).split('/');
		const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
		const bit = name === 'bits-ui' && source.match(/bits-ui\/dist\/bits\/([^/]+)/);
		return `npm: ${name}${bit ? `/${bit[1]}` : ''}`;
	}
	const lib = source.match(/src\/lib\/([^/]+)(?:\/([^/]+))?/);
	if (!lib) return source;
	return lib[1] === 'components' ? `src/lib/components/${lib[2]}` : `src/lib/${lib[1]}`;
};

function resolver(site) {
	const maps = new Map();
	return (url, line, column) => {
		const path = new URL(url).pathname;
		if (!path.endsWith('.js')) return '(inline script)';
		if (!maps.has(path)) {
			const file = join(SITES, site, `${path}.map`);
			if (!existsSync(file)) maps.set(path, null);
			else {
				const map = JSON.parse(readFileSync(file, 'utf8'));
				maps.set(path, { map, lines: decode(map.mappings) });
			}
		}
		const entry = maps.get(path);
		if (!entry) return `(no map) ${path.split('/').pop()}`;
		const segment = (entry.lines[line] ?? []).findLast((s) => s[0] <= column && s.length >= 4);
		return segment ? tidy(entry.map.sources[segment[1]]) : '(unmapped: Svelte templates and glue)';
	};
}

async function profile(browser, url, resolve) {
	const { context, page, cdp } = await openPage(browser, {
		curves: scenario.curves,
		throttled: true,
		returning
	});
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
	await cdp.send('Profiler.start');
	await page.goto(url, { waitUntil: 'commit' });
	const at = await waitForCurves(page);
	const { profile } = await cdp.send('Profiler.stop');
	await context.close();

	const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
	const bySource = new Map();
	// The profile starts just before navigation; everything after the curves is cut off.
	let clock = profile.startTime;
	const end = profile.startTime + at * 1000 + 50_000;
	profile.samples.forEach((id, i) => {
		clock += profile.timeDeltas[i];
		if (clock > end) return;
		const { callFrame } = nodes.get(id);
		let source;
		if (!callFrame.url) source = `(${callFrame.functionName || 'native'})`;
		else source = resolve(callFrame.url, callFrame.lineNumber, callFrame.columnNumber);
		bySource.set(source, (bySource.get(source) ?? 0) + (profile.timeDeltas[i + 1] ?? 0));
	});
	return { at, bySource };
}

const browser = await chromium.launch({ args: BROWSER_ARGS });
let port = 8700;
for (const site of sites) {
	const server = await serve(join(SITES, site), port);
	const url = `https://localhost:${port}/${scenario.query}`;
	const resolve = resolver(site);
	await profile(browser, url, resolve);
	const total = new Map();
	let at = 0;
	for (let i = 0; i < runs; i++) {
		const run = await profile(browser, url, resolve);
		at += run.at / runs;
		for (const [source, us] of run.bySource)
			total.set(source, (total.get(source) ?? 0) + us / runs);
	}
	const byGroup = new Map();
	for (const [source, us] of total)
		byGroup.set(group(source), (byGroup.get(group(source)) ?? 0) + us);
	const script = [...total].filter(([s]) => !s.startsWith('(idle') && !s.startsWith('(program'));
	const sum = script.reduce((n, [, us]) => n + us, 0);

	console.log(
		`\n== ${site}: curves at ${at.toFixed(0)} ms, sampled script ${(sum / 1000).toFixed(0)} ms`
	);
	const rows = [...(flag('files') ? total : byGroup)].sort((a, b) => b[1] - a[1]);
	for (const [name, us] of rows.slice(0, top)) {
		console.log(`  ${(us / 1000).toFixed(1).padStart(6)} ms  ${name}`);
	}
	server.close();
	port++;
}
await browser.close();
