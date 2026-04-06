import { describe, it, expect } from 'vitest';
import {
	createFilterTypeMap,
	FIIO_FILTER_MAP,
	WALKPLAY_FILTER_MAP,
	KTMICRO_FILTER_MAP,
	QUDELIX_FILTER_MAP,
	WIIM_FILTER_MAP
} from './filter-type-maps.js';

describe('FilterTypeMap', () => {
	describe('createFilterTypeMap', () => {
		it('creates a bidirectional map', () => {
			const map = createFilterTypeMap({ PK: 0, LSQ: 1, HSQ: 2 });
			expect(map.toCode('PK')).toBe(0);
			expect(map.toCode('LSQ')).toBe(1);
			expect(map.toCode('HSQ')).toBe(2);
			expect(map.fromCode(0)).toBe('PK');
			expect(map.fromCode(1)).toBe('LSQ');
			expect(map.fromCode(2)).toBe('HSQ');
		});

		it('returns fallback for unknown codes', () => {
			const map = createFilterTypeMap({ PK: 0, LSQ: 1, HSQ: 2 });
			expect(map.fromCode(99)).toBe('PK');
		});
	});

	describe('round-trips', () => {
		const maps = [
			{ name: 'FIIO', map: FIIO_FILTER_MAP },
			{ name: 'WALKPLAY', map: WALKPLAY_FILTER_MAP },
			{ name: 'KTMICRO', map: KTMICRO_FILTER_MAP },
			{ name: 'QUDELIX', map: QUDELIX_FILTER_MAP },
			{ name: 'WIIM', map: WIIM_FILTER_MAP }
		];

		for (const { name, map } of maps) {
			it(`${name} round-trips all filter types`, () => {
				for (const type of ['PK', 'LSQ', 'HSQ'] as const) {
					const code = map.toCode(type);
					expect(map.fromCode(code)).toBe(type);
				}
			});
		}
	});

	describe('known mappings', () => {
		it('FIIO: PK=0, LSQ=1, HSQ=2', () => {
			expect(FIIO_FILTER_MAP.toCode('PK')).toBe(0);
			expect(FIIO_FILTER_MAP.toCode('LSQ')).toBe(1);
			expect(FIIO_FILTER_MAP.toCode('HSQ')).toBe(2);
		});

		it('WALKPLAY: PK=2, LSQ=1, HSQ=3', () => {
			expect(WALKPLAY_FILTER_MAP.toCode('PK')).toBe(2);
			expect(WALKPLAY_FILTER_MAP.toCode('LSQ')).toBe(1);
			expect(WALKPLAY_FILTER_MAP.toCode('HSQ')).toBe(3);
		});

		it('KTMICRO: PK=0, LSQ=3, HSQ=4', () => {
			expect(KTMICRO_FILTER_MAP.toCode('PK')).toBe(0);
			expect(KTMICRO_FILTER_MAP.toCode('LSQ')).toBe(3);
			expect(KTMICRO_FILTER_MAP.toCode('HSQ')).toBe(4);
		});

		it('QUDELIX: PK=13, LSQ=10, HSQ=11', () => {
			expect(QUDELIX_FILTER_MAP.toCode('PK')).toBe(13);
			expect(QUDELIX_FILTER_MAP.toCode('LSQ')).toBe(10);
			expect(QUDELIX_FILTER_MAP.toCode('HSQ')).toBe(11);
		});

		it('WIIM: PK=1, LSQ=0, HSQ=2', () => {
			expect(WIIM_FILTER_MAP.toCode('PK')).toBe(1);
			expect(WIIM_FILTER_MAP.toCode('LSQ')).toBe(0);
			expect(WIIM_FILTER_MAP.toCode('HSQ')).toBe(2);
		});
	});
});
