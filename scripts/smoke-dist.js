/**
 * Smoke test for the built output.
 *
 * The unit suite mounts components against source. Nothing in it loads what
 * `npm run build` actually emits, so a whole class of breakage is invisible to
 * it: an adapter-static misconfiguration, a `defaults/` file the Vite plugin
 * stopped copying, a base-path or asset-URL regression, a worker that fails to
 * resolve once bundled. Each of those ships a blank page while every test is
 * green.
 *
 * This serves `dist/` over a real HTTP server — including the SPA fallback the
 * shipped `.htaccess` provides — drives it with the Playwright chromium that is
 * already a dev dependency, and fails on a console error, an uncaught exception,
 * a failed request, or a boot that does not reach a drawn graph.
 *
 *   node scripts/smoke-dist.js [--dir dist] [--headed]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const dirArg = args.indexOf('--dir');
const DIST = join(ROOT, dirArg === -1 ? 'dist' : args[dirArg + 1]);
const HEADED = args.includes('--headed');

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8'
};

/**
 * Static file server with the SPA fallback `.htaccess` gives the real
 * deployment: anything that is not a file on disk resolves to index.html.
 */
async function serve(root) {
	const server = createServer(async (req, res) => {
		const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
		// `normalize` collapses any `..` before the join, so a traversal request
		// cannot reach outside the served directory.
		let filePath = join(root, normalize(urlPath));

		try {
			const info = await stat(filePath);
			if (info.isDirectory()) filePath = join(filePath, 'index.html');
		} catch {
			filePath = join(root, 'index.html');
		}

		try {
			const body = await readFile(filePath);
			res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
			res.end(body);
		} catch {
			res.writeHead(404).end('not found');
		}
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const failures = [];
const checks = [];

function check(name, ok, detail = '') {
	checks.push({ name, ok });
	if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
}

async function main() {
	try {
		await stat(join(DIST, 'index.html'));
	} catch {
		console.error(`No build found at ${DIST}. Run \`npm run build\` first.`);
		process.exit(1);
	}

	const { server, origin } = await serve(DIST);
	const browser = await chromium.launch({ headless: !HEADED });
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

	const consoleErrors = [];
	const pageErrors = [];
	const failedRequests = [];

	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', (err) => pageErrors.push(err.message));
	page.on('requestfailed', (req) => {
		failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
	});
	page.on('response', (res) => {
		if (res.status() >= 400) failedRequests.push(`${res.url()} → ${res.status()}`);
	});

	try {
		// ── Cold boot ────────────────────────────────────────────────────────
		await page.goto(origin, { waitUntil: 'networkidle' });

		const svg = page.getByRole('img', { name: 'Frequency response graph' });
		const mounted = await svg
			.waitFor({ state: 'attached', timeout: 20_000 })
			.then(() => true)
			.catch(() => false);
		check('boot renders the graph svg', mounted);

		// The grid group only exists once GraphEngine has run its first draw, which
		// separates "the SPA mounted" from "the graph engine actually drew".
		const drew = await page
			.locator('.y-grid-group, .fr-graph-curve-container')
			.first()
			.waitFor({ state: 'attached', timeout: 20_000 })
			.then(() => true)
			.catch(() => false);
		check('graph engine draws its grid', drew);

		// The operator-editable files live outside the bundle and are copied by the
		// Vite plugin; a missing one boots to a tool with no data or no theme.
		//
		// A 200 is not enough on its own: the SPA fallback answers anything that is
		// not on disk with index.html, so a deleted config.js still returns 200 —
		// and does on a real Apache host too. Reject a body that is the HTML shell.
		for (const asset of ['config.js', 'theme.css', 'data/phone_book.json']) {
			const res = await page.evaluate(
				(url) =>
					fetch(url).then(async (r) => ({
						status: r.status,
						body: (await r.text()).slice(0, 200)
					})),
				`${origin}/${asset}`
			);
			const isFallback = res.body.trimStart().toLowerCase().startsWith('<!doctype html');
			check(
				`serves ${asset}`,
				res.status === 200 && !isFallback,
				isFallback
					? 'got the SPA fallback — file is missing from the build'
					: `status ${res.status}`
			);
		}

		const configured = await page.evaluate(() => typeof window.GRAPHTOOL_CONFIG === 'object');
		check('config.js populates window.GRAPHTOOL_CONFIG', configured);

		// ── Share link ───────────────────────────────────────────────────────
		// A `?share=` boot is the path every link posted to a forum takes, and it
		// runs a different branch of URLProvider than the cold boot above.
		const shareName = await page.evaluate(async (url) => {
			const book = await fetch(url).then((r) => r.json());
			for (const brand of book) {
				for (const phone of brand.phones ?? []) {
					const name = Array.isArray(phone.name) ? phone.name[0] : phone.name;
					if (name && !phone.samples) return `${brand.name} ${name}`;
				}
			}
			return null;
		}, `${origin}/data/phone_book.json`);
		check('phone book has an entry to share', Boolean(shareName));

		if (shareName) {
			await page.goto(`${origin}/?share=${encodeURIComponent(shareName)}`, {
				waitUntil: 'networkidle'
			});
			const curve = page.locator('.fr-graph-phone-curve').first();
			const drawn = await curve
				.waitFor({ state: 'attached', timeout: 20_000 })
				.then(() => true)
				.catch(() => false);
			check(`share link for "${shareName}" draws a curve`, drawn);
		}

		// ── SPA fallback ─────────────────────────────────────────────────────
		const fallback = await page.goto(`${origin}/some/deep/route`, {
			waitUntil: 'domcontentloaded'
		});
		check('unknown routes fall back to the app', fallback?.status() === 200);

		check('no uncaught exceptions', pageErrors.length === 0, pageErrors.join(' | '));
		check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
		check('no failed requests', failedRequests.length === 0, failedRequests.join(' | '));
	} finally {
		await browser.close();
		server.close();
	}

	for (const { name, ok } of checks) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);

	if (failures.length) {
		console.error(`\n${failures.length} smoke check(s) failed:`);
		for (const f of failures) console.error(`  - ${f}`);
		process.exit(1);
	}
	console.log(`\nAll ${checks.length} smoke checks passed against ${DIST}.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
