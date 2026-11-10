import type {
	Channel,
	FRDataType,
	FRDataObject,
	FRColors,
	ParsedFRData,
	FRInputMetadata,
	PhoneMetadata,
	SampleData,
	SampleDisplayKey,
	RawFRCache
} from '#lib/types/data-types.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { targetAdjustmentStore } from '#lib/stores/target-adjustment-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { eqCurve } from './eq-curve.svelte.js';
import {
	getChannelValue,
	getColorForType,
	getDashForType,
	insertRawCurve
} from './curve-insert.js';
import {
	curveDataFromRaw,
	pickChannels,
	renormalizedCurveData,
	type CurveData
} from './curve-data.js';
import {
	AddFRDataCommand,
	RemoveFRDataCommand,
	UpdateDisplayChannelCommand,
	UpdateColorsCommand,
	UpdateDashPatternCommand,
	UpdateVisibilityCommand,
	UpdateVariantCommand,
	UpdateFRDataWithRawDataCommand,
	UpdateYOffsetCommand,
	UpdateSampleDisplayCommand
} from './commands.js';
import FRParser from '#lib/utils/fr-parser.js';
import { sampleRunLabel } from '#lib/utils/eq-source.js';
import { sampleKey } from '#lib/utils/sample-key.js';
import type { FRParseResult } from '#lib/utils/fr-parser.js';
import { normalizeChannels } from '#lib/utils/fr-normalizer.js';
import { averageChannels, isAveragable } from '#lib/utils/fr-average.js';
import { defaultSampleDisplay } from '#lib/utils/sample-config.js';
import {
	downloadBaseName,
	encodeFRDataForDownload,
	encodeSampleRunsForDownload
} from '#lib/utils/fr-encoder.js';
import { downloadBlob, downloadText } from '#lib/utils/download-text.js';
import { zipTextFiles } from '#lib/utils/zip-text.js';
import * as m from '#lib/paraglide/messages.js';
import MetadataParser from '#lib/utils/metadata-parser.js';
import { analyticsService } from './analytics-service.svelte.js';
import { toast } from 'svelte-sonner';

class DataProvider {
	// ─── Add ─────────────────────────────────────────────────────────────────────

	async addFRData(
		sourceType: FRDataType,
		identifier: string,
		inputMetadata: FRInputMetadata = {}
	): Promise<void> {
		if (this.isFRDataLoaded(identifier, inputMetadata.dispSuffix)) return;

		let metaData;
		let rawData;
		try {
			metaData = MetadataParser.getFRMetadata(sourceType, identifier);
			rawData = await FRParser.getFRDataFromMetadata(
				sourceType,
				metaData,
				inputMetadata.dispSuffix ?? ''
			);
		} catch {
			const label = identifier.replace(/ Target$/, '');
			toast.error(
				sourceType === 'target'
					? m.selection_list_load_failed_target({ label })
					: m.selection_list_load_failed_device({ label })
			);
			return;
		}
		const rawCache = this.#buildRawCache(rawData);
		const curve = curveDataFromRaw(rawCache, sourceType);
		const channels = Object.keys(curve.channels) as Channel[];

		const dispSuffix =
			inputMetadata.dispSuffix ?? (metaData as PhoneMetadata).files?.[0]?.suffix ?? '';

		const colors = getColorForType(sourceType);

		const frObject: FRDataObject = {
			uuid: crypto.randomUUID(),
			type: sourceType,
			identifier: metaData.identifier,
			channels: curve.channels,
			...(curve.unadjustedChannels && { unadjustedChannels: curve.unadjustedChannels }),
			dispChannel: getChannelValue(sourceType, channels),
			dispSuffix,
			colors,
			dash: getDashForType(sourceType, metaData.identifier),
			meta: metaData,
			_rawData: rawCache
		};

		Object.assign(frObject, this.#buildSampleFields(rawData, colors, curve));

		commandHistory.execute(new AddFRDataCommand(frObject), frStore);
		this.syncPhoneChannels();

		if (sourceType === 'phone') {
			const phoneMeta = metaData as PhoneMetadata;
			analyticsService.trackPhoneEvent('phone_added', {
				brand: phoneMeta.brand,
				model: phoneMeta.name,
				variant: frObject.dispSuffix ?? ''
			});
		}
	}

	// ─── Remove ──────────────────────────────────────────────────────────────────

	removeFRData(sourceType: FRDataType, identifier: string, dispSuffix?: string): void {
		for (const [uuid, data] of frStore.entries) {
			if (
				data.identifier === identifier &&
				(dispSuffix === undefined || (data.dispSuffix ?? '') === dispSuffix)
			) {
				commandHistory.execute(new RemoveFRDataCommand(uuid, sourceType), frStore);

				if (sourceType === 'phone' && data.meta && 'brand' in data.meta) {
					analyticsService.trackPhoneEvent('phone_removed', {
						brand: data.meta.brand,
						model: data.meta.name,
						variant: data.dispSuffix ?? ''
					});
				}
				return;
			}
		}
	}

	removeFRDataWithUUID(sourceType: FRDataType, uuid: string): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new RemoveFRDataCommand(uuid, sourceType), frStore);
	}

	/**
	 * Download a curve as displayed — smoothing, normalization, target adjustments
	 * and EQ are already baked into `frStore`'s `channels` by the time this reads
	 * it, so no separate "apply the modifications" step is needed here. One .txt
	 * file per displayed channel (see fr-encoder.ts); for a sample set that is the
	 * average, plus every run when `runs` is set. More than one file goes out as a
	 * single .zip.
	 */
	async downloadFRDataWithUUID(uuid: string, { runs = false } = {}): Promise<void> {
		const item = frStore.get(uuid);
		if (!item) return;
		const files = encodeFRDataForDownload(item);
		if (runs) {
			files.push(...encodeSampleRunsForDownload(item, (i) => sampleRunLabel(item.samples![i], i)));
		}
		if (files.length === 0) return;
		if (files.length === 1) {
			downloadText(files[0].text, files[0].filename);
			return;
		}
		downloadBlob(await zipTextFiles(files), `${downloadBaseName(item)}.zip`);
	}

	async toggleFRData(
		sourceType: FRDataType,
		identifier: string,
		enabled: boolean,
		dispSuffix?: string
	): Promise<void> {
		if (enabled) await this.addFRData(sourceType, identifier, { dispSuffix });
		else this.removeFRData(sourceType, identifier, dispSuffix);
	}

	// ─── Insert raw ──────────────────────────────────────────────────────────────

	async insertRawFRData(
		sourceType: FRDataType,
		identifier: string,
		rawData: ParsedFRData,
		inputMetadata: FRInputMetadata = {}
	): Promise<void> {
		insertRawCurve(sourceType, identifier, rawData, inputMetadata);
	}

	// ─── Average every visible phone ─────────────────────────────────────────

	/**
	 * Insert the mean of every visible phone curve as a new curve.
	 *
	 * Lands as an `inserted-phone` through `insertRawFRData`, which makes it a
	 * first-class citizen for free: hideable, recolorable, removable, selectable
	 * as an EQ source or a baseline, downloadable, and undoable in one step.
	 *
	 * Averages the **raw** cached channels rather than the drawn ones so the
	 * result carries a real `_rawData` and re-smooths with everything else. The
	 * curves agree either way — see `averageChannels` on why the two orders are
	 * equivalent.
	 *
	 * It is a **snapshot**, not a live view: adding or removing a device
	 * afterwards leaves it untouched. A live average would have to decide what to
	 * do when it is itself one of the visible curves, and would fight undo/redo
	 * on every source change. The suffix carries the contributor count so a stale
	 * one is at least self-describing.
	 *
	 * Returns the number of curves that contributed, or 0 when there was nothing
	 * to do — the caller owns the messaging.
	 */
	averageVisiblePhones(labels: { identifier: string; dispSuffix: string }): number {
		const sources = [...frStore.entries.values()].filter(isAveragable);
		if (sources.length < 2) return 0;

		const averaged = averageChannels(
			sources.map((item) => ({
				// Raw when it's cached (always, for anything loaded through the normal
				// paths) and the drawn channels only as a fallback, so a curve that
				// somehow lost its cache still contributes rather than vanishing.
				channels: item._rawData?.channels ?? item.channels,
				dispChannel: item.dispChannel
			}))
		);

		const channels = Object.keys(averaged) as Channel[];
		if (channels.length === 0) return 0;

		this.insertRawFRData('phone', labels.identifier, averaged, {
			// Show exactly what was produced. `getChannelValue` would collapse an
			// L+R average down to L alone, since it assumes an AVG channel exists
			// whenever more than one channel does.
			dispChannel: channels,
			dispSuffix: labels.dispSuffix
		});

		return sources.length;
	}

	// ─── Target customizer adjustments ────────────────────────────────────────

	/**
	 * Rebuild a target's curve from its unadjusted channels plus the current slider stack
	 * in `targetAdjustmentStore`.
	 *
	 * Callable without a mounted `TargetCustomizer` — that component only drives the
	 * UI now. `reSmoothAll()` in particular rebuilds targets from raw source data, and
	 * used to rely on a mounted customizer noticing and re-applying; with the Graph tab
	 * closed the adjustment was dropped for good.
	 *
	 * Normalizes but does NOT re-smooth. `unadjustedChannels` are channels that
	 * already went through smooth → normalize, and the tilt/shelf stack on top is a
	 * smooth analytic curve with nothing to filter out. Running the result through
	 * `DataProcessor.processChannels` would smooth it a second time and blur the target — the
	 * channels carry their smoothing marker, so `FRSmoother` passes them through rather
	 * than doing that. Normalization is kept so a shelf adjustment can't drag the target
	 * off the anchor point.
	 */
	applyTargetAdjustment(uuid: string): void {
		const existing = frStore.get(uuid);
		const unadjusted = existing?.unadjustedChannels;
		if (!existing || !unadjusted) return;

		const adjusted = targetAdjustmentStore.adjustedChannels(uuid, unadjusted);
		const processed = normalizeChannels(adjusted, graphStore.normType, graphStore.normHzValue);

		const updated: FRDataObject = {
			...existing,
			channels: pickChannels(processed),
			adjustmentLabel: targetAdjustmentStore.label(uuid)
		};
		// TargetCustomizer re-applies on every mount, i.e. on every panel switch. Landing an
		// unchanged result would leave an undo entry that Ctrl+Z "reverses" to the same picture.
		if (this.#drawsSame(existing, updated)) return;
		commandHistory.execute(new UpdateFRDataWithRawDataCommand(uuid, updated), frStore);
	}

	/** Whether `next` draws exactly what `current` does: same channels, points and label. */
	#drawsSame(current: FRDataObject, next: FRDataObject): boolean {
		if (current.adjustmentLabel !== next.adjustmentLabel) return false;
		const keys = Object.keys(current.channels) as Channel[];
		if (keys.length !== Object.keys(next.channels).length) return false;
		return keys.every((key) => {
			const a = current.channels[key]?.data;
			const b = next.channels[key]?.data;
			return (
				!!a &&
				!!b &&
				a.length === b.length &&
				a.every(([f, d], i) => f === b[i][0] && d === b[i][1])
			);
		});
	}

	/**
	 * Re-apply every target adjustment on record — used after a global re-process. A target the
	 * user has no adjustment record for (`TargetCustomizer` registers one per target) has nothing
	 * to put back on top of its freshly rebuilt curve.
	 */
	#reapplyTargetAdjustments(): void {
		for (const [uuid, item] of [...frStore.entries]) {
			if (item.unadjustedChannels && targetAdjustmentStore.has(uuid)) {
				this.applyTargetAdjustment(uuid);
			}
		}
	}

	// ─── Update variant ───────────────────────────────────────────────────────

	async updateVariant(uuid: string, dispSuffix: string): Promise<void> {
		const data = frStore.get(uuid);
		if (!data?.meta) throw new Error(`No data found for UUID: ${uuid}`);

		let rawData;
		try {
			rawData = await FRParser.getFRDataFromMetadata('phone', data.meta, dispSuffix);
		} catch {
			toast.error(m.selection_list_load_failed_variant({ label: dispSuffix || data.identifier }));
			return;
		}
		const variantRawCache = this.#buildRawCache(rawData);
		const curve = curveDataFromRaw(variantRawCache, data.type);
		const channels = Object.keys(curve.channels) as Channel[];
		const dispChannel = (
			data.dispChannel.every((ch) => channels.includes(ch)) ? [...data.dispChannel] : [channels[0]]
		) as Channel[];

		// Bundle every field the new variant touches into one command so undo/redo
		// stays atomic — see UpdateVariantCommand doc comment.
		const newFields: Partial<FRDataObject> = {
			channels: curve.channels,
			unadjustedChannels: curve.unadjustedChannels,
			dispSuffix,
			dispChannel,
			_rawData: variantRawCache
		};

		// Sample fields are re-derived from the new variant's own declaration —
		// `display` is a per-variant property, so carrying the previous variant's
		// toggles over would silently override what the operator declared. Only the
		// user's per-run curve picks survive, and only where they still resolve.
		Object.assign(
			newFields,
			this.#buildSampleFields(rawData, data.colors, curve, data.dispSamples ?? undefined)
		);

		commandHistory.execute(new UpdateVariantCommand(uuid, newFields), frStore);
	}

	// ─── Update sample display ────────────────────────────────────────────────

	/** Set which runs are drawn, and whether the fill and the average are drawn.
	 *  `showFill` / `showAvg` default to the item's current state so callers that
	 *  only touch the per-run picks don't have to restate them. */
	updateSampleDisplay(
		uuid: string,
		dispSamples: SampleDisplayKey[],
		showFill?: boolean,
		showAvg?: boolean
	): void {
		const data = frStore.get(uuid);
		if (!data) return;
		commandHistory.execute(
			new UpdateSampleDisplayCommand(
				uuid,
				dispSamples,
				showFill ?? data.showFill ?? false,
				showAvg ?? data.showAvg ?? true
			),
			frStore
		);
	}

	// ─── Re-normalize all loaded data ─────────────────────────────────────────

	renormalizeAll(): void {
		const eqUUID = eqStore.eqCurveUUID;

		for (const [uuid, data] of frStore.entries) {
			// Skip the linked EQ curve — it will be rebuilt from the source below.
			if (settingsStore.linkEqNormalization && uuid === eqUUID) continue;

			// Channels, a target's unadjusted channels (so `withoutAdjustment` baselines stay on
			// the same reference) and the sample set (re-anchored against the same pooled
			// reference, envelope rebuilt from the shifted runs) are normalized, never re-smoothed.
			frStore.set(uuid, { ...data, ...renormalizedCurveData(data) });
		}

		// No re-apply pass here, unlike reSmoothAll: the loop above normalized each
		// target's already-adjusted channels in place, so the customizer stack is still
		// baked in. Re-applying would be a no-op anyway — normalization only subtracts a
		// constant offset, so normalize(original + adjustment) lands on the same curve
		// whether the original was normalized before the adjustment or after it.

		// Rebuild the EQ curve after the source phone has been renormalized.
		// Reacts to the current `linkEqNormalization` setting: linked → smooth-only,
		// unlinked → smooth + independent normalization.
		eqCurve.rebuild();

		// Invalidate history since snapshots are now stale
		commandHistory.clear();
	}

	// ─── Re-smooth all loaded data (called by SmoothingButton) ───────────────

	async reSmoothAll(): Promise<void> {
		const eqUUID = eqStore.eqCurveUUID;
		for (const [uuid, data] of frStore.entries) {
			// Skip the EQ curve — it is rebuilt from the re-smoothed source below. Its
			// `_rawData` is the filtered source's drawn (already smoothed) channels, so
			// re-smoothing that would smooth twice.
			if (uuid === eqUUID) continue;

			const rawCache = data._rawData;

			if (rawCache) {
				// Re-smooth from cached raw data (no network fetch)
				frStore.set(uuid, { ...data, ...curveDataFromRaw(rawCache, data.type) });
			} else if (data.meta && (data.type === 'phone' || data.type === 'target')) {
				// Fallback: no cache, fetch from network
				try {
					const rawData = await FRParser.getFRDataFromMetadata(
						data.type,
						data.meta,
						data.dispSuffix ?? ''
					);
					// Same builder as the cached branch: the runs and their envelope are
					// rebuilt at the new smoothing too, or a set fetched down this path
					// keeps run curves smoothed differently from its own average.
					const fallbackCache = this.#buildRawCache(rawData);
					frStore.set(uuid, {
						...data,
						...curveDataFromRaw(fallbackCache, data.type),
						_rawData: fallbackCache
					});
				} catch {
					// Keep existing data on failure
				}
			}
		}
		// Targets were rebuilt from raw (pre-adjustment) source data above, so their
		// customizer stacks have to go back on top — this no longer depends on a
		// mounted TargetCustomizer to happen.
		this.#reapplyTargetAdjustments();

		// Rebuild the EQ curve from the newly re-smoothed source phone, same as
		// renormalizeAll — respects the current linkEqNormalization setting.
		eqCurve.rebuild();

		commandHistory.clear();
	}

	// ─── Field updates ────────────────────────────────────────────────────────

	updateDisplayChannel(uuid: string, channel: Channel[]): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateDisplayChannelCommand(uuid, channel), frStore);
	}

	updateColors(uuid: string, colors: FRColors): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateColorsCommand(uuid, colors), frStore);
	}

	updateDashPattern(uuid: string, dash: string): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateDashPatternCommand(uuid, dash), frStore);
	}

	updateVisibility(uuid: string, hidden: boolean): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateVisibilityCommand(uuid, hidden), frStore);
	}

	updateYOffset(uuid: string, yOffset: number): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateYOffsetCommand(uuid, yOffset), frStore);
	}

	// ─── Reads ────────────────────────────────────────────────────────────────

	isFRDataLoaded(identifier: string, suffix?: string): boolean {
		for (const data of frStore.entries.values()) {
			if (data.identifier === identifier) {
				if (!suffix || data.dispSuffix === suffix) return true;
			}
		}
		return false;
	}

	/**
	 * Sync channel display across all loaded phones so it matches the current phone
	 * count (single phone shows L+R when available; multiple phones collapse to AVG).
	 * Called after adding a phone, and after undo/redo (from AppShell's keyboard
	 * handler) since undoing/redoing an Add or Remove changes the phone count these
	 * writes depend on but isn't itself tracked through command history — the writes
	 * here are a derived display convention, not user-editable state, so they're
	 * idempotently re-applied rather than snapshotted/undone.
	 */
	syncPhoneChannels(): void {
		const phones = [...frStore.entries.values()].filter((e) => e.type === 'phone');
		if (phones.length > 1) {
			for (const phone of phones) {
				const dispChannel = Object.keys(phone.channels).includes('AVG')
					? (['AVG'] as const)
					: ([Object.keys(phone.channels)[0]] as Channel[]);
				frStore.set(phone.uuid, { ...phone, dispChannel: [...dispChannel] });
			}
		} else if (phones.length === 1) {
			const phone = phones[0];
			const keys = Object.keys(phone.channels);
			const dispChannel: Channel[] =
				keys.includes('L') && keys.includes('R')
					? ['L', 'R']
					: keys.includes('AVG')
						? ['AVG']
						: [keys[0] as Channel];
			frStore.set(phone.uuid, { ...phone, dispChannel });
		}
	}

	// ─── Private helpers ──────────────────────────────────────────────────────

	// ─── Sample-set helpers ──────────────────────────────────────────────────

	/** Cache the raw (unsmoothed, unnormalized) payload for `reSmoothAll`. */
	#buildRawCache(rawData: FRParseResult): RawFRCache {
		const cache: RawFRCache = {
			channels: pickChannels(rawData)
		};
		if (rawData._samples?.length) {
			cache.samples = rawData._samples;
			if (rawData._sampleLabels) cache.sampleLabels = rawData._sampleLabels;
			if (rawData._sampleDisplay) cache.sampleDisplay = rawData._sampleDisplay;
			if (rawData._sampleDescription) cache.sampleDescription = rawData._sampleDescription;
		}
		return cache;
	}

	/**
	 * Every sample-set field an FRDataObject carries, derived in one place.
	 *
	 * Both `addFRData` and `updateVariant` used to keep their own near-identical
	 * copies of this — one for multi-sample, one for HpTF, four blocks in total.
	 * Fields are always returned, `undefined` when the item has no set, so
	 * `UpdateVariantCommand` clears them rather than leaving the previous
	 * variant's set attached.
	 *
	 * Display decisions only: `curve` is the already-processed runs and envelope
	 * (`curveDataFromRaw`), so this never processes anything itself.
	 */
	#buildSampleFields(
		rawData: FRParseResult,
		baseColors: FRColors,
		curve: CurveData,
		previousDispSamples?: SampleDisplayKey[]
	): Partial<FRDataObject> {
		const { samples, envelope } = curve;
		if (!rawData._samples?.length || !samples) {
			return {
				samples: undefined,
				dispSamples: undefined,
				showAvg: undefined,
				showFill: undefined,
				envelope: undefined,
				sampleDescription: undefined
			};
		}

		const display = rawData._sampleDisplay ?? defaultSampleDisplay();
		const loadedKeys = this.#getLoadedSampleKeys(samples);

		// Preserve the user's per-run picks across a variant switch, but only the
		// ones that still name a run with data in the new set.
		const carried = previousDispSamples?.filter((k) => loadedKeys.includes(k));

		return {
			samples,
			colors: this.#addSampleColors(baseColors, samples),
			// Computed whether or not `fill` is on: the user can turn the fill on at any
			// time, and recomputing on toggle would mean threading the processing
			// params through the UI.
			envelope,
			showAvg: display.includes('avg'),
			showFill: display.includes('fill'),
			dispSamples: carried?.length ? carried : display.includes('curves') ? loadedKeys : [],
			sampleDescription: rawData._sampleDescription
		};
	}

	/** Add per-run colors to an existing FRColors object */
	#addSampleColors(baseColors: FRColors, samples: SampleData[]): FRColors {
		const sampleColors: Record<string, string> = {};
		samples.forEach((sample, i) => {
			// Same color as the corresponding channel — rendered at reduced opacity.
			if (sample.L) sampleColors[sampleKey(i, 'L')] = baseColors.L ?? baseColors.AVG;
			if (sample.R) sampleColors[sampleKey(i, 'R')] = baseColors.R ?? baseColors.AVG;
			if (sample.AVG) sampleColors[sampleKey(i, 'AVG')] = baseColors.AVG;
		});
		return { ...baseColors, samples: sampleColors };
	}

	/**
	 * One display key per run that actually loaded — AVG where both channels are
	 * present, else whichever single channel is. Guards against missing files
	 * (e.g. the fallback-to-unnumbered layout, where only run 1 has data).
	 */
	#getLoadedSampleKeys(samples: SampleData[]): SampleDisplayKey[] {
		const keys: SampleDisplayKey[] = [];
		samples.forEach((sample, i) => {
			if (sample.AVG) keys.push(sampleKey(i, 'AVG'));
			else if (sample.L) keys.push(sampleKey(i, 'L'));
			else if (sample.R) keys.push(sampleKey(i, 'R'));
		});
		return keys;
	}
}

export const dataProvider = new DataProvider();
