/**
 * Completes the `<link rel="modulepreload">` list of a built index.html, so the browser
 * can fetch everything the first screen needs in one round trip.
 *
 * SvelteKit's own list has two gaps, and each costs a round trip before anything renders:
 *   - Route nodes. The fallback page knows no route, so only the root layout node is
 *     listed. Since SvelteKit 3 the router asks for the page and error nodes after the
 *     root layout, and with it the whole app chunk, has loaded and run (about 55 ms in
 *     the startup benchmark). The app has a single route, so every node is preloaded.
 *   - Chunks shared with a lazy chunk. Code that both the app chunk and a dynamically
 *     imported one use is split into a chunk of its own, which the app chunk imports
 *     statically but the list leaves out.
 *
 * It reads the built files, not the Vite manifest: the static imports of every listed
 * module are followed until nothing new turns up. `generate-boot-manifest.js` takes its
 * preloads from this page, so the CDN loader gets the same list.
 *
 * CLI: node scripts/preload-boot-chunks.js <dist dir>
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, posix } from 'path';
import { fileURLToPath } from 'url';

const PRELOAD = /<link\s+href="([^"]+)"\s+rel="modulepreload">/g;
/** `import ... from "./x.js"` and `import "./x.js"`, but not `import("./x.js")`. */
const STATIC_IMPORT = /\b(?:from|import)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;
const APP = '_app/immutable/';

/**
 * @param {string} html  the built index.html
 * @param {(path: string) => string | null} read  a file below the build root, by its
 *   path from `_app/` on; null when there is none
 * @param {string[]} nodes  file names in `_app/immutable/nodes`
 * @returns {string} the page with the missing preloads added after the existing ones
 */
export function completePreloads(html, read, nodes) {
	const links = [...html.matchAll(PRELOAD)].filter((link) => link[1].includes(APP));
	if (!links.length) throw new Error('index.html preloads nothing under _app/immutable/');
	// Everything before `_app/`: the base path, or the CDN origin of a CDN build.
	const base = links[0][1].slice(0, links[0][1].indexOf(APP));
	const listed = new Set(links.map((link) => link[1].slice(link[1].indexOf(APP))));

	const queue = [
		...listed,
		...nodes.filter((file) => file.endsWith('.js')).map((file) => `${APP}nodes/${file}`)
	];
	const found = new Set();
	while (queue.length) {
		const path = queue.shift();
		if (found.has(path)) continue;
		const code = read(path);
		if (code === null) continue;
		found.add(path);
		for (const [, specifier] of code.matchAll(STATIC_IMPORT)) {
			queue.push(posix.join(posix.dirname(path), specifier));
		}
	}

	const missing = [...found].filter((path) => !listed.has(path)).sort();
	if (!missing.length) return html;
	const last = links.at(-1);
	const end = last.index + last[0].length;
	const indent = html.slice(0, last.index).match(/[ \t]*$/)[0];
	const added = missing.map(
		(path) => `\n${indent}<link href="${base}${path}" rel="modulepreload">`
	);
	return html.slice(0, end) + added.join('') + html.slice(end);
}

/** Rewrites `dir/index.html` in place. Returns how many preloads were added. */
export function completePreloadsIn(dir) {
	const page = join(dir, 'index.html');
	const html = readFileSync(page, 'utf-8');
	const read = (path) =>
		existsSync(join(dir, path)) ? readFileSync(join(dir, path), 'utf-8') : null;
	const next = completePreloads(html, read, readdirSync(join(dir, APP, 'nodes')));
	if (next !== html) writeFileSync(page, next);
	return [...next.matchAll(PRELOAD)].length - [...html.matchAll(PRELOAD)].length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const dir = process.argv[2];
	if (!dir || !existsSync(join(dir, 'index.html'))) {
		console.error('Usage: node scripts/preload-boot-chunks.js <dist dir>');
		process.exit(1);
	}
	const added = completePreloadsIn(dir);
	console.log(
		added
			? `Added ${added} modulepreload link(s) to ${join(dir, 'index.html')}`
			: 'Every boot chunk is already preloaded'
	);
}
