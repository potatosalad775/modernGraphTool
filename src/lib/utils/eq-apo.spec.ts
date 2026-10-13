import { describe, it, expect } from 'vitest';
import type { EQFilter } from './equalizer.js';
import { formatApoFilters, parseApoConfig, parseApoFilters } from './eq-apo.js';

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
			['Filter 1: ON LP Fc 100 Hz', 'Filter 2: ON PK Fc 200 Hz Gain 1.0 dB Q 1.000'].join('\n')
		);
		expect(filters).toHaveLength(1);
		expect(filters[0].freq).toBe(200);
	});

	it('reads and writes the gainless types without a Gain field', () => {
		const text = [
			'Filter 1: ON HPQ Fc 30 Hz Q 0.707',
			'Filter 2: OFF NO Fc 6000 Hz Q 4.000',
			'Filter 3: ON BP Fc 100 Hz Gain 1.0 dB Q 1.000'
		].join('\n');
		const filters = parseApoFilters(text);
		expect(filters).toEqual([
			{ enabled: true, type: 'HPQ', freq: 30, gain: 0, q: 0.707 },
			{ enabled: false, type: 'NO', freq: 6000, gain: 0, q: 4 },
			{ enabled: true, type: 'BP', freq: 100, gain: 0, q: 1 }
		]);
		expect(formatApoFilters(filters, 0)).toContain('Filter 1: ON HPQ Fc 30 Hz Q 0.707\n');
		expect(parseApoFilters(formatApoFilters(filters, 0))).toEqual(filters);
	});

	it('skips a gain type written without a gain', () => {
		expect(parseApoFilters('Filter 1: ON PK Fc 100 Hz Q 1.000')).toEqual([]);
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

	// APO counts positions from 1 in the device layout; on stereo, 1 = L, 2 = R.
	it('reads numbered channel positions as ears', () => {
		const filters = parseApoFilters(
			[
				'Channel: 1',
				'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000',
				'Channel: 2',
				'Filter 2: ON PK Fc 200 Hz Gain 1.0 dB Q 1.000',
				'Channel: 1 2',
				'Filter 3: ON PK Fc 300 Hz Gain 1.0 dB Q 1.000'
			].join('\n')
		);
		expect(filters.map((f) => f.channel)).toEqual(['L', 'R', undefined]);
	});

	// "The filter number (n) is not interpreted and can be omitted."
	it('accepts a Filter command without a number', () => {
		const filters = parseApoFilters('Filter: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000');
		expect(filters).toEqual([{ enabled: true, type: 'PK', freq: 100, gain: 1, q: 1 }]);
	});

	it('ignores a trailing comment on a filter or channel line', () => {
		const filters = parseApoFilters(
			['Channel: L # left ear', 'Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000 # bass'].join('\n')
		);
		expect(filters).toEqual([
			{ enabled: true, type: 'PK', freq: 100, gain: 1, q: 1, channel: 'L' }
		]);
	});

	describe('bandwidth and slope', () => {
		// APO uses RBJ's digital bandwidth, so the same BW is a lower Q near Nyquist.
		it('converts a bandwidth in octaves to Q', () => {
			const [low, high] = parseApoFilters(
				[
					'Filter 1: ON PK Fc 1000 Hz Gain 3.0 dB BW Oct 1',
					'Filter 2: ON PK Fc 10000 Hz Gain 3.0 dB BW Oct 1'
				].join('\n')
			);
			expect(low.q).toBeCloseTo(1.41, 2);
			expect(high.q).toBeCloseTo(1.026, 3);
		});

		it('gives a shelf without Q the default 12 dB/oct slope', () => {
			const filters = parseApoFilters(
				['Filter 1: ON LSC Fc 100 Hz Gain 3.0 dB', 'Filter 2: ON HS Fc 8000 Hz Gain -2.0 dB'].join(
					'\n'
				)
			);
			expect(filters.map((f) => [f.type, f.q])).toEqual([
				['LSQ', 0.707],
				['HSQ', 0.707]
			]);
		});

		it('converts a shelf slope in dB per octave to Q', () => {
			const [gentle, standard] = parseApoFilters(
				[
					'Filter 1: ON LSC 6 dB Fc 100 Hz Gain 6.0 dB',
					'Filter 2: ON HSC 12 dB Fc 8000 Hz Gain 6.0 dB'
				].join('\n')
			);
			expect(gentle).toMatchObject({ type: 'LSQ', freq: 100, gain: 6, q: 0.493 });
			expect(standard).toMatchObject({ type: 'HSQ', freq: 8000, gain: 6, q: 0.707 });
		});

		it('skips a slope too steep for its gain', () => {
			expect(parseApoConfig('Filter 1: ON LSC 24 dB Fc 100 Hz Gain 30.0 dB')).toEqual({
				filters: [],
				skipped: 1
			});
		});
	});

	describe('skip count', () => {
		it('counts the filter lines it could not import, and nothing else', () => {
			const { filters, skipped } = parseApoConfig(
				[
					'Preamp: -3.0 dB',
					'# Filter 9: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000',
					// A gainless type imports; without a Q it has nothing to build.
					'Filter 1: ON BP Fc 100 Hz Q 1.000',
					'Filter 2: ON NO Fc 200 Hz',
					// Corner-frequency shelves are a different filter from the RBJ shelf.
					'Filter 3: ON LS 6dB Fc 100 Hz Gain 3.0 dB',
					'Filter 4: ON HS 12dB Fc 8000 Hz Gain 3.0 dB',
					// APO requires Q or BW on a peak.
					'Filter 5: ON PK Fc 300 Hz Gain 3.0 dB',
					'Filter 6: ON PK Fc 1000 Hz Gain 1.0 dB Q 1.000'
				].join('\n')
			);
			expect(filters.map((f) => f.type)).toEqual(['BP', 'PK']);
			expect(skipped).toBe(4);
		});

		it('is zero for a file that imports whole', () => {
			expect(parseApoConfig('Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.000').skipped).toBe(0);
		});
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
