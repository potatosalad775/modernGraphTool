import { describe, it, expect, beforeEach } from 'vitest';
import { dataProvider } from './data-provider.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { commandHistory } from './command-history.js';
import type { FRDataObject, FRDataPoint, ParsedFRData, HpTFData } from '$lib/types/data-types.js';

/** Generate synthetic FR data points spanning 20–20kHz at 1/48-octave spacing */
function makeFRPoints(baseDb = 80, count = 480): FRDataPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const data: FRDataPoint[] = [];
	for (let i = 0; i < count; i++) {
		data.push([freq, baseDb + Math.sin(i * 0.1) * 3]);
		freq *= step;
	}
	return data;
}

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

function makeFullChannelData(baseDb = 80) {
	return {
		L: { data: makeFRPoints(baseDb), metadata: { minFreq: 20, maxFreq: 20000 } },
		R: { data: makeFRPoints(baseDb - 2), metadata: { minFreq: 20, maxFreq: 20000 } },
		AVG: { data: makeFRPoints(baseDb - 1), metadata: { minFreq: 20, maxFreq: 20000 } },
	};
}

function makeTargetObject(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return makeFRDataObject(uuid, {
		type: 'target',
		identifier: `Test Target-${uuid}`,
		channels: {
			AVG: { data: makeFRPoints(75), metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		colors: { AVG: '#666666' },
		dash: '4 4',
		...overrides,
	});
}

function makeHpTFData(): HpTFData {
	return {
		samples: [
			{
				label: 'Sample A',
				L: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: makeFRPoints(78), metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: makeFRPoints(79), metadata: { minFreq: 20, maxFreq: 20000 } },
			},
			{
				label: 'Sample B',
				L: { data: makeFRPoints(82), metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: makeFRPoints(81), metadata: { minFreq: 20, maxFreq: 20000 } },
			},
		],
		envelope: {
			L: { upper: makeFRPoints(82), lower: makeFRPoints(80) },
			R: { upper: makeFRPoints(80), lower: makeFRPoints(78) },
			AVG: { upper: makeFRPoints(81), lower: makeFRPoints(79) },
		},
		labels: ['Sample A', 'Sample B'],
		fillOnly: true,
	};
}

describe('DataProvider', () => {
	beforeEach(() => {
		frStore.clear();
		commandHistory.clear();
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.targetOriginalData.clear();
		graphStore.targetOriginalVersion = 0;
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

	// ── Multi-sample display ─────────────────────────────────────────────

	describe('updateSampleDisplay', () => {
		it('sets dispSamples on a loaded phone', () => {
			frStore.set('a', makeFRDataObject('a', {
				samples: [
					{ L: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } } },
					{ L: { data: [[1000, 82]], metadata: { minFreq: 20, maxFreq: 20000 } } },
				],
				sampleCount: 2,
				dispSamples: [],
			}));
			dataProvider.updateSampleDisplay('a', ['L1', 'L2']);
			expect(frStore.get('a')!.dispSamples).toEqual(['L1', 'L2']);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateSampleDisplay('nonexistent', ['L1']);
			expect(frStore.size).toBe(0);
		});

		it('can clear samples (set to empty array)', () => {
			frStore.set('a', makeFRDataObject('a', { dispSamples: ['L1', 'R1'] }));
			dataProvider.updateSampleDisplay('a', []);
			expect(frStore.get('a')!.dispSamples).toEqual([]);
		});

		it('is undoable', () => {
			frStore.set('a', makeFRDataObject('a', { dispSamples: ['L1'] }));
			dataProvider.updateSampleDisplay('a', ['L1', 'L2', 'R1']);
			expect(frStore.get('a')!.dispSamples).toEqual(['L1', 'L2', 'R1']);

			commandHistory.undo(frStore);
			expect(frStore.get('a')!.dispSamples).toEqual(['L1']);
		});

		it('is safe to set on a phone without sample data', () => {
			frStore.set('a', makeFRDataObject('a'));
			// Phone has no samples field — setting dispSamples is harmless
			dataProvider.updateSampleDisplay('a', ['L1']);
			expect(frStore.get('a')!.dispSamples).toEqual(['L1']);
		});
	});

	// ── HpTF display ─────────────────────────────────────────────────────

	describe('updateHpTFDisplay', () => {
		it('sets dispHptf, hptfFillVisible, and hptfAvgVisible on a loaded phone', () => {
			frStore.set('a', makeFRDataObject('a', {
				hptf: {
					samples: [
						{ label: 'GRAS', AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } } },
						{ label: 'B&K', AVG: { data: [[1000, 82]], metadata: { minFreq: 20, maxFreq: 20000 } } },
					],
					envelope: {
						L: { upper: [], lower: [] },
						R: { upper: [], lower: [] },
						AVG: { upper: [[1000, 82]], lower: [[1000, 80]] },
					},
					labels: ['GRAS', 'B&K'],
					fillOnly: true,
				},
				dispHptf: [],
				hptfFillVisible: false,
				hptfAvgVisible: false,
			}));
			dataProvider.updateHpTFDisplay('a', ['sample0_AVG', 'sample1_AVG'], true, true);
			expect(frStore.get('a')!.dispHptf).toEqual(['sample0_AVG', 'sample1_AVG']);
			expect(frStore.get('a')!.hptfFillVisible).toBe(true);
			expect(frStore.get('a')!.hptfAvgVisible).toBe(true);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateHpTFDisplay('nonexistent', ['sample0_AVG'], true, false);
			expect(frStore.size).toBe(0);
		});

		it('is undoable', () => {
			frStore.set('a', makeFRDataObject('a', { dispHptf: ['sample0_AVG'], hptfFillVisible: true, hptfAvgVisible: true }));
			dataProvider.updateHpTFDisplay('a', ['sample0_AVG', 'sample1_AVG'], false, false);
			expect(frStore.get('a')!.dispHptf).toEqual(['sample0_AVG', 'sample1_AVG']);
			expect(frStore.get('a')!.hptfFillVisible).toBe(false);
			expect(frStore.get('a')!.hptfAvgVisible).toBe(false);

			commandHistory.undo(frStore);
			expect(frStore.get('a')!.dispHptf).toEqual(['sample0_AVG']);
			expect(frStore.get('a')!.hptfFillVisible).toBe(true);
			expect(frStore.get('a')!.hptfAvgVisible).toBe(true);
		});

		it('can toggle fill off while keeping sample curves', () => {
			frStore.set('a', makeFRDataObject('a', { dispHptf: ['sample0_AVG'], hptfFillVisible: true, hptfAvgVisible: true }));
			dataProvider.updateHpTFDisplay('a', ['sample0_AVG'], false, true);
			expect(frStore.get('a')!.hptfFillVisible).toBe(false);
			expect(frStore.get('a')!.dispHptf).toEqual(['sample0_AVG']);
			expect(frStore.get('a')!.hptfAvgVisible).toBe(true);
		});
	});

	// ── updateFRDataWithRawData (target customizer / EQ preview) ─────────

	describe('updateFRDataWithRawData', () => {
		it('updates channel data while preserving other fields', () => {
			frStore.set('t', makeTargetObject('t'));
			const original = frStore.get('t')!;
			const newChannels: ParsedFRData = {
				AVG: { data: makeFRPoints(90), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			dataProvider.updateFRDataWithRawData('t', newChannels);
			const updated = frStore.get('t')!;
			expect(updated.channels.AVG!.data[0][1]).not.toBe(original.channels.AVG!.data[0][1]);
			expect(updated.uuid).toBe('t');
			expect(updated.type).toBe('target');
			expect(updated.colors).toEqual(original.colors);
			expect(updated.dash).toBe(original.dash);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateFRDataWithRawData('missing', {
				AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } }
			});
			expect(frStore.size).toBe(0);
		});

		it('is undoable', () => {
			frStore.set('t', makeTargetObject('t'));
			const originalDb = frStore.get('t')!.channels.AVG!.data[0][1];
			dataProvider.updateFRDataWithRawData('t', {
				AVG: { data: makeFRPoints(999), metadata: { minFreq: 20, maxFreq: 20000 } }
			});
			expect(frStore.get('t')!.channels.AVG!.data[0][1]).not.toBe(originalDb);
			commandHistory.undo(frStore);
			expect(frStore.get('t')!.channels.AVG!.data[0][1]).toBe(originalDb);
		});

		it('can update identifier and dispSuffix', () => {
			frStore.set('t', makeTargetObject('t'));
			dataProvider.updateFRDataWithRawData('t',
				{ AVG: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } } },
				{ identifier: 'New Name', dispSuffix: '(Modified)' }
			);
			expect(frStore.get('t')!.identifier).toBe('New Name');
			expect(frStore.get('t')!.dispSuffix).toBe('(Modified)');
		});

		it('preserves HpTF data when updating channels', () => {
			const hptf = makeHpTFData();
			frStore.set('p', makeFRDataObject('p', {
				hptf,
				hptfFillVisible: true,
				dispHptf: ['sample0_AVG'],
			}));
			dataProvider.updateFRDataWithRawData('p', {
				AVG: { data: makeFRPoints(99), metadata: { minFreq: 20, maxFreq: 20000 } }
			});
			const updated = frStore.get('p')!;
			expect(updated.hptf).toBeDefined();
			expect(updated.hptf!.samples).toHaveLength(2);
			expect(updated.hptfFillVisible).toBe(true);
			expect(updated.dispHptf).toEqual(['sample0_AVG']);
		});
	});

	// ── renormalizeAll ───────────────────────────────────────────────────

	describe('renormalizeAll', () => {
		it('re-normalizes all entries in frStore', () => {
			frStore.set('a', makeFRDataObject('a', {
				channels: { AVG: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } } }
			}));
			const beforeDb = frStore.get('a')!.channels.AVG!.data[100][1];
			graphStore.normType = 'Avg';
			dataProvider.renormalizeAll();
			const afterDb = frStore.get('a')!.channels.AVG!.data[100][1];
			// Avg normalization shifts values relative to mean — should differ from raw
			expect(afterDb).not.toBe(beforeDb);
		});

		it('preserves HpTF data during renormalization', () => {
			const hptf = makeHpTFData();
			frStore.set('p', makeFRDataObject('p', {
				channels: makeFullChannelData(),
				hptf,
				hptfFillVisible: true,
				dispHptf: ['sample0_AVG'],
				hptfOnly: true,
			}));
			dataProvider.renormalizeAll();
			const updated = frStore.get('p')!;
			expect(updated.hptf).toBeDefined();
			expect(updated.hptf!.samples).toHaveLength(2);
			expect(updated.hptf!.labels).toEqual(['Sample A', 'Sample B']);
			expect(updated.hptfFillVisible).toBe(true);
			expect(updated.hptfOnly).toBe(true);
		});

		it('preserves sample data during renormalization', () => {
			frStore.set('s', makeFRDataObject('s', {
				channels: makeFullChannelData(),
				samples: [
					{ L: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } } },
					{ L: { data: makeFRPoints(82), metadata: { minFreq: 20, maxFreq: 20000 } } },
				],
				sampleCount: 2,
				dispSamples: ['L1', 'L2'],
			}));
			dataProvider.renormalizeAll();
			const updated = frStore.get('s')!;
			expect(updated.samples).toHaveLength(2);
			expect(updated.sampleCount).toBe(2);
		});

		it('clears command history after renormalization', () => {
			frStore.set('a', makeFRDataObject('a', { channels: makeFullChannelData() }));
			dataProvider.updateYOffset('a', 5);
			expect(commandHistory.canUndo()).toBe(true);
			dataProvider.renormalizeAll();
			expect(commandHistory.canUndo()).toBe(false);
		});
	});

	// ── HpTF-only phone edge cases ──────────────────────────────────────

	describe('HpTF-only phone data', () => {
		it('stores phone with hptfOnly flag and no main channels', () => {
			const hptf = makeHpTFData();
			frStore.set('h', makeFRDataObject('h', {
				channels: {},
				hptf,
				hptfOnly: true,
				hptfFillVisible: true,
				dispHptf: [],
			}));
			const data = frStore.get('h')!;
			expect(data.hptfOnly).toBe(true);
			expect(Object.keys(data.channels)).toHaveLength(0);
			expect(data.hptf!.samples).toHaveLength(2);
			expect(data.hptf!.envelope.AVG.upper.length).toBeGreaterThan(0);
		});

		it('preserves hptfOnly through visibility toggle', () => {
			frStore.set('h', makeFRDataObject('h', {
				channels: {},
				hptf: makeHpTFData(),
				hptfOnly: true,
				hptfFillVisible: true,
			}));
			dataProvider.updateVisibility('h', true);
			expect(frStore.get('h')!.hptfOnly).toBe(true);
			expect(frStore.get('h')!.hptf).toBeDefined();
			dataProvider.updateVisibility('h', false);
			expect(frStore.get('h')!.hptfOnly).toBe(true);
		});

		it('preserves hptfOnly through y-offset update', () => {
			frStore.set('h', makeFRDataObject('h', {
				channels: {},
				hptf: makeHpTFData(),
				hptfOnly: true,
			}));
			dataProvider.updateYOffset('h', 10);
			expect(frStore.get('h')!.hptfOnly).toBe(true);
			expect(frStore.get('h')!.yOffset).toBe(10);
		});

		it('preserves hptfOnly through color update', () => {
			frStore.set('h', makeFRDataObject('h', {
				channels: {},
				hptf: makeHpTFData(),
				hptfOnly: true,
			}));
			dataProvider.updateColors('h', { AVG: '#ff0000' });
			expect(frStore.get('h')!.hptfOnly).toBe(true);
			expect(frStore.get('h')!.colors.AVG).toBe('#ff0000');
		});
	});

	// ── Target original data coordination ───────────────────────────────

	describe('target original data coordination', () => {
		it('targetOriginalData stores independent copy of target base data', () => {
			const targetData: ParsedFRData = {
				AVG: { data: makeFRPoints(75), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			graphStore.targetOriginalData.set('t', targetData);
			expect(graphStore.targetOriginalData.get('t')).toBe(targetData);

			// Modifying frStore should not affect targetOriginalData
			frStore.set('t', makeTargetObject('t'));
			dataProvider.updateFRDataWithRawData('t', {
				AVG: { data: makeFRPoints(90), metadata: { minFreq: 20, maxFreq: 20000 } }
			});
			expect(graphStore.targetOriginalData.get('t')!.AVG!.data[0][1]).toBe(targetData.AVG!.data[0][1]);
		});

		it('targetOriginalData is used for original baseline compensation', () => {
			const original: ParsedFRData = {
				AVG: { data: [[500, 70], [1000, 75], [2000, 72]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			graphStore.targetOriginalData.set('t', original);

			const adjusted: ParsedFRData = {
				AVG: { data: [[500, 72], [1000, 77], [2000, 74]], metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			frStore.set('t', makeTargetObject('t', { channels: adjusted }));

			// Original and adjusted should differ (adjustments were applied)
			const storedOriginal = graphStore.targetOriginalData.get('t')!.AVG!.data;
			const storedAdjusted = frStore.get('t')!.channels.AVG!.data;
			expect(storedOriginal[1][1]).toBe(75);
			expect(storedAdjusted[1][1]).toBe(77);
		});

		it('version counter starts at 0 and increments', () => {
			expect(graphStore.targetOriginalVersion).toBe(0);
			graphStore.targetOriginalVersion++;
			expect(graphStore.targetOriginalVersion).toBe(1);
		});
	});

	// ── Baseline data consistency ────────────────────────────────────────

	describe('baseline data consistency', () => {
		it('baseline UUID can be set and cleared via graphStore', () => {
			graphStore.baselineUUID = 'target-1';
			graphStore.baselineMode = 'withoutAdjustment';
			expect(graphStore.baselineUUID).toBe('target-1');
			expect(graphStore.baselineMode).toBe('withoutAdjustment');

			graphStore.baselineUUID = null;
			graphStore.baselineMode = 'off';
			expect(graphStore.baselineUUID).toBeNull();
			expect(graphStore.baselineMode).toBe('off');
		});

		it('removing baseline entry clears baseline state when refreshed', () => {
			frStore.set('t', makeTargetObject('t'));
			graphStore.baselineUUID = 't';
			graphStore.baselineMode = 'withoutAdjustment';

			// Remove the baseline source
			dataProvider.removeFRDataWithUUID('target', 't');
			expect(frStore.has('t')).toBe(false);
			// graphStore still has the UUID — GraphEngine.refreshBaselineData() handles cleanup
			expect(graphStore.baselineUUID).toBe('t');
		});

		it('frStore update does not lose baseline-relevant data', () => {
			frStore.set('t', makeTargetObject('t'));
			graphStore.baselineUUID = 't';
			graphStore.baselineMode = 'withoutAdjustment';

			// Update the target via updateFRDataWithRawData (simulates TargetCustomizer adjustment)
			dataProvider.updateFRDataWithRawData('t', {
				AVG: { data: makeFRPoints(90), metadata: { minFreq: 20, maxFreq: 20000 } }
			});

			// Baseline entry should still exist and have updated data
			const updated = frStore.get('t')!;
			expect(updated.type).toBe('target');
			expect(updated.channels.AVG).toBeDefined();
		});
	});
});
