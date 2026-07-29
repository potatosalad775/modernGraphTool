/**
 * `EqAutoEqSelect` picks the curve AutoEQ optimizes towards. Two behaviours are
 * load-bearing beyond rendering a `<select>`: EQ curves are excluded (optimizing
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

function select() {
	return page.getByRole('combobox');
}

/** Option labels in document order, minus the leading placeholder. */
function optionLabels(): string[] {
	return Array.from(document.querySelectorAll('option'))
		.map((o) => o.textContent?.trim() ?? '')
		.slice(1);
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
		it('offers the placeholder when nothing is loaded', async () => {
			render(EqAutoEqSelect);

			await expect.element(select()).toBeInTheDocument();
			expect(optionLabels()).toEqual([]);
		});

		it('lists phones and targets', async () => {
			add('a', 'target', 'Harman');
			add('b', 'phone', 'HD600');
			render(EqAutoEqSelect);

			expect(optionLabels()).toContain('Harman');
			expect(optionLabels()).toContain('HD600');
		});

		it('omits EQ curves', async () => {
			// The EQ result is derived from the source; offering it as a target would
			// let AutoEQ chase its own output.
			add('a', 'phone', 'HD600');
			add('eq', 'eq', 'HD600 EQ');
			add('ins', 'inserted-eq', 'Imported EQ');
			render(EqAutoEqSelect);

			expect(optionLabels()).toEqual(['HD600']);
		});

		it('puts targets ahead of phones', async () => {
			add('p', 'phone', 'AAA Phone');
			add('t', 'target', 'ZZZ Target');
			render(EqAutoEqSelect);

			expect(optionLabels()).toEqual(['ZZZ Target', 'AAA Phone']);
		});

		it('sorts alphabetically within a group', async () => {
			add('p2', 'phone', 'Beta');
			add('p1', 'phone', 'Alpha');
			render(EqAutoEqSelect);

			expect(optionLabels()).toEqual(['Alpha', 'Beta']);
		});

		it('appends the display suffix to the label', async () => {
			add('p', 'phone', 'HD600', '(sample 2)');
			render(EqAutoEqSelect);

			expect(optionLabels()).toEqual(['HD600 (sample 2)']);
		});

		it('trims the label when there is no suffix', async () => {
			add('p', 'phone', 'HD600');
			render(EqAutoEqSelect);

			expect(optionLabels()).toEqual(['HD600']);
		});
	});

	// ── Selection ────────────────────────────────────────────────────────────

	describe('selection', () => {
		it('stores the picked uuid', async () => {
			add('t', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			render(EqAutoEqSelect);

			await select().selectOptions('Harman');

			expect(eqStore.autoEqTargetUUID).toBe('t');
		});

		it('clears the selection when the placeholder is picked', async () => {
			add('t', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			eqStore.autoEqTargetUUID = 't';
			render(EqAutoEqSelect);

			await select().selectOptions(m.equalizer_phone_select_option_target());

			expect(eqStore.autoEqTargetUUID).toBeNull();
		});

		it('shows the stored uuid as the current value', async () => {
			add('t', 'target', 'Harman');
			add('t2', 'target', 'Diffuse Field');
			eqStore.autoEqTargetUUID = 't2';
			render(EqAutoEqSelect);

			await expect.element(select()).toHaveValue('t2');
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
