import { resolve } from '$app/paths';
import { graphStore } from './graph-store.svelte.js';
import FRParser from '$lib/utils/fr-parser.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import { normalize } from '$lib/utils/fr-normalizer.js';
import { getConfigValue } from '$lib/utils/config.js';
import type { ChannelData, FRDataPoint } from '$lib/types/data-types.js';

/**
 * PreferenceBoundStore — visibility and source data for the preference-range overlay.
 *
 * This state deliberately does NOT live in `PreferenceBound.svelte`. That component
 * renders inside `GraphToolbar`, which on mobile sits in a collapsed accordion
 * (genuinely unmounted, not merely hidden) inside `GraphPanel`. With the visibility
 * flag scoped to the component, the operator's `ENABLE_BOUND_ON_INITIAL_LOAD` default
 * only took effect the first time the user expanded that accordion, and the overlay
 * was torn down again on collapse or on any panel switch. Page-lifetime state fixes
 * both, and makes desktop and mobile behave identically.
 *
 * The component is now just the toggle button; `GraphContainer` owns the effects that
 * trigger loading and push state into the engine overlay, matching how the spectrum
 * and sound-range overlays are already driven.
 */
class PreferenceBoundStore {
	/** Operator config — bounds are only available when a base DF target is configured. */
	isEnabled = $state(false);
	isVisible = $state(false);

	// Parsed, unsmoothed source curves. Fetched once; smoothing and normalization
	// are applied downstream as derived state so the bounds follow the graph controls.
	#parsedU = $state.raw<ChannelData | null>(null);
	#parsedD = $state.raw<ChannelData | null>(null);
	#parsedDF = $state.raw<ChannelData | null>(null);

	#baseDFTarget = '';
	#hydrated = false;
	#loadPromise: Promise<void> | null = null;

	// ── Derived view state ────────────────────────────────────────────────────

	#boundU = $derived(
		this.#parsedU ? FRSmoother.smooth(this.#parsedU.data, graphStore.smoothValue) : null
	);

	#boundD = $derived(
		this.#parsedD ? FRSmoother.smooth(this.#parsedD.data, graphStore.smoothValue) : null
	);

	#dfNormalized = $derived.by((): ChannelData | null => {
		const df = this.#parsedDF;
		if (!df) return null;
		const smoothed: ChannelData = {
			...df,
			data: FRSmoother.smooth(df.data, graphStore.smoothValue)
		};
		try {
			return normalize(smoothed, graphStore.normType, graphStore.normHzValue);
		} catch {
			return smoothed;
		}
	});

	get boundU(): FRDataPoint[] | null {
		return this.#boundU;
	}
	get boundD(): FRDataPoint[] | null {
		return this.#boundD;
	}
	get dfNormalized(): ChannelData | null {
		return this.#dfNormalized;
	}
	get isLoaded(): boolean {
		return this.#parsedU !== null && this.#parsedD !== null && this.#parsedDF !== null;
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	/**
	 * Read operator config. Called once from `AppShell.onMount`, alongside the other
	 * store hydrations — `config.js` is a plain script tag, so config is only
	 * guaranteed present after mount.
	 */
	hydrate(): void {
		if (this.#hydrated) return;
		this.#hydrated = true;

		this.#baseDFTarget =
			(getConfigValue('PREFERENCE_BOUND.BASE_DF_TARGET_FILE') as string | undefined) ?? '';
		this.isEnabled = !!this.#baseDFTarget;
		this.isVisible =
			this.isEnabled &&
			!!(getConfigValue('PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD') ?? false);
	}

	/** Fetch + parse the bound curves. Idempotent; retries only after a failure. */
	load(): void {
		if (!this.isEnabled || this.#loadPromise) return;

		this.#loadPromise = (async () => {
			try {
				const [textU, textD, textDF] = await Promise.all([
					fetch(resolve('/data/Bounds U.txt' as '/', {})).then((r) => r.text()),
					fetch(resolve('/data/Bounds D.txt' as '/', {})).then((r) => r.text()),
					this.#fetchDFTarget()
				]);
				const [boundU, boundD, dfTarget] = await Promise.all([
					FRParser.parseFRData(textU),
					FRParser.parseFRData(textD),
					FRParser.parseFRData(textDF)
				]);
				this.#parsedU = boundU;
				this.#parsedD = boundD;
				this.#parsedDF = dfTarget;
			} catch (err) {
				console.error('PreferenceBound: failed to load data', err);
				this.#loadPromise = null; // Allow retry on failure
			}
		})();
	}

	toggle(): void {
		this.isVisible = !this.isVisible;
	}

	// ── Internals ─────────────────────────────────────────────────────────────

	#fetchDFTarget(): Promise<string> {
		const targetName = this.#baseDFTarget.trim().endsWith(' Target')
			? this.#baseDFTarget
			: `${this.#baseDFTarget} Target`;
		const fileName = targetName.endsWith('.txt') ? targetName : `${targetName}.txt`;
		const base =
			(getConfigValue('PATH.TARGET_MEASUREMENT') as string | undefined) ?? './data/target';
		const url = `${base}${base.endsWith('/') ? '' : '/'}${fileName}`;
		return fetch(url).then((r) => {
			if (!r.ok) throw new Error(`Failed to fetch DF target: ${fileName}`);
			return r.text();
		});
	}
}

export const preferenceBoundStore = new PreferenceBoundStore();
