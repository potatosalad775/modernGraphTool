import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

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
