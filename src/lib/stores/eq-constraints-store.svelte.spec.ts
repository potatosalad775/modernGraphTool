import { describe, it, expect } from 'vitest';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import { mergePresets, sanitizeInlinePresets } from './eq-constraints-store.svelte.js';

function preset(id: string, overrides: Partial<EqConstraintPreset> = {}): EqConstraintPreset {
	return {
		id,
		label: id,
		mode: 'parametric',
		maxBands: 0,
		allowPk: true,
		allowLsq: true,
		allowHsq: true,
		freqMin: 20,
		freqMax: 20000,
		gainMin: -12,
		gainMax: 12,
		qMin: 0.1,
		qMax: 10,
		...overrides
	};
}

describe('mergePresets', () => {
	it('returns an empty array when no sources are provided', () => {
		expect(mergePresets([])).toEqual([]);
	});

	it('preserves source order for distinct ids', () => {
		const out = mergePresets([[preset('a'), preset('b')], [preset('c')], [preset('d')]]);
		expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('overrides earlier entries with later ones for the same id, keeping slot', () => {
		const out = mergePresets([
			[preset('a', { label: 'A1' }), preset('b', { label: 'B1' })],
			[preset('a', { label: 'A2 (later wins)' })]
		]);
		expect(out.map((p) => p.id)).toEqual(['a', 'b']);
		expect(out[0].label).toBe('A2 (later wins)');
		expect(out[1].label).toBe('B1');
	});

	it('drops entries with non-string ids defensively', () => {
		const out = mergePresets([
			[preset('a'), { ...preset('b'), id: undefined as unknown as string }, preset('c')]
		]);
		expect(out.map((p) => p.id)).toEqual(['a', 'c']);
	});
});

describe('sanitizeInlinePresets', () => {
	it('keeps well-formed presets', () => {
		const input = [preset('a'), preset('b', { label: 'Bee' })];
		const out = sanitizeInlinePresets(input);
		expect(out).toHaveLength(2);
		expect(out[1].label).toBe('Bee');
	});

	it('drops null/undefined entries', () => {
		const out = sanitizeInlinePresets([null, undefined, preset('a')]);
		expect(out.map((p) => p.id)).toEqual(['a']);
	});

	it('drops entries missing id or label', () => {
		const out = sanitizeInlinePresets([
			{ id: 'a', label: 'A', mode: 'parametric' },
			{ id: 'b' }, // missing label
			{ label: 'C' }, // missing id
			'not an object'
		]);
		expect(out.map((p) => p.id)).toEqual(['a']);
	});
});
