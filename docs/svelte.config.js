import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// `@astrojs/svelte` applies `vitePreprocess` implicitly when no config exists,
// which is what compiles `lang="ts"` in the tool components. Stating it here
// keeps that behaviour once a config file is present, and stops the standalone
// vite-plugin-svelte in vitest.config.ts from warning that it found none.
//
// `runes: true` is required, not cosmetic: Svelte 5's per-file auto-detection
// falls back to legacy mode for any component with zero rune calls (e.g.
// ConfigEditor.svelte, which is pure composition with no local state). A
// legacy-mode component hydrated by Astro's islands architecture crashes on
// mount (`Cannot read properties of null (reading 'u')`, from the legacy
// lifecycle's `context.l` never being populated) because the rest of the tree
// is runes mode. Forcing it globally is what "enforced globally" in AGENTS.md
// actually requires — a component simply cannot opt out by having no runes.
export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	}
};
