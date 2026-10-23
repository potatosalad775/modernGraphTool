import type { ParsedFRData, FRDataPoint, ChannelData } from '#lib/types/data-types.js';

/**
 * Fractional-octave smoothing, matching REW's to within float rounding.
 *
 * REW documents its kernel as "multiple forward and backward passes of first order IIR
 * filters" approximating a Gaussian (Alvarez–Mazorra). The constants below were fitted
 * against REW 5.40's own output over its API and reproduce it exactly, edges included:
 * four passes, σ = 3/8 of the octave fraction, averaged in power rather than dB.
 * A true Gaussian is not a substitute — REW's kernel has heavier tails, which decide
 * how deep a narrow notch reads (up to 2.4 dB apart at 1/3oct).
 */
const PASSES = 4;
const SIGMA_PER_FRACTION = 0.375;

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
		return this._smoothChannel(data, this.OCTAVE_BANDS[smoothValue]);
	},

	/**
	 * Smooth all channels in a ParsedFRData using the given octave smoothing value, and
	 * tag each with it (`metadata.smoothing`).
	 *
	 * Smoothing always starts from raw data. A channel already smoothed at this value
	 * passes through unchanged; one smoothed at another value is a pipeline bug — every
	 * extra pass blurs the curve further — so it throws in dev and passes through in
	 * production.
	 */
	smoothChannels(data: ParsedFRData, smoothValue: string): ParsedFRData {
		const fraction = this.OCTAVE_BANDS[smoothValue];
		if (!fraction) return data;

		const smoothedData: ParsedFRData = {};
		for (const channel of ['L', 'R', 'AVG'] as ('L' | 'R' | 'AVG')[]) {
			const source = data[channel];
			if (!source) continue;
			smoothedData[channel] = this._isSmoothed(source, smoothValue)
				? source
				: {
						...source,
						data: this._smoothChannel(source.data, fraction),
						metadata: { ...source.metadata, smoothing: smoothValue }
					};
		}
		return smoothedData;
	},

	/** Whether `channel` already carries smoothing; throws (dev) if it is not `smoothValue`. */
	_isSmoothed(channel: ChannelData, smoothValue: string): boolean {
		const applied = channel.metadata.smoothing;
		if (applied === undefined) return false;
		if (applied !== smoothValue) {
			const message = `FRSmoother: asked for ${smoothValue} smoothing on data already smoothed at ${applied}`;
			if (import.meta.env.DEV) throw new Error(message);
			console.warn(message);
		}
		return true;
	},

	/**
	 * Smooth one channel: four forward/backward first-order recursions over the power
	 * values. The output keeps the input's frequencies.
	 *
	 * `dataPoints` must be sorted and evenly spaced in log frequency — the parser's
	 * 1/48oct grid, which every caller passes. The spacing is read off the endpoints.
	 */
	_smoothChannel(dataPoints: FRDataPoint[], fraction: number): FRDataPoint[] {
		const count = dataPoints.length;
		if (count < 2) return dataPoints.map(([f, db]) => [f, db] as FRDataPoint);

		const pointsPerOctave = (count - 1) / Math.log2(dataPoints[count - 1][0] / dataPoints[0][0]);
		const sigma = SIGMA_PER_FRACTION * fraction * pointsPerOctave; // in samples
		// Each pass is a two-sided exponential nu^|n|, with variance 2nu/(1-nu)^2; the
		// passes split σ² between them evenly.
		const variance = (sigma * sigma) / PASSES;
		const nu = (variance + 1 - Math.sqrt(2 * variance + 1)) / variance;
		const gain = (1 - nu) * (1 - nu); // undoes one pass's DC gain of 1/(1-nu)^2

		const power = new Float64Array(count);
		for (let i = 0; i < count; i++) power[i] = Math.pow(10, dataPoints[i][1] / 10);

		for (let pass = 0; pass < PASSES; pass++) {
			// Steady-state starts: the data is treated as continuing flat past each end.
			// Starting from zero instead drags the ends down by up to 13 dB at 1/3oct.
			power[0] /= 1 - nu;
			for (let i = 1; i < count; i++) power[i] += nu * power[i - 1];
			power[count - 1] /= 1 - nu;
			for (let i = count - 2; i >= 0; i--) power[i] += nu * power[i + 1];
			for (let i = 0; i < count; i++) power[i] *= gain;
		}

		return dataPoints.map(([f], i) => [f, 10 * Math.log10(power[i])] as FRDataPoint);
	}
};

export default FRSmoother;
