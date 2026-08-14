import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// The tools' `utils/` are framework-free and carry the bulk of the coverage —
// they are the converters that emit the files operators paste into live
// deployments. Their specs are co-located with them.
//
// The Svelte plugin is here so specs can also import the tools' `.svelte.ts`
// stores and exercise the runes in them. It comes from `@astrojs/svelte`, which
// already depends on it, so it costs no extra dependency.
export default defineConfig({
	plugins: [svelte()],
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
