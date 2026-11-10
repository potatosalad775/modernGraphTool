import type { FRDataObject, ParsedFRData } from '#lib/types/data-types.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import FRParser from '#lib/utils/fr-parser.js';
import { DataProcessor } from '#lib/utils/data-processor.js';
import FRSmoother from '#lib/utils/fr-smoother.js';
import { Equalizer, isPlayableBand, type EQFilter } from '#lib/utils/equalizer.js';
import { effectiveFilters, hasPerChannelFilters } from '#lib/utils/eq-channel.js';
import { eqSourceChannels, eqSourceRun, sampleRunLabel } from '#lib/utils/eq-source.js';
import { derivePreamp, headroomPreamp } from '#lib/utils/eq-preamp.js';
import { insertRawCurve } from './curve-insert.js';
import { untrack } from 'svelte';

/**
 * The derived EQ curve: the `frStore` item showing the EQ source with the current EQ applied,
 * and the preamp derivation that feeds it. `DataProvider` calls `rebuild()` after it rebuilds
 * the source phone (renormalizeAll / reSmoothAll), so this module must not import it.
 */
class EqCurve {
	#syncInstalled = false;
	/** Source uuid + `dispChannel` the EQ curve last followed; see `#dispChannel`. */
	#sourceChannelKey: string | null = null;

	/** Current processing params from graph store */
	get #processingParams() {
		return {
			smoothValue: graphStore.smoothValue,
			normType: graphStore.normType,
			normHz: graphStore.normHzValue
		};
	}

	/**
	 * Keep the on-graph EQ curve in step with `eqStore`, for the lifetime of the page.
	 *
	 * This used to be an `$effect` inside `EqualizerPanel.svelte`, which AppShell
	 * unmounts on every panel switch — so the only reactive caller of
	 * `rebuild()` existed only while the Equalizer tab was open. The `\`
	 * momentary A/B key is global (`AppShell`'s `<svelte:window onkeydown>`) and
	 * flips `eqStore.isEnabled` from anywhere: pressing it on the Graph tab changed
	 * the audio while the curve on screen kept showing the EQ'd response, and only
	 * caught up the next time the user opened the Equalizer panel.
	 *
	 * The preamp is derived here too, for the same reason: it lived in
	 * `EqFilterList`, so filters changed from another panel — a global undo, or
	 * AutoEQ's auto-apply following a target tilted in the Graph panel — kept
	 * the old preamp, which offset the curve and could let the audio clip.
	 *
	 * Installed once from `AppShell.onMount` and never disposed — same shape as
	 * `audioPlayerService`, which owns its filter chain the same way and for the
	 * same reason.
	 */
	installSync(): void {
		if (this.#syncInstalled) return;
		this.#syncInstalled = true;

		$effect.root(() => {
			// Declared first, so the curve effect below sees this pass's preamp.
			$effect(() => {
				const filters = eqStore.filters;
				const linked = eqStore.linkedPreamp;
				// A device connected here takes Auto's value on its own grid, rounded down: what is
				// shown and played is what a write sends. Over the link, uniPEQ's value already is.
				const conn = devicePeqStore.connection;
				const local = conn && conn.connectionType !== 'link' ? conn : null;
				const derived = derivePreamp(filters);
				const next =
					linked && (!linked.auto || linked.filters === filters)
						? linked.preamp
						: local
							? headroomPreamp(
									derived,
									local.profile.preamp,
									local.device.capabilities.writesPreamp
								)
							: derived;
				untrack(() => {
					if (eqStore.preamp !== next) eqStore.preamp = next;
				});
			});

			$effect(() => {
				// Track the inputs; the curve math itself is untracked so its writes
				// to frStore can't feed back into this effect.
				const sourceUUID = eqStore.sourcePhoneUUID;
				void eqStore.sourceSample;
				void eqStore.isEnabled;
				void eqStore.filters;
				void eqStore.preamp;
				void settingsStore.linkEqNormalization;
				// Re-fire when the source phone data itself changes (e.g. renormalizeAll).
				if (sourceUUID) void frStore.get(sourceUUID);

				untrack(() => this.rebuild());
			});
		});
	}

	// ─── Rebuild the EQ preview curve from current eqStore + source phone ────

	/**
	 * Recomputes the EQ-modified curve in frStore from the current source phone,
	 * filters, preamp, and smoothing settings. When `settingsStore.linkEqNormalization`
	 * is on, the curve is smoothed but NOT independently normalized — it inherits
	 * the source phone's normalization, keeping the two curves visually tied
	 * regardless of how radical the EQ is.
	 *
	 * This is the single source of truth for EQ curve construction. The reactive
	 * caller is `installSync()` above; `DataProvider.renormalizeAll()` and
	 * `reSmoothAll()` call it directly after rebuilding the source phone.
	 */
	rebuild(): void {
		const sourceUUID = eqStore.sourcePhoneUUID;
		if (!eqStore.isEnabled || !sourceUUID) {
			this.#remove();
			return;
		}

		const sourceData = frStore.get(sourceUUID);
		if (!sourceData) return;

		const enabledFilters = eqStore.filters.filter(isPlayableBand);
		const preamp = eqStore.preamp;
		if (enabledFilters.length === 0 && preamp === 0) {
			this.#remove();
			return;
		}

		const linked = settingsStore.linkEqNormalization;
		const modified = this.#modifiedChannels(
			eqSourceChannels(sourceData, eqStore.sourceSample),
			enabledFilters,
			preamp,
			linked
		);
		eqStore.eqModifiedData.set(sourceUUID, modified);

		const processed = this.#processChannels(modified, linked);

		const existingUUID = eqStore.eqCurveUUID;
		const existing = existingUUID ? frStore.get(existingUUID) : null;
		// Name the run in the label: an EQ'd run and the EQ'd average are different curves.
		const run = eqSourceRun(sourceData, eqStore.sourceSample);
		const dispSuffix = run ? `(EQ · ${sampleRunLabel(run, eqStore.sourceSample!.index)})` : '(EQ)';

		if (existing && existingUUID) {
			frStore.set(existingUUID, {
				...existing,
				channels: {
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				},
				dispSuffix,
				dispChannel: this.#dispChannel(sourceUUID, sourceData, existing, processed),
				colors: { ...sourceData.colors },
				_rawData: { channels: modified }
			});
		} else {
			const uuid = crypto.randomUUID();
			const frObject: FRDataObject = {
				uuid,
				type: 'eq',
				identifier: sourceData.identifier,
				dispSuffix,
				channels: {
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				},
				dispChannel: this.#dispChannel(sourceUUID, sourceData, null, processed),
				colors: { ...sourceData.colors },
				dash: sourceData.dash || '1 0',
				hidden: false,
				yOffset: 0,
				_rawData: { channels: modified }
			};
			frStore.set(uuid, frObject);
			eqStore.eqCurveUUID = uuid;
		}
	}

	/**
	 * The current EQ source with `filters` applied, built exactly like the live EQ
	 * curve: `raw` is the filtered source before EQ processing (what the live curve's
	 * `_rawData` caches — already smoothed, since the source's drawn channels are),
	 * `processed` what gets drawn. The preamp is the one these filters derive. `null`
	 * with no source picked. Used by History & Compare for the A/B ghost trace.
	 */
	channelsFor(filters: EQFilter[]): { raw: ParsedFRData; processed: ParsedFRData } | null {
		const sourceUUID = eqStore.sourcePhoneUUID;
		const sourceData = sourceUUID ? frStore.get(sourceUUID) : null;
		if (!sourceData) return null;
		const enabled = filters.filter(isPlayableBand);
		const linked = settingsStore.linkEqNormalization;
		const raw = this.#modifiedChannels(
			eqSourceChannels(sourceData, eqStore.sourceSample),
			enabled,
			derivePreamp(enabled),
			linked
		);
		return { raw, processed: this.#processChannels(raw, linked) };
	}

	/**
	 * Insert the current EQ source with `filters` applied as a frozen curve, like
	 * `averageVisiblePhones`: an `inserted-phone`, so hiding, recoloring and undo
	 * come for free. Returns false with no source picked.
	 *
	 * Built from the source's raw cache, not its drawn channels: the frozen curve
	 * re-smooths with everything else, and smoothing already-smoothed data would
	 * blur it twice. The drawn channels are only a fallback for a source that
	 * somehow lost its cache.
	 */
	insertFrozen(filters: EQFilter[], name: string): boolean {
		const sourceUUID = eqStore.sourcePhoneUUID;
		const sourceData = sourceUUID ? frStore.get(sourceUUID) : null;
		if (!sourceData) return false;
		const enabled = filters.filter(isPlayableBand);
		const raw = this.#modifiedChannels(
			this.#rawSourceChannels(sourceData) ?? eqSourceChannels(sourceData, eqStore.sourceSample),
			enabled,
			derivePreamp(enabled),
			settingsStore.linkEqNormalization
		);
		const channels = Object.keys(raw) as ('L' | 'R' | 'AVG')[];
		if (channels.length === 0) return false;
		insertRawCurve(
			'phone',
			sourceData.identifier,
			raw,
			{
				dispChannel: sourceData.dispChannel.filter((ch) => channels.includes(ch)),
				dispSuffix: `(EQ · ${name})`
			},
			this.#processingParams
		);
		return true;
	}

	/** `eqSourceChannels`, read from the source's raw cache; null when it has none. */
	#rawSourceChannels(sourceData: FRDataObject): ParsedFRData | null {
		const cache = sourceData._rawData;
		if (!cache) return null;
		if (!eqSourceRun(sourceData, eqStore.sourceSample)) return cache.channels;
		const run = cache.samples?.[eqStore.sourceSample!.index];
		if (!run) return null;
		// Raw runs carry no AVG — processing derives it — so derive it the same way
		const avg = run.AVG ?? (run.L && run.R ? FRParser._computeAvgChannel(run.L, run.R) : null);
		return {
			...(run.L && { L: run.L }),
			...(run.R && { R: run.R }),
			...(avg && { AVG: avg })
		};
	}

	/**
	 * The source's channels with `filters` (already narrowed to complete, enabled
	 * bands) applied — the unsmoothed half of the EQ curve.
	 */
	#modifiedChannels(
		sourceChannels: ParsedFRData,
		enabledFilters: EQFilter[],
		preamp: number,
		linked: boolean
	): ParsedFRData {
		// Linked mode treats preamp as a pure playback gain (audio player + hardware
		// PEQ export both read eqStore.preamp directly). The on-screen EQ curve only
		// visualizes the filter response so peak/dip filters stay anchored to the
		// source ghost regardless of whether the user added headroom compensation.
		const applyPreamp = preamp !== 0 && !linked;

		const eq = new Equalizer();
		const modified: ParsedFRData = {};
		const perChannel = hasPerChannelFilters(enabledFilters);
		for (const ch of ['L', 'R', 'AVG'] as const) {
			const chData = sourceChannels[ch];
			if (!chData) continue;
			// Each ear gets the shared bands plus its own. AVG is handled below —
			// averaging the source and then EQ-ing it would apply both ears'
			// corrections to a single curve.
			const chFilters =
				ch === 'AVG'
					? enabledFilters.filter((f) => f.channel == null)
					: effectiveFilters(enabledFilters, ch);
			let points = chData.data;
			if (chFilters.length > 0) {
				points = eq.applyFilters(points, chFilters);
			}
			if (applyPreamp) {
				points = points.map(([f, d]) => [f, d + preamp] as [number, number]);
			}
			modified[ch] = { data: points, metadata: { ...chData.metadata } };
		}

		// With per-channel bands the EQ'd average is the average of the EQ'd
		// channels, not the shared bands laid over the source average — otherwise
		// AVG silently ignores every single-ear correction. Same pointwise dB mean
		// the rest of the pipeline uses (`anchorAndNormalizeSamples`).
		// Needs both ears: a phone measured as one curve has no per-ear structure
		// to average, and there the shared-only pass above is already right.
		// Only ever rewrites an AVG the source already had — never invents one.
		if (perChannel && modified.AVG && modified.L && modified.R) {
			modified.AVG = {
				data: modified.L.data.map(
					([freq, lDb], i) => [freq, (lDb + modified.R!.data[i][1]) / 2] as [number, number]
				),
				metadata: { ...modified.AVG.metadata }
			};
		}
		return modified;
	}

	/**
	 * Linked mode: smooth only. The absolute dB values already encode
	 * "source_normalized + filter_effect" — skipping normalization preserves that
	 * relationship. Unlinked mode: smooth + renormalize.
	 *
	 * For the live curve "smooth" is a pass-through: it is built on the source's drawn
	 * channels, already smoothed and tagged at the current value, so the EQ'd curve is
	 * the drawn source plus the exact filter response. Smoothing it again would blur
	 * the source twice. A frozen curve (`insertFrozen`) starts from raw, so it is
	 * smoothed here for real.
	 */
	#processChannels(modified: ParsedFRData, linked: boolean): ParsedFRData {
		return linked
			? FRSmoother.smoothChannels(modified, graphStore.smoothValue)
			: DataProcessor.processChannels(modified, this.#processingParams);
	}

	/**
	 * The EQ curve's displayed channels: its own, unless the source's just changed.
	 *
	 * Copying the source's `dispChannel` on every rebuild made the EQ curve's own
	 * channel picker undo itself on the next filter edit. Following the source only
	 * when the source's choice changes keeps both: switching the source still
	 * carries the EQ curve along, and a channel picked on the EQ curve sticks.
	 * A choice naming a channel the curve no longer has falls back to the source.
	 */
	#dispChannel(
		sourceUUID: string,
		sourceData: FRDataObject,
		existing: FRDataObject | null,
		channels: ParsedFRData
	): ('L' | 'R' | 'AVG')[] {
		const key = `${sourceUUID}:${sourceData.dispChannel.join('+')}`;
		const sourceChanged = key !== this.#sourceChannelKey;
		this.#sourceChannelKey = key;
		if (existing && !sourceChanged && existing.dispChannel.every((ch) => channels[ch])) {
			return existing.dispChannel;
		}
		return [...sourceData.dispChannel];
	}

	#remove(): void {
		const uuid = eqStore.eqCurveUUID;
		if (uuid) {
			frStore.delete(uuid);
			eqStore.eqCurveUUID = null;
		}
		this.#sourceChannelKey = null;
		eqStore.eqModifiedData.clear();
	}
}

export const eqCurve = new EqCurve();
