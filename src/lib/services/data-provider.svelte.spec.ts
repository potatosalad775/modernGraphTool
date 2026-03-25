import { describe, it, expect, beforeEach } from 'vitest';
import { dataProvider } from './data-provider.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { commandHistory } from './command-history.js';
import type { FRDataObject } from '$lib/types/data-types.js';

function makeFRDataObject(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Brand Phone-${uuid}`,
		channels: {
			L: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } },
			R: { data: [[1000, 78]], metadata: { minFreq: 20, maxFreq: 20000 } },
			AVG: { data: [[1000, 79]], metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '1 0',
		...overrides
	};
}

describe('DataProvider', () => {
	beforeEach(() => {
		frStore.clear();
		commandHistory.clear();
	});

	// ── Read helpers ─────────────────────────────────────────────────────────

	describe('getFRData', () => {
		it('returns data for existing UUID', () => {
			frStore.set('a', makeFRDataObject('a'));
			const result = dataProvider.getFRData('a');
			expect(result).not.toBeNull();
			expect(result!.uuid).toBe('a');
		});

		it('returns null for non-existent UUID', () => {
			expect(dataProvider.getFRData('missing')).toBeNull();
		});
	});

	describe('isFRDataLoaded', () => {
		it('returns true when identifier matches', () => {
			frStore.set('a', makeFRDataObject('a'));
			expect(dataProvider.isFRDataLoaded('Brand Phone-a')).toBe(true);
		});

		it('returns false when identifier not found', () => {
			expect(dataProvider.isFRDataLoaded('Unknown Phone')).toBe(false);
		});

		it('returns true when identifier and suffix both match', () => {
			frStore.set('a', makeFRDataObject('a', { dispSuffix: 'v2' }));
			expect(dataProvider.isFRDataLoaded('Brand Phone-a', 'v2')).toBe(true);
		});

		it('returns false when identifier matches but suffix does not', () => {
			frStore.set('a', makeFRDataObject('a', { dispSuffix: 'v2' }));
			expect(dataProvider.isFRDataLoaded('Brand Phone-a', 'v3')).toBe(false);
		});

		it('returns true when suffix is not specified (any suffix matches)', () => {
			frStore.set('a', makeFRDataObject('a', { dispSuffix: 'v2' }));
			expect(dataProvider.isFRDataLoaded('Brand Phone-a')).toBe(true);
		});
	});

	describe('getUUIDbyIdentifier', () => {
		it('returns UUID for matching identifier', () => {
			frStore.set('a', makeFRDataObject('a'));
			expect(dataProvider.getUUIDbyIdentifier('Brand Phone-a')).toBe('a');
		});

		it('returns null when identifier not found', () => {
			expect(dataProvider.getUUIDbyIdentifier('Nonexistent')).toBeNull();
		});

		it('returns first match when multiple entries exist', () => {
			frStore.set('a', makeFRDataObject('a', { identifier: 'Same Phone' }));
			frStore.set('b', makeFRDataObject('b', { identifier: 'Different Phone' }));
			expect(dataProvider.getUUIDbyIdentifier('Same Phone')).toBe('a');
		});
	});

	// ── Remove ───────────────────────────────────────────────────────────────

	describe('removeFRData', () => {
		it('removes entry matching identifier', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.removeFRData('phone', 'Brand Phone-a');
			expect(frStore.has('a')).toBe(false);
		});

		it('does nothing when identifier not found', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.removeFRData('phone', 'Unknown');
			expect(frStore.has('a')).toBe(true);
		});

		it('only removes first match', () => {
			frStore.set('a', makeFRDataObject('a', { identifier: 'Same' }));
			frStore.set('b', makeFRDataObject('b', { identifier: 'Same' }));
			dataProvider.removeFRData('phone', 'Same');
			// One removed, one remains
			expect(frStore.size).toBe(1);
		});
	});

	describe('removeFRDataWithUUID', () => {
		it('removes entry by UUID', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.removeFRDataWithUUID('phone', 'a');
			expect(frStore.has('a')).toBe(false);
		});

		it('does nothing when UUID not found', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.removeFRDataWithUUID('phone', 'nonexistent');
			expect(frStore.has('a')).toBe(true);
		});
	});

	// ── Field updates ────────────────────────────────────────────────────────

	describe('updateDisplayChannel', () => {
		it('updates dispChannel for existing UUID', () => {
			frStore.set('a', makeFRDataObject('a', { dispChannel: ['AVG'] }));
			dataProvider.updateDisplayChannel('a', ['L', 'R']);
			expect(frStore.get('a')!.dispChannel).toEqual(['L', 'R']);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateDisplayChannel('nonexistent', ['L']);
			expect(frStore.size).toBe(0);
		});
	});

	describe('updateColors', () => {
		it('updates colors for existing UUID', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateColors('a', { AVG: '#ffffff' });
			expect(frStore.get('a')!.colors.AVG).toBe('#ffffff');
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateColors('nonexistent', { AVG: '#fff' });
			expect(frStore.size).toBe(0);
		});
	});

	describe('updateDashPattern', () => {
		it('updates dash pattern for existing UUID', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateDashPattern('a', '5 5');
			expect(frStore.get('a')!.dash).toBe('5 5');
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateDashPattern('nonexistent', '5 5');
			expect(frStore.size).toBe(0);
		});
	});

	describe('updateVisibility', () => {
		it('sets hidden to true', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateVisibility('a', true);
			expect(frStore.get('a')!.hidden).toBe(true);
		});

		it('sets hidden to false', () => {
			frStore.set('a', makeFRDataObject('a', { hidden: true }));
			dataProvider.updateVisibility('a', false);
			expect(frStore.get('a')!.hidden).toBe(false);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateVisibility('nonexistent', true);
			expect(frStore.size).toBe(0);
		});
	});

	describe('updateYOffset', () => {
		it('sets y-offset', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateYOffset('a', 5);
			expect(frStore.get('a')!.yOffset).toBe(5);
		});

		it('supports negative offsets', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateYOffset('a', -3);
			expect(frStore.get('a')!.yOffset).toBe(-3);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateYOffset('nonexistent', 5);
			expect(frStore.size).toBe(0);
		});
	});

	// ── Undo / Redo integration ──────────────────────────────────────────────

	describe('undo/redo integration', () => {
		it('undoes a remove operation (restores entry)', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.removeFRDataWithUUID('phone', 'a');
			expect(frStore.has('a')).toBe(false);

			commandHistory.undo(frStore);
			expect(frStore.has('a')).toBe(true);
			expect(frStore.get('a')!.identifier).toBe('Brand Phone-a');
		});

		it('undoes a visibility update', () => {
			frStore.set('a', makeFRDataObject('a', { hidden: false }));
			dataProvider.updateVisibility('a', true);
			expect(frStore.get('a')!.hidden).toBe(true);

			commandHistory.undo(frStore);
			expect(frStore.get('a')!.hidden).toBe(false);
		});

		it('undoes a color update', () => {
			frStore.set('a', makeFRDataObject('a', { colors: { AVG: '#00ff00' } }));
			dataProvider.updateColors('a', { AVG: '#ffffff' });
			expect(frStore.get('a')!.colors.AVG).toBe('#ffffff');

			commandHistory.undo(frStore);
			expect(frStore.get('a')!.colors.AVG).toBe('#00ff00');
		});

		it('undoes a y-offset update', () => {
			frStore.set('a', makeFRDataObject('a', { yOffset: 0 }));
			dataProvider.updateYOffset('a', 10);
			commandHistory.undo(frStore);
			expect(frStore.get('a')!.yOffset).toBe(0);
		});

		it('redoes after undo', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateVisibility('a', true);
			commandHistory.undo(frStore);
			expect(frStore.get('a')!.hidden).toBe(false);

			commandHistory.redo(frStore);
			expect(frStore.get('a')!.hidden).toBe(true);
		});

		it('supports multi-step undo in LIFO order', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateVisibility('a', true);
			dataProvider.updateYOffset('a', 5);
			dataProvider.updateColors('a', { AVG: '#000000' });

			commandHistory.undo(frStore); // undo colors
			expect(frStore.get('a')!.colors.AVG).toBe('#00ff00');

			commandHistory.undo(frStore); // undo yOffset
			expect(frStore.get('a')!.yOffset).toBe(0);

			commandHistory.undo(frStore); // undo visibility
			expect(frStore.get('a')!.hidden).toBe(false);
		});
	});
});
