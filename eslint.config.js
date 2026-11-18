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

// Project rules, as lint. Each message names the fix, because the message is what the next
// contributor reads. A later block replaces a rule's options outright, so the blocks that add a
// restriction for one directory spread these lists rather than restate them.
const restrictedImports = {
	paths: [
		{
			name: 'svelte/store',
			message: 'Use runes: $state in a .svelte.ts module replaces a writable store.'
		}
	],
	patterns: [
		{
			regex: String.raw`^\.{1,2}/(.*/)?(static|defaults)/`,
			message:
				'static/ and defaults/ are operator-editable. fetch() the file at runtime: an import bakes a copy into the bundle and the edit an operator makes stops taking effect.'
		}
	]
};

// An effect that only copies one value into another: `$effect(() => { a = b; })`.
const effectCall =
	":matches(CallExpression[callee.name='$effect'], CallExpression[callee.object.name='$effect'])";
const mirrorMessage =
	'This effect only mirrors a value. Use $derived, or own the value where it is computed and pass it down as a prop.';

// A Tailwind palette class: a colour that does not follow the operator's theme.
const paletteClass = String.raw`\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide)-((zinc|gray|slate|stone|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)\b`;
const paletteMessage =
	'Use a semantic token (bg-base-200, text-base-content/60, border-accent, …) so an operator theme still applies. Tokens are in defaults/theme.css.';

const restrictedSyntax = [
	{
		selector: `${effectCall} > ArrowFunctionExpression > AssignmentExpression`,
		message: mirrorMessage
	},
	{
		selector: `${effectCall} > ArrowFunctionExpression > BlockStatement[body.length=1] > ExpressionStatement > AssignmentExpression`,
		message: mirrorMessage
	},
	{
		selector:
			"NewExpression[callee.name='Worker']:not(:has(> CallExpression[callee.name='trustedScriptUrl']))",
		message:
			'Pass trustedScriptUrl(...) from #lib/utils/trusted-types.js: a plain string throws under the Trusted Types policy.'
	},
	{
		selector: "SvelteMustacheTag[kind='raw'] > :not(CallExpression[callee.name='trustedHtml'])",
		message:
			'{@html} takes trustedHtml(...) from #lib/utils/trusted-types.js, around operator config or the output of sanitizeHtml.'
	},
	// The class can sit in a string, in a template string, or in a `class:name` directive, and
	// each keeps its text in a different place.
	{
		selector: `:matches(Literal, SvelteLiteral)[value=/${paletteClass}/]`,
		message: paletteMessage
	},
	{
		selector: `TemplateElement[value.cooked=/${paletteClass}/]`,
		message: paletteMessage
	},
	{
		selector: `SvelteDirective[kind='Class'][key.name.name=/${paletteClass}/]`,
		message: paletteMessage
	}
];

/**
 * Bans imports from the named `src/lib` directories, by the `#lib/` alias or by a relative path.
 * @param {string[]} banned
 * @param {string} message
 */
const withoutLayers = (banned, message) => ({
	...restrictedImports,
	patterns: [
		...restrictedImports.patterns,
		{ regex: String.raw`^(#lib/|(\.\./)+)(${banned.join('|')})/`, message }
	]
});

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
		// The strict presets for production code. They sit before the Svelte
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
			'@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
			// An `async` method that awaits nothing is how an implementation of a Promise-returning
			// interface turns a synchronous throw into a rejection its caller's `.catch` sees.
			'@typescript-eslint/require-await': 'off',
			// Its fix is to write `!`, which `no-non-null-assertion` bans below.
			'@typescript-eslint/non-nullable-type-assertion-style': 'off',
			// `name.trim() || fallback` means an empty string falls back too, which `??` would not do.
			'@typescript-eslint/prefer-nullish-coalescing': [
				'error',
				{ ignorePrimitives: { string: true } }
			]
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
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: testFiles,
		rules: {
			'no-restricted-imports': ['error', restrictedImports],
			'no-restricted-syntax': ['error', ...restrictedSyntax],
			'no-restricted-properties': [
				'error',
				...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
					property,
					message:
						'Build nodes or set textContent: a string at an HTML sink throws under the Trusted Types policy.'
				}))
			],
			'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }]
		}
	},
	{
		// The restricted-syntax rule above is the precise one: it allows `{@html trustedHtml(...)}`
		// and nothing else, where this rule would need a disable comment at every site.
		files: ['src/**/*.svelte'],
		rules: {
			'svelte/no-at-html-tags': 'off'
		}
	},
	{
		files: ['src/lib/workers/**/*.ts'],
		ignores: testFiles,
		rules: {
			'no-restricted-imports': [
				'error',
				withoutLayers(
					['stores', 'services', 'graph', 'components'],
					'Worker code runs without the app: take the data as a message, since importing app state pulls the Svelte runtime into the worker chunk.'
				)
			]
		}
	},
	{
		files: ['src/lib/stores/**/*.ts'],
		ignores: testFiles,
		rules: {
			'no-restricted-imports': [
				'error',
				withoutLayers(
					['services', 'components'],
					'Stores sit below services and components. Move the logic into a service that writes the store.'
				)
			]
		}
	},
	{
		files: ['src/lib/device-peq/**/*.ts'],
		ignores: testFiles,
		rules: {
			'no-restricted-imports': [
				'error',
				withoutLayers(['components'], 'device-peq is UI-free. Pass what it needs as an argument.')
			]
		}
	},
	{
		files: ['src/lib/components/panels/**/*.svelte'],
		ignores: testFiles,
		rules: {
			'no-restricted-syntax': [
				'error',
				...restrictedSyntax,
				{
					selector:
						":matches(CallExpression[callee.name='$effect'], CallExpression[callee.object.name='$effect'])",
					message:
						'A panel unmounts on every panel switch, and its effects stop with it. Put the reaction in a store, or in a service installed from AppShell.onMount.'
				}
			]
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
