/**
 * Assembles the GitHub Pages site template.
 *
 * The template lives in its own repository (potatosalad775/modernGraphTool_site)
 * so operators can start from it with "Use this template". Most of its content is
 * `defaults/` verbatim, which means it drifts the moment `defaults/` changes —
 * a new config option, a new demo measurement, a theme token. This script is what
 * stops that: it regenerates the whole template from this repo, and
 * `.github/workflows/sync-site-template.yml` pushes the result on every change.
 *
 * What comes from where:
 *
 *   defaults/theme.css            → theme.css      (verbatim)
 *   defaults/data/                → data/          (verbatim)
 *   defaults/assets/              → assets/        (verbatim)
 *   defaults/config.js            → config.js      (CDN_MODE stub spliced out)
 *   site-template/config-cdn-mode.js  ↑ the live CDN_MODE block spliced in
 *   site-template/index.html      → index.html     (verbatim)
 *   site-template/README.md       → README.md      (verbatim)
 *                                 → .nojekyll      (created empty)
 *
 * `index.html` is NOT derived from `cdn/cdn-index.html`. It diverges on purpose —
 * jsDelivr-only loader, plus the GitHub Pages base-path detector — so it's stored
 * as source. Keep the two in sync by hand when the shared parts change; there is
 * little of it and it moves rarely.
 *
 * Deliberately not copied: `.htaccess` (Apache-only), `robots.txt`, `README.txt`.
 *
 * Usage: node scripts/build-site-template.js [--out <dir>]
 * Default output: dist-site-template/
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const outIdx = process.argv.indexOf('--out');
const outDir = join(
	root,
	outIdx !== -1 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : 'dist-site-template'
);

const src = (...p) => join(root, ...p);
const out = (...p) => join(outDir, ...p);

/**
 * Matches the commented-out CDN_MODE stub in defaults/config.js — from its
 * leading comment through the closing `// },`. Anchored on the first and last
 * lines rather than the whole block so rewording the interior comments doesn't
 * break the splice.
 */
const CDN_MODE_STUB = /^\t\/\/ CDN deployment only[\s\S]*?^\t\/\/ \},\n/m;

function buildConfig() {
	const config = readFileSync(src('defaults', 'config.js'), 'utf-8');

	if (!CDN_MODE_STUB.test(config)) {
		throw new Error(
			'Could not find the CDN_MODE stub in defaults/config.js.\n' +
				'The site template needs a live CDN_MODE block spliced in where the stub sits.\n' +
				'Either the stub was reworded past what CDN_MODE_STUB matches, or it was removed.\n' +
				'Fix the regex in scripts/build-site-template.js — do NOT ship a template without\n' +
				'CDN_MODE, since index.html is a loader and the app will not start.'
		);
	}

	// The block file carries a `//`-at-column-0 header explaining itself; the
	// property is tab-indented. Drop the header, keep the property.
	const lines = readFileSync(src('site-template', 'config-cdn-mode.js'), 'utf-8').split('\n');
	const start = lines.findIndex((l) => l.trim() !== '' && !l.startsWith('//'));
	if (start === -1) throw new Error('site-template/config-cdn-mode.js has no CDN_MODE property.');

	return config.replace(CDN_MODE_STUB, lines.slice(start).join('\n'));
}

console.log('\n--- Site template build ---');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

cpSync(src('defaults', 'theme.css'), out('theme.css'));
cpSync(src('defaults', 'data'), out('data'), { recursive: true });
cpSync(src('defaults', 'assets'), out('assets'), { recursive: true });
console.log('Copied theme.css, data/, assets/ from defaults/');

const config = buildConfig();
writeFileSync(out('config.js'), config);
console.log('Built config.js (defaults/config.js + live CDN_MODE)');

cpSync(src('site-template', 'index.html'), out('index.html'));
cpSync(src('site-template', 'README.md'), out('README.md'));
writeFileSync(out('.nojekyll'), '');
console.log('Copied index.html, README.md; wrote .nojekyll');

// A template whose config.js does not parse is a blank page for everyone who
// copies it, so fail here rather than in an operator's browser.
try {
	new Function(config.replace(/^\s*window\.GRAPHTOOL_CONFIG\s*=.*$/m, ''));
} catch (err) {
	throw new Error(`Generated config.js is not valid JavaScript: ${err.message}`, { cause: err });
}
if (!/^\tCDN_MODE: \{/m.test(config)) {
	throw new Error('Generated config.js has no live CDN_MODE block.');
}
console.log('Verified generated config.js parses and carries CDN_MODE');

console.log(`\nOutput: ${outDir}\n`);
