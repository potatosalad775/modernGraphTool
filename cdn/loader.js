/**
 * modernGraphTool CDN Loader
 *
 * This script bootstraps modernGraphTool from a CDN. Site operators include
 * this in their thin index.html instead of hosting the full app bundle.
 *
 * It reads the CDN configuration from window.GRAPHTOOL_CONFIG.CDN_MODE,
 * resolves the version, fetches the boot manifest, and starts SvelteKit.
 *
 * Config keys (all optional, under window.GRAPHTOOL_CONFIG.CDN_MODE):
 *   MAJOR_VERSION — pin to a major version (default: highest available)
 *   BASE          — CDN base URL (default: jsDelivr)
 *   VERSIONS_URL  — full URL to versions.json (default: raw.githubusercontent.com
 *                   derived from BASE). We fetch this from GitHub directly to
 *                   sidestep jsDelivr's edge cache, which otherwise pins stale
 *                   version maps for hours. Override if you host your own fork
 *                   of the cdn branch or use a non-GitHub origin.
 *   BASE_PATH     — deployment subpath (e.g. "/cdn"). Set this when deploying
 *                   under a subdirectory *and* using share-link deep routes so
 *                   the loader can't auto-detect the base from the URL. For
 *                   root deployments or "cdn-index.html"-style entries, leave
 *                   unset — the loader auto-detects.
 *   VERSION       — pin one exact release ("2.3.1"). Skips versions.json, so the
 *                   site no longer updates itself. Wins over MAJOR_VERSION.
 *   BOOT_INTEGRITY — "sha384-…" of that release's boot.json; needs VERSION. The
 *                   loader refuses a boot.json that does not match. Published per
 *                   release in pins.json on the cdn branch, next to the commit to
 *                   point BASE at.
 *
 * Trust chain: index.html → this file → versions.json → boot.json → the app's
 * files. boot.json may only name files under BASE's own repository (or BASE itself
 * for a self-hosted mirror), and carries a hash for each one, which the browser
 * checks. So the cdn branch is the one thing a default deployment trusts; a pinned
 * deployment (VERSION + BOOT_INTEGRITY + this file loaded by commit with an
 * `integrity` attribute) trusts only the hashes in its own index.html and config.js.
 * Operator docs: guide-for-admins/deployment/cdn.mdx.
 *
 * Stable URL: https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/loader.js
 */
(async function () {
	'use strict';

	const CDN_BASE_DEFAULT = 'https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn';
	const LOAD_TIMEOUT_MS = 15000;
	const SRI = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

	// --- Read config ---
	const cfg = (window.GRAPHTOOL_CONFIG && window.GRAPHTOOL_CONFIG.CDN_MODE) || {};
	const cdnBase = (cfg.BASE || CDN_BASE_DEFAULT).replace(/\/+$/, '');
	const requestedMajor = cfg.MAJOR_VERSION;
	const pinnedVersion = cfg.VERSION;
	const bootIntegrity = cfg.BOOT_INTEGRITY;

	// Resolve versions.json URL. Default: derive raw.githubusercontent.com from
	// cdnBase so we bypass jsDelivr's edge cache for this one file. Falls back
	// to `${cdnBase}/versions.json` if cdnBase isn't a recognizable jsDelivr
	// gh/ URL (e.g. operator pointed BASE at their own server).
	const primaryVersionsUrl =
		cfg.VERSIONS_URL || rawGhVersionsUrl(cdnBase) || `${cdnBase}/versions.json`;
	// jsDelivr-hosted backup. Only used if the primary fetch fails with a
	// network/5xx error — a stale version map is better than a blank page.
	// Skipped when the primary URL already points at jsDelivr.
	const fallbackVersionsUrl = `${cdnBase}/versions.json`;
	const useFallback = primaryVersionsUrl !== fallbackVersionsUrl;

	// --- Resolve version ---
	let version;
	// versions.json carries each major's boot manifest, which saves the boot.json round trip.
	let boot = null;
	if (pinnedVersion != null) {
		if (!/^\d+\.\d+\.\d+$/.test(String(pinnedVersion))) {
			showError(
				'CDN_MODE.VERSION is not a version number.',
				`Expected a release such as "2.3.1", got ${JSON.stringify(pinnedVersion)}.`
			);
			return;
		}
		version = String(pinnedVersion);
	} else if (bootIntegrity) {
		// A hash can only match one release; with updates on it would break at the next one.
		showError(
			'CDN_MODE.BOOT_INTEGRITY needs CDN_MODE.VERSION.',
			'Set VERSION to the release the hash belongs to, or remove BOOT_INTEGRITY.'
		);
		return;
	} else {
		try {
			const versions = await fetchVersions(
				primaryVersionsUrl,
				useFallback ? fallbackVersionsUrl : null
			);

			let major = requestedMajor;
			if (major != null) {
				version = versions[String(major)];
				if (!version) {
					throw new Error(
						`Major version ${major} not found in versions.json. ` +
							`Available: ${Object.keys(versions)
								.filter((k) => !isNaN(Number(k)))
								.join(', ')}`
					);
				}
			} else {
				// Default to the highest major version
				const majors = Object.keys(versions)
					.map(Number)
					.filter((n) => !isNaN(n))
					.sort((a, b) => b - a);
				if (majors.length === 0) throw new Error('No versions found in versions.json');
				major = majors[0];
				version = versions[String(major)];
			}

			const embedded = versions.boot && versions.boot[String(major)];
			if (embedded && embedded.version === version) boot = embedded;
		} catch (err) {
			showError(
				'Failed to load version information from CDN.',
				err.message,
				'If this persists, switch to a self-hosted deployment (full dist/ folder).'
			);
			return;
		}
	}

	// --- Fetch boot manifest ---
	try {
		if (!boot) {
			// A hash-pinned manifest never changes, so it may come from any cache.
			const url = `${cdnBase}/v${version}/boot.json`;
			const res = await fetchWithTimeout(
				bootIntegrity ? url : `${url}?t=${Date.now()}`,
				LOAD_TIMEOUT_MS
			);
			if (!res.ok) throw new Error(`boot.json: HTTP ${res.status}`);
			const bytes = await res.arrayBuffer();
			if (bootIntegrity) await verifyIntegrity(bytes, bootIntegrity);
			boot = JSON.parse(new TextDecoder().decode(bytes));
		}
		checkBootManifest(boot);
	} catch (err) {
		showError(
			`Failed to load app version ${version} from CDN.`,
			err.message,
			'Try refreshing the page, or switch to a self-hosted deployment.'
		);
		return;
	}

	// --- Subresource integrity ---
	// boot.integrity maps each file (relative to assets_base) to its hash. Stylesheets and
	// preloads take it as an attribute; chunks imported later can only get it from an import
	// map, which has to be in the document before the first module loads.
	const assetsPrefix = boot.assets_base.replace(/\/+$/, '') + '/';
	const hashes = boot.integrity && typeof boot.integrity === 'object' ? boot.integrity : null;
	const hashFor = (url) => {
		if (!hashes || !url.startsWith(assetsPrefix)) return null;
		const hash = hashes[url.slice(assetsPrefix.length)];
		return typeof hash === 'string' && SRI.test(hash) ? hash : null;
	};
	if (hashes && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap')) {
		const integrity = {};
		for (const path of Object.keys(hashes)) {
			const hash = hashFor(assetsPrefix + path);
			if (hash && /\.m?js$/.test(path)) integrity[assetsPrefix + path] = hash;
		}
		// A page with a Content-Security-Policy blocks this inline tag, and one that requires
		// Trusted Types refuses the text. Either way the app still loads: the lazily imported
		// chunks just go unchecked, while the links below keep their hashes.
		try {
			const map = document.createElement('script');
			map.type = 'importmap';
			map.textContent = JSON.stringify({ integrity });
			document.head.appendChild(map);
		} catch {
			// Nothing to do.
		}
	}
	const addLink = (rel, url) => {
		const link = document.createElement('link');
		link.rel = rel;
		const hash = hashFor(url);
		if (hash) {
			link.integrity = hash;
			link.crossOrigin = 'anonymous';
		}
		link.href = url;
		document.head.appendChild(link);
	};

	// --- Inject CSS ---
	for (const url of boot.css || []) addLink('stylesheet', url);

	// --- Inject modulepreload hints ---
	for (const url of boot.preloads || []) addLink('modulepreload', url);

	// --- Resolve base path ---
	// Operator override via CDN_MODE.BASE_PATH; otherwise auto-detect from URL.
	// Auto-detection strips an "*.html" filename from the pathname so SvelteKit
	// sees the directory as the root route. For non-HTML paths (direct route
	// visits like /share/abc) we cannot infer the base reliably — those cases
	// need the explicit BASE_PATH override.
	const pathname = window.location.pathname;
	const lastSlash = pathname.lastIndexOf('/');
	const isHtmlFile = /\.html?$/i.test(pathname);
	let baseDir;
	if (cfg.BASE_PATH != null) {
		baseDir = String(cfg.BASE_PATH).replace(/\/+$/, '');
	} else if (isHtmlFile) {
		baseDir = lastSlash > 0 ? pathname.slice(0, lastSlash) : '';
	} else {
		baseDir = '';
	}

	// Normalize the URL so SvelteKit's router sees the directory (root route)
	// instead of the literal .html filename. This is what makes direct visits
	// to /cdn/cdn-index.html resolve to the root route under base "/cdn".
	if (isHtmlFile) {
		const normalized = baseDir + '/' + window.location.search + window.location.hash;
		if (normalized !== pathname + window.location.search + window.location.hash) {
			history.replaceState(null, '', normalized);
		}
	}

	// --- Patch fetch to work around jsDelivr CORS on _app/version.json ---
	// SvelteKit's version check (runtime/client/utils.js) sends
	//   headers: { pragma: 'no-cache', 'cache-control': 'no-cache' }
	// jsDelivr's Access-Control-Allow-Headers does not include `cache-control`,
	// so the preflight fails. Strip those headers and cache-bust via a query
	// param instead. Scoped narrowly to `_app/version.json`.
	// Must be installed before importing the SvelteKit client modules.
	const __nativeFetch = window.fetch.bind(window);
	window.fetch = function (input, init) {
		const url = typeof input === 'string' ? input : (input && input.url) || '';
		if (url.indexOf('/_app/version.json') !== -1) {
			const headers = new Headers((init && init.headers) || undefined);
			headers.delete('cache-control');
			headers.delete('pragma');
			const cacheBusted = url + (url.indexOf('?') !== -1 ? '&' : '?') + '_=' + Date.now();
			return __nativeFetch(cacheBusted, { ...(init || {}), headers });
		}
		return __nativeFetch(input, init);
	};

	// --- Set SvelteKit global ---
	// `base` is the deployment subpath (empty for root deployments).
	// `assets` points to the CDN (for dynamic chunk imports).
	// `version` is the build's app version; SvelteKit 3 reads it from this payload rather than
	// baking it in, and compares it against _app/version.json.
	const payload = { base: baseDir, assets: boot.assets_base };
	if (boot.app_version != null) payload.version = boot.app_version;
	window[boot.global_name] = payload;

	// --- Boot SvelteKit ---
	const appElement =
		document.querySelector('#app') || document.querySelector('[style*="display: contents"]');
	if (!appElement) {
		showError(
			'Could not find app mount element.',
			'Expected #app or an element with display:contents.'
		);
		return;
	}

	try {
		// SvelteKit 3's start entry loads the client runtime only once `init(payload)` runs, and
		// the app entry must evaluate after it ($app/paths reads the payload at import time). Both
		// files are already modulepreloaded, so the sequencing costs no extra round trip.
		// SvelteKit 2 builds (older pinned versions) have no `init` and read the global directly.
		const kit = await import(boot.start_url);
		if (typeof kit.init === 'function') kit.init(payload);
		const app = await import(boot.app_url);
		await kit.start(app, appElement);
	} catch (err) {
		showError(
			'Failed to start the application.',
			err.message,
			'Check the browser console for details.'
		);
	}

	// --- Helpers ---

	function fetchWithTimeout(url, ms) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), ms);
		return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
	}

	// Fetch versions.json from the primary URL. On network/5xx failure (but not
	// 4xx — those indicate a misconfiguration that should surface), retry from
	// the fallback URL. Returns parsed JSON or throws.
	async function fetchVersions(primaryUrl, fallbackUrl) {
		try {
			const res = await fetchWithTimeout(`${primaryUrl}?t=${Date.now()}`, LOAD_TIMEOUT_MS);
			if (res.ok) return await res.json();
			if (res.status >= 400 && res.status < 500) {
				throw new Error(`versions.json: HTTP ${res.status}`);
			}
			throw new Error(`versions.json: HTTP ${res.status}`);
		} catch (primaryErr) {
			const isClientError = /HTTP 4\d\d/.test(primaryErr.message);
			if (!fallbackUrl || isClientError) throw primaryErr;
			try {
				const res = await fetchWithTimeout(`${fallbackUrl}?t=${Date.now()}`, LOAD_TIMEOUT_MS);
				if (!res.ok) {
					throw new Error(`versions.json (fallback): HTTP ${res.status}`, { cause: primaryErr });
				}
				return await res.json();
			} catch (fallbackErr) {
				throw new Error(`${primaryErr.message}; fallback failed: ${fallbackErr.message}`, {
					cause: fallbackErr
				});
			}
		}
	}

	// Translate a jsDelivr gh/ URL like
	//   https://cdn.jsdelivr.net/gh/owner/repo@ref
	// to the matching raw.githubusercontent.com URL for versions.json:
	//   https://raw.githubusercontent.com/owner/repo/ref/versions.json
	// Returns null if the input isn't a recognizable jsDelivr gh/ URL.
	function rawGhVersionsUrl(base) {
		const m = base.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/@]+)@([^/]+)\/?$/);
		if (!m) return null;
		const [, owner, repo, ref] = m;
		return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/versions.json`;
	}

	// Where boot.json may point. For a jsDelivr gh/ base that is the repository at any ref —
	// the app's files are pinned to a commit, not to the branch BASE names. Anywhere else it
	// is BASE itself.
	function trustedPrefix(base) {
		const m = base.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/[^/]+\/[^/@]+@)[^/]+$/);
		return m ? m[1] : new URL(base + '/', location.href).href;
	}

	// Everything in the manifest ends up as a script or stylesheet URL, so a manifest that
	// names another host is refused rather than loaded.
	function checkBootManifest(manifest) {
		if (!manifest || typeof manifest !== 'object') throw new Error('boot.json is not an object');
		if (!/^__sveltekit_[a-z0-9]+$/.test(manifest.global_name)) {
			throw new Error('boot.json: unexpected global_name');
		}
		const prefix = trustedPrefix(cdnBase);
		const urls = [manifest.assets_base, manifest.start_url, manifest.app_url]
			.concat(manifest.preloads || [])
			.concat(manifest.css || []);
		for (const url of urls) {
			let href = null;
			try {
				href = typeof url === 'string' ? new URL(url, location.href).href : null;
			} catch {
				// An unparseable URL fails the check below.
			}
			if (!href || !href.startsWith(prefix)) {
				throw new Error(`boot.json points outside ${prefix}: ${String(url)}`);
			}
		}
	}

	async function verifyIntegrity(bytes, expected) {
		const m = typeof expected === 'string' && expected.match(SRI);
		if (!m) throw new Error('CDN_MODE.BOOT_INTEGRITY must look like "sha384-…"');
		if (!window.crypto || !window.crypto.subtle) {
			throw new Error('CDN_MODE.BOOT_INTEGRITY needs a page served over HTTPS');
		}
		const digest = await window.crypto.subtle.digest(`SHA-${m[1]}`, bytes);
		const actual = btoa(String.fromCharCode(...new Uint8Array(digest)));
		if (`sha${m[1]}-${actual}` !== expected) {
			throw new Error('boot.json does not match CDN_MODE.BOOT_INTEGRITY');
		}
	}

	// Built node by node: this file must also run under a Trusted Types policy.
	function showError(title, detail, hint) {
		const el = document.querySelector('#app') || document.body;
		const outer = document.createElement('div');
		outer.style.cssText =
			'display: flex; align-items: center; justify-content: center; min-height: 100vh;' +
			' padding: 2rem; font-family: system-ui, -apple-system, sans-serif;' +
			' background: #fafafa; color: #18181b;';
		const box = document.createElement('div');
		box.style.cssText = 'max-width: 480px; text-align: center;';
		const line = (tag, text, css) => {
			if (!text) return;
			const node = document.createElement(tag);
			node.style.cssText = css;
			node.textContent = text;
			box.appendChild(node);
		};
		line('h1', title, 'font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem;');
		line('p', detail, 'font-size: 0.875rem; color: #52525b; margin-bottom: 0.5rem;');
		line('p', hint, 'font-size: 0.875rem; color: #52525b;');
		outer.appendChild(box);
		el.replaceChildren(outer);
	}
})();
