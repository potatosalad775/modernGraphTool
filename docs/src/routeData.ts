import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
// @ts-expect-error - plain .mjs plugin, no type declarations
import { resolveUrl } from './plugins/remark-docs-links.mjs';

const CONTENT_ROOT = 'src/content/docs/';

/**
 * Base-resolves the landing pages' hero action links.
 *
 * `remark-docs-links` handles every other authored link, but it cannot reach
 * this one: `hero.actions[].link` is frontmatter, which the content layer
 * validates and stores before remark runs, and Starlight reads it back off
 * `entry.data` rather than from the rendered file.
 *
 * Left alone, `link: intro/` reaches the browser verbatim and resolves against
 * the current URL — so it lands on `<base>/intro/` when the page is served as
 * `/docs/` and on `/modernGraphTool/intro/` when served as `/docs`. It is the
 * primary call to action on the landing page, so it is worth a hook rather than
 * a hardcoded base in two content files.
 */
export const onRequest = defineRouteMiddleware((context) => {
	const entry = context.locals.starlightRoute?.entry;
	const actions = entry?.data?.hero?.actions;
	if (!actions?.length) return;

	/*
	 * Derived from `filePath`, not `id`: `content.config.ts` collapses a trailing
	 * `/index`, so `ko/index.mdx` has the id `ko` and the root landing page has
	 * the id `""` — neither of which a dirname can be taken from. `filePath` is
	 * the same string remark sees, so both resolve relative links identically.
	 */
	const filePath: string = entry.filePath ?? '';
	const idx = filePath.indexOf(CONTENT_ROOT);
	if (idx === -1) return;
	const rel = filePath.slice(idx + CONTENT_ROOT.length);
	const selfDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';

	const base = import.meta.env.BASE_URL.replace(/\/$/, '');

	for (const action of actions) {
		const next = resolveUrl(action.link, selfDir, base, true);
		if (next !== undefined) action.link = next;
	}
});
