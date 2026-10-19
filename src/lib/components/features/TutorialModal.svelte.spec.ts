/**
 * `TutorialModal` hosts the guided tours. The welcome tour opens itself on mount
 * unless `gt-tutorial-dismissed` is already set, then steps through a deck whose
 * contents depend on whether the layout is mobile. The Equalizer tour opens the
 * first time that panel becomes current, once no other tour is showing.
 *
 * Timers are left real: bits-ui's presence layer and the spotlight effect both
 * schedule their own work, and swapping the timer implementation underneath
 * them leaves the dialog mounted but frozen. The cost is a longer matcher
 * timeout on the open and close.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import TutorialModal from './TutorialModal.svelte';
import { appStore } from '#lib/stores/app-store.svelte.js';
import { menuStore } from '#lib/stores/menu-store.svelte.js';
import { tutorialStore } from '#lib/stores/tutorial-store.svelte.js';
import * as m from '#lib/paraglide/messages.js';

/** The constraint tip's text up to its icon chip, which splits it across nodes. */
const constraintHint = () => m.tutorial_eq_constraint_hint({ icon: '\0' }).split('\0')[0];

const STORAGE_KEY = 'gt-tutorial-dismissed';
const EQ_STORAGE_KEY = 'gt-tutorial-eq-dismissed';

/** Comfortably longer than the dialog's 300 ms transition. */
const OPEN_TIMEOUT = 3000;

/** Mount and wait for the dialog to appear. */
async function openModal() {
	const result = render(TutorialModal);
	await expect.element(page.getByRole('dialog'), { timeout: OPEN_TIMEOUT }).toBeInTheDocument();
	return result;
}

/** The dialog unmounts only after its close transition finishes. */
async function expectClosed() {
	await vi.waitFor(() => expect(page.getByRole('dialog').elements()).toHaveLength(0), {
		timeout: OPEN_TIMEOUT
	});
}

function button(name: string) {
	return page.getByRole('button', { name });
}

function dots() {
	return page.getByRole('button', { name: /^Go to step \d+$/ });
}

/**
 * bits-ui's modal layer parks `pointer-events: none` on `<body>` for as long as
 * the dialog is open, and synthetic pointer input never reaches the buttons
 * underneath it — a driver-level click resolves without dispatching anything.
 * Dispatching on the element itself is what a keyboard activation does anyway.
 */
async function click(locator: ReturnType<typeof button>) {
	(locator.element() as HTMLElement).click();
	// Let Svelte flush the step change before the next query.
	await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

/** Walk to the final step of the current deck. */
async function goToLastStep() {
	const total = dots().elements().length;
	await click(dots().nth(total - 1));
}

function plantTarget(name: string, top = 40) {
	const el = document.createElement('div');
	el.setAttribute('data-tutorial-target', name);
	el.style.cssText = `position:fixed;top:${top}px;left:20px;width:120px;height:32px;`;
	document.body.appendChild(el);
	return el;
}

/** The cut-out is the only aria-hidden box with the 9999px ring shadow. */
function spotlight() {
	return document.querySelector<HTMLElement>('div[aria-hidden="true"][style*="box-shadow"]');
}

function reset() {
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem(EQ_STORAGE_KEY);
	appStore.isMobile = false;
	menuStore.currentPanel = 'graph';
	// A module singleton: an unmounted test leaves its tour marked open.
	tutorialStore.isOpen = false;
	tutorialStore.tour = 'welcome';
	tutorialStore.step = 0;
}

describe('TutorialModal', () => {
	beforeEach(reset);

	afterEach(() => {
		reset();
		document.querySelectorAll('[data-tutorial-target]').forEach((el) => el.remove());
	});

	// ── Auto-open ────────────────────────────────────────────────────────────

	describe('auto-open', () => {
		it('opens on a first visit', async () => {
			await openModal();

			await expect.element(page.getByText(m.tutorial_modal_intro_title())).toBeInTheDocument();
		});

		it('stays shut once dismissed', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			render(TutorialModal);
			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(page.getByRole('dialog').elements()).toHaveLength(0);
		});

		it('opens without a settle-in delay', async () => {
			// On a first visit this dialog is the LCP element; any delay before it
			// opens is added to LCP in full.
			render(TutorialModal);

			await expect.element(page.getByRole('dialog'), { timeout: 200 }).toBeInTheDocument();
		});
	});

	// ── Deck composition ─────────────────────────────────────────────────────

	describe('deck', () => {
		it('has six steps on desktop', async () => {
			await openModal();

			expect(dots().elements()).toHaveLength(6);
		});

		it('swaps the divider and shortcut steps for the PWA step on mobile', async () => {
			appStore.isMobile = true;
			await openModal();

			expect(dots().elements()).toHaveLength(5);
			await click(dots().nth(3));
			await expect.element(page.getByText(m.tutorial_modal_pwa_title())).toBeInTheDocument();
		});

		it('shows both install instructions on the PWA step', async () => {
			appStore.isMobile = true;
			await openModal();
			await click(dots().nth(3));

			await expect.element(page.getByText(m.tutorial_modal_pwa_inst_ios())).toBeInTheDocument();
			await expect.element(page.getByText(m.tutorial_modal_pwa_inst_android())).toBeInTheDocument();
		});

		it('shows an icon only on steps without a spotlight target', async () => {
			// The tile is height a dialog beside its target can't spare on a short screen.
			const tile = () => document.querySelectorAll('[role="dialog"] .bg-accent\\/10');
			await openModal();
			expect(tile()).toHaveLength(1);

			await click(button(m.tutorial_modal_btn_next()));
			await expect.element(page.getByText(m.tutorial_modal_menu_content())).toBeInTheDocument();
			expect(tile()).toHaveLength(0);
		});

		it('ends on the user-guide step', async () => {
			await openModal();
			await goToLastStep();

			await expect.element(page.getByText(m.tutorial_modal_guide_title())).toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: new RegExp(m.tutorial_modal_guide_link()) }))
				.toHaveAttribute(
					'href',
					'https://potatosalad775.github.io/modernGraphTool/docs/category/guide-for-users'
				);
		});
	});

	// ── Navigation ───────────────────────────────────────────────────────────

	describe('navigation', () => {
		it('advances one step at a time', async () => {
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));

			await expect.element(page.getByText(m.tutorial_modal_menu_content())).toBeInTheDocument();
		});

		it('hides Previous on the first step', async () => {
			await openModal();

			expect(button(m.tutorial_modal_btn_prev()).elements()).toHaveLength(0);
		});

		it('goes back with Previous', async () => {
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));
			await click(button(m.tutorial_modal_btn_prev()));

			await expect.element(page.getByText(m.tutorial_modal_intro_title())).toBeInTheDocument();
		});

		it('jumps straight to a step from its dot', async () => {
			await openModal();
			await click(dots().nth(2));

			await expect
				.element(page.getByText(m.tutorial_modal_graph_handle_content()))
				.toBeInTheDocument();
		});

		it('swaps Next for Done and drops Skip on the last step', async () => {
			await openModal();
			await goToLastStep();

			await expect.element(button(m.tutorial_modal_btn_done())).toBeInTheDocument();
			expect(button(m.tutorial_modal_btn_skip()).elements()).toHaveLength(0);
		});
	});

	// ── Dismissal ────────────────────────────────────────────────────────────

	describe('dismissal', () => {
		it('remembers a skip', async () => {
			await openModal();
			await click(button(m.tutorial_modal_btn_skip()));

			await expectClosed();
			expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
		});

		it('remembers a completed run', async () => {
			await openModal();
			await goToLastStep();
			await click(button(m.tutorial_modal_btn_done()));

			await expectClosed();
			expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
		});

		it('closes in place from a spotlight step, without re-centring first', async () => {
			// Dropping the spotlight on close re-centred the dialog, and bits-ui kept it
			// mounted for that 300 ms slide — a visible jump before it vanished.
			plantTarget('menu');
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await click(button(m.tutorial_modal_btn_skip()));

			const style = document.querySelector('[role="dialog"]')?.getAttribute('style') ?? '';
			expect(style).not.toContain('top: 50%');
			await vi.waitFor(() => expect(page.getByRole('dialog').elements()).toHaveLength(0), {
				timeout: 200
			});
		});

		it('takes the cut-out down with it when Done is pressed on a spotlight step', async () => {
			// The Equalizer tour ends on a targeted step, so a rect is still held at close.
			localStorage.setItem(STORAGE_KEY, 'true');
			menuStore.currentPanel = 'equalizer';
			plantTarget('eq_hardware');
			await openModal();
			await goToLastStep();
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await click(button(m.tutorial_modal_btn_done()));

			await expectClosed();
			await vi.waitFor(() => expect(spotlight()).toBeNull());
		});

		it('still closes on Escape', async () => {
			await openModal();
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

			await expectClosed();
			expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
		});

		it('restarts from step one after being dismissed', async () => {
			const { unmount } = await openModal();
			await click(button(m.tutorial_modal_btn_next()));
			await click(button(m.tutorial_modal_btn_skip()));
			unmount();

			localStorage.removeItem(STORAGE_KEY);
			await openModal();

			await expect.element(page.getByText(m.tutorial_modal_intro_title())).toBeInTheDocument();
		});
	});

	// ── Spotlight ────────────────────────────────────────────────────────────

	describe('spotlight', () => {
		it('has no cut-out on a step that targets nothing', async () => {
			await openModal();

			expect(spotlight()).toBeNull();
		});

		it('cuts out the targeted element', async () => {
			plantTarget('menu');
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));

			await vi.waitFor(() => expect(spotlight()).not.toBeNull());
			// 6 px of padding on each side of the 120x32 target.
			expect(spotlight()!.style.width).toBe('132px');
			expect(spotlight()!.style.height).toBe('44px');
		});

		it('leaves the cut-out off when the targeted element is absent', async () => {
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));

			expect(spotlight()).toBeNull();
		});

		it('drops the cut-out again when moving to an untargeted step', async () => {
			plantTarget('menu');
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await goToLastStep();

			await vi.waitFor(() => expect(spotlight()).toBeNull());
		});
	});

	// ── Small screens ────────────────────────────────────────────────────────

	describe('small screens', () => {
		/** The default from vite.config.ts; each test here changes it. */
		afterEach(() => page.viewport(1280, 800));

		function plantBox(name: string, top: number, height: number) {
			const el = plantTarget(name, top);
			el.style.height = `${height}px`;
			return el;
		}

		function dialogStyle() {
			return page.getByRole('dialog').element().getAttribute('style') ?? '';
		}

		it('pins the dialog to the bottom when it fits beside a tall target on neither side', async () => {
			// Centred a little below the middle, so the old "opposite half" rule put the
			// dialog on top — over the target's heading.
			await page.viewport(400, 700);
			plantBox('menu', 90, 560);
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await vi.waitFor(() => expect(dialogStyle()).toContain('bottom: 1rem'));
		});

		it('puts the dialog on the side it fits', async () => {
			await page.viewport(400, 700);
			plantBox('menu', 560, 40);
			await openModal();
			await click(button(m.tutorial_modal_btn_next()));
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await vi.waitFor(() => expect(dialogStyle()).toContain('top: 1rem'));
		});

		it('drops the tip lines on a short screen, but only on spotlight steps', async () => {
			await page.viewport(400, 500);
			localStorage.setItem(STORAGE_KEY, 'true');
			plantTarget('eq_filters');
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(dots().nth(1));
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await expect.element(page.getByText(m.tutorial_eq_filters_content())).toBeInTheDocument();
			expect(page.getByText(constraintHint()).elements()).toHaveLength(0);
		});

		it('keeps the tip lines on a tall screen', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			plantTarget('eq_filters');
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(dots().nth(1));
			await vi.waitFor(() => expect(spotlight()).not.toBeNull());

			await expect.element(page.getByText(constraintHint())).toBeInTheDocument();
		});

		it('draws the constraint button in its tip, named for screen readers', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			plantTarget('eq_filters');
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(dots().nth(1));

			const tip = page.getByText(constraintHint());
			await expect.element(tip).toBeInTheDocument();
			const p = tip.element();
			expect(p.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
			expect(p.querySelector('.sr-only')?.textContent).toBe(m.eq_constraint_select_label());
			// The sentence reads whole, with no stray markers or whitespace around the chip.
			expect(p.textContent).toBe(
				m.tutorial_eq_constraint_hint({ icon: m.eq_constraint_select_label() })
			);
		});

		it('keeps the PWA install steps on a short screen', async () => {
			await page.viewport(400, 500);
			appStore.isMobile = true;
			await openModal();
			await click(dots().nth(3));

			await expect.element(page.getByText(m.tutorial_modal_pwa_inst_ios())).toBeInTheDocument();
		});
	});

	// ── Equalizer tour ───────────────────────────────────────────────────────

	describe('equalizer tour', () => {
		it('opens the first time the Equalizer panel is current', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			menuStore.currentPanel = 'equalizer';
			await openModal();

			await expect.element(page.getByText(m.tutorial_eq_source_content())).toBeInTheDocument();
			expect(dots().elements()).toHaveLength(5);
		});

		it('stays shut on another panel', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			render(TutorialModal);
			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(page.getByRole('dialog').elements()).toHaveLength(0);
		});

		it('waits for the welcome tour, then follows it', async () => {
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await expect.element(page.getByText(m.tutorial_modal_intro_title())).toBeInTheDocument();

			await click(button(m.tutorial_modal_btn_skip()));

			await expect.element(page.getByText(m.tutorial_eq_source_content())).toBeInTheDocument();
			expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
		});

		it('remembers its own dismissal, separately from the welcome tour', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(button(m.tutorial_modal_btn_skip()));

			await expectClosed();
			expect(localStorage.getItem(EQ_STORAGE_KEY)).toBe('true');
		});

		it('replays from step one once dismissed', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			localStorage.setItem(EQ_STORAGE_KEY, 'true');
			render(TutorialModal);
			tutorialStore.open('equalizer');

			await expect.element(page.getByRole('dialog'), { timeout: OPEN_TIMEOUT }).toBeInTheDocument();
			await expect.element(page.getByText(m.tutorial_eq_source_content())).toBeInTheDocument();
		});

		it('drops the backslash tip on mobile', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(dots().nth(3));
			await expect.element(page.getByText(m.tutorial_eq_bypass_hint())).toBeInTheDocument();

			appStore.isMobile = true;

			await vi.waitFor(() =>
				expect(page.getByText(m.tutorial_eq_bypass_hint()).elements()).toHaveLength(0)
			);
		});

		it('frames every element sharing a target in one cut-out', async () => {
			localStorage.setItem(STORAGE_KEY, 'true');
			plantTarget('eq_listen', 40);
			plantTarget('eq_listen', 100);
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(dots().nth(3));

			await vi.waitFor(() => expect(spotlight()).not.toBeNull());
			// 40 → 132 px spans both boxes, plus 6 px of padding top and bottom.
			expect(spotlight()!.style.height).toBe('104px');
		});

		it('scrolls every framed element into the scroller, not just the window', async () => {
			// The phone layout: a 300 px panel scroller with the menu bar below it. The
			// first header is in view and the second sits where the menu bar is — inside
			// the window, but clipped by the scroller.
			localStorage.setItem(STORAGE_KEY, 'true');
			const container = document.createElement('div');
			container.style.cssText =
				'position:fixed;top:0;left:0;width:300px;height:300px;overflow-y:auto';
			const header = (top: number) => {
				const el = document.createElement('div');
				el.setAttribute('data-tutorial-target', 'eq_listen');
				el.style.cssText = `position:absolute;top:${top}px;left:0;width:120px;height:32px`;
				return el;
			};
			const filler = document.createElement('div');
			filler.style.height = '1000px';
			container.append(filler, header(200), header(292));
			document.body.append(container);
			menuStore.currentPanel = 'equalizer';
			await openModal();
			await click(dots().nth(3));

			// 292 + 32 + the spotlight's 6 px is 330: 30 px past the 300 px view.
			await expect.poll(() => container.scrollTop).toBe(30);
			container.remove();
		});
	});
});
