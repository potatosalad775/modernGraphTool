/**
 * Shared pieces of the startup benchmark: where its working files live, the local
 * HTTP/2 server, and the in-page probe that stamps the metric.
 *
 * Nothing here is part of the app or its build. See the Performance section of the root
 * AGENTS.md for how to run a comparison and how to read it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));
/** Fork clones, assembled sites and the certificate. Override with MGT_BENCH_DIR. */
export const WORK = process.env.MGT_BENCH_DIR ?? join(tmpdir(), 'mgt-bench-startup');
export const SITES = join(WORK, 'sites');

/** One device and one target, or five devices and one target through a share link. */
export const SCENARIOS = {
	default: { query: '', curves: 3 },
	share: { query: '?share=FQQ,Q53,KT,B27,BKF,Banbeucmas_Target', curves: 6 }
};

/** 9 Mbps, 40 ms of latency. Paired with a 4x CPU slowdown. */
export const THROTTLE = {
	offline: false,
	latency: 40,
	downloadThroughput: (9 * 1000 * 1000) / 8,
	uploadThroughput: (9 * 1000 * 1000) / 8
};

/** Every host but localhost fails at DNS, so no site is helped or hurt by a live CDN. */
export const BROWSER_ARGS = ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'];

export const CONTEXT = {
	ignoreHTTPSErrors: true,
	// Without this the app follows the machine's language.
	locale: 'en-US',
	viewport: { width: 1366, height: 768 }
};

/** `--name value` from argv, or the fallback. */
export function option(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : process.argv[i + 1];
}

export function flag(name) {
	return process.argv.includes(`--${name}`);
}

export function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Runs in the page before any of its scripts. Sets `window.__probe.at` (and a
 * `curves-drawn` mark) once `curves` paths with a long `d` are in the DOM: a curve's `d`
 * runs to tens of thousands of characters, while grid lines and icons stay far shorter.
 */
export function probe({ curves, minLength }) {
	const count = () => {
		let n = 0;
		for (const path of document.querySelectorAll('path')) {
			if ((path.getAttribute('d') ?? '').length > minLength) n++;
		}
		return n;
	};
	window.__probe = { at: null, count };
	const observer = new MutationObserver((records) => {
		const relevant = records.some(
			(r) =>
				r.type === 'attributes' ||
				[...r.addedNodes].some(
					(node) => node.nodeType === 1 && (node.localName === 'path' || node.querySelector('path'))
				)
		);
		if (!relevant || count() < curves) return;
		window.__probe.at = performance.now();
		performance.mark('curves-drawn');
		observer.disconnect();
	});
	observer.observe(document, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['d']
	});
}

export const PROBE_MIN_LENGTH = 1500;

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
	'.txt': 'text/plain; charset=utf-8',
	'.wasm': 'application/wasm',
	'.webmanifest': 'application/manifest+json'
};
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest']);

/** Chromium only speaks HTTP/2 over TLS, so the server needs a certificate of its own. */
function certificate() {
	const key = join(WORK, 'key.pem');
	const cert = join(WORK, 'cert.pem');
	if (!existsSync(key) || !existsSync(cert)) {
		mkdirSync(WORK, { recursive: true });
		try {
			execFileSync(
				'openssl',
				[
					...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365'],
					...['-keyout', key, '-out', cert, '-subj', '/CN=localhost'],
					...['-addext', 'subjectAltName=DNS:localhost']
				],
				// Git Bash would otherwise rewrite `/CN=localhost` into a Windows path.
				{ stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
			);
		} catch {
			throw new Error(
				`Could not create a certificate with openssl. Put key.pem and cert.pem in ${WORK}.`
			);
		}
	}
	return { key: readFileSync(key), cert: readFileSync(cert) };
}

/**
 * Serves one site over HTTP/2 with gzip. Each file is compressed once and kept in memory,
 * so the server costs every site and every run the same.
 *
 * @param {string} root
 * @param {number} port
 * @param {{ phoneBook?: string }} [options] serve this file for every phone_book.json request
 */
export function serve(root, port, options = {}) {
	const cache = new Map();
	const load = (file) => {
		let hit = cache.get(file);
		if (!hit) {
			const ext = extname(file);
			const raw = readFileSync(file);
			const gzip = TEXT.has(ext);
			hit = {
				body: gzip ? gzipSync(raw, { level: 6 }) : raw,
				gzip,
				type: MIME[ext] ?? 'application/octet-stream'
			};
			cache.set(file, hit);
		}
		return hit;
	};

	const server = createSecureServer(certificate());
	server.on('sessionError', () => {});
	server.on('stream', (stream, headers) => {
		stream.on('error', () => {});
		const urlPath = decodeURIComponent(new URL(headers[':path'], 'https://localhost').pathname);
		let file = join(root, normalize(urlPath));
		if (options.phoneBook && urlPath.endsWith('/phone_book.json')) file = options.phoneBook;
		if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
		if (!existsSync(file)) {
			// The SPA fallback of the shipped .htaccess, for paths that are not files.
			if (extname(urlPath)) {
				stream.respond({ ':status': 404 }, { endStream: true });
				return;
			}
			file = join(root, 'index.html');
		}
		const hit = load(file);
		const head = {
			':status': 200,
			'content-type': hit.type,
			'content-length': hit.body.length,
			'cache-control': 'no-store'
		};
		if (hit.gzip) head['content-encoding'] = 'gzip';
		stream.respond(head);
		stream.end(hit.body);
	});
	return new Promise((resolve) => server.listen(port, 'localhost', () => resolve(server)));
}

/** A fresh context and page with the cache off, throttled or not, and the probe installed. */
export async function openPage(browser, { curves, throttled, returning = false }) {
	const context = await browser.newContext(CONTEXT);
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	if (throttled) {
		await cdp.send('Network.emulateNetworkConditions', THROTTLE);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	}
	if (returning) {
		// The welcome tour only opens on a first visit, and costs startup time when it does.
		await page.addInitScript(() => {
			try {
				localStorage.setItem('gt-tutorial-dismissed', 'true');
			} catch {
				// Storage blocked: measured as a first visit.
			}
		});
	}
	await page.addInitScript(probe, { curves, minLength: PROBE_MIN_LENGTH });
	return { context, page, cdp };
}

/** Resolves with the probe's time in ms once the curves are drawn. */
export async function waitForCurves(page) {
	await page.waitForFunction(() => window.__probe && window.__probe.at !== null, null, {
		timeout: 30000,
		polling: 50
	});
	return page.evaluate(() => window.__probe.at);
}
