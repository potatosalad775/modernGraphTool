import type { StarlightUserConfig } from '@astrojs/starlight/types';

// Explicit rather than `autogenerate`: one section per audience, and the groups do not follow
// the folder layout — pages were regrouped without moving, so their published URLs survive.
export const sidebar: StarlightUserConfig['sidebar'] = [
	{ slug: 'intro' },
	{ slug: 'why-moderngraphtool' },
	{
		label: 'Guide for Users',
		translations: { ko: '사용자 가이드' },
		items: [
			{ slug: 'guide-for-users' },
			{
				label: 'Basics',
				translations: { ko: '기초' },
				items: [
					{ slug: 'guide-for-users/what-is-this' },
					{ slug: 'guide-for-users/reading-the-graph' },
					{ slug: 'guide-for-users/how-measurements-work' },
					{ slug: 'guide-for-users/why-targets-exist' }
				]
			},
			{
				label: 'Using the Tool',
				translations: { ko: '도구 사용법' },
				items: [
					{ slug: 'guide-for-users/interface-tour' },
					{ slug: 'guide-for-users/loading-devices' },
					{ slug: 'guide-for-users/working-with-curves' },
					{ slug: 'guide-for-users/graph-controls' },
					{ slug: 'guide-for-users/targets-and-preferences' },
					{ slug: 'guide-for-users/equalizing' },
					{ slug: 'guide-for-users/sharing-and-exporting' },
					{ slug: 'guide-for-users/appearance-and-language' }
				]
			},
			{ slug: 'guide-for-users/faq' }
		]
	},
	{
		// Per-feature reference: what each feature does and how it behaves. How to click through it
		// lives in the user guide; its config options live in `customize-page`.
		label: 'Features',
		translations: { ko: '기능' },
		collapsed: true,
		items: [
			{ slug: 'features' },
			{
				label: 'Graph',
				translations: { ko: '그래프' },
				items: [
					{ slug: 'features/average-curves' },
					{ slug: 'features/preference-bound' },
					{ slug: 'features/target-customizer' },
					{ slug: 'features/frequency-tutorial' }
				]
			},
			{
				label: 'Equalizer',
				translations: { ko: '이퀄라이저' },
				items: [
					{ slug: 'features/equalizer' },
					{ slug: 'features/device-peq' },
					{ slug: 'features/autoeq-benchmarks' }
				]
			},
			{
				label: 'Across Sites',
				translations: { ko: '사이트 간 기능' },
				items: [
					{ slug: 'features/cross-site-search' },
					{ slug: 'features/site-selector' },
					{ slug: 'features/squiglink-integration' }
				]
			}
		]
	},
	{
		// URLs stay under `guide-for-admins/` — they are linked from the app and README.
		label: 'Guide for Operators',
		translations: { ko: '운영자 가이드' },
		collapsed: true,
		items: [
			{ slug: 'guide-for-admins' },
			{
				label: 'Deployment',
				translations: { ko: '배포' },
				items: [
					{ slug: 'guide-for-admins/setup-env' },
					{ slug: 'guide-for-admins/deployment/github-pages' },
					{ slug: 'guide-for-admins/deployment/cdn' },
					{ slug: 'guide-for-admins/deployment/prebuilt' },
					{ slug: 'guide-for-admins/deployment/from-source' }
				]
			},
			{ slug: 'guide-for-admins/preprocessing-measurement' },
			{ slug: 'guide-for-admins/manage-data' },
			{ slug: 'guide-for-admins/customize-page' },
			{
				// `link` rather than `slug` because they are Astro pages under src/pages/, not
				// docs-collection entries, so Starlight cannot validate them — a typo here 404s
				// silently (`check-links.mjs` catches it at build time).
				//
				// Starlight still localises these hrefs, so the Korean sidebar points at
				// `/ko/config-generator`. Each tool page builds that route itself via
				// `getStaticPaths`; drop it and these links break.
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
				label: 'Migrating',
				translations: { ko: '마이그레이션' },
				items: [
					{ slug: 'whats-new-in-v2' },
					{ slug: 'migrating-v1-to-v2' },
					{ slug: 'migrating-from-cringraph' },
					{
						label: 'Dual-Hosting with CrinGraph',
						translations: { ko: 'CrinGraph와 동시 운영' },
						collapsed: true,
						items: [
							{ slug: 'database-tips/dual-hosting' },
							{ slug: 'database-tips/dual-hosting/main-mgt' },
							{ slug: 'database-tips/dual-hosting/main-cringraph' }
						]
					}
				]
			}
		]
	},
	{
		label: 'Guide for Developers',
		translations: { ko: '개발자 가이드' },
		collapsed: true,
		items: [
			{ slug: 'guide-for-developers/overview' },
			{ slug: 'guide-for-developers/testing' },
			{ slug: 'guide-for-developers/build-and-deploy' },
			{ slug: 'guide-for-developers/i18n' }
		]
	},
	{ slug: 'changelog' },
	{
		// Frozen v1 snapshot. Every page under here also carries an "unmaintained" banner in
		// its frontmatter, which is what replaces the old Docusaurus version dropdown.
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
];
