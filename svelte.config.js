import adapter from '@sveltejs/adapter-static';

// CDN deployment: set MGT_CDN_BASE to rewrite _app/ URLs to a CDN origin.
// Example: MGT_CDN_BASE=https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/v2.0.0
// When unset, all assets are served locally (standard dist/ deployment).
const CDN_BASE = process.env.MGT_CDN_BASE || '';

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
			assets: CDN_BASE
		},
		prerender: { handleHttpError: 'warn' }
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
