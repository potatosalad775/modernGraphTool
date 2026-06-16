import type { ChannelData, ParsedFRData, FRDataPoint } from '$lib/types/data-types.js';

/**
 * Normalize a single channel's FR data.
 *
 * @param channelData - Deep-copied before mutation; original is never modified.
 * @param type        - 'Hz' | 'Avg'
 * @param hzValue     - Target frequency for Hz normalization (ignored for Avg).
 */
export function normalize(channelData: ChannelData, type: string, hzValue: number): ChannelData {
	if (!channelData?.data?.length) {
		throw new Error('Cannot normalize - invalid data structure');
	}
	return _shiftChannel(channelData, _computeDelta(channelData, type, hzValue));
}

/**
 * Normalize all channels in a ParsedFRData object with a single shared offset.
 *
 * The offset is computed once from a reference channel (AVG when present, else
 * the mean of L and R, else the single channel that exists) and applied
 * identically to every channel. Because L and R are shifted by the same amount,
 * their difference — the true left/right channel balance — is preserved exactly,
 * instead of being flattened to zero at the normalization point. This mirrors the
 * shared-offset anchoring used for HpTF samples in
 * `data-processor.ts#anchorAndNormalizeHpTFSamples`.
 */
export function normalizeChannels(
	rawData: ParsedFRData,
	type: string,
	hzValue: number
): ParsedFRData {
	const result: ParsedFRData = {};
	const reference = _offsetReference(rawData);
	if (!reference) return result;

	const delta = _computeDelta(reference, type, hzValue);
	for (const channel of ['L', 'R', 'AVG'] as ('L' | 'R' | 'AVG')[]) {
		const ch = rawData[channel];
		if (ch?.data?.length) {
			result[channel] = _shiftChannel(ch, delta);
		}
	}
	return result;
}

// ── Private helpers ────────────────────────────────────────────────────────────

/** Compute the dB offset that normalization would apply, without mutating. */
function _computeDelta(data: ChannelData, type: string, hzValue: number): number {
	return type === 'Hz' ? _hzDelta(data, hzValue) : _avgDelta(data);
}

function _hzDelta(data: ChannelData, targetHz: number): number {
	const targetFreq = Math.max(20, Math.min(20000, Number(targetHz)));
	const reference = _findNearestFrequency(data.data, targetFreq);

	if (!reference) {
		throw new Error(`No data near ${targetHz}Hz`);
	}

	return -reference[1];
}

function _avgDelta(data: ChannelData): number {
	const midLow = 300;
	const midHigh = 3000;
	const midrange = data.data.filter((p) => p[0] >= midLow && p[0] <= midHigh);

	if (midrange.length < 3) {
		throw new Error('Insufficient midrange data for normalization');
	}

	const avg = midrange.reduce((sum, p) => sum + p[1], 0) / midrange.length;
	return -avg;
}

/** Deep-copy a channel and shift every point by `delta` (clamped). */
function _shiftChannel(channelData: ChannelData, delta: number): ChannelData {
	const copy: ChannelData = structuredClone(channelData);
	copy.data.forEach((point) => {
		point[1] = clampDB(point[1] + delta);
	});
	return copy;
}

/**
 * Pick the channel whose value anchors the shared offset: AVG (already (L+R)/2
 * for phones) when present, else the index-wise mean of L and R when both exist,
 * else whichever single channel is available. Returns null if none have data.
 */
function _offsetReference(rawData: ParsedFRData): ChannelData | null {
	if (rawData.AVG?.data?.length) return rawData.AVG;

	const l = rawData.L?.data?.length ? rawData.L : null;
	const r = rawData.R?.data?.length ? rawData.R : null;
	if (l && r) return _meanChannel(l, r);
	return l ?? r;
}

/**
 * Index-wise mean of two channels. Both come from the same measurement pair and
 * share a frequency grid; if their lengths ever diverge, fall back to `l` — the
 * channel balance is preserved regardless, since both channels receive the same
 * delta either way.
 */
function _meanChannel(l: ChannelData, r: ChannelData): ChannelData {
	if (l.data.length !== r.data.length) return l;
	return {
		data: l.data.map(([freq, lDb], i) => [freq, (lDb + r.data[i][1]) / 2] as FRDataPoint),
		metadata: { ...l.metadata }
	};
}

export function clampDB(value: number): number {
	return Math.max(-40, Math.min(120, Number(value.toFixed(2))));
}

function _findNearestFrequency(points: FRDataPoint[], targetHz: number): FRDataPoint {
	const index = points.findIndex((p) => p[0] >= targetHz);
	if (index === -1) return points[points.length - 1];
	if (index === 0) return points[0];

	// Logarithmic interpolation for better accuracy
	const [f0, db0] = points[index - 1];
	const [f1, db1] = points[index];
	const t = (Math.log(targetHz) - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
	return [targetHz, db0 + t * (db1 - db0)];
}
