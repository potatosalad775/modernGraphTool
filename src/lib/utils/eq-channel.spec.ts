import { describe, it, expect } from 'vitest';
import type { EQFilter } from './equalizer.js';
import {
	compareByChannelThenFreq,
	countBandsPerOutput,
	countSharedFilters,
	effectiveFilters,
	filtersInScope,
	hasPerChannelFilters,
	indexedEffectiveFilters,
	indexedFiltersInScope,
	sanitizeChannel,
	trimToBandsPerOutput
} from './eq-channel.js';

function band(freq: number, channel?: 'L' | 'R'): EQFilter {
	return { enabled: true, type: 'PK', freq, q: 1, gain: 1, ...(channel ? { channel } : {}) };
}

describe('effectiveFilters', () => {
	it('gives an ear the shared bands plus its own', () => {
		const filters = [band(100), band(200, 'L'), band(300, 'R'), band(400)];
		expect(effectiveFilters(filters, 'L').map((f) => f.freq)).toEqual([100, 200, 400]);
		expect(effectiveFilters(filters, 'R').map((f) => f.freq)).toEqual([100, 300, 400]);
	});

	it('returns the whole list when nothing is per-channel', () => {
		const filters = [band(100), band(200), band(300)];
		expect(effectiveFilters(filters, 'L')).toEqual(filters);
		expect(effectiveFilters(filters, 'R')).toEqual(filters);
	});

	it('treats an explicitly undefined channel as shared', () => {
		const filters = [{ ...band(100), channel: undefined }];
		expect(effectiveFilters(filters, 'L')).toHaveLength(1);
		expect(effectiveFilters(filters, 'R')).toHaveLength(1);
	});
});

describe('filtersInScope', () => {
	it('returns only the bucket asked for', () => {
		const filters = [band(100), band(200, 'L'), band(300, 'R')];
		expect(filtersInScope(filters, 'BOTH').map((f) => f.freq)).toEqual([100]);
		expect(filtersInScope(filters, 'L').map((f) => f.freq)).toEqual([200]);
		expect(filtersInScope(filters, 'R').map((f) => f.freq)).toEqual([300]);
	});

	it('excludes shared bands from a single-ear scope', () => {
		// The shared bands still *apply* to that ear — the list just doesn't own
		// them, which is what the "+N shared bands" hint exists to say.
		const filters = [band(100), band(200, 'L')];
		expect(filtersInScope(filters, 'L')).toHaveLength(1);
		expect(effectiveFilters(filters, 'L')).toHaveLength(2);
	});
});

describe('indexed variants keep the flat-array index', () => {
	const filters = [band(100), band(200, 'L'), band(300, 'R'), band(400, 'L')];

	it('indexedFiltersInScope reports positions in the whole array', () => {
		expect(indexedFiltersInScope(filters, 'L').map((d) => d.index)).toEqual([1, 3]);
		expect(indexedFiltersInScope(filters, 'BOTH').map((d) => d.index)).toEqual([0]);
	});

	it('indexedEffectiveFilters reports positions in the whole array', () => {
		expect(indexedEffectiveFilters(filters, 'L').map((d) => d.index)).toEqual([0, 1, 3]);
		expect(indexedEffectiveFilters(filters, 'R').map((d) => d.index)).toEqual([0, 2]);
	});
});

describe('hasPerChannelFilters / countSharedFilters', () => {
	it('is false for a shared-only list', () => {
		expect(hasPerChannelFilters([band(100), band(200)])).toBe(false);
	});

	it('is true once any band is pinned', () => {
		expect(hasPerChannelFilters([band(100), band(200, 'R')])).toBe(true);
	});

	it('counts shared bands', () => {
		expect(countSharedFilters([band(100), band(200), band(300, 'L')])).toBe(2);
	});
});

describe('countBandsPerOutput', () => {
	it('equals the list length when nothing is per-channel', () => {
		const filters = [band(100), band(200), band(300)];
		expect(countBandsPerOutput(filters)).toBe(filters.length);
	});

	it('charges a shared band to both ears and a pinned band to one', () => {
		// 2 shared + 3 L + 1 R → the left ear realises 5, which is the busiest.
		const filters = [
			band(100),
			band(200),
			band(300, 'L'),
			band(400, 'L'),
			band(500, 'L'),
			band(600, 'R')
		];
		expect(filters).toHaveLength(6);
		expect(countBandsPerOutput(filters)).toBe(5);
	});

	it('does not double-count a symmetric split', () => {
		expect(countBandsPerOutput([band(100, 'L'), band(200, 'R')])).toBe(1);
	});
});

describe('trimToBandsPerOutput', () => {
	it('is a no-op when maxBands is unlimited', () => {
		const filters = [band(100), band(200, 'L')];
		expect(trimToBandsPerOutput(filters, 0)).toEqual(filters);
	});

	it('degenerates to a prefix cut for a shared-only list', () => {
		const filters = [band(100), band(200), band(300), band(400)];
		expect(trimToBandsPerOutput(filters, 2).map((f) => f.freq)).toEqual([100, 200]);
	});

	it('keeps more bands than a flat cut would, since ears are counted apart', () => {
		// A flat slice(0, 3) would drop the R band; per output, all four fit
		// because each ear only realises three.
		const filters = [band(100), band(200), band(300, 'L'), band(400, 'R')];
		expect(trimToBandsPerOutput(filters, 3)).toHaveLength(4);
		expect(countBandsPerOutput(trimToBandsPerOutput(filters, 3))).toBe(3);
	});

	it('never leaves an output over the cap', () => {
		const filters = [
			band(100),
			band(200, 'L'),
			band(300, 'L'),
			band(400, 'L'),
			band(500, 'R'),
			band(600)
		];
		const trimmed = trimToBandsPerOutput(filters, 3);
		expect(countBandsPerOutput(trimmed)).toBeLessThanOrEqual(3);
	});
});

describe('compareByChannelThenFreq', () => {
	it('groups buckets shared → L → R and sorts each by frequency', () => {
		const filters = [
			band(900, 'R'),
			band(200),
			band(500, 'L'),
			band(100),
			band(300, 'L'),
			band(700, 'R')
		];
		const sorted = [...filters].sort(compareByChannelThenFreq);
		expect(sorted.map((f) => [f.channel ?? 'BOTH', f.freq])).toEqual([
			['BOTH', 100],
			['BOTH', 200],
			['L', 300],
			['L', 500],
			['R', 700],
			['R', 900]
		]);
	});

	it('sorts a bandless (null freq) entry last within its bucket', () => {
		const filters = [{ ...band(0), freq: null }, band(100)];
		const sorted = [...filters].sort(compareByChannelThenFreq);
		expect(sorted[0].freq).toBe(100);
	});
});

describe('sanitizeChannel', () => {
	it('passes through the two real channels', () => {
		expect(sanitizeChannel('L')).toBe('L');
		expect(sanitizeChannel('R')).toBe('R');
	});

	it('drops anything else to shared', () => {
		for (const bad of ['AVG', 'l', '', 0, null, undefined, {}]) {
			expect(sanitizeChannel(bad)).toBeUndefined();
		}
	});
});
