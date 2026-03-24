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
    throw new Error("Cannot normalize - invalid data structure");
  }

  const copy: ChannelData = JSON.parse(JSON.stringify(channelData));

  return type === "Hz"
    ? _normalizeByHz(copy, hzValue)
    : _normalizeByAvg(copy, 0);
}

/**
 * Normalize all channels in a ParsedFRData object.
 */
export function normalizeChannels(rawData: ParsedFRData, type: string, hzValue: number): ParsedFRData {
  const result: ParsedFRData = {};
  for (const channel of ["L", "R", "AVG"] as ('L' | 'R' | 'AVG')[]) {
    const ch = rawData[channel];
    if (ch?.data?.length) {
      result[channel] = normalize(ch, type, hzValue);
    }
  }
  return result;
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _normalizeByHz(data: ChannelData, targetHz: number): ChannelData {
  const targetFreq = Math.max(20, Math.min(20000, Number(targetHz)));
  const reference = _findNearestFrequency(data.data, targetFreq);

  if (!reference) {
    throw new Error(`No data near ${targetHz}Hz`);
  }

  const delta = -reference[1];
  data.data.forEach((point) => {
    point[1] = _clampDB(point[1] + delta);
  });
  return data;
}

function _normalizeByAvg(data: ChannelData, targetDB: number): ChannelData {
  const midLow = 300;
  const midHigh = 3000;
  const midrange = data.data.filter((p) => p[0] >= midLow && p[0] <= midHigh);

  if (midrange.length < 3) {
    throw new Error("Insufficient midrange data for normalization");
  }

  const avg = midrange.reduce((sum, p) => sum + p[1], 0) / midrange.length;
  const delta = targetDB - avg;

  data.data.forEach((point) => {
    point[1] = _clampDB(point[1] + delta);
  });
  return data;
}

function _clampDB(value: number): number {
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
