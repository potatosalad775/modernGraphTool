import type {
	Channel,
	FRDataPoint,
	FRDataObject,
	ParsedFRData,
	RawFRCache,
	SampleData,
	SampleEnvelope
} from '#lib/types/data-types.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { normalizeChannels } from '#lib/utils/fr-normalizer.js';
import { DataProcessor, anchorAndNormalizeSamples } from '#lib/utils/data-processor.js';

/**
 * The data a curve item draws, built from its source: channels, plus the runs and min/max envelope
 * of a sample set. `samples` and `envelope` are `undefined` for an item with no set.
 *
 * There are two builders and they are not interchangeable. `curveDataFromRaw` smooths, so it takes
 * **raw** channels only; `renormalizedCurveData` only re-anchors what is already drawn. Smoothing is
 * not idempotent, so never hand already-smoothed channels to `curveDataFromRaw`.
 */
export interface CurveData {
	channels: ParsedFRData;
	samples: SampleData[] | undefined;
	envelope: Record<Channel, SampleEnvelope> | undefined;
}

/** The smoothing and normalization the graph currently asks for. */
export function processingParams(): { smoothValue: string; normType: string; normHz: number } {
	return {
		smoothValue: graphStore.smoothValue,
		normType: graphStore.normType,
		normHz: graphStore.normHzValue
	};
}

/** A fresh object holding only the L / R / AVG channels that are present in `data`. */
export function pickChannels(data: ParsedFRData): ParsedFRData {
	return {
		...(data.L && { L: data.L }),
		...(data.R && { R: data.R }),
		...(data.AVG && { AVG: data.AVG })
	};
}

/**
 * Smooth → normalize a curve's raw cache: what a freshly loaded item draws, and what a global
 * re-smooth rebuilds. The envelope follows the runs: a different smoothing window moves them, so a
 * stale envelope would no longer bound them. It is computed whether or not the fill is on, because
 * the user can turn the fill on at any time.
 */
export function curveDataFromRaw(raw: RawFRCache): CurveData {
	const params = processingParams();
	const channels = pickChannels(DataProcessor.processChannels(raw.channels, params));
	if (!raw.samples) return { channels, samples: undefined, envelope: undefined };
	const samples = DataProcessor.processSamples(raw.samples, params);
	return { channels, samples, envelope: computeAllEnvelopes(samples) };
}

/**
 * Normalize only: a changed normalization on what is already drawn. The channels are not smoothed
 * again, and the runs are re-anchored against the same pooled reference the channels use. An item
 * with no runs keeps its `samples` / `envelope` as they are.
 */
export function renormalizedCurveData(item: FRDataObject): CurveData {
	const { normType, normHz } = processingParams();
	const channels = pickChannels(normalizeChannels(item.channels, normType, normHz));
	if (!item.samples) return { channels, samples: item.samples, envelope: item.envelope };
	const samples = anchorAndNormalizeSamples(item.samples, normType, normHz);
	return { channels, samples, envelope: computeAllEnvelopes(samples) };
}

/** Min/max envelope for a single channel across every run in the set */
function computeEnvelope(samples: SampleData[], channel: Channel): SampleEnvelope {
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
function computeAllEnvelopes(samples: SampleData[]): Record<Channel, SampleEnvelope> {
	return {
		L: computeEnvelope(samples, 'L'),
		R: computeEnvelope(samples, 'R'),
		AVG: computeEnvelope(samples, 'AVG')
	};
}
