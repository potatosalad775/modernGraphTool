#!/usr/bin/env node
/**
 * Drives modernGraphTool the way a visitor does, and keeps the evidence.
 *
 *   node .claude/skills/verify-mgt/mgt.mjs doctor
 *   node .claude/skills/verify-mgt/mgt.mjs run <journey.mjs> [more.mjs ...]
 *
 * Options: --url <origin>   drive a server that is already running (never started or stopped here)
 *          --out <dir>      where the evidence goes (default: a new folder in the OS temp dir)
 *          --mobile         414x896 viewport (the mobile layout starts below 1000px)
 *          --headed         show the browser
 *
 * Without --url it starts its own Vite dev server on a free port and stops that one process
 * when it is done. See SKILL.md for the journey API.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const READY_TIMEOUT_MS = 90_000;

const args = process.argv.slice(2);
const command = args.shift();

function takeOption(name) {
	const at = args.indexOf(`--${name}`);
	if (at === -1) return undefined;
	const [, value] = args.splice(at, 2);
	return value;
}

function takeFlag(name) {
	const at = args.indexOf(`--${name}`);
	if (at === -1) return false;
	args.splice(at, 1);
	return true;
}

const givenUrl = takeOption('url');
const givenOut = takeOption('out');
const mobile = takeFlag('mobile');
const headed = takeFlag('headed');

function freePort() {
	return new Promise((done, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close(() => done(port));
		});
	});
}

async function answers(origin) {
	try {
		const res = await fetch(origin, { signal: AbortSignal.timeout(2000) });
		return res.ok;
	} catch {
		return false;
	}
}

/** Starts `vite dev` as one child process and resolves once it serves the shell. */
async function startServer() {
	const port = await freePort();
	const origin = `http://127.0.0.1:${port}`;
	const child = spawn(
		process.execPath,
		[
			join(ROOT, 'node_modules/vite/bin/vite.js'),
			'dev',
			'--port',
			String(port),
			'--strictPort',
			'--host',
			'127.0.0.1'
		],
		{ cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	let log = '';
	child.stdout.on('data', (chunk) => (log += chunk));
	child.stderr.on('data', (chunk) => (log += chunk));
	let exited = false;
	child.once('exit', () => (exited = true));

	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (!(await answers(origin))) {
		if (exited || Date.now() > deadline) {
			child.kill();
			throw new Error(`The dev server did not come up on ${origin}.\n${log.slice(-2000)}`);
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	return { origin, stop: () => child.kill(), pid: child.pid };
}

/** The page plus what it logged; anything in these lists fails a run. */
async function openPage(browser) {
	const page = await browser.newPage({
		viewport: mobile ? { width: 414, height: 896 } : { width: 1280, height: 800 },
		// The journeys find elements by their English names; Paraglide otherwise follows the OS.
		locale: 'en-US'
	});
	const problems = { console: [], exceptions: [], requests: [] };
	page.on('console', (msg) => {
		if (msg.type() === 'error') problems.console.push(msg.text());
	});
	page.on('pageerror', (err) => problems.exceptions.push(err.message));
	page.on('response', (res) => {
		if (res.status() >= 400) problems.requests.push(`${res.status()} ${res.url()}`);
	});
	return { page, problems };
}

/** What a journey receives. */
function toolkit(page, origin, outDir, checks) {
	let shots = 0;
	const file = (name, ext) => join(outDir, `${String(++shots).padStart(2, '0')}-${name}.${ext}`);
	return {
		page,
		origin,
		/**
		 * Opens the app and waits until the graph has drawn. A returning visitor by default:
		 * `firstVisit` leaves the welcome and equalizer tours to open as they do on a first visit.
		 */
		async boot(path = '/', { firstVisit = false } = {}) {
			if (!firstVisit) {
				await page.addInitScript(() => {
					localStorage.setItem('gt-tutorial-dismissed', 'true');
					localStorage.setItem('gt-tutorial-eq-dismissed', 'true');
				});
			}
			// Cross-site search reads a public index on another host. Answer it here, so a run
			// neither depends on that host nor fails on its CORS policy for 127.0.0.1. A journey
			// that tests cross-site search adds its own page.route, which takes precedence.
			await page.route('**/aggregate-index.json', (route) =>
				route.fulfill({
					json: { v: 2, phonesFormat: 'flat', brands: [], sites: [], dbs: [], phones: [] }
				})
			);
			await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
			await page
				.getByRole('img', { name: 'Frequency response graph' })
				.waitFor({ state: 'attached', timeout: 60_000 });
			await page
				.locator('.y-grid-group, .fr-graph-curve-container')
				.first()
				.waitFor({ state: 'attached', timeout: 60_000 });
		},
		/** Switches panel through the nav: 'DEVICES', 'GRAPH', 'EQUALIZER' or 'MISC'. */
		async panel(label) {
			await page
				.getByRole('navigation', { name: 'Panels' })
				.getByRole('button', { name: label })
				.click();
			await page.getByRole('heading', { name: label, level: 2 }).waitFor();
		},
		/**
		 * Makes the graph toolbar reachable (Share, Screenshot, Smoothing, ...). Below 1000px
		 * it is the collapsed "Graph Controls" section of the GRAPH panel.
		 */
		async toolbar() {
			const share = page.getByRole('button', { name: 'Share' });
			if (await share.isVisible()) return;
			await page
				.getByRole('navigation', { name: 'Panels' })
				.getByRole('button', { name: 'GRAPH' })
				.click();
			await page.getByRole('button', { name: 'Graph Controls' }).click();
			await share.waitFor();
		},
		/** Records one pass or fail line. A failed check fails the run but lets the journey go on. */
		check(name, ok, detail = '') {
			checks.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
			console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
		},
		/** Screenshot of the page as the user sees it. */
		async shot(name) {
			const path = file(name, 'png');
			await page.screenshot({ path });
			return path;
		},
		/** Accessibility tree of the page or of one region, as text. */
		async aria(name, locator = page.locator('body')) {
			const path = file(name, 'aria.yml');
			await writeFile(path, await locator.ariaSnapshot());
			return path;
		},
		/** Number of device and target curves the graph currently draws. */
		curves() {
			return page.locator('.fr-graph-phone-curve, .fr-graph-target-curve').count();
		}
	};
}

async function runJourney(browser, origin, outRoot, journeyPath) {
	const mod = await import(pathToFileURL(resolve(journeyPath)).href);
	const name = mod.name ?? basename(journeyPath).replace(/\.m?js$/, '');
	const outDir = join(outRoot, name);
	await mkdir(outDir, { recursive: true });
	console.log(`\n${name}`);

	const { page, problems } = await openPage(browser);
	const checks = [];
	const tools = toolkit(page, origin, outDir, checks);
	let crash = null;
	try {
		await mod.default(tools);
	} catch (err) {
		crash = String(err?.stack ?? err);
		await tools.shot('crash').catch(() => undefined);
		console.log(`  FAIL journey threw: ${String(err?.message ?? err).split('\n')[0]}`);
	}
	await page.close();

	const allowed = mod.allow ?? [];
	const unexpected = (list) => list.filter((line) => !allowed.some((ok) => line.includes(ok)));
	const report = {
		name,
		viewport: mobile ? 'mobile' : 'desktop',
		checks,
		crash,
		consoleErrors: unexpected(problems.console),
		exceptions: unexpected(problems.exceptions),
		failedRequests: unexpected(problems.requests)
	};
	for (const key of ['consoleErrors', 'exceptions', 'failedRequests']) {
		for (const line of report[key]) console.log(`  FAIL ${key}: ${line}`);
	}
	report.passed =
		!crash &&
		checks.length > 0 &&
		checks.every((c) => c.ok) &&
		report.consoleErrors.length + report.exceptions.length + report.failedRequests.length === 0;
	await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, '\t'));
	return report;
}

/** A read-only look at one instance: does it answer, boot and draw, and which build is it. */
async function doctor(browser, origin, owned) {
	const { page, problems } = await openPage(browser);
	const tools = toolkit(page, origin, tmpdir(), []);
	const result = { origin, startedByThisRun: owned, answers: await answers(origin) };
	try {
		await tools.boot();
		result.boots = true;
		result.curves = await tools.curves();
		result.configLoaded = await page.evaluate(() => typeof window.GRAPHTOOL_CONFIG === 'object');
		result.title = await page.title();
	} catch (err) {
		result.boots = false;
		result.error = String(err?.message ?? err).split('\n')[0];
	}
	result.consoleErrors = problems.console;
	result.exceptions = problems.exceptions;
	await page.close();
	console.log(JSON.stringify(result, null, '\t'));
	return result.boots && result.configLoaded && result.exceptions.length === 0;
}

async function main() {
	if (command !== 'doctor' && command !== 'run') {
		console.error('Usage: mgt.mjs doctor | run <journey.mjs> ...   (see the file header)');
		return 2;
	}
	if (command === 'run' && args.length === 0) {
		console.error('run needs at least one journey file.');
		return 2;
	}

	const server = givenUrl ? null : await startServer();
	const origin = givenUrl ?? server.origin;
	const browser = await chromium.launch({ headless: !headed });
	try {
		if (command === 'doctor') return (await doctor(browser, origin, Boolean(server))) ? 0 : 1;

		const outRoot = givenOut ? resolve(givenOut) : await mkdtemp(join(tmpdir(), 'mgt-verify-'));
		await mkdir(outRoot, { recursive: true });
		const reports = [];
		for (const journey of args) reports.push(await runJourney(browser, origin, outRoot, journey));
		const failed = reports.filter((r) => !r.passed).map((r) => r.name);
		console.log(`\nEvidence: ${outRoot}`);
		console.log(
			failed.length ? `FAILED: ${failed.join(', ')}` : `All ${reports.length} journeys passed.`
		);
		return failed.length ? 1 : 0;
	} finally {
		await browser.close();
		server?.stop();
	}
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error(err);
		process.exit(1);
	}
);
