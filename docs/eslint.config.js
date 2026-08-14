import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// `{#each rows as _, i (i)}` — the item is unused because the editors index
			// back into the array to keep the binding writable. Matches the root config.
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
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// These components are Astro islands, not SvelteKit routes. `resolve()` is a
		// SvelteKit import that does not exist here; internal links are built from
		// `import.meta.env.BASE_URL` instead.
		files: ['src/**/*.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// The config migration tool parses arbitrary operator-authored config.js /
		// phone_book.json. Their shape is unknown until it has been validated, so
		// `any` is the honest annotation there.
		files: ['src/utils/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
);

/*
 * These three overrides mirror the root eslint.config.js, which lints this
 * directory too when run from the repo root. Keep them in step — otherwise
 * `npm run lint` disagrees depending on which directory you run it from.
 */
