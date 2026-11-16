/**
 * The OS setting is not reachable from a spec, so `svelte/motion`'s
 * `prefersReducedMotion` is replaced by a plain switch. What is covered is the helper's
 * answer per setting; that Svelte re-reads the real query on every call is Svelte's.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const pref = vi.hoisted(() => ({ current: false }));
vi.mock('svelte/motion', () => ({ prefersReducedMotion: pref }));

import { flyOrFade, motionDuration, reducedMotion, slideOrFade } from './motion.svelte.js';

let node: HTMLElement;

beforeEach(() => {
	pref.current = false;
	node = document.createElement('div');
	document.body.appendChild(node);
});

afterEach(() => {
	node.remove();
});

describe('reducedMotion / motionDuration', () => {
	it('follows the preference, read at each call', () => {
		expect(reducedMotion()).toBe(false);
		expect(motionDuration(300)).toBe(300);

		pref.current = true;
		expect(reducedMotion()).toBe(true);
		expect(motionDuration(300)).toBe(0);

		pref.current = false;
		expect(motionDuration(300)).toBe(300);
	});
});

describe('flyOrFade', () => {
	it('flies when motion is allowed', () => {
		const config = flyOrFade(node, { x: 60, duration: 200, delay: 50 });
		expect(config.duration).toBe(200);
		expect(config.delay).toBe(50);
		expect(config.css?.(0, 1)).toContain('translate');
	});

	it('swaps the movement for a short opacity fade under reduced motion', () => {
		pref.current = true;
		const config = flyOrFade(node, { x: 60, duration: 250, delay: 50 });
		expect(config.duration).toBeLessThan(250);
		expect(config.delay).toBe(50);
		const css = config.css?.(0.5, 0.5) ?? '';
		expect(css).toContain('opacity');
		expect(css).not.toContain('translate');
	});

	it('never lengthens a transition that was already short', () => {
		pref.current = true;
		expect(flyOrFade(node, { x: 60, duration: 50 }).duration).toBe(50);
	});

	it('picks up a setting changed between two transitions', () => {
		expect(flyOrFade(node, { x: 60 }).css?.(0, 1)).toContain('translate');
		pref.current = true;
		expect(flyOrFade(node, { x: 60 }).css?.(0, 1)).not.toContain('translate');
	});
});

describe('slideOrFade', () => {
	it('slides when motion is allowed', () => {
		const config = slideOrFade(node, { duration: 150 });
		expect(config.duration).toBe(150);
		expect(config.css?.(0.5, 0.5)).toContain('height');
	});

	it('fades instead of collapsing the height under reduced motion', () => {
		pref.current = true;
		const config = slideOrFade(node, { duration: 150 });
		const css = config.css?.(0.5, 0.5) ?? '';
		expect(css).toContain('opacity');
		expect(css).not.toContain('height');
	});
});
