/**
 * modernGraphTool CDN Loader
 *
 * This script bootstraps modernGraphTool from a CDN. Site operators include
 * this in their thin index.html instead of hosting the full app bundle.
 *
 * It reads the CDN configuration from window.GRAPHTOOL_CONFIG.CDN_MODE,
 * resolves the version, fetches the boot manifest, and starts SvelteKit.
 *
 * Stable URL: https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/loader.js
 */
(async function () {
	'use strict';

	const CDN_BASE_DEFAULT = 'https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn';
	const LOAD_TIMEOUT_MS = 15000;

	// --- Read config ---
	const cfg = (window.GRAPHTOOL_CONFIG && window.GRAPHTOOL_CONFIG.CDN_MODE) || {};
	const cdnBase = (cfg.BASE || CDN_BASE_DEFAULT).replace(/\/+$/, '');
	const requestedMajor = cfg.MAJOR_VERSION;

	// --- Resolve version ---
	let version;
	try {
		const res = await fetchWithTimeout(`${cdnBase}/versions.json`, LOAD_TIMEOUT_MS);
		if (!res.ok) throw new Error(`versions.json: HTTP ${res.status}`);
		const versions = await res.json();

		if (requestedMajor != null) {
			version = versions[String(requestedMajor)];
			if (!version) {
				throw new Error(
					`Major version ${requestedMajor} not found in versions.json. ` +
						`Available: ${Object.keys(versions).join(', ')}`
				);
			}
		} else {
			// Default to the highest major version
			const majors = Object.keys(versions)
				.map(Number)
				.filter((n) => !isNaN(n))
				.sort((a, b) => b - a);
			if (majors.length === 0) throw new Error('No versions found in versions.json');
			version = versions[String(majors[0])];
		}
	} catch (err) {
		showError(
			'Failed to load version information from CDN.',
			err.message,
			'If this persists, switch to a self-hosted deployment (full dist/ folder).'
		);
		return;
	}

	// --- Fetch boot manifest ---
	let boot;
	try {
		const res = await fetchWithTimeout(`${cdnBase}/v${version}/boot.json`, LOAD_TIMEOUT_MS);
		if (!res.ok) throw new Error(`boot.json: HTTP ${res.status}`);
		boot = await res.json();
	} catch (err) {
		showError(
			`Failed to load app version ${version} from CDN.`,
			err.message,
			'Try refreshing the page, or switch to a self-hosted deployment.'
		);
		return;
	}

	// --- Inject CSS ---
	if (boot.css && boot.css.length > 0) {
		for (const url of boot.css) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = url;
			document.head.appendChild(link);
		}
	}

	// --- Inject modulepreload hints ---
	if (boot.preloads && boot.preloads.length > 0) {
		for (const url of boot.preloads) {
			const link = document.createElement('link');
			link.rel = 'modulepreload';
			link.href = url;
			document.head.appendChild(link);
		}
	}

	// --- Set SvelteKit global ---
	// `base` stays empty (local routing), `assets` points to CDN (for dynamic chunk imports)
	window[boot.global_name] = { base: '', assets: boot.assets_base };

	// --- Boot SvelteKit ---
	const appElement = document.querySelector('#app') || document.querySelector('[style*="display: contents"]');
	if (!appElement) {
		showError('Could not find app mount element.', 'Expected #app or an element with display:contents.');
		return;
	}

	try {
		const [kit, app] = await Promise.all([import(boot.start_url), import(boot.app_url)]);
		kit.start(app, appElement);
	} catch (err) {
		showError('Failed to start the application.', err.message, 'Check the browser console for details.');
	}

	// --- Helpers ---

	function fetchWithTimeout(url, ms) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), ms);
		return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
	}

	function showError(title, detail, hint) {
		const el = document.querySelector('#app') || document.body;
		el.innerHTML = `
			<div style="
				display: flex; align-items: center; justify-content: center;
				min-height: 100vh; padding: 2rem;
				font-family: system-ui, -apple-system, sans-serif;
				background: #fafafa; color: #18181b;
			">
				<div style="max-width: 480px; text-align: center;">
					<h1 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem;">
						${escapeHtml(title)}
					</h1>
					${detail ? `<p style="font-size: 0.875rem; color: #71717a; margin-bottom: 0.5rem;">${escapeHtml(detail)}</p>` : ''}
					${hint ? `<p style="font-size: 0.875rem; color: #a1a1aa;">${escapeHtml(hint)}</p>` : ''}
				</div>
			</div>
		`;
	}

	function escapeHtml(str) {
		const div = document.createElement('div');
		div.textContent = str;
		return div.innerHTML;
	}
})();
