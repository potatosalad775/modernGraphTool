import { describe, it, expect, beforeEach } from 'vitest';
import { graphStore } from './graph-store.svelte.js';

describe('GraphStore', () => {
	beforeEach(() => {
		graphStore.yScale = 60;
		graphStore.baselineUUID = null;
		graphStore.normType = 'Hz';
		graphStore.normHzValue = 500;
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
});
