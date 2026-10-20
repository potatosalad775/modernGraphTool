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
 * handled in `src/routeData.ts`, which reuses `resolveUrl` (`resolve-docs-url.mjs`).
 *
 * Anything external, protocol-relative, a bare `#anchor`, or a non-Markdown
 * asset (images) is left untouched.
 */
import path from 'node:path';
import { visit } from 'unist-util-visit';
import { resolveUrl } from './resolve-docs-url.mjs';

const CONTENT_ROOT = path.join('src', 'content', 'docs');

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
