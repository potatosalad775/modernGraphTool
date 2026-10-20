/**
 * Turns an authored docs link into its deployed URL. Shared by the
 * `remark-docs-links` plugin, `src/routeData.ts`, and the release workflow
 * (`scripts/release-notes-links.js`), which rewrites the changelog section it
 * pastes into a GitHub release.
 *
 * Kept free of dependencies on purpose: the release job installs only the root
 * packages, not `docs/node_modules`.
 */
import path from 'node:path';

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
			// A target that names a file (`/llms.txt`, `/intro.md`) is served at
			// exactly that path. Astro's trailing slash belongs on routes only —
			// appending it here produces `/llms.txt/`, which 404s.
			const suffix = path.posix.extname(target) ? '' : '/';
			return `${base}${target.replace(/\/$/, '')}${suffix}${hash}`;
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

export { resolveUrl };
