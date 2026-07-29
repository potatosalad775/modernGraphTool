/**
 * `EqOptionButton` is the constraint-preset picker: a popover with a search box
 * and two groups — the built-ins baked into the binary, and whatever device
 * profiles hydration merged in.
 *
 * `eqConstraintsStore.presets` is written directly rather than hydrated, so the
 * catalog under test doesn't depend on `eq-constraints.json` being reachable.
 * `reclampToActiveConstraint` is spied on: picking a preset must re-clamp the
 * live stack, but the clamping itself belongs to `eq-commands.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqOptionButton from './EqOptionButton.svelte';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '$lib/stores/eq-constraints-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import * as m from '$lib/paraglide/messages.js';

const DEVICE_PRESET: EqConstraintPreset = {
	id: 'fiio-jm21',
	label: 'FiiO JM21',
	mode: 'parametric',
	maxBands: 10,
	allowPk: true,
	allowLsq: true,
	allowHsq: true,
	freqMin: 20,
	freqMax: 20000,
	gainMin: -12,
	gainMax: 12,
	qMin: 0.3,
	qMax: 10
};

async function open() {
	render(EqOptionButton);
	await page.getByRole('button', { name: m.eq_constraint_select_title() }).click();
	await expect.element(page.getByLabelText(m.eq_constraint_search_placeholder())).toBeVisible();
}

function search() {
	return page.getByLabelText(m.eq_constraint_search_placeholder());
}

function presetOption(label: string) {
	return page.getByRole('button', { name: label, exact: true });
}

describe('EqOptionButton', () => {
	let setActive: ReturnType<typeof vi.spyOn>;
	let reclamp: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS, DEVICE_PRESET];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		setActive = vi.spyOn(eqConstraintsStore, 'setActive');
		reclamp = vi.spyOn(eqCommands, 'reclampToActiveConstraint').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
	});

	// ── Panel contents ───────────────────────────────────────────────────────

	it('keeps the panel closed until the trigger is pressed', async () => {
		render(EqOptionButton);

		expect(page.getByLabelText(m.eq_constraint_search_placeholder()).elements()).toHaveLength(0);
	});

	it('names the active preset in the panel header', async () => {
		eqConstraintsStore.activeId = DEVICE_PRESET.id;
		await open();

		// The label appears twice while the panel is open — once in the header,
		// once as its own row. The header is the first in document order.
		await expect.element(page.getByText(DEVICE_PRESET.label).first()).toBeInTheDocument();
	});

	it('splits the catalog into built-in and device groups', async () => {
		await open();

		await expect.element(page.getByText(m.eq_constraint_group_builtin())).toBeInTheDocument();
		await expect.element(page.getByText(m.eq_constraint_group_device())).toBeInTheDocument();
	});

	it('omits the device group when nothing but built-ins are loaded', async () => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		await open();

		await expect.element(page.getByText(m.eq_constraint_group_builtin())).toBeInTheDocument();
		expect(page.getByText(m.eq_constraint_group_device()).elements()).toHaveLength(0);
	});

	it('marks the active preset with aria-pressed', async () => {
		await open();

		await expect
			.element(presetOption(BUILTIN_PRESETS[0].label))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(presetOption(DEVICE_PRESET.label))
			.toHaveAttribute('aria-pressed', 'false');
	});

	// ── Search ───────────────────────────────────────────────────────────────

	describe('search', () => {
		it('filters by label', async () => {
			await open();
			await search().fill('FiiO');

			await expect.element(presetOption(DEVICE_PRESET.label)).toBeInTheDocument();
			expect(presetOption(BUILTIN_PRESETS[0].label).elements()).toHaveLength(0);
		});

		it('also matches on preset id', async () => {
			await open();
			await search().fill('jm21');

			await expect.element(presetOption(DEVICE_PRESET.label)).toBeInTheDocument();
		});

		it('ignores case and surrounding whitespace', async () => {
			await open();
			await search().fill('  GENERIC  ');

			await expect.element(presetOption(BUILTIN_PRESETS[1].label)).toBeInTheDocument();
		});

		it('shows the empty-result note when nothing matches', async () => {
			await open();
			await search().fill('no-such-preset');

			await expect.element(page.getByText(m.eq_constraint_no_results())).toBeInTheDocument();
		});

		it('starts from the full list again on the next open', async () => {
			await open();
			await search().fill('FiiO');
			await expect.element(presetOption(DEVICE_PRESET.label)).toBeInTheDocument();

			// Escape closes the popover; the query is reset on close so the next
			// open isn't silently still filtered.
			await page.getByLabelText(m.eq_constraint_search_placeholder()).element().blur();
			await page.getByRole('button', { name: m.eq_constraint_select_title() }).click();
			await page.getByRole('button', { name: m.eq_constraint_select_title() }).click();

			await expect.element(presetOption(BUILTIN_PRESETS[0].label)).toBeInTheDocument();
		});
	});

	// ── Selection ────────────────────────────────────────────────────────────

	describe('selection', () => {
		it('activates the picked preset and re-clamps the live stack', async () => {
			await open();
			await presetOption(DEVICE_PRESET.label).click();

			expect(setActive).toHaveBeenCalledWith(DEVICE_PRESET.id);
			expect(reclamp).toHaveBeenCalledOnce();
		});

		it('closes the panel after picking', async () => {
			await open();
			await presetOption(DEVICE_PRESET.label).click();

			await vi.waitFor(() =>
				expect(page.getByLabelText(m.eq_constraint_search_placeholder()).elements()).toHaveLength(0)
			);
		});

		it('does nothing but close when the active preset is picked again', async () => {
			await open();
			await presetOption(BUILTIN_PRESETS[0].label).click();

			expect(setActive).not.toHaveBeenCalled();
			expect(reclamp).not.toHaveBeenCalled();
		});
	});
});
