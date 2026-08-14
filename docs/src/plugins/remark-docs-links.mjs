/**
 * Resolves in-repo documentation links at build time.
 *
 * Astro does not rewrite relative links inside a content collection, so
 * `[x](./manage-data.mdx)` would ship to the browser verbatim and 404. The
 * migrated content is full of these (they came over from Docusaurus, which did
 * resolve them), and many carry an `#anchor` too.
 *
 * Handling it here rather than baking absolute URLs into the content keeps the
 * `base` in exactly one place — `astro.config.mjs` — and keeps the source links
 * clickable in an editor.
 *
 * Three shapes are rewritten:
 *   `[x](./foo.mdx#bar)`      -> `<base>/<dir>/foo/#bar`   (Markdown, per file)
 *   `[x](/theme-generator)`   -> `<base>/theme-generator/` (root-absolute)
 *   `<LinkCard href="./foo/">`-> `<base>/<dir>/foo/`       (JSX attribute)
 *
 * The JSX case matters because **a relative href that reaches the browser is
 * resolved against the current URL, so whether it works depends on the trailing
 * slash**. `href="intro/"` on the landing page lands on `<base>/intro/` when the
 * page is served as `/docs/` but on `/modernGraphTool/intro/` when it is served
 * as `/docs` — which is exactly what broke. Starlight's `<LinkCard>` and the
 * hero's `<LinkButton>` both emit `href` untouched, so nothing downstream fixes
 * it. Resolving here removes the dependency on the trailing slash entirely.
 *
 * The hero's `actions[].link` has the same problem but cannot be fixed here:
 * it lives in frontmatter, which the content layer validates and stores before
 * remark ever runs, and Starlight reads it back off `entry.data`. That one is
 * handled in `src/routeData.ts`, which reuses `resolveUrl` below.
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

function isExternal(url) {
	return !url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#');
}

/**
 * @param {string} url    the authored link
 * @param {string} selfDir directory of the page, relative to the content root
 * @param {string} base    deployment base path
 * @param {boolean} asRoute Markdown links name a source file (`./foo.mdx`); JSX
 *   hrefs already name a route (`./foo/`). Only the former needs an extension,
 *   and only the former should skip non-Markdown targets so images pass through.
 * @returns {string | undefined} the rewritten URL, or undefined to leave it be
 */
function resolveUrl(url, selfDir, base, asRoute) {
	if (isExternal(url)) return;

	const [target, hash] = splitHash(url);

	if (target.startsWith('/')) {
		// Site-internal absolute link authored without the deployment base.
		if (base && !target.startsWith(`${base}/`)) {
			return `${base}${target.replace(/\/$/, '')}/${hash}`;
		}
		return;
	}

	if (!asRoute && !MARKDOWN.test(target)) return; // images and other assets

	const resolved = path.posix
		.normalize(path.posix.join(selfDir === '.' ? '' : selfDir, target))
		.replace(MARKDOWN, '')
		.replace(/\/$/, '');
	const route = toRoute(resolved);
	return `${base}/${route}${route ? '/' : ''}${hash}`;
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
			const next = resolveUrl(node.url, selfDir, base, false);
			if (next !== undefined) node.url = next;
		});

		// `<LinkCard href="./foo/">` and friends. Attribute values that are MDX
		// expressions rather than plain strings have a non-string `value` and are
		// left alone — the author is computing the URL themselves.
		visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node) => {
			for (const attr of node.attributes ?? []) {
				if (attr.type !== 'mdxJsxAttribute' || attr.name !== 'href') continue;
				if (typeof attr.value !== 'string') continue;
				const next = resolveUrl(attr.value, selfDir, base, true);
				if (next !== undefined) attr.value = next;
			}
		});
	};
}

export { resolveUrl };
