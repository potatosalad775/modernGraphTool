import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs plugin, no type declarations
import { resolveUrl } from './remark-docs-links.mjs';

/**
 * `resolveUrl` is what keeps every authored link base-correct. It is worth
 * pinning because the failure mode is silent: a link that is not rewritten
 * still renders, still looks right in the source, and only 404s once the site
 * is served from its subpath — and only on some URLs, since a relative href
 * resolves differently depending on the trailing slash.
 *
 * `asRoute` distinguishes the two callers. Markdown links name a source file
 * (`./foo.mdx`); JSX hrefs and hero actions already name a route (`./foo/`).
 */

const BASE = '/modernGraphTool/docs';
const md = (url: string, dir = '.') => resolveUrl(url, dir, BASE, false);
const route = (url: string, dir = '.') => resolveUrl(url, dir, BASE, true);

describe('links that must be left alone', () => {
	it.each([
		['https://example.com/x', 'external'],
		['http://example.com/x', 'external http'],
		['mailto:a@b.c', 'mailto'],
		['//example.com/x', 'protocol-relative'],
		['#section', 'bare anchor']
	])('%s (%s)', (url) => {
		expect(md(url)).toBeUndefined();
		expect(route(url)).toBeUndefined();
	});

	it('leaves an absolute link that already carries the base', () => {
		expect(md(`${BASE}/intro/`)).toBeUndefined();
	});

	it('leaves non-Markdown assets alone in Markdown mode, so images survive', () => {
		expect(md('./img/screenshot.png')).toBeUndefined();
		expect(md('./img/screenshot.png', 'guide-for-users')).toBeUndefined();
	});
});

describe('Markdown links', () => {
	it('resolves a sibling page relative to its own directory', () => {
		expect(md('./manage-data.mdx', 'guide-for-admins')).toBe(
			`${BASE}/guide-for-admins/manage-data/`
		);
	});

	it('keeps the anchor', () => {
		expect(md('./manage-data.mdx#sample-sets', 'guide-for-admins')).toBe(
			`${BASE}/guide-for-admins/manage-data/#sample-sets`
		);
	});

	it('walks up out of the current directory', () => {
		expect(md('../features/equalizer.mdx', 'guide-for-users')).toBe(`${BASE}/features/equalizer/`);
	});

	it('collapses a trailing /index', () => {
		expect(md('./index.mdx', 'features')).toBe(`${BASE}/features/`);
	});

	it('adds the base to a root-absolute link authored without it', () => {
		expect(md('/theme-generator')).toBe(`${BASE}/theme-generator/`);
		expect(md('/theme-generator/')).toBe(`${BASE}/theme-generator/`);
	});
});

describe('JSX hrefs and hero actions', () => {
	// The reported bug: `href="intro/"` on the landing page resolved against the
	// current URL, so it reached /modernGraphTool/intro/ when the page was served
	// without a trailing slash.
	it('resolves a bare relative route from the root landing page', () => {
		expect(route('intro/')).toBe(`${BASE}/intro/`);
		expect(route('config-generator/')).toBe(`${BASE}/config-generator/`);
	});

	it('resolves the same authored link per locale', () => {
		expect(route('intro/', 'ko')).toBe(`${BASE}/ko/intro/`);
	});

	it('resolves ./ routes from a section index page', () => {
		expect(route('./average-curves/', 'features')).toBe(`${BASE}/features/average-curves/`);
		expect(route('./main-mgt/', 'database-tips/dual-hosting')).toBe(
			`${BASE}/database-tips/dual-hosting/main-mgt/`
		);
		expect(route('./average-curves/', 'ko/features')).toBe(`${BASE}/ko/features/average-curves/`);
	});

	it('normalises whether or not the author wrote a trailing slash', () => {
		expect(route('./cdn', 'guide-for-admins/deployment')).toBe(
			`${BASE}/guide-for-admins/deployment/cdn/`
		);
		expect(route('./cdn/', 'guide-for-admins/deployment')).toBe(
			`${BASE}/guide-for-admins/deployment/cdn/`
		);
	});
});
