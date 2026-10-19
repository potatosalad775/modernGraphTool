/**
 * Runs in the `client` project: it needs real layout, scrolling and
 * ResizeObserver. Styles are inline because specs load no Tailwind.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { anchorScroll, followReveal, revealBox, revealInScrollParent } from './scroll-anchor.js';

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
	document.body.replaceChildren();
});

/** A 300px scroller holding a resizable block above a button, then filler. */
function setup() {
	const container = document.createElement('div');
	container.style.cssText = 'height:300px;overflow-y:auto;overflow-anchor:none';
	const above = document.createElement('div');
	above.style.height = '400px';
	const below = document.createElement('div');
	below.style.height = '800px';
	const button = document.createElement('button');
	button.textContent = 'A';
	below.prepend(button);
	container.append(above, below);
	document.body.append(container);
	return { container, above, button, top: () => button.getBoundingClientRect().top };
}

describe('anchorScroll', () => {
	it('keeps the pressed control in place when content above it grows or shrinks', async () => {
		const { container, above, button, top } = setup();
		cleanup = anchorScroll(container);
		container.scrollTop = 350;
		await frame();
		const before = top();

		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		above.style.height = '600px';
		await frame();
		expect(top()).toBeCloseTo(before, 0);

		above.style.height = '250px';
		await frame();
		expect(top()).toBeCloseTo(before, 0);
	});

	it('holds through the clamp when shrinking content pulls the scroller off its end', async () => {
		const { container, above, button, top } = setup();
		cleanup = anchorScroll(container);
		// Button at 1000 in a 1200px column. Shrinking `above` by 300 drops the
		// max scroll from 900 to 600, so the browser clamps 850 → 600 first.
		button.style.marginTop = '600px';
		container.scrollTop = 850;
		await frame();
		const before = top();

		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		above.style.height = '100px';
		await frame();
		expect(container.scrollTop).toBe(550);
		expect(top()).toBeCloseTo(before, 0);
	});

	it('leaves the scroll alone before anything is pressed', async () => {
		const { container, above } = setup();
		cleanup = anchorScroll(container);
		container.scrollTop = 350;
		await frame();

		above.style.height = '600px';
		await frame();
		expect(container.scrollTop).toBe(350);
	});

	it('follows a scroll the user makes after pressing', async () => {
		const { container, above, button, top } = setup();
		cleanup = anchorScroll(container);
		container.scrollTop = 350;
		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		container.scrollTop = 300;
		await frame();
		const before = top();

		above.style.height = '500px';
		await frame();
		expect(top()).toBeCloseTo(before, 0);
	});
});

describe('revealInScrollParent', () => {
	function scroller(sectionHeight: number, offset: number) {
		const container = document.createElement('div');
		container.style.cssText = 'height:300px;overflow-y:auto';
		const spacer = document.createElement('div');
		spacer.style.height = `${offset}px`;
		const section = document.createElement('div');
		section.style.height = `${sectionHeight}px`;
		const filler = document.createElement('div');
		filler.style.height = '1000px';
		container.append(spacer, section, filler);
		document.body.append(container);
		return { container, section };
	}

	it('scrolls a section that runs off the bottom until it fits', () => {
		const { container, section } = scroller(100, 250);
		revealInScrollParent(section);
		// Smooth scrolling may still be in flight; the target is what matters.
		return expect.poll(() => container.scrollTop).toBe(50);
	});

	it('stops with the header at the top when the section is taller than the view', () => {
		const { container, section } = scroller(500, 250);
		revealInScrollParent(section);
		return expect.poll(() => container.scrollTop).toBe(250);
	});

	it('follows a section that grows after opening, until the user touches the page', async () => {
		const { container, section } = scroller(100, 50);
		cleanup = followReveal(section, section);
		await frame();
		expect(container.scrollTop).toBe(0);

		// Late content: the section now runs 100px past the bottom.
		section.style.height = '350px';
		await expect.poll(() => container.scrollTop).toBe(50);

		window.dispatchEvent(new Event('wheel'));
		section.style.height = '450px';
		await frame();
		await frame();
		expect(container.scrollTop).toBe(50);
	});

	it('does nothing when the section is already visible', () => {
		const { container, section } = scroller(100, 50);
		revealInScrollParent(section);
		expect(container.scrollTop).toBe(0);
	});
});

describe('revealBox', () => {
	function scroller() {
		const container = document.createElement('div');
		container.style.cssText = 'height:300px;overflow-y:auto';
		const filler = document.createElement('div');
		filler.style.height = '2000px';
		container.append(filler);
		document.body.append(container);
		/** A box `top` px down the content, in viewport coordinates. */
		const box = (top: number, height: number) =>
			new DOMRect(0, container.getBoundingClientRect().top + top - container.scrollTop, 10, height);
		return { container, box };
	}

	it('scrolls down until the box and its margin fit', () => {
		const { container, box } = scroller();
		revealBox(container, box(250, 60), 6);
		return expect.poll(() => container.scrollTop).toBe(16);
	});

	it('scrolls up to a box above the view', () => {
		const { container, box } = scroller();
		container.scrollTop = 500;
		revealBox(container, box(200, 40), 6);
		return expect.poll(() => container.scrollTop).toBe(194);
	});

	it('brings the top into view when the box is taller than the view', () => {
		const { container, box } = scroller();
		revealBox(container, box(400, 600));
		return expect.poll(() => container.scrollTop).toBe(400);
	});

	it('does nothing when the box is already visible', () => {
		const { container, box } = scroller();
		revealBox(container, box(50, 100), 6);
		expect(container.scrollTop).toBe(0);
	});
});
