import adapter from '@sveltejs/adapter-static';

// CDN deployment: set MGT_CDN_BASE to rewrite _app/ URLs to a CDN origin.
// Example: MGT_CDN_BASE=https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/v2.0.0
// When unset, all assets are served locally (standard dist/ deployment).
const CDN_BASE = process.env.MGT_CDN_BASE || '';

// Base path: set BASE_PATH for deployments under a subpath (e.g. GitHub Pages).
// Example: BASE_PATH=/modernGraphTool
const BASE_PATH = process.env.BASE_PATH || '';

// One version name per build. SvelteKit defaults it to `Date.now()` at each config load,
// and a build loads this file more than once — again in the worker that writes the
// fallback index.html. When two loads straddle a millisecond, index.html and the client
// chunks disagree on the `__sveltekit_*` global and the page boots blank. Workers inherit
// process.env, so the first load's value wins everywhere.
process.env.MGT_BUILD_VERSION ??= Date.now().toString();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: 'index.html', // Apache serves index.html by default; also handles share-link URLs
			precompress: false
		}),
		paths: {
			base: BASE_PATH,
			assets: CDN_BASE
		},
		prerender: { handleHttpError: 'warn' },
		version: { name: process.env.MGT_BUILD_VERSION }
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
