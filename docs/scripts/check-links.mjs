/**
 * Post-build link check over `dist/`.
 *
 * Two failure modes, both silent without this:
 *
 * 1. **A relative internal href.** It renders fine and looks right in the
 *    source, but the browser resolves it against the current URL — so it lands
 *    somewhere different depending on whether the page was served with a
 *    trailing slash. `href="intro/"` on the landing page reached
 *    `/modernGraphTool/intro/` instead of `/modernGraphTool/docs/intro/`.
 *    `remark-docs-links` and `src/routeData.ts` exist to rewrite these; this
 *    check is what proves they actually reached every one.
 *
 * 2. **A base-absolute href with no page behind it.** Sidebar `link:` entries
 *    and hand-written hrefs are not validated by Astro the way content-collection
 *    slugs are, so a typo only shows up as a 404 in production.
 *
 * Anchors are not resolved — only the page part of each URL.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const BASE = '/modernGraphTool/docs';

async function* htmlFiles(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* htmlFiles(full);
		else if (entry.name.endsWith('.html')) yield full;
	}
}

/** Does a built page exist for this site-absolute path? */
function resolves(pathname) {
	const p = pathname.slice(BASE.length) || '/';
	const candidates = [
		join(DIST, p.replace(/\/$/, ''), 'index.html'),
		join(DIST, p),
		join(DIST, p, 'index.html')
	];
	return candidates.some((c) => existsSync(c));
}

const relativeLinks = new Map(); // href -> Set(page)
const deadLinks = new Map();

for await (const file of htmlFiles(DIST)) {
	const page = '/' + relative(DIST, file).replace(/\\/g, '/');
	const html = await readFile(file, 'utf8');
	for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
		if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue;
		if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;

		if (!href.startsWith('/')) {
			if (!relativeLinks.has(href)) relativeLinks.set(href, new Set());
			relativeLinks.get(href).add(page);
			continue;
		}
		if (!href.startsWith(BASE)) {
			if (!relativeLinks.has(href)) relativeLinks.set(href, new Set());
			relativeLinks.get(href).add(page);
			continue;
		}

		const pathname = href.split('#')[0].split('?')[0];
		// Hashed asset paths and files with an extension are served directly.
		if (extname(pathname) && !resolves(pathname)) {
			if (!deadLinks.has(href)) deadLinks.set(href, new Set());
			deadLinks.get(href).add(page);
		} else if (!extname(pathname) && !resolves(pathname)) {
			if (!deadLinks.has(href)) deadLinks.set(href, new Set());
			deadLinks.get(href).add(page);
		}
	}
}

const report = (title, map, hint) => {
	if (!map.size) return 0;
	console.error(`\n${title}`);
	for (const [href, pages] of map) {
		const shown = [...pages].slice(0, 3).join(', ');
		const more = pages.size > 3 ? ` (+${pages.size - 3} more)` : '';
		console.error(`  ${href}\n      on ${shown}${more}`);
	}
	console.error(`  ${hint}`);
	return map.size;
};

const bad =
	report(
		`Internal links that are not absolute under ${BASE} —`,
		relativeLinks,
		'These resolve against the current URL, so they break when the page is served without a trailing slash.'
	) +
	report(
		'Links with no built page behind them —',
		deadLinks,
		'Check the slug or the sidebar entry.'
	);

if (bad) {
	console.error(`\ncheck-links: ${bad} problem(s)\n`);
	process.exit(1);
}
console.log('check-links: all internal links are base-absolute and resolve.');
