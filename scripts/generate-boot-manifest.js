/**
 * Parses a CDN-built index.html and extracts the SvelteKit bootstrap info
 * into a boot.json manifest that the CDN loader can consume.
 *
 * Usage: node scripts/generate-boot-manifest.js <dist-cdn-dir> <version> [--assets-base <url>]
 *
 * --assets-base rewrites every URL from the build's asset base to <url>. The deploy workflow
 * uses it to point boot.json at the commit that holds the assets (`…@<sha>/vX.Y.Z`): jsDelivr
 * keeps commit-pinned files at its edge for a year, branch (`@cdn`) files for only 12 hours.
 * Only boot.json carries the base — chunks import each other relatively, and the one baked
 * copy in the bundle is a fallback the loader always overrides via the SvelteKit global.
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const distDir = process.argv[2];
const version = process.argv[3];
const rebaseIdx = process.argv.indexOf('--assets-base');
const rebaseTo = rebaseIdx !== -1 ? process.argv[rebaseIdx + 1]?.replace(/\/+$/, '') : null;

if (!distDir || !version || (rebaseIdx !== -1 && !rebaseTo)) {
	console.error(
		'Usage: node scripts/generate-boot-manifest.js <dist-cdn-dir> <version> [--assets-base <url>]'
	);
	process.exit(1);
}

const html = readFileSync(join(distDir, 'index.html'), 'utf-8');

// Extract modulepreload URLs from <link rel="modulepreload" href="...">
const preloadRegex = /<link\s+href="([^"]+)"\s+rel="modulepreload">/g;
const preloads = [];
let match;
while ((match = preloadRegex.exec(html)) !== null) {
	preloads.push(match[1]);
}

// Extract CSS links from <link rel="stylesheet" href="/_app/..."> (only _app CSS, not theme.css)
const cssRegex = /<link\s+href="([^"]*\/_app\/[^"]+\.css)"\s+rel="stylesheet"[^>]*>/g;
const css = [];
while ((match = cssRegex.exec(html)) !== null) {
	css.push(match[1]);
}

// Extract the SvelteKit global name: __sveltekit_XXXXXXX = {
const globalRegex = /(__sveltekit_[a-z0-9]+)\s*=\s*\{/;
const globalMatch = html.match(globalRegex);
if (!globalMatch) {
	console.error('Could not find SvelteKit global name (__sveltekit_*) in index.html');
	process.exit(1);
}
const globalName = globalMatch[1];

// Extract the start and app entry imports: import("...start.XXX.js"), import("...app.XXX.js")
const importRegex = /import\("([^"]+)"\)/g;
const imports = [];
while ((match = importRegex.exec(html)) !== null) {
	imports.push(match[1]);
}

const startUrl = imports.find((u) => u.includes('/entry/start.'));
const appUrl = imports.find((u) => u.includes('/entry/app.'));

if (!startUrl || !appUrl) {
	console.error('Could not find start/app entry imports in index.html');
	console.error('Found imports:', imports);
	process.exit(1);
}

// Extract assets base URL from SvelteKit global: assets: "https://cdn.../v2.0.0"
const assetsRegex = /assets:\s*"([^"]+)"/;
const assetsMatch = html.match(assetsRegex);
const assetsBase = assetsMatch ? assetsMatch[1] : '';

// The fallback page knows no route, so index.html preloads only the root layout node. The
// router then imports the page and error nodes once the entry chunks have run — one more
// round trip, and a ~1 s one when jsDelivr's edge has not cached a new release yet. The app
// has a single route, so preload every node.
const nodesDir = join(distDir, '_app', 'immutable', 'nodes');
for (const file of readdirSync(nodesDir).sort()) {
	const url = `${assetsBase}/_app/immutable/nodes/${file}`;
	if (file.endsWith('.js') && !preloads.includes(url)) preloads.push(url);
}

const rebase = (url) =>
	rebaseTo && assetsBase && url.startsWith(assetsBase)
		? rebaseTo + url.slice(assetsBase.length)
		: url;

const bootManifest = {
	version,
	assets_base: rebase(assetsBase),
	global_name: globalName,
	start_url: rebase(startUrl),
	app_url: rebase(appUrl),
	preloads: preloads.map(rebase),
	css: css.map(rebase)
};

const outPath = join(distDir, 'boot.json');
writeFileSync(outPath, JSON.stringify(bootManifest, null, 2));
console.log(`Generated ${outPath}`);
console.log(JSON.stringify(bootManifest, null, 2));
