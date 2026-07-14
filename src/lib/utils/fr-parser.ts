import { getConfigValue } from './config.js';
import type {
	FRDataType,
	FRDataPoint,
	ChannelData,
	ParsedFRData,
	PhoneFileReference,
	PhoneMetadata,
	TargetMetadata,
	SampleData
} from '$lib/types/data-types.js';

/** Return type for getFRDataFromMetadata, carrying optional sample/HpTF data */
export interface FRParseResult extends ParsedFRData {
	_samples?: SampleData[];
	_sampleCount?: number;
	_hptfSamples?: Array<{ label: string; L?: ChannelData; R?: ChannelData }>;
	_hptfLabels?: string[];
	_hptfOnly?: boolean;
	_hptfFillOnly?: boolean;
}

/**
 * Frequency Response Parser
 * Handles parsing and processing of frequency response measurement files
 */
const FRParser = {
	_standardFrequencies: (function () {
		const frequencies = [20];
		const step = Math.pow(2, 1 / 48); // 1/48 octave steps
		while (frequencies[frequencies.length - 1] < 20000) {
			const next = frequencies[frequencies.length - 1] * step;
			if (next > 20000) break;
			frequencies.push(next);
		}
		return frequencies;
	})(),

	/**
	 * Get frequency response data in structured array format
	 */
	async getFRDataFromFile(
		sourceType: FRDataType,
		files: PhoneFileReference | string
	): Promise<ParsedFRData> {
		const isPhoneData = sourceType === 'phone';
		const channels: ('L' | 'R' | 'AVG')[] = isPhoneData ? ['L', 'R'] : ['AVG'];

		const parsedChannels: ParsedFRData = {};

		// Process each channel
		await Promise.all(
			channels.map(async (channel) => {
				let filename: string;
				if (isPhoneData) {
					const phoneFiles = files as PhoneFileReference;
					filename = channel === 'L' ? phoneFiles.L : phoneFiles.R;
				} else {
					filename = files as string;
				}

				try {
					const rawData = await this._fetchFRTextData(isPhoneData ? 'phone' : 'target', filename);
					if (rawData) {
						parsedChannels[channel] = await this.parseFRData(rawData);
					}
				} catch (error) {
					console.error(`Failed to process ${filename} ${channel} channel:`, error);
				}
			})
		);

		// Add AVG channel for phone data if both L/R are available
		if (isPhoneData && parsedChannels.L && parsedChannels.R) {
			parsedChannels.AVG = this._computeAvgChannel(parsedChannels.L, parsedChannels.R);
		}

		// Return structure matching input type
		return parsedChannels;
	},

	/**
	 * Get frequency response data from metadata
	 */
	async getFRDataFromMetadata(
		sourceType: FRDataType,
		metaData: PhoneMetadata | TargetMetadata | undefined,
		suffix = ''
	): Promise<FRParseResult> {
		try {
			const phoneMetaData = metaData as PhoneMetadata;
			const variant =
				suffix === ''
					? phoneMetaData.files[0]
					: phoneMetaData.files.find((file) => file.suffix === suffix);

			if (!variant) {
				throw new Error(`No file found with suffix: ${suffix}`);
			}

			// Multi-sample path: fetch all samples and compute averages
			if (variant.sampleFiles && variant.sampleCount) {
				const { samples, averaged } = await FRParser.getFRSampleData(variant.sampleFiles);
				return { ...averaged, _samples: samples, _sampleCount: variant.sampleCount };
			}

			// HpTF path: fetch all HpTF samples, compute averaged channels as main data
			if (variant.hptfFiles && variant.hptfLabels) {
				const hptfResult = await FRParser.getFRHpTFData(variant.hptfFiles, variant.hptfLabels);
				const fillOnly = variant.hptfFillOnly ?? true;
				const averaged = FRParser._averageSampleData(hptfResult._hptfSamples);
				return { ...averaged, ...hptfResult, _hptfOnly: true, _hptfFillOnly: fillOnly };
			}

			// Standard path: single L/R pair
			return await FRParser.getFRDataFromFile(sourceType, variant.files);
		} catch (e) {
			throw new Error(`Invalid FR file type: ${e instanceof Error ? e.message : String(e)}`, {
				cause: e
			});
		}
	},

	/**
	 * Fetch and parse multi-sample measurement data, computing averaged channels
	 */
	async getFRSampleData(
		sampleFiles: PhoneFileReference[]
	): Promise<{ samples: SampleData[]; averaged: ParsedFRData }> {
		// Fetch all sample files in parallel
		const samples: SampleData[] = await Promise.all(
			sampleFiles.map(async (fileRef) => {
				const sample: SampleData = {};
				let [lRaw, rRaw] = await Promise.all([
					this._fetchFRTextData('phone', fileRef.L),
					this._fetchFRTextData('phone', fileRef.R)
				]);
				// If the primary pair 404s, try the unnumbered fallback (e.g. "Foo L.txt"
				// when "Foo L1.txt" doesn't exist). Only sample index 0 carries a fallback.
				if (!lRaw && !rRaw && fileRef.fallback) {
					[lRaw, rRaw] = await Promise.all([
						this._fetchFRTextData('phone', fileRef.fallback.L),
						this._fetchFRTextData('phone', fileRef.fallback.R)
					]);
				}
				if (lRaw) sample.L = await this.parseFRData(lRaw);
				if (rRaw) sample.R = await this.parseFRData(rRaw);
				return sample;
			})
		);

		// Compute averaged channels from samples
		const averaged: ParsedFRData = {};

		// Average L channels across samples
		const lSamples = samples.filter((s) => s.L).map((s) => s.L!);
		if (lSamples.length > 0) {
			averaged.L = this._averageChannelData(lSamples);
		}

		// Average R channels across samples
		const rSamples = samples.filter((s) => s.R).map((s) => s.R!);
		if (rSamples.length > 0) {
			averaged.R = this._averageChannelData(rSamples);
		}

		// Compute AVG from averaged L and R
		if (averaged.L && averaged.R) {
			averaged.AVG = this._computeAvgChannel(averaged.L, averaged.R);
		}

		return { samples, averaged };
	},

	/**
	 * Fetch and parse HpTF sample measurement data
	 */
	async getFRHpTFData(
		hptfFiles: PhoneFileReference[],
		hptfLabels: string[]
	): Promise<{
		_hptfSamples: Array<{ label: string; L?: ChannelData; R?: ChannelData }>;
		_hptfLabels: string[];
	}> {
		const samples = await Promise.all(
			hptfFiles.map(async (fileRef, index) => {
				const sample: { label: string; L?: ChannelData; R?: ChannelData } = {
					label: hptfLabels[index] ?? `Sample ${index + 1}`
				};
				const [lRaw, rRaw] = await Promise.all([
					this._fetchFRTextData('phone', fileRef.L),
					this._fetchFRTextData('phone', fileRef.R)
				]);
				if (lRaw) sample.L = await this.parseFRData(lRaw);
				if (rRaw) sample.R = await this.parseFRData(rRaw);
				return sample;
			})
		);
		return { _hptfSamples: samples, _hptfLabels: hptfLabels };
	},

	/** Average channel data across all HpTF samples to produce main channels */
	_averageSampleData(
		samples: Array<{ label: string; L?: ChannelData; R?: ChannelData }>
	): ParsedFRData {
		const averaged: ParsedFRData = {};

		const lChannels = samples.filter((s) => s.L).map((s) => s.L!);
		if (lChannels.length > 0) averaged.L = FRParser._averageChannelData(lChannels);

		const rChannels = samples.filter((s) => s.R).map((s) => s.R!);
		if (rChannels.length > 0) averaged.R = FRParser._averageChannelData(rChannels);

		if (averaged.L && averaged.R) {
			averaged.AVG = FRParser._computeAvgChannel(averaged.L, averaged.R);
		}

		return averaged;
	},

	/** Average multiple ChannelData arrays point-by-point */
	_averageChannelData(channels: ChannelData[]): ChannelData {
		const count = channels.length;
		const data: FRDataPoint[] = channels[0].data.map(([freq], index) => [
			freq,
			channels.reduce((sum, ch) => sum + ch.data[index][1], 0) / count
		]);
		return {
			data,
			metadata: { ...channels[0].metadata }
		};
	},

	/** Compute the AVG channel as the per-point mean of L and R. Both channels are
	 *  interpolated to the same standard frequencies, so averaging by index is safe. */
	_computeAvgChannel(left: ChannelData, right: ChannelData): ChannelData {
		return {
			data: left.data.map(
				([freq, lDb], index) => [freq, (lDb + right.data[index][1]) / 2] as FRDataPoint
			),
			metadata: { ...left.metadata }
		};
	},

	/**
	 * Convert raw frequency response text data to structured format
	 */
	async parseFRData(rawData: string): Promise<ChannelData> {
		const lines = rawData
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'));

		// Improved data extraction with header detection
		const parsed = lines.reduce(
			(acc, line) => {
				const parts = line.split(/[\s,]+/).filter((p) => p !== '');

				// Skip lines with insufficient data or non-numeric values
				if (parts.length < 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
					return acc;
				}

				const freq = this._parseFrequency(parts[0]);
				const db = parseFloat(parts[1]);
				const weight = parts[2] ? parseFloat(parts[2]) : null;

				if (this._isValidDataPoint(freq, db)) {
					acc.data.push([freq, db]);
					if (weight !== null) acc.metadata.weights!.push(weight);
				}
				return acc;
			},
			{
				data: [] as FRDataPoint[],
				metadata: {
					weights: [] as number[],
					minFreq: Infinity,
					maxFreq: -Infinity
				}
			} as ChannelData
		);

		if (parsed.data.length !== 0) {
			// Sort data by frequency
			parsed.data.sort((a, b) => a[0] - b[0]);

			// Interpolate to standard frequencies (1/48oct)
			parsed.data = this._interpolateToStandard(parsed.data);

			// Update metadata with standard frequency range
			parsed.metadata.minFreq = this._standardFrequencies[0];
			parsed.metadata.maxFreq = this._standardFrequencies[this._standardFrequencies.length - 1];
		}

		return parsed;
	},

	/**
	 * Fetch raw frequency response text data from a file
	 */
	async _fetchFRTextData(sourceType: string, fileName: string): Promise<string | null> {
		const phonePath = getConfigValue('PATH.PHONE_MEASUREMENT') as string;
		const targetPath = getConfigValue('PATH.TARGET_MEASUREMENT') as string;
		const base = sourceType === 'phone' ? phonePath : targetPath;
		const basePath = base ? `${base}${base.endsWith('/') ? '' : '/'}${fileName}` : fileName;

		try {
			const response = await fetch(basePath);
			if (!response.ok) {
				return null;
			}
			return await response.text();
		} catch (error) {
			console.error(`Failed to load ${sourceType}: ${fileName}`, error);
			return null;
		}
	},

	/** Improved frequency parsing with unit detection */
	_parseFrequency(value: string): number {
		const num = parseFloat(value);
		if (value.toLowerCase().includes('k')) return num * 1000;
		return num;
	},

	/** Interpolate raw data to standard 1/48oct frequencies */
	_interpolateToStandard(rawData: FRDataPoint[]): FRDataPoint[] {
		return this._standardFrequencies.map((targetFreq) => {
			// Find surrounding points in raw data
			const index = rawData.findIndex(([freq]) => freq > targetFreq);

			if (index === -1) {
				// If beyond last point, return last value
				const lastPoint = rawData[rawData.length - 1];
				return [targetFreq, lastPoint[1]] as FRDataPoint;
			} else if (index === 0) {
				// If before first point, return first value
				const firstPoint = rawData[0];
				return [targetFreq, firstPoint[1]] as FRDataPoint;
			} else {
				// Interpolate between points
				const [freq1, db1] = rawData[index - 1];
				const [freq2, db2] = rawData[index];
				const ratio = (targetFreq - freq1) / (freq2 - freq1);
				const interpolatedDb = db1 + (db2 - db1) * ratio;
				return [targetFreq, interpolatedDb] as FRDataPoint;
			}
		});
	},

	/** Enhanced validation with frequency range checks */
	_isValidDataPoint(freq: number, db: number): boolean {
		return (
			Number.isFinite(freq) &&
			Number.isFinite(db) &&
			freq >= 20 &&
			freq <= 20000 &&
			db >= -40 &&
			db <= 120
		);
	}
};

export default FRParser;
