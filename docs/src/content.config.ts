import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

/**
 * Derive the entry id straight from the file path instead of letting Astro
 * slugify each path segment.
 *
 * The default would rewrite the frozen `1.x/` tree to `1x/`, because
 * github-slugger drops the dot — silently moving all 49 v1 pages off the
 * `/1.x/*` URLs the old Docusaurus site published. Every filename here is
 * already lowercase kebab-case, so path-as-id is otherwise identical to the
 * default.
 */
function generateId({ entry }: { entry: string }): string {
	// Mirrors Astro's own rule (strip the extension, then collapse a trailing
	// `/index`) minus the per-segment slugify. A bare root `index` is left as
	// `index`, which is what Astro produces and what Starlight expects.
	return entry.replace(/\.mdx?$/, '').replace(/\/index$/, '');
}

export const collections = {
	docs: defineCollection({ loader: docsLoader({ generateId }), schema: docsSchema() })
};
