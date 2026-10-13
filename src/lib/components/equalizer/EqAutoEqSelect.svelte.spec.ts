/**
 * `EqAutoEqSelect` picks the curve AutoEQ optimizes towards. Two behaviours are
 * load-bearing beyond rendering a picker: EQ curves are excluded (optimizing
 * towards an EQ result is meaningless), and an effect keeps the stored uuid
 * honest — clearing it when the curve is removed, and auto-selecting when the
 * choice is unambiguous.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqAutoEqSelect from './EqAutoEqSelect.svelte';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import type { FRDataObject, FRDataType } from '$lib/types/data-types.js';
import * as m from '$lib/paraglide/messages.js';

function add(uuid: string, type: FRDataType, identifier = uuid, dispSuffix?: string): void {
	frStore.set(uuid, {
		uuid,
		type,
		identifier,
		dispSuffix,
		channels: { AVG: { data: [[1000, 0]] } }
	} as unknown as FRDataObject);
}

/** The trigger: bits-ui renders it as a button with `aria-haspopup="listbox"`. */
function select() {
	return page.getByRole('button');
}

/** Opens the picker and returns its option labels in document order. */
async function optionLabels(): Promise<string[]> {
	await select().click();
	await expect.element(page.getByRole('listbox')).toBeInTheDocument();
	return Array.from(document.querySelectorAll('[role="option"]')).map(
		(o) => o.textContent?.trim() ?? ''
	);
}

describe('EqAutoEqSelect', () => {
	beforeEach(() => {
		frStore.entries.clear();
		eqStore.autoEqTargetUUID = null;
	});

	afterEach(() => {
		frStore.entries.clear();
		eqStore.autoEqTargetUUID = null;
	});

	// ── Options ──────────────────────────────────────────────────────────────

	describe('options', () => {
		it('shows the placeholder when nothing is loaded', async () => {
			render(EqAutoEqSelect);

			await expect.element(select()).toHaveTextContent(m.equalizer_phone_select_option_target());
		});

		it('lists phones and targets', async () => {
			add('a', 'target', 'Harman');
			add('b', 'phone', 'HD600');
			render(EqAutoEqSelect);

			const labels = await optionLabels();
			expect(labels).toContain('Harman');
			expect(labels).toContain('HD600');
		});

		it('omits EQ curves', async () => {
			// The EQ result is derived from the source; offering it as a target would
			// let AutoEQ chase its own output.
			add('a', 'phone', 'HD600');
			add('eq', 'eq', 'HD600 EQ');
			add('ins', 'inserted-eq', 'Imported EQ');
			render(EqAutoEqSelect);

			expect(await optionLabels()).toEqual(['HD600']);
		});

		it('puts targets ahead of phones, under group headings', async () => {
			add('p', 'phone', 'AAA Phone');
			add('t', 'target', 'ZZZ Target');
			render(EqAutoEqSelect);

			expect(await optionLabels()).toEqual(['ZZZ Target', 'AAA Phone']);
			const headings = Array.from(document.querySelectorAll('[data-select-group-label]'));
			expect(headings.map((h) => h.textContent?.trim())).toEqual([
				m.equalizer_phone_select_group_targets(),
				m.equalizer_phone_select_group_devices()
			]);
		});

		it('sorts alphabetically within a group', async () => {
			add('p2', 'phone', 'Beta');
			add('p1', 'phone', 'Alpha');
			render(EqAutoEqSelect);

			expect(await optionLabels()).toEqual(['Alpha', 'Beta']);
		});

		it('appends the display suffix to the label', async () => {
			add('p', 'phone', 'HD600', '(sample 2)');
			render(EqAutoEqSelect);

			expect(await optionLabels()).toEqual(['HD600 (sample 2)']);
		});

		it('trims the label when there is no suffix', async () => {
			add('p', 'phone', 'HD600');
			render(EqAutoEqSelect);

			expect(await optionLabels()).toEqual(['HD600']);
		});
	});

	// ── Selection ────────────────────────────────────────────────────────────

	describe('selection', () => {
		it('stores the picked uuid', async () => {
			add('t', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			render(EqAutoEqSelect);

			await select().click();
			await page.getByRole('option', { name: 'Harman' }).click();

			await expect.poll(() => eqStore.autoEqTargetUUID).toBe('t');
		});

		it('names the trigger by its label and the current choice', async () => {
			// An aria-label alone would replace the shown value as the accessible
			// name, so a screen reader would never hear what is selected.
			add('t', 'target', 'Harman');
			render(EqAutoEqSelect);

			await expect
				.element(select())
				.toHaveAccessibleName(`${m.equalizer_phone_select_target_label()} Harman`);
		});

		it('shows the stored uuid as the current value', async () => {
			add('t', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			eqStore.autoEqTargetUUID = 't2';
			render(EqAutoEqSelect);

			await expect.element(select()).toHaveTextContent('Diffuse Field');
		});
	});

	// ── The reconciling effect ───────────────────────────────────────────────

	describe('keeping the stored uuid valid', () => {
		it('auto-selects the only target present', async () => {
			add('t', 'target', 'Harman');
			add('p', 'phone', 'HD600');
			render(EqAutoEqSelect);

			expect(eqStore.autoEqTargetUUID).toBe('t');
		});

		it('counts an inserted target as a candidate', async () => {
			add('t', 'inserted-target', 'Uploaded Target');
			render(EqAutoEqSelect);

			expect(eqStore.autoEqTargetUUID).toBe('t');
		});

		it('leaves the choice open when several targets are loaded', async () => {
			add('t1', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			render(EqAutoEqSelect);

			expect(eqStore.autoEqTargetUUID).toBeNull();
		});

		it('leaves the choice open when only phones are loaded', async () => {
			add('p', 'phone', 'HD600');
			render(EqAutoEqSelect);

			expect(eqStore.autoEqTargetUUID).toBeNull();
		});

		it('drops a uuid that is no longer in the store', async () => {
			// Removing the selected curve otherwise leaves a dangling id that
			// `EqAutoEq` only discovers at run time, as an alert.
			add('t1', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			eqStore.autoEqTargetUUID = 'gone';
			render(EqAutoEqSelect);

			expect(eqStore.autoEqTargetUUID).toBeNull();
		});

		it('re-points at the sole survivor after the selected target is removed', async () => {
			add('t1', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			eqStore.autoEqTargetUUID = 't1';
			render(EqAutoEqSelect);

			frStore.delete('t1');

			await expect.poll(() => eqStore.autoEqTargetUUID).toBe('t2');
		});
	});
});
