import { describe, it, expect, beforeEach } from 'vitest';
import { graphStore } from './graph-store.svelte.js';
import type { ParsedFRData } from '$lib/types/data-types.js';

describe('GraphStore', () => {
	beforeEach(() => {
		graphStore.yScale = 60;
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.normType = 'Hz';
		graphStore.normHzValue = 500;
		graphStore.targetOriginalData.clear();
		graphStore.targetOriginalVersion = 0;
	});

	describe('initial/default state', () => {
		it('has yScale of 60', () => {
			expect(graphStore.yScale).toBe(60);
		});

		it('has null baselineUUID', () => {
			expect(graphStore.baselineUUID).toBeNull();
		});

		it('has normType of Hz', () => {
			expect(graphStore.normType).toBe('Hz');
		});

		it('has normHzValue of 500', () => {
			expect(graphStore.normHzValue).toBe(500);
		});
	});

	describe('yScale', () => {
		it('can be set to different values', () => {
			graphStore.yScale = 40;
			expect(graphStore.yScale).toBe(40);

			graphStore.yScale = 100;
			expect(graphStore.yScale).toBe(100);
		});
	});

	describe('baselineUUID', () => {
		it('can be set to a UUID string', () => {
			graphStore.baselineUUID = 'abc-123';
			expect(graphStore.baselineUUID).toBe('abc-123');
		});

		it('can be reset to null', () => {
			graphStore.baselineUUID = 'abc-123';
			graphStore.baselineUUID = null;
			expect(graphStore.baselineUUID).toBeNull();
		});
	});

	describe('normType', () => {
		it('can be switched to Avg', () => {
			graphStore.normType = 'Avg';
			expect(graphStore.normType).toBe('Avg');
		});

		it('can be switched back to Hz', () => {
			graphStore.normType = 'Avg';
			graphStore.normType = 'Hz';
			expect(graphStore.normType).toBe('Hz');
		});
	});

	describe('normHzValue', () => {
		it('can be updated', () => {
			graphStore.normHzValue = 1000;
			expect(graphStore.normHzValue).toBe(1000);
		});
	});

	// ── Baseline mode ────────────────────────────────────────────────────

	describe('baselineMode', () => {
		it('defaults to off', () => {
			expect(graphStore.baselineMode).toBe('off');
		});

		it('can cycle through off → adjusted → original', () => {
			graphStore.baselineMode = 'adjusted';
			expect(graphStore.baselineMode).toBe('adjusted');

			graphStore.baselineMode = 'original';
			expect(graphStore.baselineMode).toBe('original');

			graphStore.baselineMode = 'off';
			expect(graphStore.baselineMode).toBe('off');
		});
	});

	// ── Target original data (preference adjustment base data) ───────────

	describe('targetOriginalData', () => {
		it('starts empty', () => {
			expect(graphStore.targetOriginalData.size).toBe(0);
		});

		it('stores and retrieves ParsedFRData by UUID', () => {
			const data: ParsedFRData = {
				AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			graphStore.targetOriginalData.set('target-1', data);
			expect(graphStore.targetOriginalData.get('target-1')).toBe(data);
			expect(graphStore.targetOriginalData.has('target-1')).toBe(true);
		});

		it('overwrites existing data on set', () => {
			const old: ParsedFRData = {
				AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const updated: ParsedFRData = {
				AVG: { data: [[1000, 75]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			graphStore.targetOriginalData.set('target-1', old);
			graphStore.targetOriginalData.set('target-1', updated);
			expect(graphStore.targetOriginalData.get('target-1')!.AVG!.data[0][1]).toBe(75);
		});

		it('can store data for multiple targets', () => {
			const dataA: ParsedFRData = { AVG: { data: [[500, 70]], metadata: { minFreq: 20, maxFreq: 20000 } } };
			const dataB: ParsedFRData = { AVG: { data: [[500, 85]], metadata: { minFreq: 20, maxFreq: 20000 } } };
			graphStore.targetOriginalData.set('a', dataA);
			graphStore.targetOriginalData.set('b', dataB);
			expect(graphStore.targetOriginalData.size).toBe(2);
			expect(graphStore.targetOriginalData.get('a')!.AVG!.data[0][1]).toBe(70);
			expect(graphStore.targetOriginalData.get('b')!.AVG!.data[0][1]).toBe(85);
		});

		it('delete removes the entry', () => {
			graphStore.targetOriginalData.set('target-1', {
				AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } }
			});
			graphStore.targetOriginalData.delete('target-1');
			expect(graphStore.targetOriginalData.has('target-1')).toBe(false);
		});
	});

	// ── Target original version counter ──────────────────────────────────

	describe('targetOriginalVersion', () => {
		it('starts at 0', () => {
			expect(graphStore.targetOriginalVersion).toBe(0);
		});

		it('can be incremented', () => {
			graphStore.targetOriginalVersion++;
			expect(graphStore.targetOriginalVersion).toBe(1);
			graphStore.targetOriginalVersion++;
			expect(graphStore.targetOriginalVersion).toBe(2);
		});
	});
});
