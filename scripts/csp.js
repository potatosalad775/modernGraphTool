/**
 * The recommended Content-Security-Policy, and the build steps that write it out.
 *
 * The policy ships switched off, as a commented line the operator uncomments:
 *   - `.htaccess` (full and CDN release): `# Header set Content-Security-Policy "__CSP__"`
 *   - `cdn/cdn-index.html`, `site-template/index.html`: a commented `<meta http-equiv>` for
 *     hosts that cannot send headers (GitHub Pages)
 * `__CSP__` is replaced at build time, because the policy lists a hash for every inline script
 * of the page it protects, and SvelteKit's boot script changes with each build.
 *
 * CLI: node scripts/csp.js <dist dir>   — index.html's hashes into that folder's .htaccess
 *
 * `scripts/smoke-dist.js` serves `dist/` with these headers switched on, so a policy that
 * blocks something the app needs fails the smoke test. Operator docs:
 * guide-for-admins/deployment/security-headers.mdx — keep its "what to add" table in step with
 * the sources below.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

export const CSP_TOKEN = '__CSP__';

/** jsDelivr serves every GitHub repository; only these two owners' files are let in. */
const CDN_APP = 'https://cdn.jsdelivr.net/gh/potatosalad775/';
const CDN_FONT = 'https://cdn.jsdelivr.net/gh/orioncactus/';

/** `'sha256-…'` for each inline script, in document order. Commented-out markup is ignored. */
export function inlineScriptHashes(html) {
	const hashes = [];
	const live = html.replace(/<!--[\s\S]*?-->/g, '');
	for (const match of live.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		const [, attrs, body] = match;
		if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
		const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
		if (!hashes.includes(hash)) hashes.push(hash);
	}
	return hashes;
}

/**
 * @param {object} options
 * @param {string[]} options.hashes  inline script hashes of the page
 * @param {boolean} [options.cdn]    the page loads the app from jsDelivr (CDN deployment)
 * @param {boolean} [options.meta]   for a `<meta>` tag, where `frame-ancestors` is not allowed
 */
export function buildCsp({ hashes, cdn = false, meta = false }) {
	const directives = [
		"default-src 'self'",
		// 'wasm-unsafe-eval': the AutoEQ engine is WebAssembly. It permits compiling wasm, not eval().
		['script-src', "'self'", "'wasm-unsafe-eval'", ...hashes, ...(cdn ? [CDN_APP] : [])],
		// Components set inline `style` attributes, which no hash can cover.
		['style-src', "'self'", "'unsafe-inline'", CDN_FONT, ...(cdn ? [CDN_APP] : [])],
		['font-src', "'self'", 'data:', CDN_FONT],
		// Operator images, sponsor creatives and shop logos come from anywhere; export uses blob/data.
		['img-src', "'self'", 'data:', 'blob:', 'https:'],
		['media-src', "'self'", 'blob:', 'data:'],
		// The index, eqcaps, squig.link, ranking sheets, remote phone books and the uniPEQ link
		// server are all operator-configurable hosts, so fetch targets are limited by scheme only.
		['connect-src', "'self'", 'https:', 'wss:'],
		// A CDN deployment starts the AutoEQ worker through a blob: shim (cross-origin module). The
		// modules a worker imports are checked against worker-src, not script-src, so the CDN has
		// to be listed here too. Without it the worker fails to load with no violation reported,
		// and AutoEQ quietly returns nothing.
		['worker-src', "'self'", 'blob:', ...(cdn ? [CDN_APP] : [])],
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		...(meta ? [] : ["frame-ancestors 'self'"])
	];
	return directives.map((d) => (Array.isArray(d) ? d.join(' ') : d)).join('; ');
}

function replaceToken(file, csp) {
	if (!existsSync(file)) return false;
	const text = readFileSync(file, 'utf-8');
	if (!text.includes(CSP_TOKEN)) return false;
	writeFileSync(file, text.replaceAll(CSP_TOKEN, csp));
	return true;
}

/** Fills the `.htaccess` in `dir` from the inline scripts of `dir/<page>`. */
export function writeHtaccessCsp(dir, { page = 'index.html', cdn = false } = {}) {
	const hashes = inlineScriptHashes(readFileSync(join(dir, page), 'utf-8'));
	return replaceToken(join(dir, '.htaccess'), buildCsp({ hashes, cdn }));
}

/** Fills the commented `<meta>` of a CDN shell from that shell's own inline scripts. */
export function writeMetaCsp(file) {
	const hashes = inlineScriptHashes(readFileSync(file, 'utf-8'));
	// A double quote would end the attribute; the policy has none, but fail loudly if it grows one.
	const csp = buildCsp({ hashes, cdn: true, meta: true });
	if (csp.includes('"')) throw new Error('The CSP must not contain a double quote');
	return replaceToken(file, csp);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const dir = process.argv[2];
	if (!dir || !existsSync(join(dir, 'index.html'))) {
		console.error('Usage: node scripts/csp.js <dist dir>   (needs <dist dir>/index.html)');
		process.exit(1);
	}
	const done = writeHtaccessCsp(dir);
	console.log(
		done
			? `Wrote the recommended CSP into ${join(dir, '.htaccess')} (commented out)`
			: `No ${CSP_TOKEN} token in ${join(dir, '.htaccess')}; nothing written`
	);
}
