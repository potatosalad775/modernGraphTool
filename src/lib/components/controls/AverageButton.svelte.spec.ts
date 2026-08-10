/**
 * `AverageButton` folds every visible phone curve into one inserted curve.
 *
 * The interesting behaviour is the enablement rule — the button has to track
 * `frStore` rather than a snapshot, since hiding, removing or channel-switching
 * a curve (including via undo) changes whether there is anything to average.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import AverageButton from './AverageButton.svelte';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';

function makeItem(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Phone ${uuid}`,
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
		colors: { AVG: 'oklch(0.68 0.16 30)' },
		dash: '1 0',
		...overrides
	};
}

function seed(...items: FRDataObject[]) {
	for (const item of items) frStore.set(item.uuid, item);
}

// `Button` mirrors `title` into `aria-label`, which overrides the visible text as
// the accessible name — and this button's title changes with its enabled state to
// explain *why* it is disabled. Both titles contain the word, so match it
// case-insensitively rather than on the label the user reads.
const button = () => page.getByRole('button', { name: /average/i });

describe('AverageButton', () => {
	beforeEach(() => {
		frStore.clear();
	});

	afterEach(() => {
		frStore.clear();
		vi.restoreAllMocks();
	});

	it('is disabled with fewer than two visible phones', async () => {
		seed(makeItem('a'));
		render(AverageButton);
		await expect.element(button()).toBeDisabled();
	});

	it('is enabled once two phones are visible', async () => {
		seed(makeItem('a'), makeItem('b'));
		render(AverageButton);
		await expect.element(button()).toBeEnabled();
	});

	it('re-disables when a curve is hidden after render', async () => {
		seed(makeItem('a'), makeItem('b'));
		render(AverageButton);
		await expect.element(button()).toBeEnabled();

		frStore.set('b', makeItem('b', { hidden: true }));
		await expect.element(button()).toBeDisabled();
	});

	it('ignores targets when counting', async () => {
		seed(makeItem('a'), makeItem('t', { type: 'target' }));
		render(AverageButton);
		await expect.element(button()).toBeDisabled();
	});

	it('inserts one averaged curve carrying the contributor count', async () => {
		const insert = vi
			.spyOn(dataProvider, 'insertRawFRData')
			.mockImplementation(() => Promise.resolve());
		seed(makeItem('a'), makeItem('b'), makeItem('c'));
		render(AverageButton);

		await button().click();

		expect(insert).toHaveBeenCalledTimes(1);
		const [sourceType, identifier, , meta] = insert.mock.calls[0];
		expect(sourceType).toBe('phone');
		expect(identifier).toBe('Average');
		expect(meta?.dispSuffix).toContain('3');
		expect(meta?.dispChannel).toEqual(['AVG']);
	});

	it('averages the visible curves and leaves the hidden one out', async () => {
		const insert = vi
			.spyOn(dataProvider, 'insertRawFRData')
			.mockImplementation(() => Promise.resolve());
		// 80 and 90 average to 85; the hidden 0 dB curve would drag it to ~56.7.
		seed(
			makeItem('a'),
			makeItem('b', {
				channels: {
					AVG: {
						data: [
							[20, 90],
							[1000, 90],
							[20000, 90]
						],
						metadata: { minFreq: 20, maxFreq: 20000 }
					}
				}
			}),
			makeItem('c', {
				hidden: true,
				channels: {
					AVG: {
						data: [
							[20, 0],
							[1000, 0],
							[20000, 0]
						],
						metadata: { minFreq: 20, maxFreq: 20000 }
					}
				}
			})
		);
		render(AverageButton);

		await button().click();

		const averaged = insert.mock.calls[0][2];
		expect(averaged.AVG!.data.map(([, db]) => db)).toEqual([85, 85, 85]);
	});
});
