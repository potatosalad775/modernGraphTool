import type { ChannelData, ParsedFRData, FRDataPoint, SampleData } from '$lib/types/data-types.js';
import FRSmoother from './fr-smoother.js';
import { normalizeChannels, normalize, clampDB } from './fr-normalizer.js';

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
	processChannel(
		channelKey: 'L' | 'R',
		data: { L?: ChannelData; R?: ChannelData },
		params: ProcessingParams
	) {
		return normalizeChannels(
			FRSmoother.smoothChannels(
				{ [channelKey]: data[channelKey] } as ParsedFRData,
				params.smoothValue
			),
			params.normType,
			params.normHz
		)[channelKey];
	},

	/**
	 * Smooth a sample set, then anchor-normalize it so the spread between runs
	 * survives the user's normalization choice (see anchorAndNormalizeSamples).
	 *
	 * One path for every sample set, whatever it's drawn as. The old multi-sample
	 * path normalized each run on its own, which pinned every run to the same
	 * value at the anchor frequency and collapsed the true run-to-run spread there —
	 * invisible while only the average was drawn, wrong the moment a fill or a
	 * per-run curve appears. The pooled anchor is also the offset
	 * `normalizeChannels` computes for the averaged main channels, so runs and
	 * average now sit on a common reference rather than drifting apart.
	 */
	processSamples(rawSamples: SampleData[], params: ProcessingParams): SampleData[] {
		const smoothed: SampleData[] = rawSamples.map((sample) => {
			const p: SampleData = {};
			if (sample.label) p.label = sample.label;
			if (sample.L) p.L = FRSmoother.smoothChannels({ L: sample.L }, params.smoothValue).L;
			if (sample.R) p.R = FRSmoother.smoothChannels({ R: sample.R }, params.smoothValue).R;
			return p;
		});
		return anchorAndNormalizeSamples(smoothed, params.normType, params.normHz);
	}
};

/**
 * Anchor a sample set to a single shared "pooled mean" computed across every
 * L and R run at each frequency, then normalize that pooled mean using the
 * user's normType/normHz. Every run value — L and R alike — is placed by
 * adding its raw delta from the pooled mean onto the normalized pooled mean.
 *
 * Because all runs share the same vertical shift, every pairwise difference
 * (run-to-run within a channel AND L-to-R across channels) is preserved
 * exactly. The per-channel envelope span AND the combined L+R envelope span
 * (max upper / min lower across both channels, used by GraphEngine when both
 * channels are displayed) are both invariant to the user's normalization choice.
 * Only the envelope's vertical position translates with the normalized mean.
 *
 * AVG is recomputed per run from the resulting L and R.
 */
export function anchorAndNormalizeSamples(
	samples: SampleData[],
	normType: string,
	normHz: number
): SampleData[] {
	if (samples.length === 0) return [];

	const result: SampleData[] = samples.map((s) => (s.label ? { label: s.label } : {}));

	const pooled: ChannelData[] = [];
	for (const s of samples) {
		if (s.L) pooled.push(s.L);
		if (s.R) pooled.push(s.R);
	}

	if (pooled.length < 2) {
		// Nothing to pool against — fall back to per-curve normalization.
		for (let i = 0; i < samples.length; i++) {
			const s = samples[i];
			if (s.L) result[i].L = normalize(s.L, normType, normHz);
			if (s.R) result[i].R = normalize(s.R, normType, normHz);
		}
	} else {
		// Every run shares the same frequency grid after smoothing, so index-wise
		// averaging is safe. (Matches the assumption in DataProvider#computeEnvelope,
		// which indexes the grid directly.)
		const n = pooled[0].data.length;
		const meanPoints: FRDataPoint[] = new Array(n);
		for (let k = 0; k < n; k++) {
			let sum = 0;
			for (const c of pooled) sum += c.data[k][1];
			meanPoints[k] = [pooled[0].data[k][0], sum / pooled.length];
		}
		const mean: ChannelData = {
			data: meanPoints,
			metadata: { ...pooled[0].metadata }
		};
		const meanNorm = normalize(mean, normType, normHz);

		const applyDelta = (src: ChannelData): ChannelData => {
			const out: FRDataPoint[] = new Array(n);
			for (let k = 0; k < n; k++) {
				const v = meanNorm.data[k][1] + (src.data[k][1] - mean.data[k][1]);
				out[k] = [src.data[k][0], clampDB(v)];
			}
			return { data: out, metadata: { ...src.metadata } };
		};

		for (let i = 0; i < samples.length; i++) {
			const s = samples[i];
			if (s.L) result[i].L = applyDelta(s.L);
			if (s.R) result[i].R = applyDelta(s.R);
		}
	}

	for (const s of result) {
		if (s.L && s.R) {
			s.AVG = {
				data: s.L.data.map(
					([freq, lDb], idx) => [freq, (lDb + s.R!.data[idx][1]) / 2] as FRDataPoint
				),
				metadata: { ...s.L.metadata }
			};
		}
	}

	return result;
}
