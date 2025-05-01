/**
 * Equalizer utility class for calculating filter responses
 */
export class Equalizer {
  constructor() {
    this.config = {
      DefaultSampleRate: 48000,
    };
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

  applyFilters(fr, filters) {
    let freqs = fr.map(p => p[0]);
    let coeffs = this._filtersToCoeffs(filters);
    let gains = this._calculateGains(freqs, coeffs);
    return freqs.map((f, i) => [f, fr[i][1] + gains[i]]);
  }
}