import { describe, it, expect, beforeEach } from 'vitest';
import { audioRangeStore } from './audio-range-store.svelte.js';

describe('AudioRangeStore', () => {
	beforeEach(() => {
		audioRangeStore.isFrequencySelectionMode = false;
		audioRangeStore.reset();
	});

	it('defaults to the full audible band', () => {
		expect(audioRangeStore.fromHz).toBe(20);
		expect(audioRangeStore.toHz).toBe(20000);
	});

	describe('setRange', () => {
		it('stores an ordinary band as given, rounded', () => {
			audioRangeStore.setRange(100.4, 5000.6);
			expect(audioRangeStore.fromHz).toBe(100);
			expect(audioRangeStore.toHz).toBe(5001);
		});

		it('orders the bounds regardless of argument order', () => {
			audioRangeStore.setRange(8000, 200);
			expect(audioRangeStore.fromHz).toBe(200);
			expect(audioRangeStore.toHz).toBe(8000);
		});

		it('clamps below 20 Hz and above 20 kHz', () => {
			audioRangeStore.setRange(-500, 99999);
			expect(audioRangeStore.fromHz).toBe(20);
			expect(audioRangeStore.toHz).toBe(20000);
		});

		it('enforces a minimum bandwidth so the bandpass cannot fully close', () => {
			audioRangeStore.setRange(1000, 1000);
			expect(audioRangeStore.toHz - audioRangeStore.fromHz).toBeGreaterThanOrEqual(1);
			expect(audioRangeStore.fromHz).toBe(1000);
			expect(audioRangeStore.toHz).toBe(1001);
		});

		it('takes the separation out of the low bound at the top of the domain', () => {
			// `hi` must not escape the 20 kHz ceiling, so the 1 Hz minimum comes off
			// `lo` instead.
			audioRangeStore.setRange(20000, 20000);
			expect(audioRangeStore.fromHz).toBe(19999);
			expect(audioRangeStore.toHz).toBe(20000);
		});

		it('keeps the ceiling when both bounds clamp to the top', () => {
			audioRangeStore.setRange(50000, 60000);
			expect(audioRangeStore.fromHz).toBe(19999);
			expect(audioRangeStore.toHz).toBe(20000);
		});

		it('keeps the floor when both bounds clamp to the bottom', () => {
			audioRangeStore.setRange(1, 2);
			expect(audioRangeStore.fromHz).toBe(20);
			expect(audioRangeStore.toHz).toBe(21);
		});
	});

	describe('reset', () => {
		it('restores the full band', () => {
			audioRangeStore.setRange(300, 3000);
			audioRangeStore.reset();
			expect(audioRangeStore.fromHz).toBe(20);
			expect(audioRangeStore.toHz).toBe(20000);
		});

		it('leaves the selection-mode flag alone', () => {
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.reset();
			expect(audioRangeStore.isFrequencySelectionMode).toBe(true);
		});
	});
});
