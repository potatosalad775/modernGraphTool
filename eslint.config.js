import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import { loadConfig } from '@sveltejs/load-config';

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config;

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

const testFiles = [
	'src/**/*.spec.ts',
	'src/**/*.fixtures.ts',
	'src/**/__fixtures__/**',
	'src/**/*-harness.ts',
	'src/test-setup.*.ts'
];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		// The root .gitignore anchors its output patterns (`/build`, `/dist`), so it does not
		// cover the docs site's generated output, and includeIgnoreFile only reads the root
		// file. Without this, linting after a docs build walks into minified bundles.
		ignores: ['docs/dist/**', 'docs/.astro/**', 'site-template/config-cdn-mode.js']
	},
	js.configs.recommended,
	ts.configs.recommended,
	{
		// The strict presets for production code. Violations that predate them are recorded in
		// eslint-suppressions.json, so only new ones fail lint. They sit before the Svelte
		// configs, which have to win for .svelte files: the presets set typescript-eslint's
		// parser, and placed after them it replaces Svelte's and every .svelte file fails to parse.
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: testFiles,
		extends: [ts.configs.strictTypeChecked, ts.configs.stylisticTypeChecked],
		rules: {
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			complexity: ['error', 15],
			// A number in a template string prints as written; the preset's ban is aimed at
			// objects and nullish values, which stay banned.
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
			// `onclick={() => store.close()}` is the idiom for a handler whose result nobody reads.
			// Its fix is to write `!`, which `no-non-null-assertion` bans below.
			'@typescript-eslint/non-nullable-type-assertion-style': 'off',
			'@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }]
		}
	},
	{
		// typescript-eslint's program cannot read `.svelte` modules, so a component's props and
		// the types its module script exports reach these rules as `any`: every callback passed
		// to a child component would be flagged with nothing unsafe in it.
		files: ['src/**/*.svelte'],
		rules: {
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off'
		}
	},
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				// Anchored explicitly, not left to inference: ESLint 10 resolves the config
				// from each linted file, so a root run also loads docs/eslint.config.js, and
				// each config registers a candidate `tsconfigRootDir`. Two candidates on one
				// typescript-eslint instance turn every unanchored parse into a 0:0 error.
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// Allow _-prefixed vars used solely for Svelte reactive subscriptions
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				// Anchors `projectService` at the repo root. It belongs under
				// `parserOptions` — ESLint 10 rejects an unknown key directly on
				// `languageOptions` and refuses to run at all.
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		},
		rules: {
			// `let { open = $bindable(false) } = $props()` reads as a dead initializer to this
			// rule, but the default is what Svelte hands the component when the prop is omitted.
			'no-useless-assignment': 'off'
		}
	},
	{
		// Type-aware rules for the app. The block above gives only Svelte files type information;
		// this extends it to every .ts file under src/. A promise nobody awaits or catches turns a
		// rejection into an unhandled one, and a promise-returning callback in a void slot (an
		// event handler, a timer) drops its rejection the same way.
		// `no-unnecessary-condition` trusts the types, so data from outside them (operator config,
		// fetched JSON, storage, DOM reads, an index that can miss) is typed `| undefined` where it
		// enters, and the guard on it stays.
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		languageOptions: {
			parserOptions: { projectService: true }
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'error',
			'@typescript-eslint/no-non-null-assertion': 'error'
		}
	},
	{
		// Tests read back what they just set up, and a wrong `!` there fails the test rather
		// than a user's page.
		files: testFiles,
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'off'
		}
	},
	{
		// The docs site's Svelte components are Astro islands, not SvelteKit routes.
		// `resolve()` is a SvelteKit import that does not exist there, and these links
		// are built from `import.meta.env.BASE_URL` instead.
		files: ['docs/src/**/*.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// The docs site's config migration tool parses arbitrary operator-authored
		// config.js / phone_book.json. Their shape is unknown until it has been
		// validated, so `any` is the honest annotation there.
		files: ['docs/src/utils/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
);
