/**
 * `EqOptionButton` is the constraint picker: a popover with a search box over
 * the built-ins baked into the binary, the connected device's profile, recent
 * picks, and the eqcaps database's software and hardware profiles.
 *
 * `eqConstraintsStore.presets` is written directly to seed the local presets,
 * and the eqcaps client is mocked to serve a small index. `reclampToActiveConstraint`
 * is spied on: picking a preset must fold the live stack, but the folding
 * itself belongs to `eq-commands.spec.ts`.
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
import type { IndexEntry } from '@potatosalad775/eqcaps-core';
import * as m from '$lib/paraglide/messages.js';
import { hardwareProfile, parametricPreset } from '$lib/utils/__fixtures__/eq-profiles.js';

const DEVICE_PRESET = parametricPreset('fiio-jm21', {
	label: 'FiiO JM21',
	maxBands: 10,
	source: 'device'
});

const indexEntry = (id: string, extra: Partial<IndexEntry>): IndexEntry => ({
	id,
	kind: 'hardware',
	brand: 'Brand',
	model: id,
	status: 'community-verified',
	path: `profiles/${id}.json`,
	sha256: '',
	bytes: 0,
	...extra
});

const client = vi.hoisted(() => ({ loadIndex: vi.fn(), loadProfile: vi.fn() }));
vi.mock('$lib/services/eqcaps-client.js', () => ({ eqcapsClient: () => client }));

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
		reclamp = vi.spyOn(eqCommands, 'reclampToActiveConstraint').mockImplementation(() => false);
		client.loadIndex.mockResolvedValue({
			profiles: [
				indexEntry('poweramp-equalizer', {
					kind: 'software',
					brand: 'Poweramp',
					model: 'Equalizer'
				}),
				indexEntry('moondrop-quark2', {
					brand: 'Moondrop',
					model: 'Quark2',
					status: 'draft',
					aliases: ['Quark 2']
				}),
				indexEntry('old-thing', { status: 'deprecated' })
			]
		});
		client.loadProfile.mockImplementation(async (id: string) => ({
			...hardwareProfile(id, { bandCount: 5 }),
			device: { brand: 'Moondrop', model: 'Quark2' }
		}));
		localStorage.removeItem('gt-eq-constraint-catalog');
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

	// ── The eqcaps database ──────────────────────────────────────────────────

	describe('database profiles', () => {
		it('lists software EQs and devices once the index arrives, without deprecated ones', async () => {
			await open();

			await expect.element(page.getByText(m.eq_constraint_group_software())).toBeInTheDocument();
			await expect.element(presetOption('Poweramp Equalizer')).toBeInTheDocument();
			await expect.element(page.getByText(m.eq_constraint_group_hardware())).toBeInTheDocument();
			expect(page.getByText('old-thing').elements()).toHaveLength(0);
		});

		it('marks unverified profiles as drafts', async () => {
			await open();
			await expect
				.element(page.getByTitle(m.eq_constraint_draft_title()))
				.toHaveTextContent(m.eq_constraint_draft());
		});

		it('finds a device by its aliases', async () => {
			await open();
			await search().fill('quark 2');
			await expect
				.element(page.getByRole('button', { name: /Moondrop Quark2/ }))
				.toBeInTheDocument();
		});

		it('fetches a picked profile, selects it and folds the live stack onto it', async () => {
			await open();
			await page.getByRole('button', { name: /Moondrop Quark2/ }).click();

			await vi.waitFor(() => expect(reclamp).toHaveBeenCalledOnce());
			expect(client.loadProfile).toHaveBeenCalledWith('moondrop-quark2');
			expect(eqConstraintsStore.activeId).toBe('eqcaps:moondrop-quark2');
			expect(eqConstraintsStore.maxBands).toBe(5);
		});

		it('keeps the current constraint when the profile can’t be fetched', async () => {
			client.loadProfile.mockResolvedValue(null);
			await open();
			await page.getByRole('button', { name: /Moondrop Quark2/ }).click();

			await vi.waitFor(() => expect(client.loadProfile).toHaveBeenCalled());
			expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
			expect(reclamp).not.toHaveBeenCalled();
		});

		it('says so when the database is unreachable, and keeps the built-ins', async () => {
			client.loadIndex.mockResolvedValue(null);
			await open();
			await expect.element(page.getByText(m.eq_constraint_catalog_failed())).toBeInTheDocument();
			await expect.element(presetOption(BUILTIN_PRESETS[0].label)).toBeInTheDocument();
		});
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
