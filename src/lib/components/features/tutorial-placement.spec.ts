import { describe, it, expect } from 'vitest';
import { placeBeside } from './tutorial-placement.js';

const box = (left: number, top: number, width: number, height: number) => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height
});
const dialog = { width: 384, height: 200 };
const wide = { width: 1920, height: 1080 };

describe('placeBeside', () => {
	it('sits to the right of a target with room there, centred on it', () => {
		const at = placeBeside(box(100, 600, 200, 40), dialog, wide);
		expect(at).toEqual({ left: 316, top: 520 });
	});

	it('takes the left side when the right has less room', () => {
		const at = placeBeside(box(1400, 600, 400, 40), dialog, wide);
		expect(at).toEqual({ left: 1400 - 16 - 384, top: 520 });
	});

	it('stays on screen beside a target near the bottom edge', () => {
		const at = placeBeside(box(100, 1040, 200, 30), dialog, wide);
		expect(at!.top).toBe(1080 - 200 - 16);
	});

	it('goes below a full-width target', () => {
		const at = placeBeside(box(0, 0, 1920, 56), dialog, wide);
		expect(at).toEqual({ top: 72, left: 960 - 192 });
	});

	it('gives up when no side has room', () => {
		const at = placeBeside(box(0, 0, 1920, 1000), dialog, wide);
		expect(at).toBeNull();
	});

	it('gives up before the dialog has been measured', () => {
		expect(placeBeside(box(100, 600, 200, 40), { width: 0, height: 0 }, wide)).toBeNull();
	});
});
