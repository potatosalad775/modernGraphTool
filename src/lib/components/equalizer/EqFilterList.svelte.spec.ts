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
});
