/**
 * Equalizer utility class for calculating filter responses and auto-EQ
 * Based on the original implementation from the old project
 */
export class Equalizer {
  constructor() {
    this.config = {
      DefaultSampleRate: 48000,
      TrebleStartFrom: 7000,
      AutoEQRange: [20, 15000],
      OptimizeQRange: [0.5, 2],
      OptimizeGainRange: [-12, 12],
      OptimizeDeltas: [
        [10, 10, 10, 5, 0.1, 0.5],
        [10, 10, 10, 2, 0.1, 0.2],
        [10, 10, 10, 1, 0.1, 0.1],
      ],
      GraphicEQRawFrequences: (
        new Array(Math.ceil(Math.log(20000 / 20) / Math.log(1.0072))).fill(null)
        .map((_, i) => 20 * Math.pow(1.0072, i))),
      GraphicEQFrequences: Array.from(new Set(
        new Array(Math.ceil(Math.log(20000 / 20) / Math.log(1.0563))).fill(null)
        .map((_, i) => Math.floor(20 * Math.pow(1.0563, i))))).sort((a, b) => a - b)
    };
  }

  _interpolate(fv, fr) {
    let i = 0;
    return fv.map(f => {
      for (; i < fr.length-1; ++i) {
        let [f0, v0] = fr[i];
        let [f1, v1] = fr[i+1];
        if (i == 0 && f < f0) {
          return [f, v0];
        } else if (f >= f0 && f < f1) {
          let v = v0 + (v1 - v0) * (f - f0) / (f1 - f0);
          return [f, v];
        }
      }
      return [f, fr[fr.length-1][1]];
    });
  }

  _lowshelf(freq, q, gain) {
    freq = freq / this.config.DefaultSampleRate;
    freq = Math.max(1e-6, Math.min(freq, 1));
    q = Math.max(1e-4, Math.min(q, 1000));
    gain = Math.max(-40, Math.min(gain, 40));

    let w0 = 2 * Math.PI * freq;
    let sin = Math.sin(w0);
    let cos = Math.cos(w0);
    let a = Math.pow(10, (gain / 40));
    let alpha = sin / (2 * q);
    let alphamod = (2 * Math.sqrt(a) * alpha) || 0;

    let a0 = ((a+1) + (a-1) * cos + alphamod);
    let a1 = -2 * ((a-1) + (a+1) * cos);
    let a2 = ((a+1) + (a-1) * cos - alphamod);
    let b0 = a * ((a+1) - (a-1) * cos + alphamod);
    let b1 = 2 * a * ((a-1) - (a+1) * cos);
    let b2 = a * ((a+1) - (a-1) * cos - alphamod);

    return [1.0, a1/a0, a2/a0, b0/a0, b1/a0, b2/a0];
  }

  _highshelf(freq, q, gain) {
    freq = freq / this.config.DefaultSampleRate;
    freq = Math.max(1e-6, Math.min(freq, 1));
    q = Math.max(1e-4, Math.min(q, 1000));
    gain = Math.max(-40, Math.min(gain, 40));

    let w0 = 2 * Math.PI * freq;
    let sin = Math.sin(w0);
    let cos = Math.cos(w0);
    let a = Math.pow(10, (gain / 40));
    let alpha = sin / (2 * q);
    let alphamod = (2 * Math.sqrt(a) * alpha) || 0;

    let a0 = ((a+1) - (a-1) * cos + alphamod);
    let a1 = 2 * ((a-1) - (a+1) * cos);
    let a2 = ((a+1) - (a-1) * cos - alphamod);
    let b0 = a * ((a+1) + (a-1) * cos + alphamod);
    let b1 = -2 * a * ((a-1) + (a+1) * cos);
    let b2 = a * ((a+1) + (a-1) * cos - alphamod);

    return [1.0, a1/a0, a2/a0, b0/a0, b1/a0, b2/a0];
  }

  _peaking(freq, q, gain) {
    freq = freq / this.config.DefaultSampleRate;
    freq = Math.max(1e-6, Math.min(freq, 1));
    q = Math.max(1e-4, Math.min(q, 1000));
    gain = Math.max(-40, Math.min(gain, 40));

    let w0 = 2 * Math.PI * freq;
    let sin = Math.sin(w0);
    let cos = Math.cos(w0);
    let alpha = sin / (2 * q);
    let a = Math.pow(10, (gain / 40));

    let a0 = 1 + alpha / a;
    let a1 = -2 * cos;
    let a2 = 1 - alpha / a;
    let b0 = 1 + alpha * a;
    let b1 = -2 * cos;
    let b2 = 1 - alpha * a;

    return [1.0, a1/a0, a2/a0, b0/a0, b1/a0, b2/a0];
  }

  _calculateGains(freqs, coeffs) {
    let gains = new Array(freqs.length).fill(0);

    for (let i = 0; i < coeffs.length; ++i) {
      let [a0, a1, a2, b0, b1, b2] = coeffs[i];
      for (let j = 0; j < freqs.length; ++j) {
        let w = 2 * Math.PI * freqs[j] / this.config.DefaultSampleRate;
        let phi = 4 * Math.pow(Math.sin(w / 2), 2);
        let c = (
          10 * Math.log10(Math.pow(b0 + b1 + b2, 2) +
            (b0 * b2 * phi - (b1 * (b0 + b2) + 4 * b0 * b2)) * phi) -
          10 * Math.log10(Math.pow(a0 + a1 + a2, 2) +
            (a0 * a2 * phi - (a1 * (a0 + a2) + 4 * a0 * a2)) * phi));
        gains[j] += c;
      }
    }
    return gains;
  }

  calculateGainsFromFilter(freqs, filters) {
    const coeffs = this._filtersToCoeffs(filters);
    return this._calculateGains(freqs, coeffs);
  }

  calculatePreamp(source, filters) {
    const fr1 = source;
    const fr2 = this.applyFilters(source, filters);
    let maxGain = -Infinity;
    for (let i = 0; i < fr1.length; ++i) {
      maxGain = Math.max(maxGain, fr2[i][1] - fr1[i][1]);
    }
    return -maxGain;
  }

  _calculateDistance(fr1, fr2) {
    let distance = 0;
    for (let i = 0; i < fr1.length; ++i) {
      let d = Math.abs(fr1[i][1] - fr2[i][1]);
      distance += (d >= 0.1 ? d : 0);
    }
    return distance / fr1.length;
  }

  _filtersToCoeffs(filters) {
    return filters.map(f => {
      if (!f.freq || !f.gain || !f.q) {
        return null;
      } else if (f.type === "LSQ") {
        return this._lowshelf(f.freq, f.q, f.gain);
      } else if (f.type === "HSQ") {
        return this._highshelf(f.freq, f.q, f.gain);
      } else if (f.type === "PK") {
        return this._peaking(f.freq, f.q, f.gain);
      }
      return null;
    }).filter(f => f);
  }
  
  _normalizeResolution(source, target) {
    // Generate 1/48 octave frequency points
    const frequencies = [20];
    const step = Math.pow(2, 1/48); // 1/48 octave steps
    while (frequencies[frequencies.length-1] < 20000) {
      frequencies.push(frequencies[frequencies.length-1] * step);
    }
    
    // Interpolate both source and target to the common frequency set
    const normalizedSource = this._interpolatePoints(frequencies, source);
    const normalizedTarget = this._interpolatePoints(frequencies, target);
    
    // Normalize target to match source at 1kHz reference point
    const refFreq = 1000;
    let sourceRefIdx = frequencies.findIndex(f => f >= refFreq);
    let targetRefIdx = sourceRefIdx;
    
    // Calculate offset to align target with source at reference point
    const offset = normalizedSource[sourceRefIdx][1] - normalizedTarget[targetRefIdx][1];
    
    // Apply offset to all target points
    const alignedTarget = normalizedTarget.map(point => [point[0], point[1] + offset]);
    
    return {
      source: normalizedSource,
      target: alignedTarget
    };
  }
  
  _interpolatePoints(freqs, points) {
    if (!points || points.length === 0) return freqs.map(f => [f, 0]);
    
    // Sort points by frequency
    const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);
    
    return freqs.map(f => {
      let i = 0;
      // Find the two points that surround the target frequency
      while (i < sortedPoints.length - 1 && sortedPoints[i + 1][0] < f) {
        i++;
      }
      
      if (i >= sortedPoints.length - 1) {
        // Beyond the last point, use the last value
        return [f, sortedPoints[sortedPoints.length - 1][1]];
      } else if (i < 0 || f <= sortedPoints[0][0]) {
        // Before the first point, use the first value
        return [f, sortedPoints[0][1]];
      } else {
        // Interpolate between two points using logarithmic interpolation for frequency
        const [f0, v0] = sortedPoints[i];
        const [f1, v1] = sortedPoints[i + 1];
        const ratio = Math.log(f / f0) / Math.log(f1 / f0);
        const v = v0 + ratio * (v1 - v0);
        return [f, v];
      }
    });
  }

  applyFilters(fr, filters) {
    let freqs = fr.map(p => p[0]);
    let coeffs = this._filtersToCoeffs(filters);
    let gains = this._calculateGains(freqs, coeffs);
    return freqs.map((f, i) => [f, fr[i][1] + gains[i]]);
  }

  _searchCandidates(fr, frTarget, threshold) {
    let state = 0; // 1: peak, 0: matched, -1: dip
    let startIndex = -1;
    let candidates = [];
    let [minFreq, maxFreq] = this.config.AutoEQRange;
    
    for (let i = 0; i < fr.length; ++i) {
      let [f, v0] = fr[i];
      let v1 = frTarget[i][1];
      let delta = v0 - v1;
      let deltaAbs = Math.abs(delta);
      let nextState = (deltaAbs < threshold) ? 0 : (delta / deltaAbs);
      
      if (nextState === state) continue;
      
      if (startIndex >= 0) {
        if (state != 0) {
          let start = fr[startIndex][0];
          let end = f;
          let center = Math.sqrt(start * end);
          let gain = (
            this._interpolate([center], frTarget.slice(startIndex, i))[0][1] -
            this._interpolate([center], fr.slice(startIndex, i))[0][1]);
          let q = center / (end - start);
          if (center >= minFreq && center <= maxFreq) {
            candidates.push({ type: "PK", freq: center, q, gain });
          }
        }
        startIndex = -1;
      } else {
        startIndex = i;
      }
      state = nextState;
    }
    return candidates;
  }

  _freqUnit(freq) {
    if (freq < 100) return 1;
    if (freq < 1000) return 10;
    if (freq < 10000) return 100;
    return 1000;
  }

  _stripFilters(filters) {
    let [minQ, maxQ] = this.config.OptimizeQRange;
    let [minGain, maxGain] = this.config.OptimizeGainRange;
    return filters.map(f => ({
      type: f.type,
      freq: Math.floor(f.freq - f.freq % this._freqUnit(f.freq)),
      q: Math.min(Math.max(Math.floor(f.q * 10) / 10, minQ), maxQ),
      gain: Math.min(Math.max(Math.floor(f.gain * 10) / 10, minGain), maxGain)
    }));
  }

  convertFilterAsGraphicEQ(filters) {
    let rawFreq = this.config.GraphicEQRawFrequences, eqFreq = this.config.GraphicEQFrequences;
    let coeffs = this._filtersToCoeffs(filters);
    let gains = this._calculateGains(rawFreq, coeffs);
    let rawFR = rawFreq.map((f, i) => [f, gains[i]]);
    // Interpolate and smoothing with moving average
    let i = 0;
    let resultFR = eqFreq.map((f, j) => {
        let freqTo = (j < eqFreq.length-1) ? Math.sqrt(f * eqFreq[j+1]) : 20000;
        let points = [];
        for (; i < rawFreq.length; ++i) {
            if (rawFreq[i] < freqTo) {
                points.push(rawFR[i][1]);
            } else {
                break
            }
        }
        let avg = points.reduce((a, b) => a + b, 0) / points.length;
        return [f, avg];
    });
    // Normalize (apply preamp)
    let maxGain = resultFR.reduce((a, b) => a > b[1] ? a : b[1], -Infinity);
    resultFR = resultFR.map(([f, v]) => [f, v-maxGain]);
    return resultFR;
  };

  _optimize(fr, frTarget, filters, iteration, dir = false) {
    filters = this._stripFilters(filters);
    
    let [minFreq, maxFreq] = this.config.AutoEQRange;
    let [minQ, maxQ] = this.config.OptimizeQRange;
    let [minGain, maxGain] = this.config.OptimizeGainRange;
    let [maxDF, maxDQ, maxDG, stepDF, stepDQ, stepDG] = this.config.OptimizeDeltas[iteration];
    let [begin, end, step] = (dir ? [filters.length-1, -1, -1] : [0, filters.length, 1]);
    
    for (let i = begin; i != end; i += step) {
      let f = filters[i];
      let fr1 = this.applyFilters(fr, filters.filter((f, fi) => fi !== i));
      let bestFilter = f;
      let bestDistance = this._calculateDistance(this.applyFilters(fr1, [f]), frTarget);
      
      let testNewFilter = (df, dq, dg) => {
        let freq = f.freq + df * this._freqUnit(f.freq) * stepDF;
        let q = f.q + dq * stepDQ;
        let gain = f.gain + dg * stepDG;
        if (freq < minFreq || freq > maxFreq || q < minQ || q > maxQ || gain < minGain || gain > maxGain) {
          return false;
        }
        let newFilter = { type: f.type, freq, q, gain };
        let newFR = this.applyFilters(fr1, [newFilter]);
        let newDistance = this._calculateDistance(newFR, frTarget);
        if (newDistance < bestDistance) {
          bestFilter = newFilter;
          bestDistance = newDistance;
          return true;
        }
        return false;
      }

      for (let df = -maxDF; df <= maxDF; ++df) {
        for (let dq = maxDQ; dq >= -maxDQ; --dq) {
          for (let dg = 0; dg <= maxDG; ++dg) {
            if (!testNewFilter(df, dq, dg)) break;
          }
          for (let dg = 0; dg >= -maxDG; --dg) {
            if (!testNewFilter(df, dq, dg)) break;
          }
        }
      }
      filters[i] = bestFilter;
    }
    return filters.sort((a, b) => a.freq - b.freq);
  }

  autoEQ(source, target, options = {}) {
    const maxFilters = options.maxFilters || 8;
    const freqRange = options.freqRange || this.config.AutoEQRange;
    const qRange = options.qRange || this.config.OptimizeQRange;
    const gainRange = options.gainRange || this.config.OptimizeGainRange;

    this.config.AutoEQRange = freqRange;
    this.config.OptimizeQRange = qRange;
    this.config.OptimizeGainRange = gainRange;

    // Filter points within frequency range
    const normalizedData = this._normalizeResolution(source, target);
    const fr = normalizedData.source.filter(p => p[0] >= freqRange[0] && p[0] <= freqRange[1]);
    const frTarget = normalizedData.target.filter(p => p[0] >= freqRange[0] && p[0] <= freqRange[1]);
    
    // First batch
    const firstBatchSize = Math.max(Math.floor(maxFilters / 2) - 1, 1);
    const firstCandidates = this._searchCandidates(fr, frTarget, 1);
    let firstFilters = firstCandidates
      .filter(c => c.freq <= this.config.TrebleStartFrom)
      .sort((a, b) => a.q - b.q)
      .slice(0, firstBatchSize)
      .sort((a, b) => a.freq - b.freq);
    
    // Optimize first batch
    for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
      firstFilters = this._optimize(fr, frTarget, firstFilters, i);
    }
    
    // Apply first batch and find remaining candidates
    const secondFR = this.applyFilters(fr, firstFilters);
    const secondBatchSize = maxFilters - firstFilters.length;
    const secondCandidates = this._searchCandidates(secondFR, frTarget, 0.5);
    
    // Second batch
    let secondFilters = secondCandidates
      .sort((a, b) => a.q - b.q)
      .slice(0, secondBatchSize)
      .sort((a, b) => a.freq - b.freq);
    
    // Optimize second batch
    for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
      secondFilters = this._optimize(secondFR, frTarget, secondFilters, i);
    }
    
    // Combine and optimize all filters
    let allFilters = [...firstFilters, ...secondFilters];
    for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
      allFilters = this._optimize(fr, frTarget, allFilters, i);
    }
    
    // Clean up and return
    return allFilters;
  }
}