/**
 * `TargetCustomizer` is the per-target slider stack — Tilt / Bass / Treble and
 * whatever else the operator declares under `TARGET_CUSTOMIZER`.
 *
 * The component itself holds no slider state: everything lives in
 * `targetAdjustmentStore` so it survives the panel switches that unmount this
 * subtree. So the assertions here are about the two directions of that wiring —
 * what the store puts on screen, and what each control writes back — plus the
 * mount-time bookkeeping (the pre-adjustment snapshot in `graphStore`) that
 * baseline compensation depends on.
 *
 * `TARGET_CUSTOMIZER` config is read once and memoized inside the store, so it
 * is installed at module scope rather than per test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import TargetCustomizer from './TargetCustomizer.svelte';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { targetAdjustmentStore } from '$lib/stores/target-adjustment-store.svelte.js';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';
import * as m from '$lib/paraglide/messages.js';

window.GRAPHTOOL_CONFIG = {
	TARGET_CUSTOMIZER: {
		CUSTOMIZABLE_TARGETS: ['Harman'],
		FILTERS: [
			{ id: 'tilt', name: 'Tilt (dB/oct)', type: 'TILT', freq: 0, q: 0 },
			{
				id: 'bass',
				name: 'Bass (dB)',
				type: 'LSQ',
				freq: 105,
				q: 0.707,
				description: 'Low shelf at 105 Hz'
			},
			{ id: 'treble', name: 'Treble (dB)', type: 'HSQ', freq: 2500, q: 0.42 }
		],
		FILTER_PRESET: [{ name: 'Bassy', filter: { bass: 4, treble: 0 } }],
		INITIAL_TARGET_FILTERS: [{ name: 'Harman', filter: { bass: 2 } }]
	}
} as never;

const UUID = 'target-uuid';

function makeTarget(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: UUID,
		type: 'target',
		identifier: 'Harman',
		channels: {
			AVG: {
				data: [
					[20, 80],
					[1000, 80],
					[20000, 80]
				],
				metadata: { minFreq: 20, maxFreq: 20000 }
			}
		},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: 'oklch(0.7 0.1 30)' },
		dash: '',
		...overrides
	};
}

/** Mount with the FR entry present, then open the popover. */
async function open(item: FRDataObject = makeTarget()) {
	frStore.set(item.uuid, item);
	const result = render(TargetCustomizer, { uuid: item.uuid, item });
	await page.getByRole('button', { name: m.target_customizer_btn_view() }).click();
	await expect
		.element(page.getByRole('button', { name: m.target_customizer_btn_reset() }))
		.toBeVisible();
	return result;
}

function slider(id: string) {
	return page.getByLabelText(new RegExp(`^${id}\\b`));
}

describe('TargetCustomizer', () => {
	let applyTargetAdjustment: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		frStore.delete(UUID);
		targetAdjustmentStore.delete(UUID);
		graphStore.targetOriginalData.delete(UUID);
		applyTargetAdjustment = vi
			.spyOn(dataProvider, 'applyTargetAdjustment')
			.mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		frStore.delete(UUID);
		targetAdjustmentStore.delete(UUID);
		graphStore.targetOriginalData.delete(UUID);
	});

	// ── Gating ───────────────────────────────────────────────────────────────

	describe('gating', () => {
		it('renders nothing for a target the operator did not list', async () => {
			const item = makeTarget({ identifier: 'Diffuse Field' });
			frStore.set(UUID, item);
			render(TargetCustomizer, { uuid: UUID, item });

			expect(page.getByRole('button', { name: m.target_customizer_btn_view() }).elements()).toEqual(
				[]
			);
		});

		it('renders the trigger for a listed target', async () => {
			frStore.set(UUID, makeTarget());
			render(TargetCustomizer, { uuid: UUID, item: makeTarget() });

			await expect
				.element(page.getByRole('button', { name: m.target_customizer_btn_view() }))
				.toBeInTheDocument();
		});

		it('matches the config entry with or without the " Target" suffix', async () => {
			const item = makeTarget({ identifier: 'Harman Target' });
			frStore.set(UUID, item);
			render(TargetCustomizer, { uuid: UUID, item });

			await expect
				.element(page.getByRole('button', { name: m.target_customizer_btn_view() }))
				.toBeInTheDocument();
		});
	});

	// ── Mount-time bookkeeping ───────────────────────────────────────────────

	describe('registration', () => {
		it('snapshots the pre-adjustment channels into graphStore', async () => {
			frStore.set(UUID, makeTarget());
			render(TargetCustomizer, { uuid: UUID, item: makeTarget() });

			await vi.waitFor(() => expect(graphStore.targetOriginalData.has(UUID)).toBe(true));
			expect(graphStore.targetOriginalData.get(UUID)!.AVG!.data).toEqual([
				[20, 80],
				[1000, 80],
				[20000, 80]
			]);
		});

		it('seeds the sliders from INITIAL_TARGET_FILTERS', async () => {
			await open();

			await expect.element(slider('Bass')).toHaveValue('2');
		});

		it('does not overwrite a snapshot left by an earlier mount', async () => {
			const stale = { AVG: { data: [[100, 1] as [number, number]], metadata: {} } };
			graphStore.targetOriginalData.set(UUID, stale as never);
			frStore.set(UUID, makeTarget());
			render(TargetCustomizer, { uuid: UUID, item: makeTarget() });

			await vi.waitFor(() => expect(applyTargetAdjustment).toHaveBeenCalled());
			expect(graphStore.targetOriginalData.get(UUID)).toBe(stale);
		});

		it('keeps the adjustments when the component unmounts but the curve stays', async () => {
			const { unmount } = await open();
			await slider('Bass').fill('5');

			unmount();

			expect(targetAdjustmentStore.get(UUID).values.bass).toBe(5);
			expect(graphStore.targetOriginalData.has(UUID)).toBe(true);
		});

		it('cleans up once the curve itself is gone', async () => {
			const { unmount } = await open();
			frStore.delete(UUID);

			unmount();

			expect(graphStore.targetOriginalData.has(UUID)).toBe(false);
			expect(targetAdjustmentStore.has(UUID)).toBe(false);
		});
	});

	// ── Sliders ──────────────────────────────────────────────────────────────

	describe('sliders', () => {
		it('writes the dragged value back to the store', async () => {
			await open();
			await slider('Bass').fill('-3.5');

			expect(targetAdjustmentStore.get(UUID).values.bass).toBe(-3.5);
		});

		it('re-applies the adjustment through dataProvider', async () => {
			await open();
			applyTargetAdjustment.mockClear();
			await slider('Bass').fill('6');

			await vi.waitFor(() => expect(applyTargetAdjustment).toHaveBeenCalledWith(UUID));
		});

		it('prints the current value to one decimal', async () => {
			await open();
			await slider('Bass').fill('-3.5');

			await expect.element(page.getByText('-3.5', { exact: true })).toBeInTheDocument();
		});

		it('gives a TILT filter the narrow dB/oct range', async () => {
			await open();
			await page.getByRole('combobox').first().selectOptions('tilt');

			const el = slider('Tilt').element() as HTMLInputElement;
			expect([el.min, el.max, el.step]).toEqual(['-2', '2', '0.1']);
		});

		it('gives a shelf filter the wide dB range', async () => {
			await open();

			const el = slider('Bass').element() as HTMLInputElement;
			expect([el.min, el.max, el.step]).toEqual(['-20', '20', '0.5']);
		});

		it('explains a filter that carries a description', async () => {
			await open();
			await page.getByRole('button', { name: 'Open target filter description' }).click();

			await expect.element(page.getByText('Low shelf at 105 Hz')).toBeInTheDocument();
		});
	});

	// ── Add / remove / preset / reset ────────────────────────────────────────

	describe('filter stack', () => {
		it('shows the empty note when nothing is active', async () => {
			const item = makeTarget({ identifier: 'Harman' });
			frStore.set(UUID, item);
			targetAdjustmentStore.ensure(UUID, 'Harman');
			targetAdjustmentStore.reset(UUID);
			render(TargetCustomizer, { uuid: UUID, item });
			await page.getByRole('button', { name: m.target_customizer_btn_view() }).click();

			await expect.element(page.getByText(m.target_customizer_no_filters())).toBeInTheDocument();
		});

		it('adds a filter from the picker', async () => {
			await open();
			await page.getByRole('combobox').first().selectOptions('treble');

			expect(targetAdjustmentStore.get(UUID).activeIds).toContain('treble');
			await expect.element(slider('Treble')).toHaveValue('0');
		});

		it('drops the added filter out of the picker', async () => {
			await open();
			const picker = page.getByRole('combobox').first();
			await picker.selectOptions('treble');

			const values = [...(picker.element() as HTMLSelectElement).options].map((o) => o.value);
			expect(values).not.toContain('treble');
		});

		it('removes a filter from its X button', async () => {
			await open();
			await page.getByRole('button', { name: 'Remove' }).click();

			expect(targetAdjustmentStore.get(UUID).activeIds).toEqual([]);
			expect(targetAdjustmentStore.get(UUID).values.bass).toBeUndefined();
		});

		it('applies a preset from the preset picker', async () => {
			await open();
			await page.getByRole('combobox').last().selectOptions('Bassy');

			// The preset's zero-gain entries are dropped — only `bass` stays active.
			expect(targetAdjustmentStore.get(UUID).activeIds).toEqual(['bass']);
			await expect.element(slider('Bass')).toHaveValue('4');
		});

		it('clears every slider on Reset', async () => {
			await open();
			await page.getByRole('button', { name: m.target_customizer_btn_reset() }).click();

			expect(targetAdjustmentStore.get(UUID)).toEqual({ activeIds: [], values: {}, preset: '' });
			await expect.element(page.getByText(m.target_customizer_no_filters())).toBeInTheDocument();
		});
	});
});
