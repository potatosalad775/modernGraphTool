/**
 * Resolves in-repo documentation links at build time.
 *
 * Astro does not rewrite relative Markdown links inside a content collection,
 * so `[x](./manage-data.mdx)` would ship to the browser verbatim and 404. The
 * migrated content is full of these (they came over from Docusaurus, which did
 * resolve them), and many carry an `#anchor` too.
 *
 * Handling it here rather than baking absolute URLs into the content keeps the
 * `base` in exactly one place — `astro.config.mjs` — and keeps the source links
 * clickable in an editor.
 *
 * Two shapes are rewritten:
 *   `./foo.mdx#bar`  -> `<base>/<dir>/foo/#bar`   (relative, resolved per file)
 *   `/theme-generator` -> `<base>/theme-generator/` (root-absolute, site-internal)
 *
 * Anything external, protocol-relative, a bare `#anchor`, or a non-Markdown
 * asset (images) is left untouched.
 */
import path from 'node:path';
import { visit } from 'unist-util-visit';

const CONTENT_ROOT = path.join('src', 'content', 'docs');
const MARKDOWN = /\.mdx?$/;

/** Split `foo.mdx#bar` into its path and its `#bar` suffix. */
function splitHash(url) {
	const i = url.indexOf('#');
	return i === -1 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}

/** `guide-for-users/index` -> `guide-for-users`; root `index` -> ''. */
function toRoute(slug) {
	return slug.replace(/\/index$/, '').replace(/^index$/, '');
}

export default function remarkDocsLinks({ base = '' } = {}) {
	return (tree, file) => {
		const filePath = file.history[0] ?? file.path ?? '';
		const idx = filePath.replace(/\\/g, '/').indexOf(CONTENT_ROOT.replace(/\\/g, '/'));
		if (idx === -1) return;

		// Directory of the current page, relative to src/content/docs.
		const selfDir = path.posix.dirname(
			filePath.replace(/\\/g, '/').slice(idx + CONTENT_ROOT.length + 1)
		);

		visit(tree, 'link', (node) => {
			const url = node.url;
			if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#')) {
				return;
			}

			const [target, hash] = splitHash(url);

			if (target.startsWith('/')) {
				// Site-internal absolute link authored without the deployment base.
				if (base && !target.startsWith(`${base}/`)) {
					node.url = `${base}${target.replace(/\/$/, '')}/${hash}`;
				}
				return;
			}

			if (!MARKDOWN.test(target)) return; // images and other assets

			const resolved = path.posix
				.normalize(path.posix.join(selfDir === '.' ? '' : selfDir, target))
				.replace(MARKDOWN, '');
			const route = toRoute(resolved);
			node.url = `${base}/${route}${route ? '/' : ''}${hash}`;
		});
	};
}
