import type { ParsedFRData, FRDataPoint } from '$lib/types/data-types.js';

interface OctaveBand {
	lower: number;
	upper: number;
	centerFreq: number;
}

interface OctaveBandWithValues extends OctaveBand {
	values: number[];
}

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

	/** Smooth a single channel's data */
	_smoothChannel(dataPoints: FRDataPoint[], octave: string): FRDataPoint[] {
		const bands = this._createOctaveBands(octave);
		const binned = this._binData(dataPoints, bands);

		return binned.map(
			(bin) =>
				[bin.centerFreq, bin.values.reduce((a, b) => a + b, 0) / bin.values.length] as FRDataPoint
		);
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
	},

	/** Bin data points into octave bands */
	_binData(points: FRDataPoint[], bands: OctaveBand[]): OctaveBandWithValues[] {
		return bands
			.map((band) => ({
				...band,
				values: points.filter((p) => p && p[0] >= band.lower && p[0] <= band.upper).map((p) => p[1])
			}))
			.filter((bin) => bin.values.length > 0); // Skip empty bins
	}
};

export default FRSmoother;
