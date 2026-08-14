import type { StarlightUserConfig } from '@astrojs/starlight/types';

// Explicit rather than `autogenerate`: the section order and the group labels come from the
// old `_category_.json` files and are not alphabetical, and each group leads with its
// overview page.
export const sidebar: StarlightUserConfig['sidebar'] = [
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
		// The three interactive tools. `link` rather than `slug` because they are Astro pages
		// under src/pages/, not docs-collection entries, so Starlight cannot validate them —
		// a typo here 404s silently.
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
