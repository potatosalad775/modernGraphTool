import { goto } from '$app/navigation';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { getConfigValue } from './config.js';
import { sanitizeChannel } from './eq-channel.js';
import { baseline } from '#lib/graph/baseline.js';
import {
	buildQueryString,
	normalizeSampleDisplay,
	parseShareParam,
	parseStateParam,
	shareKey,
	type EQStateSnapshot,
	type SampleDisplayState,
	type URLState
} from './url-state.js';

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
				// the deployment base). Pass it directly to goto instead of resolve(),
				// which would prepend base a second time under subpath deployments
				// like /cdn/.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto(newPath, { shallow: true, replace: true }).catch((err) =>
					console.error('URLProvider: failed to update the URL', err)
				);
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
		const { yScale, baseline: savedBaseline, yOffsets, eq } = this.#stateFromURL;
		const sampleDisplay = normalizeSampleDisplay(this.#stateFromURL);

		if (yScale != null) graphStore.yScale = yScale;

		// `mode` is hand-editable, so the baseline module validates it.
		if (savedBaseline) baseline.restoreFromURL(savedBaseline);

		if (yOffsets) {
			for (const [uuid, data] of frStore.entries) {
				const key = shareKey(data);
				if (key in yOffsets) {
					// Direct store update (no command history for URL restore)
					frStore.set(uuid, { ...data, yOffset: yOffsets[key] });
				}
			}
		}

		for (const [uuid, data] of frStore.entries) {
			const entry = sampleDisplay[shareKey(data)];
			if (entry && data.samples) {
				frStore.set(uuid, {
					...data,
					dispSamples: entry.keys,
					showFill: entry.fill,
					showAvg: entry.avg
				});
			}
		}

		if (eq && eq.filters.length > 0) {
			// `channel` comes from a hand-editable URL, so narrow it rather than
			// trusting it — an unknown value would make a band belong to no ear
			// and quietly vanish from every scoped view.
			eqStore.filters = eq.filters.map((f) => {
				const channel = sanitizeChannel(f.channel);
				return channel ? { ...f, channel } : { ...f, channel: undefined };
			});
			eqStore.preamp = eq.preamp;
			eqStore.isEnabled = true;
		}
	}

	// ── Private ──────────────────────────────────────────────────────────────

	#loadFromURL(): void {
		const urlParams = new URLSearchParams(window.location.search);
		this.#phoneDataFromURL = parseShareParam(urlParams.get('share'));
		this.#stateFromURL = parseStateParam(urlParams.get('state'));
	}

	#buildURL(eq?: EQStateSnapshot): { url: string; title: string; namesCombined: string } {
		const activeNames: string[] = [];
		for (const [, data] of frStore.entries) {
			const name = shareKey(data);
			if (name) activeNames.push(name);
		}

		let title = this.#baseTitle;
		let url = this.#baseURL;
		const namesCombined = activeNames.join(', ');

		if (activeNames.length) title = title + ' - ' + namesCombined;

		// Collect graph state from the stores; url-state decides what makes the URL.
		const stateData: URLState = { yScale: graphStore.yScale };

		const defaultYScale =
			parseInt((getConfigValue('VISUALIZATION.DEFAULT_Y_SCALE') as string) || '50') || 50;

		// A dormant baseline (its item removed) is not in effect, so it is not written.
		const baselineUUID = baseline.uuid;
		const baselineItem = baselineUUID ? frStore.get(baselineUUID) : null;
		if (baselineItem) stateData.baseline = { key: shareKey(baselineItem), mode: baseline.mode };

		const yOffsets: Record<string, number> = {};
		for (const [, data] of frStore.entries) {
			if (data.yOffset) {
				yOffsets[shareKey(data)] = data.yOffset;
			}
		}
		if (Object.keys(yOffsets).length) stateData.yOffsets = yOffsets;

		// Only the current shape is written. `hptfDisplay` is read on the way in
		// (see normalizeSampleDisplay) and never emitted again.
		const sampleDisplay: Record<string, SampleDisplayState> = {};
		for (const [, data] of frStore.entries) {
			if (!data.samples?.length) continue;
			sampleDisplay[shareKey(data)] = {
				keys: data.dispSamples ?? [],
				fill: data.showFill ?? false,
				avg: data.showAvg ?? true
			};
		}
		if (Object.keys(sampleDisplay).length) stateData.sampleDisplay = sampleDisplay;

		if (eq && eq.filters.length > 0) stateData.eq = eq;

		url += buildQueryString(activeNames, stateData, defaultYScale, this.#useBase62);

		return { url, title, namesCombined };
	}

	#updateMetaTags(namesCombined: string): void {
		const canonicalLink = document.querySelector("link[rel='canonical']");
		if (canonicalLink) {
			canonicalLink.setAttribute('href', namesCombined ? window.location.href : this.#baseURL);
		}

		const metaDescription = document.querySelector("meta[name='description']");
		if (metaDescription) {
			metaDescription.setAttribute(
				'content',
				namesCombined
					? `View and compare frequency response graph of ${namesCombined}.`
					: this.#baseDescription
			);
		}
	}
}

export const urlProvider = new URLProvider();
