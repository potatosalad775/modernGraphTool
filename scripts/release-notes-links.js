/**
 * Rewrites the docs links in a changelog section so they work in a GitHub release.
 *
 * The changelog is authored for the docs site, where `remark-docs-links` resolves
 * `[x](./features/foo.mdx#bar)` at build time. Pasted into a release body verbatim, the same
 * link resolves against github.com and 404s. This applies that plugin's `resolveUrl` and
 * prefixes the site origin, so both surfaces follow one set of rules.
 *
 * Usage: node scripts/release-notes-links.js < section.md > section.resolved.md
 */

import { readFileSync } from 'fs';
import { SITE, BASE } from '../docs/site.mjs';
import { resolveUrl } from '../docs/src/plugins/resolve-docs-url.mjs';

// The changelog sits at the content root, so its links resolve from there.
const SELF_DIR = '.';

const input = readFileSync(0, 'utf8');

// `](url)` and `](url "title")`. The changelog has no nested parentheses in its link targets.
const output = input.replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (match, url, title) => {
	const next = resolveUrl(url, SELF_DIR, BASE, false);
	return next === undefined ? match : `](${SITE}${next}${title})`;
});

process.stdout.write(output);
