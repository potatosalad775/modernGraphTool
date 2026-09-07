import { describe, it, expect } from 'vitest';
import type { EQFilter } from './equalizer.js';
import { formatApoFilters, parseApoFilters } from './eq-apo.js';

function band(over: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 100, q: 1, gain: 3, ...over };
}

describe('parseApoFilters', () => {
	it('parses a plain single-channel config', () => {
		const filters = parseApoFilters(
			[
				'Preamp: -6.3 dB',
				'Filter 1: ON PK Fc 105 Hz Gain -3.2 dB Q 1.410',
				'Filter 2: ON LSC Fc 80 Hz Gain 2.0 dB Q 0.700'
			].join('\n')
		);
		expect(filters).toEqual([
			{ enabled: true, type: 'PK', freq: 105, gain: -3.2, q: 1.41 },
			{ enabled: true, type: 'LSQ', freq: 80, gain: 2, q: 0.7 }
		]);
	});

	it('leaves every band shared when there is no Channel directive', () => {
		const filters = parseApoFilters('Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000');
		expect(filters[0].channel).toBeUndefined();
	});

	it('scopes filters to the preceding Channel directive', () => {
		const filters = parseApoFilters(
			[
				'Preamp: -4.0 dB',
				'Channel: ALL',
				'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000',
				'Channel: L',
				'Filter 2: ON PK Fc 200 Hz Gain 2.0 dB Q 1.000',
				'Channel: R',
				'Filter 3: ON PK Fc 300 Hz Gain 3.0 dB Q 1.000',
				'Channel: ALL',
				'Filter 4: ON PK Fc 400 Hz Gain 4.0 dB Q 1.000'
			].join('\n')
		);
		expect(filters.map((f) => [f.freq, f.channel])).toEqual([
			[100, undefined],
			[200, 'L'],
			[300, 'R'],
			[400, undefined]
		]);
	});

	it('treats "Channel: L R" as shared — it names both ears', () => {
		const filters = parseApoFilters(
			['Channel: L R', 'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000'].join('\n')
		);
		expect(filters[0].channel).toBeUndefined();
	});

	it('falls back to shared for a channel layout it does not model', () => {
		const filters = parseApoFilters(
			['Channel: C SUB', 'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000'].join('\n')
		);
		expect(filters).toHaveLength(1);
		expect(filters[0].channel).toBeUndefined();
	});

	it('honours OFF as a disabled band', () => {
		const filters = parseApoFilters(
			[
				'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000',
				'Filter 2: OFF PK Fc 200 Hz Gain 2.0 dB Q 1.000'
			].join('\n')
		);
		expect(filters.map((f) => f.enabled)).toEqual([true, false]);
	});

	it('accepts a decimal centre frequency', () => {
		const filters = parseApoFilters('Filter 1: ON PK Fc 105.5 Hz Gain 1.0 dB Q 1.000');
		expect(filters[0].freq).toBeCloseTo(105.5);
	});

	it('maps APO shelf spellings onto the internal names', () => {
		const filters = parseApoFilters(
			[
				'Filter 1: ON LSC Fc 100 Hz Gain 1.0 dB Q 1.000',
				'Filter 2: ON HSC Fc 8000 Hz Gain 1.0 dB Q 1.000',
				'Filter 3: ON PEQ Fc 1000 Hz Gain 1.0 dB Q 1.000'
			].join('\n')
		);
		expect(filters.map((f) => f.type)).toEqual(['LSQ', 'HSQ', 'PK']);
	});

	it('skips filter types it cannot represent rather than importing them as peaks', () => {
		const filters = parseApoFilters(
			[
				'Filter 1: ON BP Fc 100 Hz Gain 1.0 dB Q 1.000',
				'Filter 2: ON PK Fc 200 Hz Gain 1.0 dB Q 1.000'
			].join('\n')
		);
		expect(filters).toHaveLength(1);
		expect(filters[0].freq).toBe(200);
	});

	it('ignores directives and blank lines it has no use for', () => {
		const filters = parseApoFilters(
			[
				'# a comment',
				'Include: other.txt',
				'',
				'Convolution: impulse.wav',
				'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000'
			].join('\n')
		);
		expect(filters).toHaveLength(1);
	});

	it('handles CRLF line endings', () => {
		const filters = parseApoFilters(
			'Channel: L\r\nFilter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000\r\n'
		);
		expect(filters[0].channel).toBe('L');
	});

	it('returns nothing for a file with no filter lines', () => {
		expect(parseApoFilters('Preamp: -3.0 dB\n')).toEqual([]);
	});
});

describe('formatApoFilters', () => {
	it('writes no Channel line for a shared-only EQ', () => {
		const text = formatApoFilters([band({ freq: 105, gain: -3.2, q: 1.41 })], -6.3);
		expect(text).toBe('Preamp: -6.3 dB\nFilter 1: ON PK Fc 105 Hz Gain -3.2 dB Q 1.410\n');
		expect(text).not.toContain('Channel:');
	});

	it('groups per-channel bands into ALL / L / R sections', () => {
		const text = formatApoFilters(
			[
				band({ freq: 100, gain: 1 }),
				band({ freq: 300, gain: 3, channel: 'R' }),
				band({ freq: 200, gain: 2, channel: 'L' })
			],
			-3
		);
		expect(text).toBe(
			[
				'Preamp: -3.0 dB',
				'Channel: ALL',
				'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000',
				'Channel: L',
				'Filter 2: ON PK Fc 200 Hz Gain 2.0 dB Q 1.000',
				'Channel: R',
				'Filter 3: ON PK Fc 300 Hz Gain 3.0 dB Q 1.000',
				''
			].join('\n')
		);
	});

	it('numbers filters sequentially across sections so no two collide', () => {
		const text = formatApoFilters(
			[band({ channel: 'L' }), band({ channel: 'L' }), band({ channel: 'R' })],
			0
		);
		expect(text.match(/Filter (\d+):/g)).toEqual(['Filter 1:', 'Filter 2:', 'Filter 3:']);
	});

	it('omits a section with no bands', () => {
		const text = formatApoFilters([band(), band({ channel: 'L' })], 0);
		expect(text).toContain('Channel: ALL');
		expect(text).toContain('Channel: L');
		expect(text).not.toContain('Channel: R');
	});

	it('writes a disabled band as OFF', () => {
		const text = formatApoFilters([band({ enabled: false })], 0);
		expect(text).toContain('Filter 1: OFF PK');
	});

	it('drops incomplete bands', () => {
		const text = formatApoFilters([band({ freq: null }), band({ freq: 100 })], 0);
		expect(text.match(/Filter/g)).toHaveLength(1);
	});
});

describe('round trip', () => {
	it('preserves buckets, enablement and values through format → parse', () => {
		const original: EQFilter[] = [
			band({ freq: 105, gain: -3.2, q: 1.41 }),
			band({ freq: 2400, gain: 2, q: 0.9, type: 'LSQ' }),
			band({ freq: 6800, gain: -1.4, q: 2, channel: 'L' }),
			band({ freq: 6800, gain: -2.1, q: 2, channel: 'R', enabled: false })
		];
		const parsed = parseApoFilters(formatApoFilters(original, -4.2));
		expect(parsed).toEqual([
			{ enabled: true, type: 'PK', freq: 105, gain: -3.2, q: 1.41 },
			{ enabled: true, type: 'LSQ', freq: 2400, gain: 2, q: 0.9 },
			{ enabled: true, type: 'PK', freq: 6800, gain: -1.4, q: 2, channel: 'L' },
			{ enabled: false, type: 'PK', freq: 6800, gain: -2.1, q: 2, channel: 'R' }
		]);
	});
});
