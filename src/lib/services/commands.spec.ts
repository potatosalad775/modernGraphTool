import { describe, it, expect, beforeEach } from 'vitest';
import {
	AddFRDataCommand,
	RemoveFRDataCommand,
	UpdateDisplayChannelCommand,
	UpdateColorsCommand,
	UpdateDashPatternCommand,
	UpdateVisibilityCommand,
	UpdateVariantCommand,
	UpdateFRDataWithRawDataCommand,
	UpdateYOffsetCommand,
	UpdateSampleDisplayCommand,
	UpdateHpTFDisplayCommand
} from './commands.js';
import type { FRStoreWriteAPI } from './command-history.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/** Simple in-memory store for testing */
function createMockStore(): FRStoreWriteAPI & { data: Map<string, FRDataObject> } {
	const data = new Map<string, FRDataObject>();
	return {
		data,
		get(uuid: string) {
			return data.get(uuid) ?? null;
		},
		set(uuid: string, obj: FRDataObject) {
			data.set(uuid, obj);
		},
		delete(uuid: string) {
			data.delete(uuid);
		}
	};
}

function makeFRDataObject(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Test ${uuid}`,
		channels: {
			L: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } },
			R: { data: [[1000, 78]], metadata: { minFreq: 20, maxFreq: 20000 } },
			AVG: { data: [[1000, 79]], metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '',
		...overrides
	};
}

describe('Commands', () => {
	let store: ReturnType<typeof createMockStore>;

	beforeEach(() => {
		store = createMockStore();
	});

	describe('AddFRDataCommand', () => {
		it('adds data to store on execute', () => {
			const obj = makeFRDataObject('a');
			const cmd = new AddFRDataCommand(obj);
			cmd.execute(store);
			expect(store.data.has('a')).toBe(true);
		});

		it('removes data from store on undo', () => {
			const obj = makeFRDataObject('a');
			const cmd = new AddFRDataCommand(obj);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.has('a')).toBe(false);
		});

		it('exposes uuid, sourceType, and identifier', () => {
			const obj = makeFRDataObject('a');
			const cmd = new AddFRDataCommand(obj);
			expect(cmd.uuid).toBe('a');
			expect(cmd.sourceType).toBe('phone');
			expect(cmd.identifier).toBe('Test a');
		});

		it('deep-copies the input (no shared references)', () => {
			const obj = makeFRDataObject('a');
			const cmd = new AddFRDataCommand(obj);
			obj.identifier = 'mutated';
			cmd.execute(store);
			expect(store.data.get('a')!.identifier).toBe('Test a');
		});
	});

	describe('RemoveFRDataCommand', () => {
		it('removes data from store on execute', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new RemoveFRDataCommand('a', 'phone');
			cmd.execute(store);
			expect(store.data.has('a')).toBe(false);
		});

		it('restores data on undo', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new RemoveFRDataCommand('a', 'phone');
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.has('a')).toBe(true);
			expect(store.data.get('a')!.identifier).toBe('Test a');
		});

		it('is safe to undo when item was not in store', () => {
			const cmd = new RemoveFRDataCommand('nonexistent', 'phone');
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.has('nonexistent')).toBe(false);
		});
	});

	describe('UpdateDisplayChannelCommand', () => {
		it('updates the display channel', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateDisplayChannelCommand('a', ['L', 'R']);
			cmd.execute(store);
			expect(store.data.get('a')!.dispChannel).toEqual(['L', 'R']);
		});

		it('restores previous channel on undo', () => {
			store.set('a', makeFRDataObject('a', { dispChannel: ['AVG'] }));
			const cmd = new UpdateDisplayChannelCommand('a', ['L', 'R']);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dispChannel).toEqual(['AVG']);
		});

		it('does nothing for non-existent uuid', () => {
			const cmd = new UpdateDisplayChannelCommand('nonexistent', ['L']);
			cmd.execute(store);
			expect(store.data.size).toBe(0);
		});
	});

	describe('UpdateColorsCommand', () => {
		it('updates colors', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateColorsCommand('a', { AVG: '#ffffff' });
			cmd.execute(store);
			expect(store.data.get('a')!.colors.AVG).toBe('#ffffff');
		});

		it('restores previous colors on undo', () => {
			store.set('a', makeFRDataObject('a', { colors: { AVG: '#00ff00' } }));
			const cmd = new UpdateColorsCommand('a', { AVG: '#ffffff' });
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.colors.AVG).toBe('#00ff00');
		});
	});

	describe('UpdateDashPatternCommand', () => {
		it('updates dash pattern', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateDashPatternCommand('a', '5,5');
			cmd.execute(store);
			expect(store.data.get('a')!.dash).toBe('5,5');
		});

		it('restores previous dash on undo', () => {
			store.set('a', makeFRDataObject('a', { dash: '' }));
			const cmd = new UpdateDashPatternCommand('a', '5,5');
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dash).toBe('');
		});
	});

	describe('UpdateVisibilityCommand', () => {
		it('sets hidden state', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateVisibilityCommand('a', true);
			cmd.execute(store);
			expect(store.data.get('a')!.hidden).toBe(true);
		});

		it('restores previous hidden state on undo', () => {
			store.set('a', makeFRDataObject('a', { hidden: false }));
			const cmd = new UpdateVisibilityCommand('a', true);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.hidden).toBe(false);
		});
	});

	describe('UpdateVariantCommand', () => {
		it('updates channels, suffix, and display channel', () => {
			store.set('a', makeFRDataObject('a'));
			const newChannels = {
				AVG: { data: [[500, 70] as [number, number]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const cmd = new UpdateVariantCommand('a', {
				channels: newChannels,
				dispSuffix: 'v2',
				dispChannel: ['AVG']
			});
			cmd.execute(store);
			const data = store.data.get('a')!;
			expect(data.dispSuffix).toBe('v2');
			expect(data.channels.AVG!.data[0][0]).toBe(500);
		});

		it('restores full snapshot on undo', () => {
			const original = makeFRDataObject('a', { dispSuffix: 'v1' });
			store.set('a', original);
			const newChannels = {
				AVG: { data: [[500, 70] as [number, number]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const cmd = new UpdateVariantCommand('a', {
				channels: newChannels,
				dispSuffix: 'v2',
				dispChannel: ['AVG']
			});
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dispSuffix).toBe('v1');
		});
	});

	describe('UpdateFRDataWithRawDataCommand', () => {
		it('replaces the entire FRDataObject', () => {
			store.set('a', makeFRDataObject('a'));
			const newObj = makeFRDataObject('a', { identifier: 'Updated' });
			const cmd = new UpdateFRDataWithRawDataCommand('a', newObj);
			cmd.execute(store);
			expect(store.data.get('a')!.identifier).toBe('Updated');
		});

		it('restores previous object on undo', () => {
			store.set('a', makeFRDataObject('a'));
			const newObj = makeFRDataObject('a', { identifier: 'Updated' });
			const cmd = new UpdateFRDataWithRawDataCommand('a', newObj);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.identifier).toBe('Test a');
		});
	});

	describe('UpdateYOffsetCommand', () => {
		it('sets y-offset', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateYOffsetCommand('a', 5);
			cmd.execute(store);
			expect(store.data.get('a')!.yOffset).toBe(5);
		});

		it('restores previous offset on undo', () => {
			store.set('a', makeFRDataObject('a', { yOffset: 2 }));
			const cmd = new UpdateYOffsetCommand('a', 5);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.yOffset).toBe(2);
		});

		it('defaults to 0 when no previous offset', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateYOffsetCommand('a', 5);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.yOffset).toBe(0);
		});
	});

	describe('UpdateSampleDisplayCommand', () => {
		it('sets dispSamples on execute', () => {
			store.set('a', makeFRDataObject('a', { dispSamples: [] }));
			const cmd = new UpdateSampleDisplayCommand('a', ['L1', 'R1', 'L2']);
			cmd.execute(store);
			expect(store.data.get('a')!.dispSamples).toEqual(['L1', 'R1', 'L2']);
		});

		it('restores previous dispSamples on undo', () => {
			store.set('a', makeFRDataObject('a', { dispSamples: ['L1'] }));
			const cmd = new UpdateSampleDisplayCommand('a', ['L1', 'R1', 'L2']);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dispSamples).toEqual(['L1']);
		});

		it('defaults to empty array when no previous dispSamples', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateSampleDisplayCommand('a', ['L1']);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dispSamples).toEqual([]);
		});

		it('does nothing for non-existent uuid', () => {
			const cmd = new UpdateSampleDisplayCommand('nonexistent', ['L1']);
			cmd.execute(store);
			expect(store.data.size).toBe(0);
		});

		it('can set to empty array (hide all samples)', () => {
			store.set('a', makeFRDataObject('a', { dispSamples: ['L1', 'R1'] }));
			const cmd = new UpdateSampleDisplayCommand('a', []);
			cmd.execute(store);
			expect(store.data.get('a')!.dispSamples).toEqual([]);
		});
	});

	describe('UpdateHpTFDisplayCommand', () => {
		it('sets dispHptf, hptfFillVisible, and hptfAvgVisible on execute', () => {
			store.set(
				'a',
				makeFRDataObject('a', { dispHptf: [], hptfFillVisible: false, hptfAvgVisible: false })
			);
			const cmd = new UpdateHpTFDisplayCommand('a', ['sample0_AVG', 'sample1_AVG'], true, true);
			cmd.execute(store);
			expect(store.data.get('a')!.dispHptf).toEqual(['sample0_AVG', 'sample1_AVG']);
			expect(store.data.get('a')!.hptfFillVisible).toBe(true);
			expect(store.data.get('a')!.hptfAvgVisible).toBe(true);
		});

		it('restores previous state on undo', () => {
			store.set(
				'a',
				makeFRDataObject('a', {
					dispHptf: ['sample0_AVG'],
					hptfFillVisible: true,
					hptfAvgVisible: true
				})
			);
			const cmd = new UpdateHpTFDisplayCommand('a', ['sample0_AVG', 'sample1_AVG'], false, false);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dispHptf).toEqual(['sample0_AVG']);
			expect(store.data.get('a')!.hptfFillVisible).toBe(true);
			expect(store.data.get('a')!.hptfAvgVisible).toBe(true);
		});

		it('defaults to empty array and false when no previous HpTF state', () => {
			store.set('a', makeFRDataObject('a'));
			const cmd = new UpdateHpTFDisplayCommand('a', ['sample0_AVG'], true, true);
			cmd.execute(store);
			cmd.undo(store);
			expect(store.data.get('a')!.dispHptf).toEqual([]);
			expect(store.data.get('a')!.hptfFillVisible).toBe(false);
			expect(store.data.get('a')!.hptfAvgVisible).toBe(false);
		});

		it('does nothing for non-existent uuid', () => {
			const cmd = new UpdateHpTFDisplayCommand('nonexistent', ['sample0_AVG'], true, false);
			cmd.execute(store);
			expect(store.data.size).toBe(0);
		});

		it('can hide all sample curves (empty dispHptf) while keeping fill visible', () => {
			store.set(
				'a',
				makeFRDataObject('a', {
					dispHptf: ['sample0_AVG'],
					hptfFillVisible: true,
					hptfAvgVisible: false
				})
			);
			const cmd = new UpdateHpTFDisplayCommand('a', [], true, false);
			cmd.execute(store);
			expect(store.data.get('a')!.dispHptf).toEqual([]);
			expect(store.data.get('a')!.hptfFillVisible).toBe(true);
		});

		it('can toggle average visibility independently', () => {
			store.set(
				'a',
				makeFRDataObject('a', { dispHptf: [], hptfFillVisible: true, hptfAvgVisible: false })
			);
			const cmd = new UpdateHpTFDisplayCommand('a', [], true, true);
			cmd.execute(store);
			expect(store.data.get('a')!.hptfAvgVisible).toBe(true);
			expect(store.data.get('a')!.hptfFillVisible).toBe(true);
			expect(store.data.get('a')!.dispHptf).toEqual([]);
		});
	});
});
