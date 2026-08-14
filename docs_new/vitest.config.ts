import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The tools' `utils/` are framework-free and carry over unchanged through the
// React → Svelte port, so their specs are co-located with them and survive it.
// `@site/*` is the Docusaurus path alias the sources still use.
export default defineConfig({
	resolve: {
		alias: {
			'@site': fileURLToPath(new URL('.', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.spec.ts'],
		environment: 'node'
	}
});
