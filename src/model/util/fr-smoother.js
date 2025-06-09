import CoreEvent from "../../core-event.js";

const FRSmoother = {
  OCTAVE_BANDS: {
    '1/48': 1/48,
    '1/24': 1/24,
    '1/12': 1/12,
    '1/6': 1/6, 
    '1/3': 1/3
  },
  currentSmoothValue: '1/48',

  // New method to get smoothed data for d3 path
  smooth(data) {
    if (!this.OCTAVE_BANDS[this.currentSmoothValue] || !data) return data;
    return this._smoothChannel(data, this.currentSmoothValue);
  },

  smoothChannels(data) {
    if (!this.OCTAVE_BANDS[this.currentSmoothValue]) return data;
    
    // Process each channel
    const smoothedData = {};
    for (const channel of ['L', 'R', 'AVG']) {
      if (data[channel]) {
        const smoothed = this._smoothChannel(data[channel].data, this.currentSmoothValue);
        smoothedData[channel] = {
          ...data[channel],
          data: smoothed
        };
      }
    }
    return smoothedData;
  },

  async updateSmoothing(octave = null) {
    if(octave !== null) {
      this.currentSmoothValue = octave;
    }
    // Dispatch Event
    CoreEvent.dispatchEvent("fr-smoothing-updated");
  },

  _smoothChannel(dataPoints, octave) {
    const bands = this._createOctaveBands(octave);
    const binned = this._binData(dataPoints, bands);
    
    return binned.map(bin => [
      bin.centerFreq,
      bin.values.reduce((a, b) => a + b, 0) / bin.values.length
    ]);
  },

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