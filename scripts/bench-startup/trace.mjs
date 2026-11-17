/**
 * Where the main thread spends a throttled startup, for one or more benchmark sites.
 *
 *   node scripts/bench-startup/trace.mjs --sites before,after
 *       [--scenario default|share] [--runs 3] [--returning] [--layouts]
 *
 * Prints main-thread self time by trace event between navigation and the last curve, and
 * with `--layouts` every style recalculation or layout over 4 ms with the script position
 * that forced it. Tracing slows the page down, so read the breakdown, not the totals.
 * To turn a `file:line:column` into a source position, build with `--sourcemap` and run
 * bundle-report.mjs with `--resolve`.
 */
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
const runs = Number(option('runs', '3'));
const scenario = SCENARIOS[option('scenario', 'default')];
const returning = flag('returning');
const ms = (us) => (us / 1000).toFixed(0);

async function trace(browser, url) {
	const { context, page, cdp } = await openPage(browser, {
		curves: scenario.curves,
		throttled: true,
		returning
	});
	const events = [];
	cdp.on('Tracing.dataCollected', (data) => events.push(...data.value));
	await cdp.send('Tracing.start', {
		transferMode: 'ReportEvents',
		traceConfig: {
			includedCategories: [
				'devtools.timeline',
				'v8',
				'blink.user_timing',
				'disabled-by-default-devtools.timeline.stack'
			]
		}
	});
	await page.goto(url, { waitUntil: 'commit' });
	const at = await waitForCurves(page);
	const ended = new Promise((done) => cdp.once('Tracing.tracingComplete', done));
	await cdp.send('Tracing.end');
	await ended;
	await context.close();

	// The thread that fired the probe's mark is the page's main thread.
	const mark = events.find((e) => e.name === 'curves-drawn');
	const start = mark.ts - at * 1000;
	const main = events
		.filter((e) => e.pid === mark.pid && e.tid === mark.tid && e.ph === 'X')
		.filter((e) => e.ts >= start && e.ts <= mark.ts)
		.sort((a, b) => a.ts - b.ts || b.dur - a.dur);

	// Self time: an event's duration minus the events nested inside it.
	const self = new Map();
	const stack = [];
	let busy = 0;
	for (const e of main) {
		const end = Math.min(e.ts + (e.dur ?? 0), mark.ts);
		while (stack.length && stack.at(-1).end <= e.ts) stack.pop();
		const duration = end - e.ts;
		if (stack.length) self.set(stack.at(-1).name, (self.get(stack.at(-1).name) ?? 0) - duration);
		else busy += duration;
		self.set(e.name, (self.get(e.name) ?? 0) + duration);
		stack.push({ name: e.name, end });
	}

	const layouts = main
		.filter((e) => (e.name === 'Layout' || e.name === 'UpdateLayoutTree') && e.dur > 4000)
		.map((e) => {
			const frames = e.args?.beginData?.stackTrace ?? [];
			const where = frames
				.slice(0, 3)
				.map((f) => `${String(f.url).split('/').pop()}:${f.lineNumber}:${f.columnNumber}`)
				.join(' < ');
			return `  ${e.name} at ${ms(e.ts - start)} ms, ${ms(e.dur)} ms  ${where || '(not forced by script)'}`;
		});
	return { at, busy, self, layouts };
}

const browser = await chromium.launch({ args: BROWSER_ARGS });
let port = 8600;
for (const site of sites) {
	const server = await serve(join(SITES, site), port);
	const url = `https://localhost:${port}/${scenario.query}`;
	await trace(browser, url);
	const results = [];
	for (let i = 0; i < runs; i++) results.push(await trace(browser, url));
	results.sort((a, b) => a.at - b.at);
	const r = results[results.length >> 1];

	console.log(`\n== ${site}: curves at ${r.at.toFixed(0)} ms, main thread busy ${ms(r.busy)} ms`);
	const rows = [...r.self].filter(([, us]) => us > 4000).sort((a, b) => b[1] - a[1]);
	for (const [name, us] of rows.slice(0, 12)) console.log(`  ${ms(us).padStart(5)} ms  ${name}`);
	if (flag('layouts')) console.log(r.layouts.join('\n'));
	server.close();
	port++;
}
await browser.close();
