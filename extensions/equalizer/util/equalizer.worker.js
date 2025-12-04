/**
 * Web Worker for AutoEQ computation
 * This offloads the heavy autoEQ calculations to a separate thread
 * to prevent UI freezing
 */

// Import the Equalizer class logic inline since workers can't use ES modules easily
// We'll include a self-contained version of the Equalizer for the worker

class EqualizerWorker {
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
    const frequencies = [20];
    const step = Math.pow(2, 1/48);
    while (frequencies[frequencies.length-1] < 20000) {
      frequencies.push(frequencies[frequencies.length-1] * step);
    }
    
    const normalizedSource = this._interpolatePoints(frequencies, source);
    const normalizedTarget = this._interpolatePoints(frequencies, target);
    
    const refFreq = 1000;
    let sourceRefIdx = frequencies.findIndex(f => f >= refFreq);
    
    const offset = normalizedSource[sourceRefIdx][1] - normalizedTarget[sourceRefIdx][1];
    const alignedTarget = normalizedTarget.map(point => [point[0], point[1] + offset]);
    
    return {
      source: normalizedSource,
      target: alignedTarget
    };
  }
  
  _interpolatePoints(freqs, points) {
    if (!points || points.length === 0) return freqs.map(f => [f, 0]);
    
    const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);
    
    return freqs.map(f => {
      let i = 0;
      while (i < sortedPoints.length - 1 && sortedPoints[i + 1][0] < f) {
        i++;
      }
      
      if (i >= sortedPoints.length - 1) {
        return [f, sortedPoints[sortedPoints.length - 1][1]];
      } else if (i < 0 || f <= sortedPoints[0][0]) {
        return [f, sortedPoints[0][1]];
      } else {
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
    let state = 0;
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

  _round(value, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  _stripFilters(filters) {
    let [minQ, maxQ] = this.config.OptimizeQRange;
    let [minGain, maxGain] = this.config.OptimizeGainRange;
    return filters.map(f => ({
      type: f.type,
      freq: Math.floor(f.freq - f.freq % this._freqUnit(f.freq)),
      q: Math.min(Math.max(f.q, minQ), maxQ),
      gain: Math.min(Math.max(f.gain, minGain), maxGain)
    }));
  }

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
      
      const isShelfFilter = f.type === "LSQ" || f.type === "HSQ";
      const effectiveMinFreq = isShelfFilter ? (f.type === "LSQ" ? 20 : 4000) : minFreq;
      const effectiveMaxFreq = isShelfFilter ? (f.type === "LSQ" ? 400 : 16000) : maxFreq;
      const effectiveMinQ = isShelfFilter ? 0.3 : minQ;
      const effectiveMaxQ = isShelfFilter ? 1.5 : maxQ;
      
      let testNewFilter = (df, dq, dg) => {
        let freq = f.freq + df * this._freqUnit(f.freq) * stepDF;
        let q = f.q + dq * stepDQ;
        let gain = f.gain + dg * stepDG;
        if (freq < effectiveMinFreq || freq > effectiveMaxFreq || 
            q < effectiveMinQ || q > effectiveMaxQ || 
            gain < minGain || gain > maxGain) {
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

      let improved = true;
      let maxIterations = 50;
      let iterCount = 0;
      
      while (improved && iterCount < maxIterations) {
        improved = false;
        iterCount++;
        
        for (let df = -maxDF; df <= maxDF && !improved; df++) {
          if (df !== 0 && testNewFilter(df, 0, 0)) {
            f = bestFilter;
            improved = true;
          }
        }
        
        for (let dq = -maxDQ; dq <= maxDQ && !improved; dq++) {
          if (dq !== 0 && testNewFilter(0, dq, 0)) {
            f = bestFilter;
            improved = true;
          }
        }
        
        for (let dg = -maxDG; dg <= maxDG && !improved; dg++) {
          if (dg !== 0 && testNewFilter(0, 0, dg)) {
            f = bestFilter;
            improved = true;
          }
        }
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

  _analyzeShelfOpportunities(fr, frTarget) {
    const [minFreq, maxFreq] = this.config.AutoEQRange;
    const shelfFilters = [];
    
    const lowFreqPoints = fr.filter(p => p[0] >= minFreq && p[0] <= 200);
    const lowFreqTargetPoints = frTarget.filter(p => p[0] >= minFreq && p[0] <= 200);
    
    if (lowFreqPoints.length > 0 && lowFreqTargetPoints.length > 0) {
      let totalDelta = 0;
      let count = 0;
      for (let i = 0; i < lowFreqPoints.length; i++) {
        totalDelta += lowFreqTargetPoints[i][1] - lowFreqPoints[i][1];
        count++;
      }
      const avgDelta = totalDelta / count;
      
      if (Math.abs(avgDelta) > 1.5) {
        let shelfFreq = 100;
        for (let i = lowFreqPoints.length - 1; i >= 0; i--) {
          const delta = lowFreqTargetPoints[i][1] - lowFreqPoints[i][1];
          if (Math.sign(delta) === Math.sign(avgDelta) && Math.abs(delta) > 1) {
            shelfFreq = lowFreqPoints[i][0];
          } else {
            break;
          }
        }
        shelfFilters.push({
          type: "LSQ",
          freq: Math.max(shelfFreq, 50),
          q: 0.7,
          gain: avgDelta
        });
      }
    }
    
    const highFreqPoints = fr.filter(p => p[0] >= 8000 && p[0] <= maxFreq);
    const highFreqTargetPoints = frTarget.filter(p => p[0] >= 8000 && p[0] <= maxFreq);
    
    if (highFreqPoints.length > 0 && highFreqTargetPoints.length > 0) {
      let totalDelta = 0;
      let count = 0;
      for (let i = 0; i < highFreqPoints.length; i++) {
        totalDelta += highFreqTargetPoints[i][1] - highFreqPoints[i][1];
        count++;
      }
      const avgDelta = totalDelta / count;
      
      if (Math.abs(avgDelta) > 1.5) {
        let shelfFreq = 8000;
        for (let i = 0; i < highFreqPoints.length; i++) {
          const delta = highFreqTargetPoints[i][1] - highFreqPoints[i][1];
          if (Math.sign(delta) === Math.sign(avgDelta) && Math.abs(delta) > 1) {
            shelfFreq = highFreqPoints[i][0];
            break;
          }
        }
        shelfFilters.push({
          type: "HSQ",
          freq: Math.min(shelfFreq, 12000),
          q: 0.7,
          gain: avgDelta
        });
      }
    }
    
    return shelfFilters;
  }

  _calculateWeightedError(fr1, fr2) {
    let error = 0;
    for (let i = 0; i < fr1.length; i++) {
      const diff = Math.abs(fr1[i][1] - fr2[i][1]);
      error += diff * diff;
    }
    return Math.sqrt(error / fr1.length);
  }

  _scoreCandidates(fr, frTarget, candidates) {
    return candidates.map(c => {
      const newFR = this.applyFilters(fr, [c]);
      const originalError = this._calculateWeightedError(fr, frTarget);
      const newError = this._calculateWeightedError(newFR, frTarget);
      const improvement = originalError - newError;
      
      return {
        ...c,
        score: improvement,
        coverage: Math.abs(c.gain) / c.q
      };
    }).filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  _optimizeShelfFilter(fr, frTarget, filter) {
    const isLowShelf = filter.type === "LSQ";
    const [minGain, maxGain] = this.config.OptimizeGainRange;
    
    let bestFilter = { ...filter };
    let bestError = this._calculateWeightedError(this.applyFilters(fr, [filter]), frTarget);
    
    const freqSteps = isLowShelf ? [30, 50, 70, 100, 120, 150, 200, 250, 300] : 
                                   [4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];
    const qSteps = [0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5];
    
    for (const freq of freqSteps) {
      for (const q of qSteps) {
        let lowGain = minGain;
        let highGain = maxGain;
        
        while (highGain - lowGain > 0.2) {
          const midGain = (lowGain + highGain) / 2;
          const testFilter1 = { type: filter.type, freq, q, gain: midGain - 0.5 };
          const testFilter2 = { type: filter.type, freq, q, gain: midGain + 0.5 };
          
          const error1 = this._calculateWeightedError(this.applyFilters(fr, [testFilter1]), frTarget);
          const error2 = this._calculateWeightedError(this.applyFilters(fr, [testFilter2]), frTarget);
          
          if (error1 < error2) {
            highGain = midGain;
          } else {
            lowGain = midGain;
          }
        }
        
        const gain = (lowGain + highGain) / 2;
        const testFilter = { type: filter.type, freq, q, gain };
        const error = this._calculateWeightedError(this.applyFilters(fr, [testFilter]), frTarget);
        
        if (error < bestError) {
          bestFilter = testFilter;
          bestError = error;
        }
      }
    }
    
    return bestFilter;
  }

  _iterativeBatchOptimization(fr, frTarget, initialFilters, maxFilters) {
    let filters = [...initialFilters];
    let currentFR = this.applyFilters(fr, filters);
    
    while (filters.length < maxFilters) {
      const candidates = this._searchCandidates(currentFR, frTarget, 0.3);
      if (candidates.length === 0) break;
      
      const scoredCandidates = this._scoreCandidates(currentFR, frTarget, candidates);
      if (scoredCandidates.length === 0) break;
      
      const bestCandidate = scoredCandidates[0];
      filters.push({
        type: bestCandidate.type,
        freq: bestCandidate.freq,
        q: bestCandidate.q,
        gain: bestCandidate.gain
      });
      
      for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
        filters = this._optimize(fr, frTarget, filters, i);
        filters = this._optimize(fr, frTarget, filters, i, true);
      }
      
      currentFR = this.applyFilters(fr, filters);
      
      const remainingError = this._calculateWeightedError(currentFR, frTarget);
      if (remainingError < 0.5) break;
    }
    
    return filters;
  }

  _pruneIneffectiveFilters(fr, frTarget, filters) {
    const baselineError = this._calculateWeightedError(this.applyFilters(fr, filters), frTarget);
    
    return filters.filter((filter, index) => {
      const withoutThisFilter = filters.filter((_, i) => i !== index);
      const errorWithout = this._calculateWeightedError(this.applyFilters(fr, withoutThisFilter), frTarget);
      const contribution = errorWithout - baselineError;
      
      return contribution > 0.1;
    });
  }

  autoEQ(source, target, options = {}) {
    const maxFilters = options.maxFilters || 8;
    const freqRange = options.freqRange || this.config.AutoEQRange;
    const qRange = options.qRange || this.config.OptimizeQRange;
    const gainRange = options.gainRange || this.config.OptimizeGainRange;
    const useShelfFilter = options.useShelfFilter !== false;

    this.config.AutoEQRange = freqRange;
    this.config.OptimizeQRange = qRange;
    this.config.OptimizeGainRange = gainRange;

    const normalizedData = this._normalizeResolution(source, target);
    const fr = normalizedData.source.filter(p => p[0] >= freqRange[0] && p[0] <= freqRange[1]);
    const frTarget = normalizedData.target.filter(p => p[0] >= freqRange[0] && p[0] <= freqRange[1]);
    
    let initialFilters = [];
    let remainingFilterSlots = maxFilters;
    
    if (useShelfFilter) {
      const shelfSuggestions = this._analyzeShelfOpportunities(fr, frTarget);
      
      for (const shelf of shelfSuggestions) {
        if (remainingFilterSlots <= 2) break;
        
        const optimizedShelf = this._optimizeShelfFilter(fr, frTarget, shelf);
        
        const withShelf = this.applyFilters(fr, [...initialFilters, optimizedShelf]);
        const withoutShelf = this.applyFilters(fr, initialFilters);
        const improvementWithShelf = this._calculateWeightedError(withoutShelf, frTarget) - 
                                     this._calculateWeightedError(withShelf, frTarget);
        
        if (improvementWithShelf > 0.3) {
          initialFilters.push(optimizedShelf);
          remainingFilterSlots--;
        }
      }
    }
    
    let allFilters = this._iterativeBatchOptimization(fr, frTarget, initialFilters, maxFilters);
    
    for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
      allFilters = this._optimize(fr, frTarget, allFilters, i);
      allFilters = this._optimize(fr, frTarget, allFilters, i, true);
    }
    
    allFilters = this._pruneIneffectiveFilters(fr, frTarget, allFilters);
    
    // Round final values and sort by frequency
    return allFilters.map(f => ({
      type: f.type,
      freq: this._round(f.freq, 0),
      q: this._round(f.q, 2),
      gain: this._round(f.gain, 1)
    })).sort((a, b) => a.freq - b.freq);
  }
}

// Worker message handler
const equalizer = new EqualizerWorker();

self.onmessage = function(e) {
  const { type, payload, id } = e.data;
  
  if (type === 'autoEQ') {
    try {
      const { source, target, options } = payload;
      const filters = equalizer.autoEQ(source, target, options);
      self.postMessage({ type: 'result', id, payload: { filters } });
    } catch (error) {
      self.postMessage({ type: 'error', id, payload: { message: error.message } });
    }
  }
};
