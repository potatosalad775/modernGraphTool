import type {
	FRDataType,
	FRDataObject,
	FRDataPoint,
	FRColors,
	ParsedFRData,
	FRInputMetadata,
	PhoneMetadata,
	SampleData,
	SampleDisplayKey,
	SampleEnvelope,
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
import type { FRParseResult } from '#lib/utils/fr-parser.js';
import { normalizeChannels } from '#lib/utils/fr-normalizer.js';
import { averageChannels, isAveragable } from '#lib/utils/fr-average.js';
import { DataProcessor, anchorAndNormalizeSamples } from '#lib/utils/data-processor.js';
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
	/** Current processing params from graph store */
	get #processingParams() {
		return {
			smoothValue: graphStore.smoothValue,
			normType: graphStore.normType,
			normHz: graphStore.normHzValue
		};
	}

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
		const processed = DataProcessor.processChannels(rawData, this.#processingParams);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];

		const dispSuffix =
			inputMetadata.dispSuffix ?? (metaData as PhoneMetadata).files?.[0]?.suffix ?? '';

		const colors = getColorForType(sourceType);

		const frObject: FRDataObject = {
			uuid: crypto.randomUUID(),
			type: sourceType,
			identifier: metaData.identifier,
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
			dispChannel: getChannelValue(sourceType, channels),
			dispSuffix,
			colors,
			dash: getDashForType(sourceType, metaData.identifier),
			meta: metaData,
			_rawData: rawCache
		};

		Object.assign(frObject, this.#buildSampleFields(rawData, colors));

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
			files.push(
				...encodeSampleRunsForDownload(item, (i) => `${m.selection_list_samples_run()} ${i + 1}`)
			);
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
		insertRawCurve(sourceType, identifier, rawData, inputMetadata, this.#processingParams);
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

		const channels = Object.keys(averaged) as ('L' | 'R' | 'AVG')[];
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

	// ─── Update raw data (EQ preview) ─────────────────────────────────────────

	updateFRDataWithRawData(
		uuid: string,
		rawData: ParsedFRData,
		opts: {
			identifier?: string | null;
			dispSuffix?: string | null;
			adjustmentLabel?: string | null;
		} = {}
	): void {
		const existing = frStore.get(uuid);
		if (!existing) return;
		const processed = DataProcessor.processChannels(rawData, this.#processingParams);
		const updated: FRDataObject = {
			...existing,
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
			identifier: opts.identifier ?? existing.identifier,
			dispSuffix: opts.dispSuffix ?? existing.dispSuffix,
			adjustmentLabel: 'adjustmentLabel' in opts ? opts.adjustmentLabel : existing.adjustmentLabel
		};
		commandHistory.execute(new UpdateFRDataWithRawDataCommand(uuid, updated), frStore);
	}

	// ─── Target customizer adjustments ────────────────────────────────────────

	/**
	 * Rebuild a customizable target's curve from its cached pre-adjustment channels
	 * plus the current slider stack in `targetAdjustmentStore`.
	 *
	 * Callable without a mounted `TargetCustomizer` — that component only drives the
	 * UI now. `reSmoothAll()` in particular rebuilds targets from raw source data, and
	 * used to rely on a mounted customizer noticing `targetOriginalVersion` and
	 * re-applying; with the Graph tab closed the adjustment was dropped for good.
	 *
	 * Normalizes but does NOT re-smooth. `targetOriginalData` is a snapshot of channels
	 * that already went through smooth → normalize, and the tilt/shelf stack on top is a
	 * smooth analytic curve with nothing to filter out. Sending the result back through
	 * `updateFRDataWithRawData` would smooth it a second time and blur the target — the
	 * channels carry their smoothing marker, so `FRSmoother` passes them through rather
	 * than doing that. Normalization is kept so a shelf adjustment can't drag the target
	 * off the anchor point.
	 */
	applyTargetAdjustment(uuid: string): void {
		const existing = frStore.get(uuid);
		const original = graphStore.targetOriginalData.get(uuid);
		if (!existing || !original) return;

		const adjusted = targetAdjustmentStore.adjustedChannels(uuid, original);
		const processed = normalizeChannels(adjusted, graphStore.normType, graphStore.normHzValue);

		const updated: FRDataObject = {
			...existing,
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
			adjustmentLabel: targetAdjustmentStore.label(uuid)
		};
		commandHistory.execute(new UpdateFRDataWithRawDataCommand(uuid, updated), frStore);
	}

	/** Re-apply every known target adjustment — used after a global re-process. */
	#reapplyTargetAdjustments(): void {
		for (const uuid of graphStore.targetOriginalData.keys()) {
			this.applyTargetAdjustment(uuid);
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
		const processed = DataProcessor.processChannels(rawData, this.#processingParams);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];
		const dispChannel = (
			data.dispChannel.every((ch) => channels.includes(ch)) ? [...data.dispChannel] : [channels[0]]
		) as ('L' | 'R' | 'AVG')[];

		// Bundle every field the new variant touches into one command so undo/redo
		// stays atomic — see UpdateVariantCommand doc comment.
		const newFields: Partial<FRDataObject> = {
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
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
			this.#buildSampleFields(rawData, data.colors, data.dispSamples ?? undefined)
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
		const { normType, normHzValue } = graphStore;
		const eqUUID = eqStore.eqCurveUUID;
		let targetOriginalTouched = false;

		for (const [uuid, data] of frStore.entries) {
			// Skip the linked EQ curve — it will be rebuilt from the source below.
			if (settingsStore.linkEqNormalization && uuid === eqUUID) continue;

			const processed = normalizeChannels(data.channels, normType, normHzValue);
			const updated: FRDataObject = {
				...data,
				channels: {
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				}
			};
			// Re-anchor the sample set against the same pooled reference the main
			// channels use, then rebuild the envelope from the shifted runs.
			if (data.samples) {
				const reNormed = anchorAndNormalizeSamples(data.samples, normType, normHzValue);
				updated.samples = reNormed;
				updated.envelope = this.#computeAllEnvelopes(reNormed);
			}
			frStore.set(uuid, updated);

			// Keep the cached pre-adjustment target channels aligned with the new
			// normalization so `withoutAdjustment` baselines remain correct and
			// TargetCustomizer can re-apply filters on top of it.
			const cachedOriginal = graphStore.targetOriginalData.get(uuid);
			if (cachedOriginal) {
				graphStore.targetOriginalData.set(
					uuid,
					normalizeChannels(cachedOriginal, normType, normHzValue)
				);
				targetOriginalTouched = true;
			}
		}

		// No re-apply pass here, unlike reSmoothAll: the loop above normalized each
		// target's already-adjusted channels in place, so the customizer stack is still
		// baked in. Re-applying would be a no-op anyway — normalization only subtracts a
		// constant offset, so normalize(original + adjustment) lands on the same curve
		// whether the original was normalized before the adjustment or after it.
		if (targetOriginalTouched) graphStore.targetOriginalVersion++;

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
				const processed = DataProcessor.processChannels(rawCache.channels, this.#processingParams);
				const updated: FRDataObject = {
					...data,
					channels: {
						...(processed.L && { L: processed.L }),
						...(processed.R && { R: processed.R }),
						...(processed.AVG && { AVG: processed.AVG })
					}
				};
				// Re-process the sample set from cache. The envelope has to follow —
				// a different smoothing window moves the runs, so a stale envelope
				// would no longer bound them.
				if (rawCache.samples) {
					const processedSamples = DataProcessor.processSamples(
						rawCache.samples,
						this.#processingParams
					);
					updated.samples = processedSamples;
					updated.envelope = this.#computeAllEnvelopes(processedSamples);
				}
				frStore.set(uuid, updated);

				// Update persisted original data so TargetCustomizer can re-apply adjustments
				if (data.type === 'target' && graphStore.targetOriginalData.has(uuid)) {
					graphStore.targetOriginalData.set(uuid, {
						...(processed.L && { L: processed.L }),
						...(processed.R && { R: processed.R }),
						...(processed.AVG && { AVG: processed.AVG })
					});
				}
			} else if (data.meta && (data.type === 'phone' || data.type === 'target')) {
				// Fallback: no cache, fetch from network
				try {
					const rawData = await FRParser.getFRDataFromMetadata(
						data.type,
						data.meta,
						data.dispSuffix ?? ''
					);
					const fallbackCache = this.#buildRawCache(rawData);
					const processed = DataProcessor.processChannels(rawData, this.#processingParams);
					const updated: FRDataObject = {
						...data,
						channels: {
							...(processed.L && { L: processed.L }),
							...(processed.R && { R: processed.R }),
							...(processed.AVG && { AVG: processed.AVG })
						},
						_rawData: fallbackCache
					};
					// Same as the cached branch above: the runs and their envelope have to
					// be rebuilt at the new smoothing too, or a set fetched down this path
					// keeps run curves smoothed differently from its own average.
					if (fallbackCache.samples) {
						const processedSamples = DataProcessor.processSamples(
							fallbackCache.samples,
							this.#processingParams
						);
						updated.samples = processedSamples;
						updated.envelope = this.#computeAllEnvelopes(processedSamples);
					}
					frStore.set(uuid, updated);
				} catch {
					// Keep existing data on failure
				}
			}
		}
		// Targets were rebuilt from raw (pre-adjustment) source data above, so their
		// customizer stacks have to go back on top — this no longer depends on a
		// mounted TargetCustomizer to happen.
		graphStore.targetOriginalVersion++;
		this.#reapplyTargetAdjustments();

		// Rebuild the EQ curve from the newly re-smoothed source phone, same as
		// renormalizeAll — respects the current linkEqNormalization setting.
		eqCurve.rebuild();

		commandHistory.clear();
	}

	// ─── Field updates ────────────────────────────────────────────────────────

	updateDisplayChannel(uuid: string, channel: ('L' | 'R' | 'AVG')[]): void {
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

	getFRData(uuid: string): FRDataObject | null {
		return frStore.get(uuid);
	}

	isFRDataLoaded(identifier: string, suffix?: string): boolean {
		for (const data of frStore.entries.values()) {
			if (data.identifier === identifier) {
				if (!suffix || data.dispSuffix === suffix) return true;
			}
		}
		return false;
	}

	getUUIDbyIdentifier(identifier: string): string | null {
		for (const [uuid, data] of frStore.entries) {
			if (data.identifier === identifier) return uuid;
		}
		return null;
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
					: ([Object.keys(phone.channels)[0]] as ('L' | 'R' | 'AVG')[]);
				frStore.set(phone.uuid, { ...phone, dispChannel: [...dispChannel] });
			}
		} else if (phones.length === 1) {
			const phone = phones[0];
			const keys = Object.keys(phone.channels);
			const dispChannel: ('L' | 'R' | 'AVG')[] =
				keys.includes('L') && keys.includes('R')
					? ['L', 'R']
					: keys.includes('AVG')
						? ['AVG']
						: [keys[0] as 'L' | 'R' | 'AVG'];
			frStore.set(phone.uuid, { ...phone, dispChannel });
		}
	}

	// ─── Private helpers ──────────────────────────────────────────────────────

	// ─── Sample-set helpers ──────────────────────────────────────────────────

	/** Cache the raw (unsmoothed, unnormalized) payload for `reSmoothAll`. */
	#buildRawCache(rawData: FRParseResult): RawFRCache {
		const cache: RawFRCache = {
			channels: {
				...(rawData.L && { L: rawData.L }),
				...(rawData.R && { R: rawData.R }),
				...(rawData.AVG && { AVG: rawData.AVG })
			}
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
	 */
	#buildSampleFields(
		rawData: FRParseResult,
		baseColors: FRColors,
		previousDispSamples?: SampleDisplayKey[]
	): Partial<FRDataObject> {
		if (!rawData._samples?.length) {
			return {
				samples: undefined,
				dispSamples: undefined,
				showAvg: undefined,
				showFill: undefined,
				envelope: undefined,
				sampleDescription: undefined
			};
		}

		const samples = DataProcessor.processSamples(rawData._samples, this.#processingParams);
		const display = rawData._sampleDisplay ?? defaultSampleDisplay();
		const loadedKeys = this.#getLoadedSampleKeys(samples);

		// Preserve the user's per-run picks across a variant switch, but only the
		// ones that still name a run with data in the new set.
		const carried = previousDispSamples?.filter((k) => loadedKeys.includes(k));

		return {
			samples,
			colors: this.#addSampleColors(baseColors, samples),
			// The envelope is computed whether or not `fill` is on: the user can turn
			// the fill on at any time, and recomputing on toggle would mean threading
			// the processing params through the UI.
			envelope: this.#computeAllEnvelopes(samples),
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
			if (sample.L) sampleColors[`sample${i}_L`] = baseColors.L ?? baseColors.AVG;
			if (sample.R) sampleColors[`sample${i}_R`] = baseColors.R ?? baseColors.AVG;
			if (sample.AVG) sampleColors[`sample${i}_AVG`] = baseColors.AVG;
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
			if (sample.AVG) keys.push(`sample${i}_AVG`);
			else if (sample.L) keys.push(`sample${i}_L`);
			else if (sample.R) keys.push(`sample${i}_R`);
		});
		return keys;
	}

	/** Min/max envelope for a single channel across every run in the set */
	#computeEnvelope(samples: SampleData[], channel: 'L' | 'R' | 'AVG'): SampleEnvelope {
		const sampleDataArrays = samples
			.map((s) => s[channel]?.data)
			.filter((d): d is FRDataPoint[] => !!d);

		if (sampleDataArrays.length < 2) return { upper: [], lower: [] };

		const upper: FRDataPoint[] = sampleDataArrays[0].map(([freq], idx) => {
			const max = Math.max(...sampleDataArrays.map((d) => d[idx][1]));
			return [freq, max] as FRDataPoint;
		});
		const lower: FRDataPoint[] = sampleDataArrays[0].map(([freq], idx) => {
			const min = Math.min(...sampleDataArrays.map((d) => d[idx][1]));
			return [freq, min] as FRDataPoint;
		});

		return { upper, lower };
	}

	/** Compute envelopes for all channels */
	#computeAllEnvelopes(samples: SampleData[]): Record<'L' | 'R' | 'AVG', SampleEnvelope> {
		return {
			L: this.#computeEnvelope(samples, 'L'),
			R: this.#computeEnvelope(samples, 'R'),
			AVG: this.#computeEnvelope(samples, 'AVG')
		};
	}
}

export const dataProvider = new DataProvider();
