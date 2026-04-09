import type { ParsedFRData, FRDataPoint, SampleData, HpTFSampleData } from '$lib/types/data-types.js';
import FRSmoother from './fr-smoother.js';
import { normalizeChannels } from './fr-normalizer.js';

interface ProcessingParams {
	smoothValue: string;
	normType: string;
	normHz: number;
}

/**
 * Stateless data processing pipeline.
 * Consolidates the smooth → normalize chain used across DataProvider.
 */
export const DataProcessor = {
	/** Smooth and normalize channel data. */
	processChannels(rawData: ParsedFRData, params: ProcessingParams): ParsedFRData {
		return normalizeChannels(
			FRSmoother.smoothChannels(rawData, params.smoothValue),
			params.normType,
			params.normHz
		);
	},

	/** Smooth and normalize a single channel, returning just that channel's data. */
	processChannel(channelKey: 'L' | 'R', data: { L?: import('$lib/types/data-types.js').ChannelData; R?: import('$lib/types/data-types.js').ChannelData }, params: ProcessingParams) {
		return normalizeChannels(
			FRSmoother.smoothChannels({ [channelKey]: data[channelKey] } as ParsedFRData, params.smoothValue),
			params.normType,
			params.normHz
		)[channelKey];
	},

	/** Smooth and normalize multi-sample data (L/R per sample). */
	processSamples(rawSamples: SampleData[], params: ProcessingParams): SampleData[] {
		return rawSamples.map((sample) => {
			const s: SampleData = {};
			if (sample.L) s.L = DataProcessor.processChannel('L', sample, params);
			if (sample.R) s.R = DataProcessor.processChannel('R', sample, params);
			return s;
		});
	},

	/** Smooth and normalize HpTF sample data, computing AVG from L+R. */
	processHpTFSamples(rawSamples: HpTFSampleData[], labels: string[], params: ProcessingParams): HpTFSampleData[] {
		return rawSamples.map((sample, i) => {
			const p: HpTFSampleData = { label: labels[i] ?? `Sample ${i + 1}` };
			if (sample.L) p.L = DataProcessor.processChannel('L', sample, params);
			if (sample.R) p.R = DataProcessor.processChannel('R', sample, params);
			if (p.L && p.R) {
				p.AVG = {
					data: p.L.data.map(([freq, lDb], idx) => [
						freq, (lDb + p.R!.data[idx][1]) / 2
					] as FRDataPoint),
					metadata: { ...p.L.metadata }
				};
			}
			return p;
		});
	}
};
