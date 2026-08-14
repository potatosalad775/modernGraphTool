// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import starlightDotMd from 'starlight-dot-md';
import starlightLlmsTxt from 'starlight-llms-txt';
import remarkHeadingIds from './src/plugins/remark-heading-ids.mjs';
import remarkDocsLinks from './src/plugins/remark-docs-links.mjs';
import { sidebar } from './src/sidebar.ts';
import { llmsTxtConfig } from './src/llms-txt.config.ts';

const SITE = 'https://potatosalad775.github.io';
const BASE = '/modernGraphTool/docs';

/**
 * Docusaurus generated a `/category/<slug>` page for every sidebar category.
 * Starlight has no equivalent, so those URLs are redirected here — they are
 * linked from the old footer, from inside the docs, and from the app itself
 * (`TutorialModal.svelte`). v2 sections redirect to their new overview page;
 * v1 is frozen, so its categories go straight to the section's first page.
 */
const rawRedirects = {
	'/category/features': '/features/',
	'/category/guide-for-users': '/guide-for-users/',
	'/category/guide-for-admins': '/guide-for-admins/',
	'/category/guide-for-developers': '/guide-for-developers/',
	'/category/database-setup-tips': '/database-tips/',
	'/category/deployment-options': '/guide-for-admins/deployment/',
	'/category/dual-hosting-moderngraphtool--cringraph': '/database-tips/dual-hosting/',

	'/1.x/category/guide-for-users': '/1.x/guide-for-users/understanding-ui/',
	'/1.x/category/tool-guide': '/1.x/guide-for-users/tool-instructions/ti-graph/',
	'/1.x/category/guide-for-admins': '/1.x/guide-for-admins/setup-env/',
	'/1.x/category/guide-for-developers': '/1.x/guide-for-developers/coming-soon/',
	'/1.x/category/database-setup-tips': '/1.x/database-tips/dual-hosting/main-mgt/',
	'/1.x/category/dual-hosting-moderngraphtool--cringraph':
		'/1.x/database-tips/dual-hosting/main-mgt/',
	'/1.x/category/extensions': '/1.x/extensions/device-peq/',
	'/1.x/category/changelog': '/1.x/changelog/core/'
};

const redirects = /** @type {Record<string, string>} */ ({});
for (const [from, to] of Object.entries(rawRedirects)) {
	// Astro applies `base` to the redirect's own route but NOT to the target it
	// writes into the meta-refresh, so the destination has to carry it here or
	// every one of these lands at the domain root.
	redirects[from] = `${BASE}${to}`;
	redirects[`/ko${from}`] = `${BASE}/ko${to}`;
}

export default defineConfig({
	site: SITE,
	// `site` carries the origin only. GitHub Pages serves this site from a
	// subpath, and Astro does NOT derive `base` from `site` — without this every
	// internal link resolves one level too high.
	base: BASE,
	redirects,
	markdown: {
		processor: unified({ remarkPlugins: [remarkHeadingIds, [remarkDocsLinks, { base: BASE }]] })
	},
	integrations: [
		// Powers the three interactive tools under src/pages/. Every other page
		// stays zero-JS: the islands only hydrate on those three routes.
		svelte(),
		starlight({
			title: { en: 'modernGraphTool Docs', ko: 'modernGraphTool 문서' },
			favicon: '/img/favicon.ico',
			head: [
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: `${SITE}${BASE}/img/mGT-social-card.png` }
				}
			],
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				ko: { label: '한국어', lang: 'ko' }
			},
			editLink: {
				baseUrl: 'https://github.com/potatosalad775/modernGraphTool/tree/main/docs/'
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/potatosalad775/modernGraphTool'
				}
			],
			customCss: ['./src/styles/custom.css'],
			// Base-resolves the hero action links, which frontmatter puts out of
			// `remark-docs-links`' reach. See src/routeData.ts.
			routeMiddleware: './src/routeData.ts',
			// See src/sidebar.ts — explicit rather than `autogenerate`, since the section order
			// and group labels come from the old `_category_.json` files and are not alphabetical.
			sidebar,
			// See src/llms-txt.config.ts for the machine-readable-output settings.
			plugins: [starlightDotMd(), starlightLlmsTxt(llmsTxtConfig)]
		})
	]
});
