import type {
	FRDataType,
	FRDataObject,
	FRDataPoint,
	FRColors,
	ParsedFRData,
	FRInputMetadata,
	PhoneMetadata,
	SampleChannelKey,
	SampleData,
	HpTFSampleData,
	HpTFEnvelope,
	HpTFDisplayKey,
	RawFRCache
} from '$lib/types/data-types.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
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
	UpdateSampleDisplayCommand,
	UpdateHpTFDisplayCommand
} from './commands.js';
import FRParser from '$lib/utils/fr-parser.js';
import { normalizeChannels } from '$lib/utils/fr-normalizer.js';
import { DataProcessor, anchorAndNormalizeHpTFSamples } from '$lib/utils/data-processor.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import { Equalizer } from '$lib/utils/equalizer.js';
import MetadataParser from '$lib/utils/metadata-parser.js';
import { getConfigValue } from '$lib/utils/config.js';
import { analyticsService } from './analytics-service.svelte.js';
import { toast } from 'svelte-sonner';

class DataProvider {
	#baseHue: number | null = null;

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
		} catch (err) {
			const label = identifier.replace(/ Target$/, '');
			toast.error(`Failed to load ${sourceType === 'target' ? 'target' : 'device'}: ${label}`);
			return;
		}
		const rawCache: RawFRCache = {
			channels: {
				...(rawData.L && { L: rawData.L }),
				...(rawData.R && { R: rawData.R }),
				...(rawData.AVG && { AVG: rawData.AVG })
			}
		};
		if (rawData._samples && rawData._sampleCount) {
			rawCache.samples = rawData._samples;
			rawCache.sampleCount = rawData._sampleCount;
		}
		if (rawData._hptfSamples && rawData._hptfLabels) {
			rawCache.hptfSamples = rawData._hptfSamples;
			rawCache.hptfLabels = rawData._hptfLabels;
			rawCache.hptfOnly = rawData._hptfOnly;
			rawCache.hptfFillOnly = rawData._hptfFillOnly;
		}
		const processed = DataProcessor.processChannels(rawData, this.#processingParams);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];

		const dispSuffix =
			inputMetadata.dispSuffix ?? (metaData as PhoneMetadata).files?.[0]?.suffix ?? '';

		const colors = this.#getColorForType(sourceType);

		const frObject: FRDataObject = {
			uuid: crypto.randomUUID(),
			type: sourceType,
			identifier: metaData.identifier,
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
			dispChannel: this.#getChannelValue(sourceType, channels),
			dispSuffix,
			colors,
			dash: this.#getDashForType(sourceType, metaData.identifier),
			meta: metaData,
			_rawData: rawCache
		};

		// Multi-sample: process and attach sample data
		if (rawData._samples && rawData._sampleCount) {
			const processedSamples = DataProcessor.processSamples(
				rawData._samples,
				this.#processingParams
			);
			frObject.samples = processedSamples;
			frObject.sampleCount = rawData._sampleCount;
			frObject.colors = this.#addSampleColors(colors, rawData._sampleCount);

			const defaultDisplay = getConfigValue('MULTI_SAMPLE.DEFAULT_DISPLAY') as string | undefined;
			if (defaultDisplay === 'all') {
				// Only emit keys for sample slots that actually loaded — protects
				// against missing L{n}/R{n} files (e.g. fallback-to-unnumbered mode
				// where only sample 1 has data).
				frObject.dispSamples = this.#getLoadedSampleKeys(processedSamples);
			} else {
				frObject.dispSamples = [];
			}
		}

		// HpTF: process and attach sample data + envelope
		if (rawData._hptfSamples && rawData._hptfLabels) {
			const processedSamples = DataProcessor.processHpTFSamples(
				rawData._hptfSamples,
				rawData._hptfLabels,
				this.#processingParams
			);

			const fillOnly = rawData._hptfFillOnly ?? true;
			const hptfDescription = (metaData as PhoneMetadata).files?.[0]?.hptfDescription;
			frObject.hptf = {
				samples: processedSamples,
				envelope: this.#computeAllHpTFEnvelopes(processedSamples),
				labels: rawData._hptfLabels,
				fillOnly,
				...(hptfDescription && { description: hptfDescription })
			};

			const defaultDisplay = (getConfigValue('HPTF.DEFAULT_DISPLAY') as string) ?? 'fill+curves';
			frObject.hptfFillVisible = defaultDisplay === 'fill' || defaultDisplay === 'fill+curves';
			frObject.hptfAvgVisible = defaultDisplay !== 'none';
			frObject.dispHptf = fillOnly
				? []
				: defaultDisplay === 'curves' || defaultDisplay === 'fill+curves'
					? this.#getAllHpTFKeys(processedSamples)
					: [];
			if (rawData._hptfOnly) {
				frObject.hptfOnly = true;
			}
		}

		commandHistory.execute(new AddFRDataCommand(frObject), frStore);
		this.#syncChannelsAfterAdd();

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

	removeFRData(sourceType: FRDataType, identifier: string): void {
		for (const [uuid, data] of frStore.entries) {
			if (data.identifier === identifier) {
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

	async toggleFRData(sourceType: FRDataType, identifier: string, enabled: boolean): Promise<void> {
		if (enabled) await this.addFRData(sourceType, identifier);
		else this.removeFRData(sourceType, identifier);
	}

	// ─── Insert raw ──────────────────────────────────────────────────────────────

	async insertRawFRData(
		sourceType: FRDataType,
		identifier: string,
		rawData: ParsedFRData,
		inputMetadata: FRInputMetadata = {}
	): Promise<void> {
		const processed = DataProcessor.processChannels(rawData, this.#processingParams);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];

		const frObject: FRDataObject = {
			uuid: crypto.randomUUID(),
			type: `inserted-${sourceType}` as FRDataType,
			identifier,
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
			dispChannel: inputMetadata.dispChannel ?? this.#getChannelValue(sourceType, channels),
			dispSuffix: inputMetadata.dispSuffix ?? '(Inserted)',
			colors: this.#getColorForType(sourceType),
			dash: this.#getDashForType(sourceType, identifier),
			_rawData: { channels: rawData }
		};

		commandHistory.execute(new AddFRDataCommand(frObject), frStore);
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

	// ─── Update variant ───────────────────────────────────────────────────────

	async updateVariant(uuid: string, dispSuffix: string): Promise<void> {
		const data = frStore.get(uuid);
		if (!data?.meta) throw new Error(`No data found for UUID: ${uuid}`);

		let rawData;
		try {
			rawData = await FRParser.getFRDataFromMetadata('phone', data.meta, dispSuffix);
		} catch {
			toast.error(`Failed to load variant: ${dispSuffix || data.identifier}`);
			return;
		}
		const variantRawCache: RawFRCache = {
			channels: {
				...(rawData.L && { L: rawData.L }),
				...(rawData.R && { R: rawData.R }),
				...(rawData.AVG && { AVG: rawData.AVG })
			}
		};
		if (rawData._samples && rawData._sampleCount) {
			variantRawCache.samples = rawData._samples;
			variantRawCache.sampleCount = rawData._sampleCount;
		}
		if (rawData._hptfSamples && rawData._hptfLabels) {
			variantRawCache.hptfSamples = rawData._hptfSamples;
			variantRawCache.hptfLabels = rawData._hptfLabels;
			variantRawCache.hptfOnly = rawData._hptfOnly;
			variantRawCache.hptfFillOnly = rawData._hptfFillOnly;
		}
		const processed = DataProcessor.processChannels(rawData, this.#processingParams);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];
		const dispChannel = (
			data.dispChannel.every((ch) => channels.includes(ch)) ? [...data.dispChannel] : [channels[0]]
		) as ('L' | 'R' | 'AVG')[];

		commandHistory.execute(
			new UpdateVariantCommand(
				uuid,
				{
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				},
				dispSuffix,
				dispChannel
			),
			frStore
		);

		// Re-attach sample data for the new variant
		if (rawData._samples && rawData._sampleCount) {
			const existingData = frStore.get(uuid);
			if (existingData) {
				const processedSamples = DataProcessor.processSamples(
					rawData._samples,
					this.#processingParams
				);
				frStore.set(uuid, {
					...existingData,
					samples: processedSamples,
					sampleCount: rawData._sampleCount,
					colors: this.#addSampleColors(existingData.colors, rawData._sampleCount),
					dispSamples: existingData.dispSamples ?? []
				});
			}
		} else {
			// New variant has no samples — clear sample data
			const existingData = frStore.get(uuid);
			if (existingData && existingData.samples) {
				frStore.set(uuid, {
					...existingData,
					samples: undefined,
					sampleCount: undefined,
					dispSamples: undefined
				});
			}
		}

		// Re-attach HpTF data for the new variant
		if (rawData._hptfSamples && rawData._hptfLabels) {
			const existingData = frStore.get(uuid);
			if (existingData) {
				const processedSamples = DataProcessor.processHpTFSamples(
					rawData._hptfSamples,
					rawData._hptfLabels,
					this.#processingParams
				);
				const variantFillOnly = rawData._hptfFillOnly ?? true;
				const phoneMeta = data.meta as PhoneMetadata;
				const variantDescription =
					phoneMeta.files?.find((f) => f.suffix === dispSuffix)?.hptfDescription ??
					phoneMeta.files?.[0]?.hptfDescription;
				frStore.set(uuid, {
					...existingData,
					hptf: {
						samples: processedSamples,
						envelope: this.#computeAllHpTFEnvelopes(processedSamples),
						labels: rawData._hptfLabels,
						fillOnly: variantFillOnly,
						...(variantDescription && { description: variantDescription })
					},
					hptfOnly: rawData._hptfOnly ?? false,
					dispHptf: variantFillOnly ? [] : (existingData.dispHptf ?? []),
					hptfFillVisible: existingData.hptfFillVisible ?? true
				});
			}
		} else {
			// New variant has no HpTF — clear HpTF data
			const existingData = frStore.get(uuid);
			if (existingData && existingData.hptf) {
				frStore.set(uuid, {
					...existingData,
					hptf: undefined,
					dispHptf: undefined,
					hptfFillVisible: undefined,
					hptfOnly: undefined
				});
			}
		}

		// Update raw data cache for re-smoothing
		const finalData = frStore.get(uuid);
		if (finalData) {
			frStore.set(uuid, { ...finalData, _rawData: variantRawCache });
		}
	}

	// ─── Update sample display ────────────────────────────────────────────────

	updateSampleDisplay(uuid: string, dispSamples: SampleChannelKey[]): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateSampleDisplayCommand(uuid, dispSamples), frStore);
	}

	// ─── Update HpTF display ─────────────────────────────────────────────────

	updateHpTFDisplay(
		uuid: string,
		dispHptf: HpTFDisplayKey[],
		hptfFillVisible: boolean,
		hptfAvgVisible: boolean
	): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(
			new UpdateHpTFDisplayCommand(uuid, dispHptf, hptfFillVisible, hptfAvgVisible),
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
			// Re-normalize sample data
			if (data.samples) {
				updated.samples = data.samples.map((sample) => {
					const s: SampleData = {};
					if (sample.L) s.L = normalizeChannels({ L: sample.L }, normType, normHzValue).L;
					if (sample.R) s.R = normalizeChannels({ R: sample.R }, normType, normHzValue).R;
					return s;
				});
			}
			// Re-normalize HpTF sample data
			if (data.hptf) {
				const reNormedSamples = anchorAndNormalizeHpTFSamples(
					data.hptf.samples,
					normType,
					normHzValue
				);
				updated.hptf = {
					...data.hptf,
					samples: reNormedSamples,
					envelope: this.#computeAllHpTFEnvelopes(reNormedSamples)
				};
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

		// Signal mounted TargetCustomizer instances to re-sync their base data
		// and re-apply filter stacks on top of the newly normalized original.
		if (targetOriginalTouched) graphStore.targetOriginalVersion++;

		// Rebuild the EQ curve after the source phone has been renormalized.
		// Reacts to the current `linkEqNormalization` setting: linked → smooth-only,
		// unlinked → smooth + independent normalization.
		this.rebuildEqCurve();

		// Invalidate history since snapshots are now stale
		commandHistory.clear();
	}

	// ─── Rebuild the EQ preview curve from current eqStore + source phone ────

	/**
	 * Recomputes the EQ-modified curve in frStore from the current source phone,
	 * filters, preamp, and smoothing settings. When `settingsStore.linkEqNormalization`
	 * is on, the curve is smoothed but NOT independently normalized — it inherits
	 * the source phone's normalization, keeping the two curves visually tied
	 * regardless of how radical the EQ is.
	 *
	 * This is the single source of truth for EQ curve construction. Both
	 * `EqualizerPanel.svelte`'s reactive effect and `renormalizeAll()` funnel
	 * through here.
	 */
	rebuildEqCurve(): void {
		const sourceUUID = eqStore.sourcePhoneUUID;
		if (!eqStore.isEnabled || !sourceUUID) {
			this.#removeEqCurve();
			return;
		}

		const sourceData = frStore.get(sourceUUID);
		if (!sourceData) return;

		const enabledFilters = eqStore.filters.filter(
			(f) => f.enabled && f.freq != null && f.q != null && f.gain != null
		);
		const preamp = eqStore.preamp;
		if (enabledFilters.length === 0 && preamp === 0) {
			this.#removeEqCurve();
			return;
		}

		// Linked mode treats preamp as a pure playback gain (audio player + hardware
		// PEQ export both read eqStore.preamp directly). The on-screen EQ curve only
		// visualizes the filter response so peak/dip filters stay anchored to the
		// source ghost regardless of whether the user added headroom compensation.
		const linked = settingsStore.linkEqNormalization;
		const applyPreamp = preamp !== 0 && !linked;

		const eq = new Equalizer();
		const modified: ParsedFRData = {};
		for (const ch of ['L', 'R', 'AVG'] as const) {
			const chData = sourceData.channels[ch];
			if (!chData) continue;
			let points = chData.data;
			if (enabledFilters.length > 0) {
				points = eq.applyFilters(points, enabledFilters);
			}
			if (applyPreamp) {
				points = points.map(([f, d]) => [f, d + preamp] as [number, number]);
			}
			modified[ch] = { data: points, metadata: { ...chData.metadata } };
		}
		eqStore.eqModifiedData.set(sourceUUID, modified);

		const params = {
			smoothValue: graphStore.smoothValue,
			normType: graphStore.normType,
			normHz: graphStore.normHzValue
		};

		// Linked mode: smooth only. The absolute dB values in `modified` already
		// encode "source_normalized + filter_effect" — skipping normalization
		// preserves that relationship. Unlinked mode: smooth + renormalize.
		const processed = linked
			? FRSmoother.smoothChannels(modified, params.smoothValue)
			: DataProcessor.processChannels(modified, params);

		const existingUUID = eqStore.eqCurveUUID;
		const existing = existingUUID ? frStore.get(existingUUID) : null;

		if (existing && existingUUID) {
			frStore.set(existingUUID, {
				...existing,
				channels: {
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				},
				dispChannel: [...sourceData.dispChannel],
				colors: { ...sourceData.colors },
				_rawData: { channels: modified }
			});
		} else {
			const uuid = crypto.randomUUID();
			const frObject: FRDataObject = {
				uuid,
				type: 'eq',
				identifier: sourceData.identifier,
				dispSuffix: '(EQ)',
				channels: {
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				},
				dispChannel: [...sourceData.dispChannel],
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

	#removeEqCurve(): void {
		const uuid = eqStore.eqCurveUUID;
		if (uuid) {
			frStore.delete(uuid);
			eqStore.eqCurveUUID = null;
		}
		eqStore.eqModifiedData.clear();
	}

	// ─── Re-smooth all loaded data (called by SmoothingButton) ───────────────

	async reSmoothAll(): Promise<void> {
		for (const [uuid, data] of frStore.entries) {
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
				// Re-process sample data from cache
				if (rawCache.samples && rawCache.sampleCount) {
					updated.samples = DataProcessor.processSamples(rawCache.samples, this.#processingParams);
					updated.sampleCount = rawCache.sampleCount;
				}
				// Re-process HpTF sample data from cache
				if (rawCache.hptfSamples && rawCache.hptfLabels) {
					const processedSamples = DataProcessor.processHpTFSamples(
						rawCache.hptfSamples,
						rawCache.hptfLabels,
						this.#processingParams
					);
					updated.hptf = {
						...data.hptf!,
						samples: processedSamples,
						envelope: this.#computeAllHpTFEnvelopes(processedSamples)
					};
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
					const fallbackCache: RawFRCache = {
						channels: {
							...(rawData.L && { L: rawData.L }),
							...(rawData.R && { R: rawData.R }),
							...(rawData.AVG && { AVG: rawData.AVG })
						}
					};
					if (rawData._samples && rawData._sampleCount) {
						fallbackCache.samples = rawData._samples;
						fallbackCache.sampleCount = rawData._sampleCount;
					}
					if (rawData._hptfSamples && rawData._hptfLabels) {
						fallbackCache.hptfSamples = rawData._hptfSamples;
						fallbackCache.hptfLabels = rawData._hptfLabels;
						fallbackCache.hptfOnly = rawData._hptfOnly;
						fallbackCache.hptfFillOnly = rawData._hptfFillOnly;
					}
					const processed = DataProcessor.processChannels(rawData, this.#processingParams);
					frStore.set(uuid, {
						...data,
						channels: {
							...(processed.L && { L: processed.L }),
							...(processed.R && { R: processed.R }),
							...(processed.AVG && { AVG: processed.AVG })
						},
						_rawData: fallbackCache
					});
				} catch {
					// Keep existing data on failure
				}
			}
		}
		// Signal TargetCustomizer instances to re-sync base data and re-apply adjustments
		graphStore.targetOriginalVersion++;
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

	// ─── Private helpers ──────────────────────────────────────────────────────

	/** After adding a phone, sync channel display across all phones */
	#syncChannelsAfterAdd(): void {
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

	#getChannelValue(
		sourceType: FRDataType,
		available: ('L' | 'R' | 'AVG')[]
	): ('L' | 'R' | 'AVG')[] {
		const phoneCount = [...frStore.entries.values()].filter((e) => e.type === 'phone').length;
		if (sourceType !== 'phone') return ['AVG'];
		if (phoneCount < 1) return available.filter((ch) => ch !== 'AVG');
		return available.includes('AVG') ? ['AVG'] : [available[0]];
	}

	#getColorForType(sourceType: FRDataType): FRColors {
		if (this.#baseHue === null) {
			this.#baseHue = Math.floor(Math.random() * 360);
		} else {
			this.#baseHue = (this.#baseHue + 100) % 360;
		}
		const s = Math.floor(Math.random() * 50);
		const l = Math.floor(Math.random() * 20);
		if (sourceType === 'target') return { AVG: `hsl(${this.#baseHue}, 0%, 45%)` };
		return {
			L: `hsl(${(this.#baseHue - 10 + 360) % 360}, ${50 + s}%, ${30 + l}%)`,
			R: `hsl(${(this.#baseHue + 10) % 360}, ${50 + s}%, ${30 + l}%)`,
			AVG: `hsl(${this.#baseHue}, ${50 + s}%, ${30 + l}%)`
		};
	}

	#getDashForType(sourceType: FRDataType, identifier: string): string {
		if (sourceType !== 'target') return '1 0';
		const list = getConfigValue('TRACE_STYLING.TARGET_TRACE_DASH') as
			| Array<{ name: string; dash: string }>
			| undefined;
		const match = list?.find(
			(o) => (o.name.endsWith(' Target') ? o.name : o.name + ' Target') === identifier
		);
		return match?.dash ?? this.#randomDash();
	}

	#randomDash(): string {
		const numPairs = 1 + Math.floor(Math.random() * 3);
		const space = 5 + Math.floor(Math.random() * 3);
		return Array.from({ length: numPairs }, (_, i) =>
			i % 2 === 0 ? `${5 + Math.floor(Math.random() * 5)} ${space}` : `2 ${space}`
		).join(' ');
	}

	/** Add sample colors to an existing FRColors object */
	#addSampleColors(baseColors: FRColors, sampleCount: number): FRColors {
		const samples: Record<string, string> = {};
		for (let i = 1; i <= sampleCount; i++) {
			// Use same color as the corresponding channel but will be rendered at reduced opacity
			samples[`L${i}`] = baseColors.L ?? baseColors.AVG;
			samples[`R${i}`] = baseColors.R ?? baseColors.AVG;
		}
		return { ...baseColors, samples };
	}

	/** Sample channel keys for slots that actually have L and/or R data loaded */
	#getLoadedSampleKeys(samples: SampleData[]): SampleChannelKey[] {
		const keys: SampleChannelKey[] = [];
		samples.forEach((sample, i) => {
			const n = i + 1;
			if (sample.L) keys.push(`L${n}` as SampleChannelKey);
			if (sample.R) keys.push(`R${n}` as SampleChannelKey);
		});
		return keys;
	}

	// ─── HpTF helpers ────────────────────────────────────────────────────────

	/** Compute min/max envelope for a single channel across all HpTF samples */
	#computeHpTFEnvelope(samples: HpTFSampleData[], channel: 'L' | 'R' | 'AVG'): HpTFEnvelope {
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
	#computeAllHpTFEnvelopes(samples: HpTFSampleData[]): Record<'L' | 'R' | 'AVG', HpTFEnvelope> {
		return {
			L: this.#computeHpTFEnvelope(samples, 'L'),
			R: this.#computeHpTFEnvelope(samples, 'R'),
			AVG: this.#computeHpTFEnvelope(samples, 'AVG')
		};
	}

	/** Generate all HpTF display keys (AVG per sample by default) */
	#getAllHpTFKeys(samples: HpTFSampleData[]): HpTFDisplayKey[] {
		const keys: HpTFDisplayKey[] = [];
		samples.forEach((sample, i) => {
			if (sample.AVG) keys.push(`sample${i}_AVG` as HpTFDisplayKey);
			else {
				if (sample.L) keys.push(`sample${i}_L` as HpTFDisplayKey);
				if (sample.R) keys.push(`sample${i}_R` as HpTFDisplayKey);
			}
		});
		return keys;
	}
}

export const dataProvider = new DataProvider();
