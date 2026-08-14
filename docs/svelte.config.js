import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// `@astrojs/svelte` applies `vitePreprocess` implicitly when no config exists,
// which is what compiles `lang="ts"` in the tool components. Stating it here
// keeps that behaviour once a config file is present, and stops the standalone
// vite-plugin-svelte in vitest.config.ts from warning that it found none.
export default {
	preprocess: vitePreprocess()
};
