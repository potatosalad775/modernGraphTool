import {
	isTargetType,
	type Channel,
	type FRDataPoint,
	type FRDataObject,
	type FRDataType,
	type ParsedFRData,
	type RawFRCache,
	type SampleData,
	type SampleEnvelope
} from '#lib/types/data-types.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { normalizeChannels } from '#lib/utils/fr-normalizer.js';
import { DataProcessor, anchorAndNormalizeSamples } from '#lib/utils/data-processor.js';

/**
 * The data a curve item draws, built from its source: channels, plus the runs and min/max envelope
 * of a sample set. `samples` and `envelope` are `undefined` for an item with no set, and
 * `unadjustedChannels` is a target's channels before the user's target adjustments (`undefined` for
 * anything that is not a target).
 *
 * There are two builders and they are not interchangeable. `curveDataFromRaw` smooths, so it takes
 * **raw** channels only; `renormalizedCurveData` only re-anchors what is already drawn. Smoothing is
 * not idempotent, so never hand already-smoothed channels to `curveDataFromRaw`.
 */
export interface CurveData {
	channels: ParsedFRData;
	samples: SampleData[] | undefined;
	envelope: Record<Channel, SampleEnvelope> | undefined;
	/** Present only for a target. Absent rather than `undefined`, so an item never gains the key. */
	unadjustedChannels?: ParsedFRData;
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
 *
 * A target's unadjusted channels are its processed channels: nothing has adjusted it yet. They are
 * the same object as `channels`, which is safe because drawn channel data is replaced, never edited
 * in place.
 */
export function curveDataFromRaw(raw: RawFRCache, type: FRDataType): CurveData {
	const params = processingParams();
	const channels = pickChannels(DataProcessor.processChannels(raw.channels, params));
	const unadjusted = isTargetType({ type }) ? { unadjustedChannels: channels } : {};
	if (!raw.samples) return { channels, samples: undefined, envelope: undefined, ...unadjusted };
	const samples = DataProcessor.processSamples(raw.samples, params);
	return { channels, samples, envelope: computeAllEnvelopes(samples), ...unadjusted };
}

/**
 * Normalize only: a changed normalization on what is already drawn. The channels are not smoothed
 * again, and the runs are re-anchored against the same pooled reference the channels use. An item
 * with no runs keeps its `samples` / `envelope` as they are. A target's unadjusted channels are
 * normalized the same way as its drawn ones, so the two stay on one reference.
 */
export function renormalizedCurveData(item: FRDataObject): CurveData {
	const { normType, normHz } = processingParams();
	const channels = pickChannels(normalizeChannels(item.channels, normType, normHz));
	const unadjusted = item.unadjustedChannels
		? { unadjustedChannels: normalizeChannels(item.unadjustedChannels, normType, normHz) }
		: {};
	if (!item.samples) {
		return { channels, samples: item.samples, envelope: item.envelope, ...unadjusted };
	}
	const samples = anchorAndNormalizeSamples(item.samples, normType, normHz);
	return { channels, samples, envelope: computeAllEnvelopes(samples), ...unadjusted };
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
