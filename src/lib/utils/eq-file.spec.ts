import { describe, it, expect } from 'vitest';
import {
	eqFileLabel,
	graphicEqBands,
	graphicEqExport,
	importOutcome,
	omittedPerEarCount,
	parametricExport
} from './eq-file.js';
import type { EQFilter } from './equalizer.js';

function band(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3, ...overrides };
}

describe('eqFileLabel', () => {
	it('is null with no source', () => {
		expect(eqFileLabel(null, null)).toBeNull();
		expect(eqFileLabel(null, 'Run 1')).toBeNull();
	});

	it('is the identifier alone for a source with no variant', () => {
		expect(eqFileLabel({ identifier: 'HD600', dispSuffix: '' }, null)).toBe('HD600');
	});

	it('appends the variant suffix', () => {
		expect(eqFileLabel({ identifier: 'HD600', dispSuffix: 'Stock' }, null)).toBe('HD600 Stock');
	});

	it('appends the run label after the variant, with single spaces', () => {
		expect(eqFileLabel({ identifier: 'HD600', dispSuffix: 'Stock' }, 'Center')).toBe(
			'HD600 Stock Center'
		);
		expect(eqFileLabel({ identifier: 'HD600', dispSuffix: '' }, 'Center')).toBe('HD600 Center');
		expect(eqFileLabel({ identifier: 'HD600', dispSuffix: '' }, '')).toBe('HD600');
	});

	it('removes the characters a file name cannot hold', () => {
		expect(eqFileLabel({ identifier: 'A\\B/C:D*E?F"G<H>I|J', dispSuffix: '' }, null)).toBe(
			'ABCDEFGHIJ'
		);
		expect(eqFileLabel({ identifier: 'HD650/HD6XX', dispSuffix: '' }, 'Run: 2')).toBe(
			'HD650HD6XX Run 2'
		);
	});

	it('trims what the removal leaves at the edges', () => {
		expect(eqFileLabel({ identifier: '? Name', dispSuffix: '' }, null)).toBe('Name');
	});

	it('is null when only forbidden characters are left', () => {
		expect(eqFileLabel({ identifier: '*?', dispSuffix: '' }, null)).toBeNull();
	});
});

describe('parametricExport', () => {
	it('is null when no band is complete', () => {
		expect(parametricExport([], 0, null)).toBeNull();
		expect(parametricExport([band({ freq: null })], 0, null)).toBeNull();
	});

	it('leaves an incomplete band out', () => {
		const out = parametricExport(
			[band({ freq: 100 }), band({ q: null }), band({ gain: null })],
			0,
			null
		)!;
		expect(out.text.match(/^Filter /gm)).toHaveLength(1);
		expect(out.text).toContain('Fc 100 Hz');
	});

	// A parked band must survive a round trip, so it is written OFF rather than dropped.
	it('writes a disabled complete band as OFF', () => {
		const out = parametricExport([band({ freq: 100, enabled: false })], 0, null)!;
		expect(out.text).toContain('Filter 1: OFF PK Fc 100 Hz');
	});

	it('carries the preamp into the text', () => {
		const out = parametricExport([band()], -4.26, null)!;
		expect(out.text.startsWith('Preamp: -4.3 dB\n')).toBe(true);
	});

	it('names the file after the label, or a bare "filters.txt"', () => {
		expect(parametricExport([band()], 0, 'HD600 Stock')!.filename).toBe('HD600 Stock filters.txt');
		expect(parametricExport([band()], 0, null)!.filename).toBe('filters.txt');
	});
});

describe('graphicEqBands / omittedPerEarCount', () => {
	const filters = [
		band({ freq: 100 }),
		band({ freq: 200, enabled: false }),
		band({ freq: 300, channel: 'L' }),
		band({ freq: 400, channel: 'R' }),
		band({ freq: 500, channel: 'R', enabled: false })
	];

	it('keeps only the enabled shared bands', () => {
		expect(graphicEqBands(filters).map((f) => f.freq)).toEqual([100]);
	});

	it('counts only the enabled per-ear bands as omitted', () => {
		expect(omittedPerEarCount(filters)).toBe(2);
	});
});

describe('graphicEqExport', () => {
	it('is null when no enabled shared band is left', () => {
		expect(graphicEqExport([], null)).toBeNull();
		expect(graphicEqExport([band({ enabled: false })], null)).toBeNull();
		expect(graphicEqExport([band({ channel: 'L' })], null)).toBeNull();
	});

	it('leaves disabled bands out of the curve', () => {
		const withOff = graphicEqExport(
			[band(), band({ freq: 100, gain: -12, enabled: false })],
			null
		)!;
		const alone = graphicEqExport([band()], null)!;
		expect(withOff.text).toBe(alone.text);
	});

	it('leaves per-ear bands out of the curve and counts the enabled ones', () => {
		const out = graphicEqExport(
			[
				band(),
				band({ freq: 100, gain: -12, channel: 'L' }),
				band({ freq: 5000, gain: 4, channel: 'R', enabled: false })
			],
			null
		)!;
		expect(out.text).toBe(graphicEqExport([band()], null)!.text);
		expect(out.omitted).toBe(1);
	});

	it('omits nothing when there are no per-ear bands', () => {
		expect(graphicEqExport([band()], null)!.omitted).toBe(0);
	});

	it('writes "GraphicEQ: " and freq/gain pairs joined by "; "', () => {
		const { text } = graphicEqExport([band()], null)!;
		expect(text.startsWith('GraphicEQ: ')).toBe(true);
		const pairs = text.slice('GraphicEQ: '.length).split('; ');
		expect(pairs.length).toBeGreaterThan(1);
		for (const pair of pairs) expect(pair).toMatch(/^\d+ -?\d+\.\d$/);
	});

	it('names the file after the label, or "graphic_eq.txt"', () => {
		expect(graphicEqExport([band()], 'HD600')!.filename).toBe('HD600 GraphicEQ.txt');
		expect(graphicEqExport([band()], null)!.filename).toBe('graphic_eq.txt');
	});
});

describe('importOutcome', () => {
	it('returns the filters and how many lines were skipped', () => {
		const out = importOutcome(
			[
				'Filter: ON PK Fc 100 Hz Gain 3.0 dB Q 1.000',
				'Filter: ON NO Fc 200 Hz',
				'Filter: ON LS 6dB Fc 300 Hz Gain 3.0 dB'
			].join('\n')
		);
		expect(out.kind).toBe('filters');
		if (out.kind !== 'filters') return;
		expect(out.filters).toHaveLength(1);
		expect(out.filters[0]).toMatchObject({ type: 'PK', freq: 100, gain: 3, q: 1 });
		expect(out.skipped).toBe(2);
	});

	it('reports no skipped lines for a clean file', () => {
		const out = importOutcome('Filter 1: ON PK Fc 100 Hz Gain 3.0 dB Q 1.000');
		expect(out).toMatchObject({ kind: 'filters', skipped: 0 });
	});

	it('is none for an empty file', () => {
		expect(importOutcome('')).toEqual({ kind: 'none' });
	});

	it('is none for a file of only unsupported lines, skipped or not', () => {
		expect(importOutcome('Filter: ON NO Fc 200 Hz\nFilter: ON LS 6dB Fc 300 Hz Gain 3 dB')).toEqual(
			{ kind: 'none' }
		);
	});
});
