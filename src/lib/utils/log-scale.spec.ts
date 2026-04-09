import { describe, it, expect } from 'vitest';
import { logToLinear, linearToLog, formatFreq, formatGain, formatQ } from './log-scale.js';

describe('logToLinear', () => {
	it('maps minimum value to 0', () => {
		expect(logToLinear(20, 20, 20000)).toBe(0);
	});

	it('maps maximum value to steps', () => {
		expect(logToLinear(20000, 20, 20000)).toBe(1000);
	});

	it('maps geometric midpoint to steps/2', () => {
		const geomMid = Math.sqrt(20 * 20000); // ~632.46
		expect(logToLinear(geomMid, 20, 20000)).toBe(500);
	});

	it('maps 1 kHz in 20-20k range to ~567', () => {
		// log10(1000) - log10(20) / (log10(20000) - log10(20)) * 1000
		const result = logToLinear(1000, 20, 20000);
		expect(result).toBeGreaterThan(550);
		expect(result).toBeLessThan(580);
	});

	it('respects custom steps parameter', () => {
		const result = logToLinear(20000, 20, 20000, 500);
		expect(result).toBe(500);
	});

	it('returns integer positions', () => {
		const freqs = [30, 100, 500, 1000, 5000, 15000];
		for (const f of freqs) {
			const result = logToLinear(f, 20, 20000);
			expect(result).toBe(Math.round(result));
		}
	});
});

describe('linearToLog', () => {
	it('maps position 0 to min', () => {
		expect(linearToLog(0, 20, 20000)).toBeCloseTo(20, 5);
	});

	it('maps position steps to max', () => {
		expect(linearToLog(1000, 20, 20000)).toBeCloseTo(20000, 0);
	});

	it('maps midpoint to geometric mean', () => {
		const geomMid = Math.sqrt(20 * 20000);
		expect(linearToLog(500, 20, 20000)).toBeCloseTo(geomMid, 2);
	});

	it('respects custom steps parameter', () => {
		expect(linearToLog(0, 20, 20000, 500)).toBeCloseTo(20, 5);
		expect(linearToLog(500, 20, 20000, 500)).toBeCloseTo(20000, 0);
	});
});

describe('logToLinear / linearToLog roundtrip', () => {
	const testFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

	it('roundtrips representative frequencies within rounding tolerance', () => {
		for (const freq of testFreqs) {
			const pos = logToLinear(freq, 20, 20000);
			const recovered = linearToLog(pos, 20, 20000);
			// Integer rounding in logToLinear causes proportionally larger absolute
			// error at higher frequencies — use relative tolerance (~1%)
			const relativeError = Math.abs(recovered - freq) / freq;
			expect(relativeError).toBeLessThan(0.02);
		}
	});

	it('roundtrips Q factor range (0.1 to 30)', () => {
		const qValues = [0.1, 0.5, 0.707, 1.0, 1.414, 5.0, 10.0, 30.0];
		for (const q of qValues) {
			const pos = logToLinear(q, 0.1, 30);
			const recovered = linearToLog(pos, 0.1, 30);
			expect(recovered).toBeCloseTo(q, 1);
		}
	});
});

describe('formatFreq', () => {
	it('returns "--" for null', () => {
		expect(formatFreq(null)).toBe('--');
	});

	it('returns whole number string below 1000', () => {
		expect(formatFreq(200)).toBe('200');
	});

	it('rounds sub-1000 values', () => {
		expect(formatFreq(999)).toBe('999');
	});

	it('returns one-decimal kHz for 1000-9999', () => {
		expect(formatFreq(1000)).toBe('1.0k');
	});

	it('formats mid-kHz range', () => {
		expect(formatFreq(2500)).toBe('2.5k');
	});

	it('returns whole kHz for >=10000', () => {
		expect(formatFreq(10000)).toBe('10k');
	});

	it('formats 20kHz', () => {
		expect(formatFreq(20000)).toBe('20k');
	});
});

describe('formatGain', () => {
	it('returns "--" for null', () => {
		expect(formatGain(null)).toBe('--');
	});

	it('prepends + for positive values', () => {
		expect(formatGain(3)).toBe('+3.0');
	});

	it('shows negative sign for negative values', () => {
		expect(formatGain(-1.5)).toBe('-1.5');
	});

	it('shows no sign prefix for zero', () => {
		expect(formatGain(0)).toBe('0.0');
	});
});

describe('formatQ', () => {
	it('returns "--" for null', () => {
		expect(formatQ(null)).toBe('--');
	});

	it('formats to 2 decimal places', () => {
		expect(formatQ(0.707)).toBe('0.71');
	});

	it('formats whole number Q', () => {
		expect(formatQ(1)).toBe('1.00');
	});
});
