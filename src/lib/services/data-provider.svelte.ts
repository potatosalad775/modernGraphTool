import type {
	FRDataType,
	FRDataObject,
	FRColors,
	ParsedFRData,
	FRInputMetadata,
	PhoneMetadata
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
	UpdateYOffsetCommand
} from './commands.js';
import FRParser from '$lib/utils/fr-parser.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import { normalizeChannels } from '$lib/utils/fr-normalizer.js';
import MetadataParser from '$lib/utils/metadata-parser.js';
import { getConfigValue } from '$lib/utils/config.js';
import { analyticsService } from './analytics-service.svelte.js';

class DataProvider {
	#baseHue: number | null = null;

	// ─── Add ─────────────────────────────────────────────────────────────────────

	async addFRData(
		sourceType: FRDataType,
		identifier: string,
		inputMetadata: FRInputMetadata = {}
	): Promise<void> {
		if (this.isFRDataLoaded(identifier, inputMetadata.dispSuffix)) return;

		const metaData = MetadataParser.getFRMetadata(sourceType, identifier);
		const rawData = await FRParser.getFRDataFromMetadata(
			sourceType,
			metaData,
			inputMetadata.dispSuffix ?? ''
		);
		const processed = normalizeChannels(
			FRSmoother.smoothChannels(rawData),
			graphStore.normType,
			graphStore.normHzValue
		);
		const channels = Object.keys(processed) as ('L' | 'R' | 'AVG')[];

		const dispSuffix =
			inputMetadata.dispSuffix ??
			((metaData as PhoneMetadata).files?.[0]?.suffix ?? '');

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
			colors: this.#getColorForType(sourceType),
			dash: this.#getDashForType(sourceType, metaData.identifier),
			meta: metaData
		};

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

		const rawData = await FRParser.getFRDataFromMetadata('phone', data.meta, dispSuffix);
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
	}

	// ─── Re-normalize all loaded data ─────────────────────────────────────────

	renormalizeAll(): void {
		for (const [uuid, data] of frStore.entries) {
			const processed = normalizeChannels(
				data.channels,
				graphStore.normType,
				graphStore.normHzValue
			);
			frStore.set(uuid, {
				...data,
				channels: {
					...(processed.L && { L: processed.L }),
					...(processed.R && { R: processed.R }),
					...(processed.AVG && { AVG: processed.AVG })
				}
			});
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
				frStore.set(uuid, {
					...data,
					channels: {
						...(processed.L && { L: processed.L }),
						...(processed.R && { R: processed.R }),
						...(processed.AVG && { AVG: processed.AVG })
					}
				});
			} catch {
				// Keep existing data on failure
			}
		}
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
}

export const dataProvider = new DataProvider();
