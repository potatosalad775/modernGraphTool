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

/**
 * REW's variable-width smoothings are a different filter from the fixed ones, fitted the
 * same way against REW 5.40 and reproducing it to 0.0002 dB: a bilinear (Tustin)
 * first-order low-pass with time constant τ = 0.139472 × the local octave fraction, run six
 * times forward and only then six times backward. That order is REW's, not a
 * simplification — it is what lags the top end of the curve.
 */
const VARIABLE_PASSES = 6;
const TAU_PER_FRACTION = 0.139472;

/**
 * `power` is the exponent on power that gets averaged — 1 averages power; 1.5 averages
 * cubed amplitude, REW's "cubic mean" that weights peaks over dips. `anchors` are
 * [Hz, octave fraction] pairs; the fraction holds outside them and eases between each pair
 * along log fraction = a + (b − a)·t(2 − t), t the log-frequency position in the pair.
 */
interface VariableSmoothing {
	power: number;
	anchors: [number, number][];
}

const FRSmoother = {
	OCTAVE_BANDS: {
		'1/48': 1 / 48,
		'1/24': 1 / 24,
		'1/12': 1 / 12,
		'1/6': 1 / 6,
		'1/3': 1 / 3
	} as Record<string, number>,

	/** REW's Variable and Psychoacoustic smoothing, keyed by REW's own labels. */
	VARIABLE: {
		Var: {
			power: 1,
			anchors: [
				[100, 1 / 48],
				[1000, 1 / 6],
				[10000, 1 / 3]
			]
		},
		Psy: {
			power: 1.5,
			anchors: [
				[100, 1 / 3],
				[1000, 1 / 6]
			]
		}
	} as Record<string, VariableSmoothing>,

	/** Smooth a single data array using the given smoothing value. */
	smooth(data: FRDataPoint[], smoothValue: string): FRDataPoint[] {
		const smoother = this._smootherFor(smoothValue);
		if (!smoother || !data) return data;
		return smoother(data);
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
		const smoother = this._smootherFor(smoothValue);
		if (!smoother) return data;

		const smoothedData: ParsedFRData = {};
		for (const channel of ['L', 'R', 'AVG'] as ('L' | 'R' | 'AVG')[]) {
			const source = data[channel];
			if (!source) continue;
			smoothedData[channel] = this._isSmoothed(source, smoothValue)
				? source
				: {
						...source,
						data: smoother(source.data),
						metadata: { ...source.metadata, smoothing: smoothValue }
					};
		}
		return smoothedData;
	},

	/** The smoothing function for `smoothValue`, or undefined if it names none. */
	_smootherFor(smoothValue: string): ((data: FRDataPoint[]) => FRDataPoint[]) | undefined {
		const fraction = this.OCTAVE_BANDS[smoothValue];
		if (fraction) return (data) => this._smoothChannel(data, fraction);
		const variable = this.VARIABLE[smoothValue];
		if (variable) return (data) => this._smoothVariable(data, variable);
		return undefined;
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
	},

	/**
	 * Variable-width smoothing: per point, the octave fraction from `anchors` sets a
	 * Tustin first-order section's time constant; six forward passes, then six backward,
	 * over `power`-th powers of the power values. Same input contract as `_smoothChannel`.
	 */
	_smoothVariable(dataPoints: FRDataPoint[], { power, anchors }: VariableSmoothing): FRDataPoint[] {
		const count = dataPoints.length;
		if (count < 2) return dataPoints.map(([f, db]) => [f, db] as FRDataPoint);

		const pointsPerOctave = (count - 1) / Math.log2(dataPoints[count - 1][0] / dataPoints[0][0]);
		// y[i] = a·y[i−1] + b·(x[i] + x[i−1]), from the bilinear transform of 1/(1 + sτ)
		const a = new Float64Array(count);
		const b = new Float64Array(count);
		for (let i = 0; i < count; i++) {
			const tau =
				TAU_PER_FRACTION * this._variableFraction(anchors, dataPoints[i][0]) * pointsPerOctave;
			a[i] = (2 * tau - 1) / (2 * tau + 1);
			b[i] = 1 / (2 * tau + 1);
		}

		let values = new Float64Array(count);
		let floor = Infinity;
		for (let i = 0; i < count; i++) {
			values[i] = Math.pow(10, (dataPoints[i][1] * power) / 10);
			floor = Math.min(floor, values[i]);
		}

		// Each pass starts at steady state: the data is treated as continuing flat.
		for (let pass = 0; pass < 2 * VARIABLE_PASSES; pass++) {
			const out = new Float64Array(count);
			if (pass < VARIABLE_PASSES) {
				out[0] = values[0];
				for (let i = 1; i < count; i++)
					out[i] = a[i] * out[i - 1] + b[i] * (values[i] + values[i - 1]);
			} else {
				out[count - 1] = values[count - 1];
				for (let i = count - 2; i >= 0; i--)
					out[i] = a[i] * out[i + 1] + b[i] * (values[i] + values[i + 1]);
			}
			values = out;
		}

		// Below τ = 0.5 (Var's 1/48) the pole goes negative and the kernel rings, so an
		// extreme spike can leave a point below zero. No smoothing should read lower than
		// the input's own minimum, so that is the floor.
		return dataPoints.map(
			([f], i) => [f, (10 / power) * Math.log10(Math.max(values[i], floor))] as FRDataPoint
		);
	},

	/** The octave fraction a variable smoothing applies at `freq`. */
	_variableFraction(anchors: [number, number][], freq: number): number {
		if (freq <= anchors[0][0]) return anchors[0][1];
		for (let j = 1; j < anchors.length; j++) {
			const [f0, b0] = anchors[j - 1];
			const [f1, b1] = anchors[j];
			if (freq <= f1) {
				const t = Math.log2(freq / f0) / Math.log2(f1 / f0);
				return b0 * Math.pow(b1 / b0, t * (2 - t));
			}
		}
		return anchors[anchors.length - 1][1];
	}
};

export default FRSmoother;
