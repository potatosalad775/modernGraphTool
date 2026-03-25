import { describe, it, expect } from 'vitest';
import MetadataParser from './metadata-parser.js';

describe('MetadataParser', () => {
	describe('_generateSampleFiles', () => {
		it('generates correct file references for 3 samples', () => {
			const result = MetadataParser._generateSampleFiles('Dunu Zen', 3);
			expect(result).toEqual([
				{ L: 'Dunu Zen L1.txt', R: 'Dunu Zen R1.txt' },
				{ L: 'Dunu Zen L2.txt', R: 'Dunu Zen R2.txt' },
				{ L: 'Dunu Zen L3.txt', R: 'Dunu Zen R3.txt' },
			]);
		});

		it('generates single sample file reference', () => {
			const result = MetadataParser._generateSampleFiles('Test', 1);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ L: 'Test L1.txt', R: 'Test R1.txt' });
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
});
