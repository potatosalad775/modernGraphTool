// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import starlightDotMd from 'starlight-dot-md';
import starlightLlmsTxt from 'starlight-llms-txt';
import remarkHeadingIds from './src/plugins/remark-heading-ids.mjs';
import remarkDocsLinks from './src/plugins/remark-docs-links.mjs';

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
	markdown: { remarkPlugins: [remarkHeadingIds, [remarkDocsLinks, { base: BASE }]] },
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
			// Explicit rather than `autogenerate`: the section order and the group
			// labels come from the old `_category_.json` files and are not
			// alphabetical, and each group leads with its overview page.
			sidebar: [
				{ slug: 'intro' },
				{ slug: 'why-moderngraphtool' },
				{ slug: 'whats-new-in-v2' },
				{ slug: 'migrating-v1-to-v2' },
				{ slug: 'migrating-from-cringraph' },
				{
					label: 'Features',
					translations: { ko: '기능' },
					collapsed: true,
					items: [
						{ slug: 'features' },
						{ slug: 'features/average-curves' },
						{ slug: 'features/cross-site-search' },
						{ slug: 'features/device-peq' },
						{ slug: 'features/equalizer' },
						{ slug: 'features/frequency-tutorial' },
						{ slug: 'features/preference-bound' },
						{ slug: 'features/site-selector' },
						{ slug: 'features/squiglink-integration' },
						{ slug: 'features/target-customizer' }
					]
				},
				{
					label: 'Guide for Users',
					translations: { ko: '사용자 가이드' },
					items: [
						{ slug: 'guide-for-users' },
						{ slug: 'guide-for-users/what-is-this' },
						{ slug: 'guide-for-users/reading-the-graph' },
						{ slug: 'guide-for-users/how-measurements-work' },
						{ slug: 'guide-for-users/why-targets-exist' },
						{ slug: 'guide-for-users/interface-tour' },
						{ slug: 'guide-for-users/loading-devices' },
						{ slug: 'guide-for-users/working-with-curves' },
						{ slug: 'guide-for-users/graph-controls' },
						{ slug: 'guide-for-users/targets-and-preferences' },
						{ slug: 'guide-for-users/equalizing' },
						{ slug: 'guide-for-users/sharing-and-exporting' },
						{ slug: 'guide-for-users/appearance-and-language' },
						{ slug: 'guide-for-users/faq' }
					]
				},
				{
					label: 'Guide for Admins',
					translations: { ko: '관리자 가이드' },
					collapsed: true,
					items: [
						{ slug: 'guide-for-admins' },
						{ slug: 'guide-for-admins/setup-env' },
						{
							label: 'Deployment Options',
							translations: { ko: '배포 방법' },
							items: [
								{ slug: 'guide-for-admins/deployment' },
								{ slug: 'guide-for-admins/deployment/github-pages' },
								{ slug: 'guide-for-admins/deployment/cdn' },
								{ slug: 'guide-for-admins/deployment/prebuilt' },
								{ slug: 'guide-for-admins/deployment/from-source' }
							]
						},
						{ slug: 'guide-for-admins/customize-page' },
						{ slug: 'guide-for-admins/preprocessing-measurement' },
						{ slug: 'guide-for-admins/manage-data' }
					]
				},
				{
					label: 'Guide for Developers',
					translations: { ko: '개발자 가이드' },
					collapsed: true,
					items: [
						{ slug: 'guide-for-developers' },
						{ slug: 'guide-for-developers/overview' },
						{ slug: 'guide-for-developers/testing' },
						{ slug: 'guide-for-developers/build-and-deploy' },
						{ slug: 'guide-for-developers/i18n' }
					]
				},
				{
					label: 'Database Setup Tips',
					translations: { ko: '데이터베이스 설정 팁' },
					items: [
						{ slug: 'database-tips' },
						{
							label: 'Dual-Hosting modernGraphTool & CrinGraph',
							translations: { ko: 'modernGraphTool & CrinGraph 동시 운영' },
							collapsed: true,
							items: [
								{ slug: 'database-tips/dual-hosting' },
								{ slug: 'database-tips/dual-hosting/main-mgt' },
								{ slug: 'database-tips/dual-hosting/main-cringraph' }
							]
						}
					]
				},
				{ slug: 'changelog' },
				{
					// The three interactive tools. `link` rather than `slug` because they
					// are Astro pages under src/pages/, not docs-collection entries, so
					// Starlight cannot validate them — a typo here 404s silently.
					//
					// Starlight still localises these hrefs, so the Korean sidebar points
					// at `/ko/config-generator`. Each tool page builds that route itself
					// via `getStaticPaths`; drop it and these links break.
					label: 'Tools',
					translations: { ko: '도구' },
					items: [
						{
							link: '/config-generator',
							label: 'Config Editor',
							translations: { ko: '설정 파일 편집기' }
						},
						{
							link: '/phone-book-editor',
							label: 'phone_book.json Editor',
							translations: { ko: 'phone_book.json 편집기' }
						},
						{
							link: '/theme-generator',
							label: 'Theme Generator',
							translations: { ko: '테마 생성기' }
						}
					]
				},
				{
					// Frozen v1 snapshot. Every page under here also carries an
					// "unmaintained" banner in its frontmatter, which is what replaces
					// the old Docusaurus version dropdown.
					label: 'v1 (unmaintained)',
					translations: { ko: 'v1 (지원 종료)' },
					collapsed: true,
					items: [
						{ slug: '1.x/intro' },
						{
							label: 'Guide for Users',
							translations: { ko: '사용자 가이드' },
							collapsed: true,
							items: [
								{ slug: '1.x/guide-for-users/understanding-ui' },
								{
									label: 'Tool Guide',
									translations: { ko: '도구 가이드' },
									collapsed: true,
									items: [
										{ slug: '1.x/guide-for-users/tool-instructions/ti-graph' },
										{ slug: '1.x/guide-for-users/tool-instructions/ti-list' }
									]
								}
							]
						},
						{
							label: 'Guide for Admins',
							translations: { ko: '관리자 가이드' },
							collapsed: true,
							items: [
								{ slug: '1.x/guide-for-admins/setup-env' },
								{ slug: '1.x/guide-for-admins/customize-page' },
								{ slug: '1.x/guide-for-admins/preprocessing-measurement' },
								{ slug: '1.x/guide-for-admins/manage-data' },
								{ slug: '1.x/guide-for-admins/use-extensions' }
							]
						},
						{
							label: 'Guide for Developers',
							translations: { ko: '개발자 가이드' },
							collapsed: true,
							items: [{ slug: '1.x/guide-for-developers/coming-soon' }]
						},
						{
							label: 'Database Setup Tips',
							translations: { ko: '데이터베이스 설정 팁' },
							collapsed: true,
							items: [
								{ slug: '1.x/database-tips/dual-hosting/main-mgt' },
								{ slug: '1.x/database-tips/dual-hosting/main-cringraph' }
							]
						},
						{
							label: 'Extensions',
							translations: { ko: '확장 기능' },
							collapsed: true,
							items: [{ autogenerate: { directory: '1.x/extensions' } }]
						},
						{
							label: 'Changelog',
							collapsed: true,
							items: [{ autogenerate: { directory: '1.x/changelog' } }]
						}
					]
				}
			],
			plugins: [
				starlightDotMd(),
				starlightLlmsTxt({
					projectName: 'modernGraphTool',
					description:
						'A web-based frequency response (FR) visualization tool for headphones and IEMs, ' +
						'built as a fully static SPA. Operators run measurement databases with it ' +
						'(typically on squig.link); end users load, compare, EQ and share measurements.',
					details: [
						'- The current version is **v2** (SvelteKit 2 + Svelte 5). Anything under `1.x/` is a',
						'  frozen snapshot of the unmaintained v1 docs, kept only for operators who have not',
						'  migrated. **Answer from the v2 pages unless the question is explicitly about v1** —',
						'  several v1 pages share a title with their v2 replacement but describe a different,',
						'  now-incorrect setup (`Customizing the Page`, `Managing Data`, `Setting Up Your',
						'  Environment`, `Preprocessing Measurement Data`, and the dual-hosting pages).',
						'- Every page is also available as raw Markdown by appending `.md` to its URL.',
						'- The docs are published in English and Korean. Only the English pages are included',
						'  here; the Korean translation is partial and falls back to English per page.'
					].join('\n'),
					optionalLinks: [
						{
							label: 'Source repository',
							url: 'https://github.com/potatosalad775/modernGraphTool',
							description: 'the modernGraphTool source, including CONTRIBUTING.md and the docs sources'
						}
					],
					// `llms-full.txt` is always the complete corpus — `exclude` does not apply to it,
					// only to `llms-small.txt`. So v1 and the changelogs are dropped from the small
					// build and pushed to the bottom of the full one, where a truncated read misses
					// them instead of hitting them first.
					exclude: ['1.x/**', 'changelog'],
					promote: ['index*', 'intro*', 'why-moderngraphtool*', 'whats-new-in-v2*'],
					demote: ['changelog', '1.x/**'],
					// Three audience-sized subsets, matching the sidebar's own split. An agent helping
					// an operator stand up a database should read the operator set, not 400 KB.
					customSets: [
						{
							label: 'Operator guide',
							description:
								'everything needed to deploy, configure and populate a modernGraphTool database — ' +
								'config.js reference, deployment options, measurement data, and feature docs',
							paths: ['guide-for-admins/**', 'database-tips/**', 'features/**']
						},
						{
							label: 'End-user guide',
							description:
								'how to read the graph and use the interface — for questions from people browsing ' +
								'a measurement database rather than running one',
							paths: ['guide-for-users/**', 'features/**']
						},
						{
							label: 'Contributor guide',
							description:
								'architecture, testing, i18n and build internals — for working on modernGraphTool itself',
							paths: ['guide-for-developers/**']
						}
					],
					// Starlight renders a "Section titled …" link beside every heading. It is pure
					// noise once the HTML is flattened to Markdown, and there are ~600 of them.
					customSelectors: { all: ['.sl-anchor-link'] }
				})
			]
		})
	]
});
