import CoreEvent from "../../core-event.js";

/**
 * @typedef {import('../../types/data-types.js').ParsedFRData} ParsedFRData
 * @typedef {import('../../types/data-types.js').FRDataPoint} FRDataPoint
 */

const FRSmoother = {
  /** @type {{[key: string]: number}} */
  OCTAVE_BANDS: {
    '1/48': 1/48,
    '1/24': 1/24,
    '1/12': 1/12,
    '1/6': 1/6, 
    '1/3': 1/3
  },
  /** @type {string} */
  currentSmoothValue: '1/48',

  /**
   * Smooth the frequency response data based on the current smoothing value.
   * @param {FRDataPoint[]} data 
   * @returns {FRDataPoint[]}
   */
  smooth(data) {
    if (!this.OCTAVE_BANDS[this.currentSmoothValue] || !data) return data;
    return this._smoothChannel(data, this.currentSmoothValue);
  },

  /**
   * Smooth the frequency response data across all channels.
   * @param {ParsedFRData} data 
   * @returns {ParsedFRData}
   */
  smoothChannels(data) {
    if (!this.OCTAVE_BANDS[this.currentSmoothValue]) return data;
    
    // Process each channel
    const smoothedData = {};
    for (const channel of ['L', 'R', 'AVG']) {
      smoothedData[channel] = {
        ...(data[channel] && { ...data[channel] }), // Copy existing data
        data: this._smoothChannel(data[channel]?.data || [], this.currentSmoothValue)
      };
    }
    return smoothedData;
  },

  /**
   * Update the current smoothing value and dispatch an event.
   * @param {string|null} octave - The new octave division (e.g., '1/48', '1/24', etc.) or null to keep current.
   */
  async updateSmoothing(octave = null) {
    if(octave !== null) {
      this.currentSmoothValue = octave;
    }
    // Dispatch Event
    CoreEvent.dispatchEvent("fr-smoothing-updated");
  },

  /**
   * Smooth a single channel's data
   * @param {FRDataPoint[]} dataPoints
   * @param {string} octave
   * @returns {FRDataPoint[]}
   */
  _smoothChannel(dataPoints, octave) {
    const bands = this._createOctaveBands(octave);
    const binned = this._binData(dataPoints, bands);
    
    return binned.map(bin => [
      bin.centerFreq,
      bin.values.reduce((a, b) => a + b, 0) / bin.values.length
    ]);
  },

  /**
   * Create octave bands based on the specified octave division
   * @param {string} octave - The octave division (e.g., '1/48', '1/24', etc.)
   * @returns {Array<{lower: number, upper: number, centerFreq: number}>}
   * @private
   */
  _createOctaveBands(octave) {
    const bands = [];
    let f = 20;
    const fraction = this.OCTAVE_BANDS[octave];
    
    while(f < 20000) {
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

  /**
   * Bin data points into octave bands
   * @param {FRDataPoint[]} points - Frequency response data points
   * @param {Array<{lower: number, upper: number, centerFreq: number}>} bands - Octave bands
   * @returns {Array<{lower: number, upper: number, centerFreq: number, values: number[]}>}
   * @private
   */
  _binData(points, bands) {
    return bands.map(band => ({
      ...band,
      values: points
        .filter(p => p && p[0] >= band.lower && p[0] <= band.upper)
        .map(p => p[1])
    })).filter(bin => bin.values.length > 0); // Skip empty bins
  }
}

export default FRSmoother;