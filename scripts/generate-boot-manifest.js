/**
 * Parses a CDN-built index.html and extracts the SvelteKit bootstrap info
 * into a boot.json manifest that the CDN loader can consume.
 *
 * Usage: node scripts/generate-boot-manifest.js <dist-cdn-dir> <version>
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const distDir = process.argv[2];
const version = process.argv[3];

if (!distDir || !version) {
	console.error('Usage: node scripts/generate-boot-manifest.js <dist-cdn-dir> <version>');
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

const bootManifest = {
	version,
	assets_base: assetsBase,
	global_name: globalName,
	start_url: startUrl,
	app_url: appUrl,
	preloads,
	css
};

const outPath = join(distDir, 'boot.json');
writeFileSync(outPath, JSON.stringify(bootManifest, null, 2));
console.log(`Generated ${outPath}`);
console.log(JSON.stringify(bootManifest, null, 2));
