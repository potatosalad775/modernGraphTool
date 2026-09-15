import type { ParsedFRData, FRDataPoint } from '$lib/types/data-types.js';

interface OctaveBand {
	lower: number;
	upper: number;
	centerFreq: number;
}

/** Bands per octave key — five keys, each computed once. */
const bandCache = new Map<string, OctaveBand[]>();

const FRSmoother = {
	OCTAVE_BANDS: {
		'1/48': 1 / 48,
		'1/24': 1 / 24,
		'1/12': 1 / 12,
		'1/6': 1 / 6,
		'1/3': 1 / 3
	} as Record<string, number>,

	/** Smooth a single data array using the given octave smoothing value. */
	smooth(data: FRDataPoint[], smoothValue: string): FRDataPoint[] {
		if (!this.OCTAVE_BANDS[smoothValue] || !data) return data;
		return this._smoothChannel(data, smoothValue);
	},

	/** Smooth all channels in a ParsedFRData using the given octave smoothing value. */
	smoothChannels(data: ParsedFRData, smoothValue: string): ParsedFRData {
		if (!this.OCTAVE_BANDS[smoothValue]) return data;

		const smoothedData: ParsedFRData = {};
		for (const channel of ['L', 'R', 'AVG'] as ('L' | 'R' | 'AVG')[]) {
			if (data[channel]) {
				smoothedData[channel] = {
					...data[channel]!,
					data: this._smoothChannel(data[channel]!.data, smoothValue)
				};
			}
		}
		return smoothedData;
	},

	/**
	 * Smooth a single channel's data: each non-empty band becomes one point at its
	 * centre, carrying the mean of the points inside it.
	 *
	 * `dataPoints` must be sorted by frequency (every caller passes the parser's
	 * 1/48oct grid), so one cursor walks the points and the bands together.
	 */
	_smoothChannel(dataPoints: FRDataPoint[], octave: string): FRDataPoint[] {
		let bands = bandCache.get(octave);
		if (!bands) {
			bands = this._createOctaveBands(octave);
			bandCache.set(octave, bands);
		}

		const smoothed: FRDataPoint[] = [];
		const count = dataPoints.length;
		let start = 0;
		for (const { lower, upper, centerFreq } of bands) {
			// Membership is inclusive at both ends and each band's upper edge is the
			// next band's lower edge, so a point exactly on a boundary counts in both —
			// on the 1/48oct grid that is every point. Start from the first point at or
			// above `lower`, which may be the previous band's last one.
			while (start < count && (!dataPoints[start] || dataPoints[start][0] < lower)) start++;

			let sum = 0;
			let members = 0;
			for (let i = start; i < count; i++) {
				const point = dataPoints[i];
				if (!point) continue;
				if (point[0] > upper) break;
				sum += point[1];
				members++;
			}
			if (members > 0) smoothed.push([centerFreq, sum / members]);
		}
		return smoothed;
	},

	/** Create octave bands based on the specified octave division */
	_createOctaveBands(octave: string): OctaveBand[] {
		const bands: OctaveBand[] = [];
		let f = 20;
		const fraction = this.OCTAVE_BANDS[octave];

		while (f < 20000) {
			const upper = f * Math.pow(2, fraction);
			bands.push({
				lower: f,
				upper: upper,
				centerFreq: Math.sqrt(f * upper)
			});
			f = upper;
		}

		return bands;
	}
};

export default FRSmoother;
