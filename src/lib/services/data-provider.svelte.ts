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
	HpTFRigData,
	HpTFEnvelope,
	HpTFDisplayKey
} from '$lib/types/data-types.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { commandHistory } from './command-history.js';
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
import FRSmoother from '$lib/utils/fr-smoother.js';
import { normalizeChannels } from '$lib/utils/fr-normalizer.js';
import MetadataParser from '$lib/utils/metadata-parser.js';
import { getConfigValue } from '$lib/utils/config.js';
import { analyticsService } from './analytics-service.svelte.js';
import { toast } from 'svelte-sonner';

class DataProvider {
	#baseHue: number | null = null;

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
		const processed = normalizeChannels(
			FRSmoother.smoothChannels(rawData),
			graphStore.normType,
			graphStore.normHzValue
		);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];

		const dispSuffix =
			inputMetadata.dispSuffix ??
			((metaData as PhoneMetadata).files?.[0]?.suffix ?? '');

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
			meta: metaData
		};

		// Multi-sample: process and attach sample data
		if (rawData._samples && rawData._sampleCount) {
			const processedSamples = rawData._samples.map((sample) => {
				const s: SampleData = {};
				if (sample.L) s.L = normalizeChannels(FRSmoother.smoothChannels({ L: sample.L }), graphStore.normType, graphStore.normHzValue).L;
				if (sample.R) s.R = normalizeChannels(FRSmoother.smoothChannels({ R: sample.R }), graphStore.normType, graphStore.normHzValue).R;
				return s;
			});
			frObject.samples = processedSamples;
			frObject.sampleCount = rawData._sampleCount;
			frObject.colors = this.#addSampleColors(colors, rawData._sampleCount);

			const defaultDisplay = getConfigValue('MULTI_SAMPLE.DEFAULT_DISPLAY') as string | undefined;
			if (defaultDisplay === 'all') {
				frObject.dispSamples = this.#getAllSampleKeys(rawData._sampleCount);
			} else {
				frObject.dispSamples = [];
			}
		}

		// HpTF: process and attach rig data + envelope
		if (rawData._hptfRigs && rawData._hptfLabels) {
			const processedRigs: HpTFRigData[] = rawData._hptfRigs.map((rig, i) => {
				const processed: HpTFRigData = { label: rawData._hptfLabels![i] ?? `Rig ${i + 1}` };
				if (rig.L) processed.L = normalizeChannels(FRSmoother.smoothChannels({ L: rig.L }), graphStore.normType, graphStore.normHzValue).L;
				if (rig.R) processed.R = normalizeChannels(FRSmoother.smoothChannels({ R: rig.R }), graphStore.normType, graphStore.normHzValue).R;
				if (processed.L && processed.R) {
					processed.AVG = {
						data: processed.L.data.map(([freq, lDb], idx) => [
							freq, (lDb + processed.R!.data[idx][1]) / 2
						] as FRDataPoint),
						metadata: { ...processed.L.metadata }
					};
				}
				return processed;
			});

			const fillOnly = rawData._hptfFillOnly ?? true;
			frObject.hptf = {
				rigs: processedRigs,
				envelope: this.#computeAllHpTFEnvelopes(processedRigs),
				labels: rawData._hptfLabels,
				fillOnly
			};

			const defaultDisplay = (getConfigValue('HPTF.DEFAULT_DISPLAY') as string) ?? 'fill+curves';
			frObject.hptfFillVisible = defaultDisplay === 'fill' || defaultDisplay === 'fill+curves';
			frObject.dispHptf = fillOnly
				? []
				: (defaultDisplay === 'curves' || defaultDisplay === 'fill+curves')
					? this.#getAllHpTFKeys(processedRigs)
					: [];
			frObject.colors = { 
				...frObject.colors, 
				hptfStroke: this.#getHpTFStrokeColor(frObject.colors),
				hptfFill: this.#getHpTFFillColor(frObject.colors) 
			};

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

	async toggleFRData(
		sourceType: FRDataType,
		identifier: string,
		enabled: boolean
	): Promise<void> {
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
		const processed = normalizeChannels(
			FRSmoother.smoothChannels(rawData),
			graphStore.normType,
			graphStore.normHzValue
		);
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
			dispChannel:
				inputMetadata.dispChannel ?? this.#getChannelValue(sourceType, channels),
			dispSuffix: inputMetadata.dispSuffix ?? '(Inserted)',
			colors: this.#getColorForType(sourceType),
			dash: this.#getDashForType(sourceType, identifier)
		};

		commandHistory.execute(new AddFRDataCommand(frObject), frStore);
	}

	// ─── Update raw data (EQ preview) ─────────────────────────────────────────

	updateFRDataWithRawData(
		uuid: string,
		rawData: ParsedFRData,
		opts: { identifier?: string | null; dispSuffix?: string | null } = {}
	): void {
		const existing = frStore.get(uuid);
		if (!existing) return;
		const processed = normalizeChannels(
			FRSmoother.smoothChannels(rawData),
			graphStore.normType,
			graphStore.normHzValue
		);
		const updated: FRDataObject = {
			...existing,
			channels: {
				...(processed.L && { L: processed.L }),
				...(processed.R && { R: processed.R }),
				...(processed.AVG && { AVG: processed.AVG })
			},
			identifier: opts.identifier ?? existing.identifier,
			dispSuffix: opts.dispSuffix ?? existing.dispSuffix
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
		const processed = normalizeChannels(
			FRSmoother.smoothChannels(rawData),
			graphStore.normType,
			graphStore.normHzValue
		);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];
		const dispChannel = (
			data.dispChannel.every((ch) => channels.includes(ch))
				? [...data.dispChannel]
				: [channels[0]]
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
				const processedSamples = rawData._samples.map((sample) => {
					const s: SampleData = {};
					if (sample.L) s.L = normalizeChannels(FRSmoother.smoothChannels({ L: sample.L }), graphStore.normType, graphStore.normHzValue).L;
					if (sample.R) s.R = normalizeChannels(FRSmoother.smoothChannels({ R: sample.R }), graphStore.normType, graphStore.normHzValue).R;
					return s;
				});
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
		if (rawData._hptfRigs && rawData._hptfLabels) {
			const existingData = frStore.get(uuid);
			if (existingData) {
				const processedRigs: HpTFRigData[] = rawData._hptfRigs.map((rig, i) => {
					const p: HpTFRigData = { label: rawData._hptfLabels![i] ?? `Rig ${i + 1}` };
					if (rig.L) p.L = normalizeChannels(FRSmoother.smoothChannels({ L: rig.L }), graphStore.normType, graphStore.normHzValue).L;
					if (rig.R) p.R = normalizeChannels(FRSmoother.smoothChannels({ R: rig.R }), graphStore.normType, graphStore.normHzValue).R;
					if (p.L && p.R) {
						p.AVG = {
							data: p.L.data.map(([freq, lDb], idx) => [freq, (lDb + p.R!.data[idx][1]) / 2] as FRDataPoint),
							metadata: { ...p.L.metadata }
						};
					}
					return p;
				});
				const variantFillOnly = rawData._hptfFillOnly ?? true;
				frStore.set(uuid, {
					...existingData,
					hptf: {
						rigs: processedRigs,
						envelope: this.#computeAllHpTFEnvelopes(processedRigs),
						labels: rawData._hptfLabels,
						fillOnly: variantFillOnly
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
	}

	// ─── Update sample display ────────────────────────────────────────────────

	updateSampleDisplay(uuid: string, dispSamples: SampleChannelKey[]): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateSampleDisplayCommand(uuid, dispSamples), frStore);
	}

	// ─── Update HpTF display ─────────────────────────────────────────────────

	updateHpTFDisplay(uuid: string, dispHptf: HpTFDisplayKey[], hptfFillVisible: boolean): void {
		if (!frStore.has(uuid)) return;
		commandHistory.execute(new UpdateHpTFDisplayCommand(uuid, dispHptf, hptfFillVisible), frStore);
	}

	// ─── Re-normalize all loaded data ─────────────────────────────────────────

	renormalizeAll(): void {
		for (const [uuid, data] of frStore.entries) {
			const processed = normalizeChannels(
				data.channels,
				graphStore.normType,
				graphStore.normHzValue
			);
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
					if (sample.L) s.L = normalizeChannels({ L: sample.L }, graphStore.normType, graphStore.normHzValue).L;
					if (sample.R) s.R = normalizeChannels({ R: sample.R }, graphStore.normType, graphStore.normHzValue).R;
					return s;
				});
			}
			// Re-normalize HpTF rig data
			if (data.hptf) {
				const reNormedRigs = this.#reprocessHpTFRigs(data.hptf.rigs, false);
				updated.hptf = {
					...data.hptf,
					rigs: reNormedRigs,
					envelope: this.#computeAllHpTFEnvelopes(reNormedRigs)
				};
			}
			frStore.set(uuid, updated);
		}
		// Invalidate history since snapshots are now stale
		commandHistory.clear();
	}

	// ─── Re-smooth all loaded data (called by SmoothingButton) ───────────────

	async reSmoothAll(): Promise<void> {
		// Re-fetch and re-process every entry from scratch
		for (const [uuid, data] of frStore.entries) {
			if (!data.meta || (data.type !== 'phone' && data.type !== 'target')) continue;
			try {
				const rawData = await FRParser.getFRDataFromMetadata(
					data.type,
					data.meta,
					data.dispSuffix ?? ''
				);
				const processed = normalizeChannels(
					FRSmoother.smoothChannels(rawData),
					graphStore.normType,
					graphStore.normHzValue
				);
				const updated: FRDataObject = {
					...data,
					channels: {
						...(processed.L && { L: processed.L }),
						...(processed.R && { R: processed.R }),
						...(processed.AVG && { AVG: processed.AVG })
					}
				};
				// Re-process sample data
				if (rawData._samples && rawData._sampleCount) {
					updated.samples = rawData._samples.map((sample) => {
						const s: SampleData = {};
						if (sample.L) s.L = normalizeChannels(FRSmoother.smoothChannels({ L: sample.L }), graphStore.normType, graphStore.normHzValue).L;
						if (sample.R) s.R = normalizeChannels(FRSmoother.smoothChannels({ R: sample.R }), graphStore.normType, graphStore.normHzValue).R;
						return s;
					});
					updated.sampleCount = rawData._sampleCount;
				}
				// Re-process HpTF rig data
				if (rawData._hptfRigs && rawData._hptfLabels) {
					const processedRigs: HpTFRigData[] = rawData._hptfRigs.map((rig, i) => {
						const p: HpTFRigData = { label: rawData._hptfLabels![i] ?? `Rig ${i + 1}` };
						if (rig.L) p.L = normalizeChannels(FRSmoother.smoothChannels({ L: rig.L }), graphStore.normType, graphStore.normHzValue).L;
						if (rig.R) p.R = normalizeChannels(FRSmoother.smoothChannels({ R: rig.R }), graphStore.normType, graphStore.normHzValue).R;
						if (p.L && p.R) {
							p.AVG = {
								data: p.L.data.map(([freq, lDb], idx) => [freq, (lDb + p.R!.data[idx][1]) / 2] as FRDataPoint),
								metadata: { ...p.L.metadata }
							};
						}
						return p;
					});
					updated.hptf = {
						rigs: processedRigs,
						envelope: this.#computeAllHpTFEnvelopes(processedRigs),
						labels: rawData._hptfLabels,
						fillOnly: rawData._hptfFillOnly ?? true
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
			} catch {
				// Keep existing data on failure
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
		const phoneCount = [...frStore.entries.values()].filter(
			(e) => e.type === 'phone'
		).length;
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
			(o) =>
				(o.name.endsWith(' Target') ? o.name : o.name + ' Target') === identifier
		);
		return match?.dash ?? this.#randomDash();
	}

	#randomDash(): string {
		const numPairs = 1 + Math.floor(Math.random() * 3);
		const space = 5 + Math.floor(Math.random() * 3);
		return Array.from(
			{ length: numPairs },
			(_, i) =>
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

	/** Generate all sample channel keys for a given sample count */
	#getAllSampleKeys(sampleCount: number): SampleChannelKey[] {
		const keys: SampleChannelKey[] = [];
		for (let i = 1; i <= sampleCount; i++) {
			keys.push(`L${i}` as SampleChannelKey, `R${i}` as SampleChannelKey);
		}
		return keys;
	}

	// ─── HpTF helpers ────────────────────────────────────────────────────────

	/** Compute min/max envelope for a single channel across all rigs */
	#computeHpTFEnvelope(rigs: HpTFRigData[], channel: 'L' | 'R' | 'AVG'): HpTFEnvelope {
		const rigDataArrays = rigs
			.map((r) => r[channel]?.data)
			.filter((d): d is FRDataPoint[] => !!d);

		if (rigDataArrays.length < 2) return { upper: [], lower: [] };

		const upper: FRDataPoint[] = rigDataArrays[0].map(([freq], idx) => {
			const max = Math.max(...rigDataArrays.map((d) => d[idx][1]));
			return [freq, max] as FRDataPoint;
		});
		const lower: FRDataPoint[] = rigDataArrays[0].map(([freq], idx) => {
			const min = Math.min(...rigDataArrays.map((d) => d[idx][1]));
			return [freq, min] as FRDataPoint;
		});

		return { upper, lower };
	}

	/** Compute envelopes for all channels */
	#computeAllHpTFEnvelopes(rigs: HpTFRigData[]): Record<'L' | 'R' | 'AVG', HpTFEnvelope> {
		return {
			L: this.#computeHpTFEnvelope(rigs, 'L'),
			R: this.#computeHpTFEnvelope(rigs, 'R'),
			AVG: this.#computeHpTFEnvelope(rigs, 'AVG'),
		};
	}

	/** Generate all HpTF display keys (AVG per rig by default) */
	#getAllHpTFKeys(rigs: HpTFRigData[]): HpTFDisplayKey[] {
		const keys: HpTFDisplayKey[] = [];
		rigs.forEach((rig, i) => {
			if (rig.AVG) keys.push(`rig${i}_AVG` as HpTFDisplayKey);
			else {
				if (rig.L) keys.push(`rig${i}_L` as HpTFDisplayKey);
				if (rig.R) keys.push(`rig${i}_R` as HpTFDisplayKey);
			}
		});
		return keys;
	}

	/** Get semi-transparent stroke color for HpTF curves */
	#getHpTFStrokeColor(colors: FRColors): string {
		const opacity = (getConfigValue('HPTF.FILL_OPACITY') as number) ?? 0.5;
		const base = colors.AVG;
		// Convert hsl() to hsla() with fill opacity
		if (base.startsWith('hsl(')) {
			return base.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
		}
		return base;
	}

	/** Get semi-transparent fill color from the phone's AVG color */
	#getHpTFFillColor(colors: FRColors): string {
		const opacity = (getConfigValue('HPTF.FILL_OPACITY') as number) ?? 0.3;
		const base = colors.AVG;
		// Convert hsl() to hsla() with fill opacity
		if (base.startsWith('hsl(')) {
			return base.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
		}
		return base;
	}

	/** Re-process HpTF rigs (normalize only, not re-smooth) */
	#reprocessHpTFRigs(rigs: HpTFRigData[], smooth: boolean): HpTFRigData[] {
		return rigs.map((rig) => {
			const p: HpTFRigData = { label: rig.label };
			if (rig.L) {
				const src = smooth ? FRSmoother.smoothChannels({ L: rig.L }) : { L: rig.L };
				p.L = normalizeChannels(src, graphStore.normType, graphStore.normHzValue).L;
			}
			if (rig.R) {
				const src = smooth ? FRSmoother.smoothChannels({ R: rig.R }) : { R: rig.R };
				p.R = normalizeChannels(src, graphStore.normType, graphStore.normHzValue).R;
			}
			if (p.L && p.R) {
				p.AVG = {
					data: p.L.data.map(([freq, lDb], idx) => [freq, (lDb + p.R!.data[idx][1]) / 2] as FRDataPoint),
					metadata: { ...p.L.metadata }
				};
			}
			return p;
		});
	}
}

export const dataProvider = new DataProvider();
