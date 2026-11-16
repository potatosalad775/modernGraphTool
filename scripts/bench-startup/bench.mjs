/**
 * Startup benchmark: navigation to the last initial curve's long <path> in the DOM.
 *
 *   node scripts/bench-startup/bench.mjs --sites lab,pgt,before,after
 *       [--runs 10] [--scenario default|share] [--mode both|throttled|unthrottled]
 *       [--returning] [--big-book] [--inspect] [--out results.json]
 *
 * Sites come from setup.mjs. They are visited in the order given, run by run, in one
 * session: absolute numbers drift between sessions, so only compare within one run of
 * this script. `--returning` measures a visitor who has dismissed the welcome tour;
 * `--big-book` serves every site a 1500-device phone book; `--inspect` loads each site
 * once and prints its curve paths and request waterfall instead of timing it.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
	BROWSER_ARGS,
	SCENARIOS,
	SITES,
	flag,
	median,
	openPage,
	option,
	serve,
	waitForCurves
} from './common.mjs';

const sites = option('sites', 'lab,pgt').split(',');
const runs = Number(option('runs', '10'));
const scenarioName = option('scenario', 'default');
const scenario = SCENARIOS[scenarioName];
if (!scenario) throw new Error(`Unknown scenario ${scenarioName}`);
const modeArg = option('mode', 'both');
const modes = modeArg === 'both' ? ['throttled', 'unthrottled'] : [modeArg];
const returning = flag('returning');
const phoneBook = flag('big-book') ? join(SITES, '_data/phone_book_big.json') : undefined;
const out = option('out', undefined);

async function measure(browser, url, throttled, inspect = false) {
	const { context, page } = await openPage(browser, {
		curves: scenario.curves,
		throttled,
		returning
	});
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
	try {
		await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
		const at = await waitForCurves(page);
		if (!inspect) return { at };
		await page.waitForTimeout(1500);
		const detail = await page.evaluate(() => ({
			paths: [...document.querySelectorAll('path')]
				.map((p) => (p.getAttribute('d') ?? '').length)
				.filter((n) => n > 300)
				.sort((a, b) => b - a),
			requests: performance
				.getEntriesByType('resource')
				.map(
					(r) =>
						`${Math.round(r.startTime)}-${Math.round(r.responseEnd)} ` +
						r.name.replace(location.origin, '')
				)
		}));
		return { at, detail, errors };
	} catch (e) {
		const seen = await page.evaluate(() => window.__probe?.count()).catch(() => '?');
		const reason = String(e.message).split('\n')[0];
		return { at: null, error: `${reason} (long paths: ${seen}) ${errors.join(' | ')}` };
	} finally {
		await context.close();
	}
}

const servers = [];
const urls = {};
let port = 8443;
for (const site of sites) {
	const root = join(SITES, site);
	if (!existsSync(join(root, 'index.html'))) throw new Error(`No site at ${root}; see setup.mjs`);
	servers.push(await serve(root, port, { phoneBook }));
	urls[site] = `https://localhost:${port}/${scenario.query}`;
	port++;
}

const browser = await chromium.launch({ args: BROWSER_ARGS });
const report = {
	scenario: scenarioName,
	runs,
	returning,
	bigBook: Boolean(phoneBook),
	results: {}
};
try {
	if (flag('inspect')) {
		for (const site of sites) {
			const r = await measure(browser, urls[site], modeArg === 'throttled', true);
			console.log(`\n== ${site}: curves at ${r.at?.toFixed(0)} ms ${r.error ?? ''}`);
			if (!r.detail) continue;
			console.log('long paths:', r.detail.paths.join(' '));
			console.log(r.detail.requests.join('\n'));
			if (r.errors.length) console.log('page errors:', r.errors);
		}
	} else {
		for (const mode of modes) {
			const throttled = mode === 'throttled';
			const times = Object.fromEntries(sites.map((site) => [site, []]));
			// One discarded pass: it fills the server's gzip cache and warms the browser.
			for (const site of sites) await measure(browser, urls[site], throttled);
			for (let run = 0; run < runs; run++) {
				for (const site of sites) {
					const r = await measure(browser, urls[site], throttled);
					if (r.at === null) console.error(`${mode} ${site} run ${run}: ${r.error}`);
					else times[site].push(r.at);
				}
			}
			report.results[mode] = {};
			console.log(
				`\n${scenarioName} / ${mode}${returning ? ' / returning' : ''} (${runs} runs, ms)`
			);
			for (const site of sites) {
				const t = times[site].map(Math.round);
				const row = t.length
					? { median: Math.round(median(t)), min: Math.min(...t), max: Math.max(...t) }
					: { median: null, min: null, max: null };
				report.results[mode][site] = { ...row, all: t };
				console.log(
					`  ${site.padEnd(16)} median ${String(row.median).padStart(5)}` +
						`  min ${row.min}  max ${row.max}  n=${t.length}`
				);
			}
		}
		if (out) writeFileSync(out, JSON.stringify(report, null, '\t'));
	}
} finally {
	await browser.close();
	for (const server of servers) server.close();
}
