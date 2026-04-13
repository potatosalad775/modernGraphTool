import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MetadataParser from './metadata-parser.js';
import type { BrandMetadata, TargetManifestEntry, RawPhoneData } from '$lib/types/data-types.js';

// ── Mock data factories ──────────────────────────────────────────────────────

function makeMockBrandData(): BrandMetadata[] {
	return [
		{
			brand: 'Sennheiser',
			phones: [
				{
					brand: 'Sennheiser',
					name: 'HD 600',
					identifier: 'Sennheiser HD 600',
					files: [
						{
							suffix: '',
							fullName: 'Sennheiser HD 600',
							files: { L: 'HD 600 L.txt', R: 'HD 600 R.txt' },
							fileName: 'HD 600'
						}
					]
				},
				{
					brand: 'Sennheiser',
					name: 'HD 800 S',
					identifier: 'Sennheiser HD 800 S',
					files: [
						{
							suffix: 'Stock',
							fullName: 'Sennheiser HD 800 S Stock',
							files: { L: 'HD 800 S Stock L.txt', R: 'HD 800 S Stock R.txt' },
							fileName: 'HD 800 S Stock'
						},
						{
							suffix: 'Modded',
							fullName: 'Sennheiser HD 800 S Modded',
							files: { L: 'HD 800 S Modded L.txt', R: 'HD 800 S Modded R.txt' },
							fileName: 'HD 800 S Modded'
						}
					]
				}
			]
		},
		{
			brand: 'Moondrop',
			phones: [
				{
					brand: 'Moondrop',
					name: 'Blessing 3',
					identifier: 'Moondrop Blessing 3',
					files: [
						{
							suffix: '',
							fullName: 'Moondrop Blessing 3',
							files: { L: 'Blessing 3 L.txt', R: 'Blessing 3 R.txt' },
							fileName: 'Blessing 3'
						}
					]
				}
			]
		}
	];
}

function makeMockTargetData(): TargetManifestEntry[] {
	return [
		{ type: 'IEM', files: ['IEM Neutral Target', 'Harman IE 2019 Target'] },
		{ type: 'Headphone', files: ['Diffuse Field Target'] }
	];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MetadataParser', () => {
	afterEach(() => {
		MetadataParser.phoneMetadata = null;
		MetadataParser.targetMetadata = null;
	});

	// ── _generateSampleFiles (existing tests) ─────────────────────────────

	describe('_generateSampleFiles', () => {
		it('generates correct file references for 3 samples', () => {
			const result = MetadataParser._generateSampleFiles('Dunu Zen', 3);
			expect(result).toEqual([
				{
					L: 'Dunu Zen L1.txt',
					R: 'Dunu Zen R1.txt',
					fallback: { L: 'Dunu Zen L.txt', R: 'Dunu Zen R.txt' }
				},
				{ L: 'Dunu Zen L2.txt', R: 'Dunu Zen R2.txt' },
				{ L: 'Dunu Zen L3.txt', R: 'Dunu Zen R3.txt' }
			]);
		});

		it('generates single sample file reference', () => {
			const result = MetadataParser._generateSampleFiles('Test', 1);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				L: 'Test L1.txt',
				R: 'Test R1.txt',
				fallback: { L: 'Test L.txt', R: 'Test R.txt' }
			});
		});

		it('only sample index 0 carries an unnumbered fallback', () => {
			const result = MetadataParser._generateSampleFiles('Foo', 3);
			expect(result[0].fallback).toEqual({ L: 'Foo L.txt', R: 'Foo R.txt' });
			expect(result[1].fallback).toBeUndefined();
			expect(result[2].fallback).toBeUndefined();
		});

		it('returns empty array for 0 samples', () => {
			const result = MetadataParser._generateSampleFiles('Test', 0);
			expect(result).toEqual([]);
		});

		it('handles file names with spaces', () => {
			const result = MetadataParser._generateSampleFiles('Brand Model Variant', 2);
			expect(result[0].L).toBe('Brand Model Variant L1.txt');
			expect(result[1].R).toBe('Brand Model Variant R2.txt');
		});
	});

	// ── _generateHpTFFiles ────────────────────────────────────────────────

	describe('_generateHpTFFiles', () => {
		it('generates L/R file references for each filename', () => {
			const result = MetadataParser._generateHpTFFiles(['Sample1', 'Sample2']);
			expect(result).toEqual([
				{ L: 'Sample1 L.txt', R: 'Sample1 R.txt' },
				{ L: 'Sample2 L.txt', R: 'Sample2 R.txt' }
			]);
		});

		it('returns empty array for empty input', () => {
			expect(MetadataParser._generateHpTFFiles([])).toEqual([]);
		});
	});

	// ── _getSuffix ────────────────────────────────────────────────────────

	describe('_getSuffix', () => {
		it('returns empty string for string phone', () => {
			expect(MetadataParser._getSuffix('HD 600')).toBe('');
		});

		it('returns suffix at index from array suffix', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['File A', 'File B'],
				suffix: ['Stock', 'Modded']
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('Stock');
			expect(MetadataParser._getSuffix(phone, 1)).toBe('Modded');
		});

		it('returns empty string when suffix array entry is explicitly empty', () => {
			// Explicit "" is a valid "no suffix" intent — must not fall back to
			// String(index), which would stringify to "0" and show up as a label.
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['File A', 'File B'],
				suffix: ['', '']
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('');
			expect(MetadataParser._getSuffix(phone, 1)).toBe('');
		});

		it('returns String(index) when suffix array entry is missing (undefined)', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['File A', 'File B'],
				suffix: []
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('0');
			expect(MetadataParser._getSuffix(phone, 1)).toBe('1');
		});

		it('returns trimmed string suffix for array file', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['File A', 'File B'],
				suffix: ' Stock '
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('Stock');
		});

		it('returns String(index) when string suffix is empty for array file', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['File A', 'File B'],
				suffix: ''
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('0');
		});

		it('strips array prefix from file name at given index', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['Brand Test v1', 'Brand Test v2'],
				prefix: ['Brand Test ', 'Brand Test ']
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('v1');
			expect(MetadataParser._getSuffix(phone, 1)).toBe('v2');
		});

		it('strips string prefix from file at index', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['Brand Test v1', 'Brand Test v2'],
				prefix: 'Brand Test '
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('v1');
			expect(MetadataParser._getSuffix(phone, 1)).toBe('v2');
		});

		it('returns empty string when no suffix or prefix for array file', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: ['File A', 'File B']
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('');
		});

		it('returns trimmed suffix for single-file phone', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: 'Test File',
				suffix: ' Stock '
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('Stock');
		});

		it('returns file as suffix when suffix is empty string for single file', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: 'Test File',
				suffix: ''
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('Test File');
		});

		it('strips string prefix from single file', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: 'Brand Test v1',
				prefix: 'Brand Test '
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('v1');
		});

		it('returns empty string for single file with no suffix/prefix', () => {
			const phone: RawPhoneData = {
				name: 'Test',
				file: 'Test File'
			};
			expect(MetadataParser._getSuffix(phone, 0)).toBe('');
		});
	});

	// ── isPhoneAvailable ──────────────────────────────────────────────────

	describe('isPhoneAvailable', () => {
		it('returns false when phoneMetadata is null', () => {
			expect(MetadataParser.isPhoneAvailable('Sennheiser HD 600')).toBe(false);
		});

		it('finds phone by identifier', () => {
			MetadataParser.phoneMetadata = makeMockBrandData();
			expect(MetadataParser.isPhoneAvailable('Sennheiser HD 600')).toBe(true);
		});

		it('finds phone by fullName', () => {
			MetadataParser.phoneMetadata = makeMockBrandData();
			expect(MetadataParser.isPhoneAvailable('Sennheiser HD 800 S Stock')).toBe(true);
		});

		it('returns false when identifier is not found', () => {
			MetadataParser.phoneMetadata = makeMockBrandData();
			expect(MetadataParser.isPhoneAvailable('NonExistent Phone')).toBe(false);
		});

		it('finds phone across different brands', () => {
			MetadataParser.phoneMetadata = makeMockBrandData();
			expect(MetadataParser.isPhoneAvailable('Moondrop Blessing 3')).toBe(true);
		});
	});

	// ── isTargetAvailable ─────────────────────────────────────────────────

	describe('isTargetAvailable', () => {
		it('returns false when targetMetadata is null', () => {
			expect(MetadataParser.isTargetAvailable('IEM Neutral Target')).toBe(false);
		});

		it('finds target with " Target" suffix already present', () => {
			MetadataParser.targetMetadata = makeMockTargetData();
			expect(MetadataParser.isTargetAvailable('IEM Neutral Target')).toBe(true);
		});

		it('finds target without " Target" suffix (auto-appended)', () => {
			MetadataParser.targetMetadata = makeMockTargetData();
			expect(MetadataParser.isTargetAvailable('IEM Neutral')).toBe(true);
		});

		it('returns false when target is not found', () => {
			MetadataParser.targetMetadata = makeMockTargetData();
			expect(MetadataParser.isTargetAvailable('NonExistent Target')).toBe(false);
		});
	});

	// ── searchFRInfoWithFullName ──────────────────────────────────────────

	describe('searchFRInfoWithFullName', () => {
		beforeEach(() => {
			MetadataParser.phoneMetadata = makeMockBrandData();
		});

		it('throws when phoneMetadata is null', () => {
			MetadataParser.phoneMetadata = null;
			expect(() => MetadataParser.searchFRInfoWithFullName('anything')).toThrow(
				'Phone metadata not loaded'
			);
		});

		it('matches by fullName case-insensitively', () => {
			const result = MetadataParser.searchFRInfoWithFullName('sennheiser hd 600');
			expect(result.identifier).toBe('Sennheiser HD 600');
		});

		it('matches by fileName case-insensitively', () => {
			const result = MetadataParser.searchFRInfoWithFullName('hd 600');
			expect(result.identifier).toBe('Sennheiser HD 600');
		});

		it('matches fileName with underscore normalization', () => {
			const result = MetadataParser.searchFRInfoWithFullName('HD_600');
			expect(result.identifier).toBe('Sennheiser HD 600');
		});

		it('falls back to identifier match', () => {
			const result = MetadataParser.searchFRInfoWithFullName('Sennheiser HD 800 S');
			expect(result.identifier).toBe('Sennheiser HD 800 S');
		});

		it('returns dispSuffix from matching file variant', () => {
			const result = MetadataParser.searchFRInfoWithFullName('Sennheiser HD 800 S Stock');
			expect(result.dispSuffix).toBe('Stock');
		});

		it('throws when no match found', () => {
			expect(() => MetadataParser.searchFRInfoWithFullName('NonExistent')).toThrow(
				'No such data found: NonExistent'
			);
		});
	});

	// ── searchTargetInfoWithFullName ──────────────────────────────────────

	describe('searchTargetInfoWithFullName', () => {
		beforeEach(() => {
			MetadataParser.targetMetadata = makeMockTargetData();
		});

		it('throws when targetMetadata is null', () => {
			MetadataParser.targetMetadata = null;
			expect(() => MetadataParser.searchTargetInfoWithFullName('anything')).toThrow(
				'Target metadata not loaded'
			);
		});

		it('finds target by normalized name', () => {
			const result = MetadataParser.searchTargetInfoWithFullName('IEM Neutral Target');
			expect(result.identifier).toBe('IEM Neutral Target');
		});

		it('auto-appends " Target" when missing', () => {
			const result = MetadataParser.searchTargetInfoWithFullName('IEM Neutral');
			expect(result.identifier).toBe('IEM Neutral Target');
		});

		it('throws when target not found', () => {
			expect(() => MetadataParser.searchTargetInfoWithFullName('NonExistent')).toThrow(
				'No such target data found: NonExistent'
			);
		});
	});

	// ── getFRMetadata ─────────────────────────────────────────────────────

	describe('getFRMetadata', () => {
		beforeEach(() => {
			MetadataParser.phoneMetadata = makeMockBrandData();
		});

		it('returns phone metadata by identifier', () => {
			const result = MetadataParser.getFRMetadata('phone', 'Sennheiser HD 600');
			expect(result).toHaveProperty('identifier', 'Sennheiser HD 600');
			expect(result).toHaveProperty('brand', 'Sennheiser');
		});

		it('falls back to fullName search when identifier is a fullName', () => {
			const result = MetadataParser.getFRMetadata('phone', 'Sennheiser HD 800 S Stock');
			expect(result).toHaveProperty('identifier', 'Sennheiser HD 800 S');
		});

		it('returns target metadata structure for target type', () => {
			const result = MetadataParser.getFRMetadata('target', 'Harman IE 2019');
			expect(result).toEqual({
				identifier: 'Harman IE 2019',
				files: [{ files: 'Harman IE 2019.txt' }]
			});
		});

		it('returns fallback structure for unknown source type', () => {
			const result = MetadataParser.getFRMetadata('unknown' as any, 'SomeData');
			expect(result).toEqual({
				identifier: 'SomeData',
				files: [{ files: 'SomeData.txt' }]
			});
		});

		it('throws when phone not found at all', () => {
			expect(() => MetadataParser.getFRMetadata('phone', 'NonExistent')).toThrow();
		});
	});
});
