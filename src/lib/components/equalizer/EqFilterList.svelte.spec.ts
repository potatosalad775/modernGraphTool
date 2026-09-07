/**
 * `EqFilterList` is the band editor: preamp readout, add/remove/sort controls,
 * the filter cards, and import/export.
 *
 * Covered here is the master-toggle rule the component owns, which the store
 * and command layer cannot express on their own: **the first** band added to an
 * empty stack switches EQ on, later ones do not. Adding a band to a stack the
 * user has deliberately bypassed is an edit, and re-enabling under them would
 * fight the `\` momentary-compare workflow.
 *
 * `eqCommands.ensureEnabled` itself — including its momentary-hold redirect —
 * is unit-tested in `services/eq-commands.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqFilterList from './EqFilterList.svelte';
import { eqStore, type EQFilter } from '$lib/stores/eq-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '$lib/stores/eq-constraints-store.svelte.js';
import { commandHistory } from '$lib/services/command-history.svelte.js';

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 0, ...overrides };
}

const addButton = () => page.getByRole('button', { name: 'Add EQ Band' });
const removeButton = () => page.getByRole('button', { name: 'Remove EQ Band' });

describe('EqFilterList', () => {
	beforeEach(() => {
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqStore.isEnabled = false;
		eqStore.channelScope = 'BOTH';
		eqStore.momentaryOverride = null;
		eqStore.momentaryRestore = null;
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		commandHistory.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		eqStore.filters = [];
		eqStore.isEnabled = false;
		eqStore.channelScope = 'BOTH';
	});

	describe('the master toggle', () => {
		it('switches on when the first band is added to an empty stack', async () => {
			render(EqFilterList);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.isEnabled).toBe(true);
		});

		it('stays off when a band joins a stack the user has bypassed', async () => {
			eqStore.filters = [makeFilter()];
			render(EqFilterList);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(2));
			expect(eqStore.isEnabled).toBe(false);
		});

		// Emptying the stack and adding again is a fresh start, so the rule is
		// "the stack was empty", not "this is the first add of the session".
		it('switches on again after the stack has been emptied', async () => {
			eqStore.filters = [makeFilter()];
			render(EqFilterList);

			await removeButton().click();
			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(0));
			expect(eqStore.isEnabled).toBe(false);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.isEnabled).toBe(true);
		});
	});

	// ── Channel scoping ──────────────────────────────────────────────────────

	describe('channel scope', () => {
		/** Number-input triples, one per rendered band card. */
		const cardCount = () => document.querySelectorAll('input[type="number"]').length / 3;

		/** The scope segments are the only aria-pressed buttons in this component. */
		const scopeButton = (label: string) =>
			[...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) =>
				b.textContent!.trim().startsWith(label)
			)!;

		// The switch lives on the list, not in the panel header: it scopes this
		// list and decides which bucket `+` fills, and in the header it both read
		// as part of "what am I equalizing" and wrapped that row on a phone.
		it('renders the channel switch at the head of the list', async () => {
			render(EqFilterList);

			await vi.waitFor(() => expect(scopeButton('L+R')).toBeTruthy());
			expect(scopeButton('L+R').getAttribute('aria-pressed')).toBe('true');
			expect(scopeButton('R').getAttribute('aria-pressed')).toBe('false');
		});

		it('switches scope from the list and shows each bucket count', async () => {
			eqStore.filters = [makeFilter({ freq: 100 }), makeFilter({ freq: 200, channel: 'R' })];
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			expect(scopeButton('L+R').textContent!.trim()).toBe('L+R (1)');
			expect(scopeButton('R').textContent!.trim()).toBe('R (1)');

			scopeButton('R').click();

			await vi.waitFor(() => expect(eqStore.channelScope).toBe('R'));
			expect(document.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('200');
		});

		it('renders only the active bucket', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100 }),
				makeFilter({ freq: 200, channel: 'L' }),
				makeFilter({ freq: 300, channel: 'R' })
			];
			eqStore.channelScope = 'L';
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			expect(document.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('200');
		});

		it('says how many shared bands also reach the scoped ear', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100 }),
				makeFilter({ freq: 150 }),
				makeFilter({ freq: 200, channel: 'L' })
			];
			eqStore.channelScope = 'L';
			render(EqFilterList);

			await expect.element(page.getByText(/2 shared band/)).toBeInTheDocument();
		});

		it('does not show the hint in the shared bucket', async () => {
			eqStore.filters = [makeFilter({ freq: 100 })];
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			expect(document.body.textContent).not.toMatch(/shared band/);
		});

		it('stamps the active scope onto a newly added band', async () => {
			eqStore.channelScope = 'R';
			render(EqFilterList);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.filters[0].channel).toBe('R');
		});

		// The minus button sits under the scoped list, so it has to remove from
		// that list — popping the flat array's tail would delete another ear's band.
		it('removes the last band of the active bucket, not of the whole array', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100, channel: 'L' }),
				makeFilter({ freq: 200, channel: 'R' })
			];
			eqStore.channelScope = 'L';
			render(EqFilterList);

			await removeButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.filters[0]).toMatchObject({ freq: 200, channel: 'R' });
		});

		// Cards are addressed by their index in the flat array; if narrowing the
		// view renumbered them, an edit in the R bucket would hit an L band.
		it('edits the right band when the view is narrowed', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100, channel: 'L' }),
				makeFilter({ freq: 200, channel: 'R' })
			];
			eqStore.channelScope = 'R';
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			const freqBox = document.querySelector<HTMLInputElement>('input[type="number"]')!;
			freqBox.focus();
			await page.getByRole('spinbutton').first().fill('250');
			freqBox.blur();

			await vi.waitFor(() => expect(eqStore.filters[1].freq).toBe(250));
			expect(eqStore.filters[0].freq).toBe(100);
		});
	});
});
