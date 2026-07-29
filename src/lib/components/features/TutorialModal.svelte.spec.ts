/**
 * `TutorialModal` is the first-visit walkthrough: it opens itself 800 ms after
 * mount unless `gt-tutorial-dismissed` is already set, then steps through a
 * deck whose contents depend on whether the layout is mobile.
 *
 * The 800 ms open delay is waited out for real rather than faked: bits-ui's
 * presence layer and the spotlight effect both schedule their own work, and
 * swapping the timer implementation underneath them leaves the dialog mounted
 * but frozen. The cost is a longer matcher timeout on the open and close.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import TutorialModal from './TutorialModal.svelte';
import { appStore } from '$lib/stores/app-store.svelte.js';
import * as m from '$lib/paraglide/messages.js';

const STORAGE_KEY = 'gt-tutorial-dismissed';

/** Longer than the 800 ms auto-open delay plus the dialog's 300 ms transition. */
const OPEN_TIMEOUT = 3000;

/** Mount and wait out the auto-open delay. */
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

describe('TutorialModal', () => {
	beforeEach(() => {
		localStorage.removeItem(STORAGE_KEY);
		appStore.isMobile = false;
	});

	afterEach(() => {
		localStorage.removeItem(STORAGE_KEY);
		appStore.isMobile = false;
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
			await new Promise((resolve) => setTimeout(resolve, 1000));

			expect(page.getByRole('dialog').elements()).toHaveLength(0);
		});

		it('does not open before the delay elapses', async () => {
			render(TutorialModal);
			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(page.getByRole('dialog').elements()).toHaveLength(0);
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
		function plantTarget(name: string) {
			const el = document.createElement('div');
			el.setAttribute('data-tutorial-target', name);
			el.style.cssText = 'position:fixed;top:40px;left:20px;width:120px;height:32px;';
			document.body.appendChild(el);
			return el;
		}

		/** The cut-out is the only aria-hidden box with the 9999px ring shadow. */
		function spotlight() {
			return document.querySelector<HTMLElement>('div[aria-hidden="true"][style*="box-shadow"]');
		}

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
});
