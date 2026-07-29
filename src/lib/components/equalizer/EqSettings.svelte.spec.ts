/**
 * `EqSettings` is the small settings sheet behind the Equalizer panel's gear:
 * where AutoEQ inputs persist, and whether the EQ curve is normalized against
 * the original.
 *
 * Both controls have a side effect beyond writing the flag — switching persist
 * mode migrates the stored options to the other storage, and the link toggle has
 * to renormalize immediately or the graph keeps showing the previous reference.
 * Those are what is asserted; the storage mechanics themselves belong to
 * `settings-store.svelte.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqSettings from './EqSettings.svelte';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import * as m from '$lib/paraglide/messages.js';

function persistSelect() {
	return page.getByRole('combobox');
}

function linkSwitch() {
	return page.getByRole('switch');
}

describe('EqSettings', () => {
	let renormalizeAll: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
		settingsStore.autoEqPersistMode = 'session';
		settingsStore.linkEqNormalization = false;
		renormalizeAll = vi.spyOn(dataProvider, 'renormalizeAll').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		settingsStore.autoEqPersistMode = 'session';
		settingsStore.linkEqNormalization = false;
	});

	// ── AutoEQ persistence mode ──────────────────────────────────────────────

	describe('AutoEQ persistence mode', () => {
		it('shows the stored mode as the current value', async () => {
			settingsStore.autoEqPersistMode = 'local';
			render(EqSettings);

			await expect.element(persistSelect()).toHaveValue('local');
		});

		it('offers both session and local', async () => {
			render(EqSettings);

			await expect
				.element(page.getByRole('option', { name: m.eq_settings_autoeq_persist_session() }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('option', { name: m.eq_settings_autoeq_persist_local() }))
				.toBeInTheDocument();
		});

		it('switches the store to the picked mode', async () => {
			render(EqSettings);

			await persistSelect().selectOptions(m.eq_settings_autoeq_persist_local());

			expect(settingsStore.autoEqPersistMode).toBe('local');
		});

		it('moves the stored options into the newly picked storage', async () => {
			// The migration is the whole point of the setting: picking `local`
			// without carrying the options over would silently reset them.
			settingsStore.autoEqOptions = { ...settingsStore.autoEqOptions, freqMax: 12345 };
			render(EqSettings);

			await persistSelect().selectOptions(m.eq_settings_autoeq_persist_local());

			expect(JSON.parse(localStorage.getItem('gt-settings-autoeq-options')!)).toMatchObject({
				freqMax: 12345
			});
		});
	});

	// ── Link EQ normalization ────────────────────────────────────────────────

	describe('link EQ normalization', () => {
		it('reflects the stored flag', async () => {
			settingsStore.linkEqNormalization = true;
			render(EqSettings);

			await expect.element(linkSwitch()).toBeChecked();
		});

		it('sets the flag when switched on', async () => {
			render(EqSettings);

			await linkSwitch().click();

			expect(settingsStore.linkEqNormalization).toBe(true);
		});

		it('renormalizes immediately so the graph matches the new reference', async () => {
			render(EqSettings);

			await linkSwitch().click();

			expect(renormalizeAll).toHaveBeenCalledOnce();
		});

		it('clears the flag and renormalizes again when switched back off', async () => {
			settingsStore.linkEqNormalization = true;
			render(EqSettings);

			await linkSwitch().click();

			expect(settingsStore.linkEqNormalization).toBe(false);
			expect(renormalizeAll).toHaveBeenCalledOnce();
		});

		it('explains the option in a popover', async () => {
			render(EqSettings);

			await page
				.getByRole('button', { name: "Open 'Link EQ curve to original' option description" })
				.click();

			await expect
				.element(page.getByText(m.eq_settings_link_eq_normalization_description()))
				.toBeVisible();
		});
	});
});
