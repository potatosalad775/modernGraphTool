import { resolve } from '$app/paths';
import type { Path } from '$app/types';
import { getLocale } from '#lib/paraglide/runtime.js';
import { graphStore } from './graph-store.svelte.js';
import FRParser from '#lib/utils/fr-parser.js';
import FRSmoother from '#lib/utils/fr-smoother.js';
import {
	alignDFToBoundCenter,
	resolvePreferenceBoundEntries,
	type PreferenceBoundEntry
} from '#lib/utils/preference-bound.js';
import { getConfigValue } from '#lib/utils/config.js';
import type { ChannelData, FRDataPoint } from '#lib/types/data-types.js';

/** Parsed, unsmoothed curves for one entry, tagged with the entry they belong to. */
interface ParsedBound {
	name: string;
	upper: ChannelData;
	lower: ChannelData;
	df: ChannelData;
}

/**
 * PreferenceBoundStore — which preference bound is shown, and its source data.
 *
 * The operator lists one or more bounds under `PREFERENCE_BOUND.BOUND_LIST`, each a base
 * target plus its offset files. At most one is selected; selecting none hides the overlay.
 *
 * This state deliberately does NOT live in a component. The selector row sits in the target
 * list, which can be collapsed (genuinely unmounted) and unmounts on every panel switch. With
 * the selection scoped to a component, the operator's `ENABLE_BOUND_ON_INITIAL_LOAD` default
 * would only apply once the row first rendered, and the overlay would be torn down with it.
 * `GraphContainer` owns the effects that trigger loading and push state into the engine
 * overlay, matching how the spectrum and sound-range overlays are driven.
 */
class PreferenceBoundStore {
	entries = $state.raw<PreferenceBoundEntry[]>([]);
	/** Name of the selected entry, or `null` when the overlay is off. */
	selectedName = $state<string | null>(null);

	// Parsed source curves for the most recently loaded entry. Smoothing and normalization are
	// applied downstream as derived state so the bounds follow the graph controls.
	#parsed = $state.raw<ParsedBound | null>(null);

	#hydrated = false;
	/** Fetch + parse promises keyed by URL — entries sharing a target or bound file reuse them. */
	#curveCache = new Map<string, Promise<ChannelData>>();
	#pendingName: string | null = null;

	// ── Derived view state ────────────────────────────────────────────────────

	/** Only the selected entry's curves; a stale entry's data never shows under a new name. */
	#current = $derived(
		this.#parsed && this.#parsed.name === this.selectedName ? this.#parsed : null
	);

	#boundU = $derived(
		this.#current ? FRSmoother.smooth(this.#current.upper.data, graphStore.smoothValue) : null
	);

	#boundD = $derived(
		this.#current ? FRSmoother.smooth(this.#current.lower.data, graphStore.smoothValue) : null
	);

	// Aligned by the band's center rather than the DF's own value — see alignDFToBoundCenter.
	#dfNormalized = $derived.by((): ChannelData | null => {
		const df = this.#current?.df;
		const upper = this.#boundU;
		const lower = this.#boundD;
		if (!df || !upper || !lower) return null;
		const smoothed: ChannelData = {
			...df,
			data: FRSmoother.smooth(df.data, graphStore.smoothValue)
		};
		try {
			return alignDFToBoundCenter(
				smoothed,
				upper,
				lower,
				graphStore.normType,
				graphStore.normHzValue
			);
		} catch {
			return smoothed;
		}
	});

	/** Operator config — the feature exists only when at least one bound is configured. */
	get isEnabled(): boolean {
		return this.entries.length > 0;
	}
	get isVisible(): boolean {
		return this.selectedName !== null;
	}
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
		return this.#current !== null;
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

		this.entries = resolvePreferenceBoundEntries(
			getConfigValue('PREFERENCE_BOUND') as Record<string, unknown> | undefined,
			getLocale()
		);
		this.selectedName =
			this.entries.length > 0 && getConfigValue('PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD')
				? this.entries[0].name
				: null;
	}

	/**
	 * Fetch + parse the selected entry's curves. Idempotent per entry; a failed fetch is
	 * dropped from the cache so the next call retries it.
	 */
	load(): void {
		const entry = this.entries.find((e) => e.name === this.selectedName);
		if (!entry) return;
		if (this.#parsed?.name === entry.name || this.#pendingName === entry.name) return;
		this.#pendingName = entry.name;

		Promise.all([
			this.#loadCurve(resolve(`data/${entry.upper}` as Path)),
			this.#loadCurve(resolve(`data/${entry.lower}` as Path)),
			this.#loadCurve(this.#targetUrl(entry.target))
		])
			.then(([upper, lower, df]) => {
				// The user may have switched again while this was in flight. The curves stay
				// cached, so switching back is cheap.
				if (this.selectedName !== entry.name) return;
				this.#parsed = { name: entry.name, upper, lower, df };
			})
			.catch((err) => {
				console.error(`PreferenceBound: failed to load "${entry.name}"`, err);
			})
			.finally(() => {
				if (this.#pendingName === entry.name) this.#pendingName = null;
			});
	}

	/** Select `name`, or turn the overlay off when it is already selected. */
	toggle(name: string): void {
		this.selectedName = this.selectedName === name ? null : name;
	}

	// ── Internals ─────────────────────────────────────────────────────────────

	#loadCurve(url: string): Promise<ChannelData> {
		let promise = this.#curveCache.get(url);
		if (!promise) {
			promise = fetch(url)
				.then((r) => {
					if (!r.ok) throw new Error(`Failed to fetch ${url}`);
					return r.text();
				})
				.then((text) => FRParser.parseFRData(text));
			promise.catch(() => this.#curveCache.delete(url));
			this.#curveCache.set(url, promise);
		}
		return promise;
	}

	#targetUrl(target: string): string {
		const base =
			(getConfigValue('PATH.TARGET_MEASUREMENT') as string | undefined) ?? './data/target';
		return `${base}${base.endsWith('/') ? '' : '/'}${target}.txt`;
	}
}

export const preferenceBoundStore = new PreferenceBoundStore();
