import { replaceState } from '$app/navigation';
import Base62 from './base62.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore, type BaselineMode } from '$lib/stores/graph-store.svelte.js';
import { eqStore, type EQFilter } from '$lib/stores/eq-store.svelte.js';
import { getConfigValue } from './config.js';
import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
import { resolveBaselineChannelData } from '$lib/graph/baseline.js';
import type { SampleChannelKey, HpTFDisplayKey } from '$lib/types/data-types.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface EQStateSnapshot {
	filters: EQFilter[];
	preamp: number;
}

interface URLState {
	yScale?: number;
	baseline?: { key: string; mode: BaselineMode };
	yOffsets?: Record<string, number>;
	eq?: EQStateSnapshot;
	sampleDisplay?: Record<string, SampleChannelKey[]>;
	hptfDisplay?: Record<string, { keys: HpTFDisplayKey[]; fill: boolean }>;
}

// ── URL Provider ─────────────────────────────────────────────────────────────

class URLProvider {
	#baseTitle = '';
	#baseDescription = '';
	#baseURL = '';
	#autoUpdateURL = true;
	#useBase62 = false;
	#phoneDataFromURL: string[] = [];
	#stateFromURL: URLState | null = null;

	/** Call once during app startup (in onMount). */
	init(): void {
		this.#baseTitle = document.querySelector('title')?.textContent || 'modernGraphTool';
		this.#baseDescription =
			document.querySelector('meta[name="description"]')?.getAttribute('content') ||
			'View and compare frequency response graphs';
		this.#baseURL = window.location.href.split('?')[0];
		this.#autoUpdateURL = (getConfigValue('URL.AUTO_UPDATE_URL') as boolean) ?? true;
		this.#useBase62 = (getConfigValue('URL.COMPRESS_URL') as boolean) ?? false;

		this.#loadFromURL();
	}

	// ── Public reads ─────────────────────────────────────────────────────────

	get phoneDataFromURL(): string[] {
		return this.#phoneDataFromURL;
	}

	get stateFromURL(): URLState | null {
		return this.#stateFromURL;
	}

	// ── URL update (called reactively from $effect or on demand) ─────────────

	updateURL(changeURL = true): void {
		const { url, title, namesCombined } = this.#buildURL();

		if (changeURL) {
			const { pathname, search } = new URL(url);
			const newPath = pathname + search;
			const currentPath = window.location.pathname + window.location.search;
			if (newPath !== currentPath) {
				// newPath is already an absolute path (pathname from #baseURL includes
				// the deployment base). Pass it directly to replaceState instead of
				// resolve(), which would prepend base a second time under subpath
				// deployments like /cdn/.
				replaceState(newPath, {});
			}
		}
		document.title = title;
		this.#updateMetaTags(namesCombined);
	}

	/** Auto-update URL if configured. Called from $effect. */
	autoUpdate(): void {
		if (this.#autoUpdateURL) this.updateURL(true);
	}

	/**
	 * Returns a shareable URL that includes the current EQ filter state.
	 */
	getCurrentURLWithEQ(): string {
		const { url } = this.#buildURL({
			filters: eqStore.filters,
			preamp: eqStore.preamp
		});
		return url;
	}

	/** Get the current share URL (without EQ state). */
	getCurrentURL(): string {
		const { url } = this.#buildURL();
		return url;
	}

	toggleBase62(enable: boolean): void {
		this.#useBase62 = enable;
		this.updateURL();
	}

	// ── State restoration (called after initial data loads) ──────────────────

	applyStateFromURL(): void {
		if (!this.#stateFromURL) return;
		const { yScale, baseline, yOffsets, eq, sampleDisplay, hptfDisplay } = this.#stateFromURL;

		if (yScale != null) graphStore.yScale = yScale;

		if (baseline) {
			let matchedUUID: string | null = null;
			for (const [uuid, data] of frStore.entries) {
				const key = (data.identifier + ' ' + (data.dispSuffix ?? '')).trim();
				if (key === baseline.key) {
					matchedUUID = uuid;
					break;
				}
			}
			if (matchedUUID) {
				graphStore.baselineMode = baseline.mode;
				const channelData = resolveBaselineChannelData(matchedUUID, baseline.mode);
				if (graphEngine.isInitialized) {
					graphEngine.updateBaselineData(true, { uuid: matchedUUID, channelData });
				} else {
					graphStore.baselineUUID = matchedUUID;
				}
			}
		}

		if (yOffsets) {
			for (const [uuid, data] of frStore.entries) {
				const key = (data.identifier + ' ' + (data.dispSuffix ?? '')).trim();
				if (key in yOffsets) {
					// Direct store update (no command history for URL restore)
					frStore.set(uuid, { ...data, yOffset: yOffsets[key] });
				}
			}
		}

		if (sampleDisplay) {
			for (const [uuid, data] of frStore.entries) {
				const key = (data.identifier + ' ' + (data.dispSuffix ?? '')).trim();
				if (key in sampleDisplay && data.samples) {
					frStore.set(uuid, { ...data, dispSamples: sampleDisplay[key] });
				}
			}
		}

		if (hptfDisplay) {
			for (const [uuid, data] of frStore.entries) {
				const key = (data.identifier + ' ' + (data.dispSuffix ?? '')).trim();
				if (key in hptfDisplay && data.hptf) {
					frStore.set(uuid, {
						...data,
						dispHptf: hptfDisplay[key].keys as HpTFDisplayKey[],
						hptfFillVisible: hptfDisplay[key].fill
					});
				}
			}
		}

		if (eq && eq.filters.length > 0) {
			eqStore.filters = eq.filters;
			eqStore.preamp = eq.preamp;
			eqStore.isEnabled = true;
		}
	}

	// ── Private ──────────────────────────────────────────────────────────────

	#loadFromURL(): void {
		const urlParams = new URLSearchParams(window.location.search);
		const shareParam = urlParams.get('share');

		if (shareParam) {
			if (shareParam.startsWith('b62_')) {
				const encoded = shareParam.replace('b62_', '');
				this.#phoneDataFromURL = this.#smartSplit(Base62.decode(encoded));
			} else {
				const decodedParam = decodeURI(shareParam).replace(/_/g, ' ');
				this.#phoneDataFromURL = this.#smartSplit(decodedParam);
			}
		}

		const stateParam = urlParams.get('state');
		if (stateParam) {
			try {
				const stateStr = Base62.decode(stateParam);
				this.#stateFromURL = JSON.parse(stateStr);
			} catch {
				// ignore malformed state
			}
		}
	}

	/** Split comma-separated string while respecting parentheses/brackets. */
	#smartSplit(input: string): string[] {
		const result: string[] = [];
		let current = '';
		let parenDepth = 0;

		for (let i = 0; i < input.length; i++) {
			const char = input[i];
			if (char === '(' || char === '[' || char === '{') {
				parenDepth++;
				current += char;
			} else if (char === ')' || char === ']' || char === '}') {
				parenDepth--;
				current += char;
			} else if (char === ',' && parenDepth === 0) {
				if (current.trim()) result.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}

		if (current.trim()) result.push(current.trim());
		return result;
	}

	#buildURL(eq?: EQStateSnapshot): { url: string; title: string; namesCombined: string } {
		const activeNames: string[] = [];
		for (const [, data] of frStore.entries) {
			const name = (data.identifier + ' ' + (data.dispSuffix ?? '')).trim();
			if (name) activeNames.push(name);
		}

		let title = this.#baseTitle;
		let url = this.#baseURL;
		const namesCombined = activeNames.join(', ');

		if (activeNames.length) {
			if (this.#useBase62) {
				const encoded = Base62.encode(activeNames.join(','));
				url += `?share=b62_${encoded}`;
			} else {
				url += `?share=${encodeURI(activeNames.join(','))}`;
			}
			title = title + ' - ' + namesCombined;
		}

		// Encode graph state
		const stateData: URLState = { yScale: graphStore.yScale };
		const defaultYScale =
			parseInt((getConfigValue('VISUALIZATION.DEFAULT_Y_SCALE') as string) || '50') || 50;
		let hasExtraState = graphStore.yScale !== defaultYScale;

		if (graphStore.baselineUUID) {
			const baselineData = frStore.get(graphStore.baselineUUID);
			if (baselineData) {
				const key = (baselineData.identifier + ' ' + (baselineData.dispSuffix ?? '')).trim();
				stateData.baseline = { key, mode: graphStore.baselineMode };
				hasExtraState = true;
			}
		}

		const yOffsets: Record<string, number> = {};
		for (const [, data] of frStore.entries) {
			if (data.yOffset) {
				yOffsets[(data.identifier + ' ' + (data.dispSuffix ?? '')).trim()] = data.yOffset;
				hasExtraState = true;
			}
		}
		if (Object.keys(yOffsets).length) stateData.yOffsets = yOffsets;

		const sampleDisplay: Record<string, SampleChannelKey[]> = {};
		for (const [, data] of frStore.entries) {
			if (data.dispSamples && data.dispSamples.length > 0) {
				sampleDisplay[(data.identifier + ' ' + (data.dispSuffix ?? '')).trim()] = data.dispSamples;
				hasExtraState = true;
			}
		}
		if (Object.keys(sampleDisplay).length) stateData.sampleDisplay = sampleDisplay;

		const hptfDisplay: Record<string, { keys: HpTFDisplayKey[]; fill: boolean }> = {};
		for (const [, data] of frStore.entries) {
			if (data.hptf) {
				const key = (data.identifier + ' ' + (data.dispSuffix ?? '')).trim();
				hptfDisplay[key] = {
					keys: data.dispHptf ?? [],
					fill: data.hptfFillVisible ?? false
				};
				hasExtraState = true;
			}
		}
		if (Object.keys(hptfDisplay).length) stateData.hptfDisplay = hptfDisplay;

		if (eq && eq.filters.length > 0) {
			stateData.eq = eq;
			hasExtraState = true;
		}

		if (hasExtraState) {
			const stateStr = JSON.stringify(stateData);
			const sep = url.includes('?') ? '&' : '?';
			url += `${sep}state=${Base62.encode(stateStr)}`;
		}

		return { url, title, namesCombined };
	}

	#updateMetaTags(namesCombined: string): void {
		const canonicalLink = document.querySelector("link[rel='canonical']");
		if (canonicalLink) {
			canonicalLink.setAttribute('href', namesCombined ? window.location.href : this.#baseURL);
		}

		const metaDescription = document.querySelector("meta[name='description']");
		if (metaDescription && namesCombined) {
			metaDescription.setAttribute(
				'content',
				`View and compare frequency response graph of ${namesCombined}.`
			);
		}
	}
}

export const urlProvider = new URLProvider();
