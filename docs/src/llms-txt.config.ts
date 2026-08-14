import type starlightLlmsTxt from 'starlight-llms-txt';

type LlmsTxtOptions = Parameters<typeof starlightLlmsTxt>[0];

export const llmsTxtConfig: LlmsTxtOptions = {
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
	// `llms-full.txt` is always the complete corpus — `exclude` does not apply to it, only to
	// `llms-small.txt`. So v1 and the changelogs are dropped from the small build and pushed to
	// the bottom of the full one, where a truncated read misses them instead of hitting them
	// first.
	exclude: ['1.x/**', 'changelog'],
	promote: ['index*', 'intro*', 'why-moderngraphtool*', 'whats-new-in-v2*'],
	demote: ['changelog', '1.x/**'],
	// Three audience-sized subsets, matching the sidebar's own split. An agent helping an
	// operator stand up a database should read the operator set, not 400 KB.
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
	// Starlight renders a "Section titled …" link beside every heading. It is pure noise once
	// the HTML is flattened to Markdown, and there are ~600 of them.
	customSelectors: { all: ['.sl-anchor-link'] }
};
