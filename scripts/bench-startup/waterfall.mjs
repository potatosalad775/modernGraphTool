/**
 * The requests of one throttled startup per site: when each was sent, answered and done.
 *
 *   node scripts/bench-startup/waterfall.mjs --sites before,after
 *       [--scenario default|share] [--returning]
 *
 * Prints the fastest of three runs. Columns: request sent, headers received, body done
 * (ms after navigation), transferred bytes, what started it, and the URL's tail. Look for
 * a request that starts only after a large one has finished: that is a round trip the
 * page could have avoided with a preload.
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
const scenario = SCENARIOS[option('scenario', 'default')];
const returning = flag('returning');

async function record(browser, url) {
	const { context, page, cdp } = await openPage(browser, {
		curves: scenario.curves,
		throttled: true,
		returning
	});
	await cdp.send('Network.enable');
	const requests = new Map();
	let origin;
	cdp.on('Network.requestWillBeSent', (e) => {
		origin ??= e.timestamp;
		requests.set(e.requestId, {
			url: e.request.url,
			start: e.timestamp,
			initiator: e.initiator.type
		});
	});
	cdp.on('Network.responseReceived', (e) => {
		const request = requests.get(e.requestId);
		if (request) request.headers = e.timestamp;
	});
	cdp.on('Network.loadingFinished', (e) => {
		const request = requests.get(e.requestId);
		if (request) Object.assign(request, { end: e.timestamp, bytes: e.encodedDataLength });
	});
	cdp.on('Network.loadingFailed', (e) => {
		const request = requests.get(e.requestId);
		if (request) request.failed = true;
	});
	await page.goto(url, { waitUntil: 'commit' });
	const at = await waitForCurves(page);
	// Requests that start right after the curves belong in the picture too.
	await page.waitForTimeout(600);
	await context.close();
	return { at, origin, requests: [...requests.values()] };
}

const browser = await chromium.launch({ args: BROWSER_ARGS });
let port = 8800;
for (const site of sites) {
	const server = await serve(join(SITES, site), port);
	const url = `https://localhost:${port}/${scenario.query}`;
	await record(browser, url);
	const runs = [];
	for (let i = 0; i < 3; i++) runs.push(await record(browser, url));
	const best = runs.sort((a, b) => a.at - b.at)[0];

	const ms = (time) =>
		time === undefined ? '   -' : String(Math.round((time - best.origin) * 1000)).padStart(4);
	console.log(`\n== ${site}: curves at ${best.at.toFixed(0)} ms`);
	for (const request of best.requests.sort((a, b) => a.start - b.start)) {
		if (request.failed) continue;
		const tail = request.url.replace(/^https:\/\/localhost:\d+\//, '').slice(-56);
		console.log(
			`  ${ms(request.start)} ${ms(request.headers)} ${ms(request.end)} ` +
				`${String(request.bytes ?? 0).padStart(7)}  ${request.initiator.padEnd(7)} ${tail}`
		);
	}
	server.close();
	port++;
}
await browser.close();
