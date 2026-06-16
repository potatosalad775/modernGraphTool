import type {
	ChannelData,
	ParsedFRData,
	FRDataPoint,
	SampleData,
	HpTFSampleData
} from '$lib/types/data-types.js';
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
	 * Smooth and normalize multi-sample data (L/R per sample). Each sample's L and
	 * R are normalized together with a single shared offset so the channel balance
	 * within a sample is preserved (see fr-normalizer#normalizeChannels).
	 */
	processSamples(rawSamples: SampleData[], params: ProcessingParams): SampleData[] {
		return rawSamples.map((sample) => {
			const raw: ParsedFRData = {};
			if (sample.L) raw.L = sample.L;
			if (sample.R) raw.R = sample.R;
			const processed = DataProcessor.processChannels(raw, params);
			const s: SampleData = {};
			if (processed.L) s.L = processed.L;
			if (processed.R) s.R = processed.R;
			return s;
		});
	},

	/**
	 * Smooth HpTF samples, then anchor-normalize so the envelope shape is
	 * invariant to the user's normalization choice (see anchorAndNormalizeHpTFSamples).
	 */
	processHpTFSamples(
		rawSamples: HpTFSampleData[],
		labels: string[],
		params: ProcessingParams
	): HpTFSampleData[] {
		const smoothed: HpTFSampleData[] = rawSamples.map((sample, i) => {
			const p: HpTFSampleData = { label: labels[i] ?? sample.label ?? `Sample ${i + 1}` };
			if (sample.L) p.L = FRSmoother.smoothChannels({ L: sample.L }, params.smoothValue).L;
			if (sample.R) p.R = FRSmoother.smoothChannels({ R: sample.R }, params.smoothValue).R;
			return p;
		});
		return anchorAndNormalizeHpTFSamples(smoothed, params.normType, params.normHz);
	}
};

/**
 * Anchor HpTF samples to a single shared "pooled mean" computed across every
 * L and R sample at each frequency, then normalize that pooled mean using the
 * user's normType/normHz. Every sample value — L and R alike — is placed by
 * adding its raw delta from the pooled mean onto the normalized pooled mean.
 *
 * Because all samples share the same vertical shift, every pairwise difference
 * (sample-to-sample within a channel AND L-to-R across channels) is preserved
 * exactly. The per-channel envelope span AND the combined L+R envelope span
 * (max upper / min lower across both channels, used by GraphEngine when both
 * channels are displayed) are both invariant to the user's normalization choice.
 * Only the envelope's vertical position translates with the normalized mean.
 *
 * AVG is recomputed per sample from the resulting L and R.
 */
export function anchorAndNormalizeHpTFSamples(
	samples: HpTFSampleData[],
	normType: string,
	normHz: number
): HpTFSampleData[] {
	if (samples.length === 0) return [];

	const result: HpTFSampleData[] = samples.map((s) => ({ label: s.label }));

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
		// Every HpTF curve shares the same frequency grid after smoothing, so
		// index-wise averaging is safe. (Matches the assumption in
		// DataProvider#computeHpTFEnvelope, which indexes the grid directly.)
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
