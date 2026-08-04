import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dataProvider } from './data-provider.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { targetAdjustmentStore } from '$lib/stores/target-adjustment-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import FRParser, { type FRParseResult } from '$lib/utils/fr-parser.js';
import MetadataParser from '$lib/utils/metadata-parser.js';
import type {
	FRDataObject,
	FRDataPoint,
	ParsedFRData,
	PhoneMetadata,
	PhoneFileVariant,
	SampleData
} from '$lib/types/data-types.js';

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
		AVG: { data: makeFRPoints(baseDb - 1), metadata: { minFreq: 20, maxFreq: 20000 } }
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
		...overrides
	});
}

/** One `PhoneFileVariant` entry, with the L/R file reference filled in. */
function phoneFile(base: string, suffix: string): PhoneFileVariant {
	return {
		suffix,
		fullName: suffix ? `${base} ${suffix}` : base,
		fileName: base,
		files: { L: `${base} L.txt`, R: `${base} R.txt` }
	};
}

/** A two-run labelled sample set with its envelope, as an FRDataObject fragment. */
function makeSampleSet(overrides: Partial<FRDataObject> = {}): Partial<FRDataObject> {
	return {
		samples: [
			{
				label: 'Sample A',
				L: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: makeFRPoints(78), metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: makeFRPoints(79), metadata: { minFreq: 20, maxFreq: 20000 } }
			},
			{
				label: 'Sample B',
				L: { data: makeFRPoints(82), metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: makeFRPoints(81), metadata: { minFreq: 20, maxFreq: 20000 } }
			}
		],
		envelope: {
			L: { upper: makeFRPoints(82), lower: makeFRPoints(80) },
			R: { upper: makeFRPoints(80), lower: makeFRPoints(78) },
			AVG: { upper: makeFRPoints(81), lower: makeFRPoints(79) }
		},
		showFill: true,
		showAvg: true,
		...overrides
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

	// ── Sample display ───────────────────────────────────────────────────

	describe('updateSampleDisplay', () => {
		const withSamples = (overrides: Partial<FRDataObject> = {}) =>
			makeFRDataObject('a', {
				samples: [
					{ L: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } } },
					{ L: { data: [[1000, 82]], metadata: { minFreq: 20, maxFreq: 20000 } } }
				],
				dispSamples: [],
				...overrides
			});

		it('sets dispSamples on a loaded phone', () => {
			frStore.set('a', withSamples());
			dataProvider.updateSampleDisplay('a', ['sample0_L', 'sample1_L']);
			expect(frStore.get('a')!.dispSamples).toEqual(['sample0_L', 'sample1_L']);
		});

		it('does nothing for non-existent UUID', () => {
			dataProvider.updateSampleDisplay('nonexistent', ['sample0_L']);
			expect(frStore.size).toBe(0);
		});

		it('can clear the run picks (set to empty array)', () => {
			frStore.set('a', withSamples({ dispSamples: ['sample0_L', 'sample0_R'] }));
			dataProvider.updateSampleDisplay('a', []);
			expect(frStore.get('a')!.dispSamples).toEqual([]);
		});

		it('is undoable', () => {
			frStore.set('a', withSamples({ dispSamples: ['sample0_L'] }));
			dataProvider.updateSampleDisplay('a', ['sample0_L', 'sample1_L']);
			expect(frStore.get('a')!.dispSamples).toEqual(['sample0_L', 'sample1_L']);

			commandHistory.undo(frStore);
			expect(frStore.get('a')!.dispSamples).toEqual(['sample0_L']);
		});

		it('is safe to set on a phone without sample data', () => {
			frStore.set('a', makeFRDataObject('a'));
			dataProvider.updateSampleDisplay('a', ['sample0_L']);
			expect(frStore.get('a')!.dispSamples).toEqual(['sample0_L']);
		});

		it('sets the fill and average toggles when given', () => {
			frStore.set('a', withSamples({ showFill: false, showAvg: true }));
			dataProvider.updateSampleDisplay('a', ['sample0_AVG'], true, false);
			expect(frStore.get('a')!.showFill).toBe(true);
			expect(frStore.get('a')!.showAvg).toBe(false);
		});

		it('leaves the toggles alone when the caller only changes run picks', () => {
			// The selector calls this on every checkbox tick without restating the
			// other two toggles — they must not silently reset.
			frStore.set('a', withSamples({ showFill: true, showAvg: false }));
			dataProvider.updateSampleDisplay('a', ['sample0_AVG']);
			expect(frStore.get('a')!.showFill).toBe(true);
			expect(frStore.get('a')!.showAvg).toBe(false);
		});

		it('can hide the average — impossible for multi-sample before unification', () => {
			frStore.set('a', withSamples({ showAvg: true }));
			dataProvider.updateSampleDisplay('a', [], false, false);
			expect(frStore.get('a')!.showAvg).toBe(false);
		});

		it('restores all three fields on undo', () => {
			frStore.set('a', withSamples({ dispSamples: ['sample0_L'], showFill: true, showAvg: true }));
			dataProvider.updateSampleDisplay('a', ['sample1_R'], false, false);
			commandHistory.undo(frStore);
			expect(frStore.get('a')!.dispSamples).toEqual(['sample0_L']);
			expect(frStore.get('a')!.showFill).toBe(true);
			expect(frStore.get('a')!.showAvg).toBe(true);
		});
	});

	// ── updateFRDataWithRawData (target customizer / EQ preview) ─────────────

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
			dataProvider.updateFRDataWithRawData(
				't',
				{ AVG: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } } },
				{ identifier: 'New Name', dispSuffix: '(Modified)' }
			);
			expect(frStore.get('t')!.identifier).toBe('New Name');
			expect(frStore.get('t')!.dispSuffix).toBe('(Modified)');
		});

		it('preserves the sample set when updating channels', () => {
			frStore.set('p', makeFRDataObject('p', { ...makeSampleSet(), dispSamples: ['sample0_AVG'] }));
			dataProvider.updateFRDataWithRawData('p', {
				AVG: { data: makeFRPoints(99), metadata: { minFreq: 20, maxFreq: 20000 } }
			});
			const updated = frStore.get('p')!;
			expect(updated.samples).toHaveLength(2);
			expect(updated.envelope).toBeDefined();
			expect(updated.showFill).toBe(true);
			expect(updated.dispSamples).toEqual(['sample0_AVG']);
		});
	});

	// ── renormalizeAll ───────────────────────────────────────────────────

	describe('renormalizeAll', () => {
		it('re-normalizes all entries in frStore', () => {
			frStore.set(
				'a',
				makeFRDataObject('a', {
					channels: { AVG: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } } }
				})
			);
			const beforeDb = frStore.get('a')!.channels.AVG!.data[100][1];
			graphStore.normType = 'Avg';
			dataProvider.renormalizeAll();
			const afterDb = frStore.get('a')!.channels.AVG!.data[100][1];
			// Avg normalization shifts values relative to mean — should differ from raw
			expect(afterDb).not.toBe(beforeDb);
		});

		it('preserves run labels and display toggles during renormalization', () => {
			frStore.set(
				'p',
				makeFRDataObject('p', {
					channels: makeFullChannelData(),
					...makeSampleSet(),
					dispSamples: ['sample0_AVG'],
					showAvg: false
				})
			);
			dataProvider.renormalizeAll();
			const updated = frStore.get('p')!;
			expect(updated.samples).toHaveLength(2);
			expect(updated.samples!.map((s) => s.label)).toEqual(['Sample A', 'Sample B']);
			expect(updated.showFill).toBe(true);
			expect(updated.showAvg).toBe(false);
			expect(updated.dispSamples).toEqual(['sample0_AVG']);
		});

		it('rebuilds the envelope from the renormalized runs', () => {
			// A stale envelope would no longer bound the runs it is drawn around.
			frStore.set(
				'p',
				makeFRDataObject('p', { channels: makeFullChannelData(), ...makeSampleSet() })
			);
			graphStore.normType = 'Hz';
			graphStore.normHzValue = 1000;
			dataProvider.renormalizeAll();

			const { samples, envelope } = frStore.get('p')!;
			const n = samples![0].L!.data.length;
			for (let k = 0; k < n; k++) {
				const values = samples!.map((s) => s.L!.data[k][1]);
				expect(envelope!.L.upper[k][1]).toBeCloseTo(Math.max(...values), 6);
				expect(envelope!.L.lower[k][1]).toBeCloseTo(Math.min(...values), 6);
			}
		});

		it('clears command history after renormalization', () => {
			frStore.set('a', makeFRDataObject('a', { channels: makeFullChannelData() }));
			dataProvider.updateYOffset('a', 5);
			expect(commandHistory.canUndo).toBe(true);
			dataProvider.renormalizeAll();
			expect(commandHistory.canUndo).toBe(false);
		});

		// Once Bug 1 is fixed and 'withoutAdjustment' baselines read from
		// targetOriginalData, the cached original must also track the current
		// normalization — otherwise the baseline and the curves would sit at
		// different reference points, producing a constant-dB drift after any
		// normalization change.
		it('keeps targetOriginalData aligned with the current normalization', () => {
			const originalAvg = makeFRPoints(75);
			frStore.set(
				't',
				makeTargetObject('t', {
					channels: { AVG: { data: originalAvg, metadata: { minFreq: 20, maxFreq: 20000 } } }
				})
			);
			graphStore.targetOriginalData.set('t', {
				AVG: {
					data: originalAvg.map(([f, d]) => [f, d]),
					metadata: { minFreq: 20, maxFreq: 20000 }
				}
			});

			graphStore.normType = 'Hz';
			graphStore.normHzValue = 1000;
			dataProvider.renormalizeAll();

			const normalizedFr = frStore.get('t')!.channels.AVG!.data;
			const normalizedOriginal = graphStore.targetOriginalData.get('t')!.AVG!.data;
			for (let i = 0; i < normalizedFr.length; i++) {
				expect(normalizedOriginal[i][0]).toBe(normalizedFr[i][0]);
				expect(normalizedOriginal[i][1]).toBeCloseTo(normalizedFr[i][1], 10);
			}
		});

		it('bumps targetOriginalVersion when a target has cached original data', () => {
			frStore.set(
				't',
				makeTargetObject('t', {
					channels: { AVG: { data: makeFRPoints(75), metadata: { minFreq: 20, maxFreq: 20000 } } }
				})
			);
			graphStore.targetOriginalData.set('t', {
				AVG: { data: makeFRPoints(75), metadata: { minFreq: 20, maxFreq: 20000 } }
			});

			const before = graphStore.targetOriginalVersion;
			dataProvider.renormalizeAll();
			expect(graphStore.targetOriginalVersion).toBe(before + 1);
		});

		it('does not bump targetOriginalVersion when no targets have cached original data', () => {
			frStore.set('a', makeFRDataObject('a', { channels: makeFullChannelData() }));
			const before = graphStore.targetOriginalVersion;
			dataProvider.renormalizeAll();
			expect(graphStore.targetOriginalVersion).toBe(before);
		});

		// Sample runs are anchored to a single pooled L+R mean, so every pairwise
		// value difference — within a channel, across runs, and between L & R
		// at any frequency — must stay constant when the user changes
		// normalization. This covers both the per-channel envelope spread and
		// the combined L+R envelope used when displaying both channels.
		it('preserves run deltas across normalization changes', () => {
			frStore.set(
				'p',
				makeFRDataObject('p', { channels: makeFullChannelData(), ...makeSampleSet() })
			);

			const snapshotDeltas = () => {
				const samples = frStore.get('p')!.samples!;
				const env = frStore.get('p')!.envelope!;
				const n = samples[0].L!.data.length;
				const lSpan = new Array(n);
				const rSpan = new Array(n);
				const combinedSpan = new Array(n);
				const lrGap = new Array(n);
				for (let k = 0; k < n; k++) {
					lSpan[k] = env.L.upper[k][1] - env.L.lower[k][1];
					rSpan[k] = env.R.upper[k][1] - env.R.lower[k][1];
					// Combined upper/lower = max/min across L and R at bin k
					// (mirrors GraphEngine._combineEnvelopes).
					const up = Math.max(env.L.upper[k][1], env.R.upper[k][1]);
					const lo = Math.min(env.L.lower[k][1], env.R.lower[k][1]);
					combinedSpan[k] = up - lo;
					// Run-0 L minus run-0 R gap — another invariant under
					// pooled anchoring.
					lrGap[k] = samples[0].L!.data[k][1] - samples[0].R!.data[k][1];
				}
				return { lSpan, rSpan, combinedSpan, lrGap };
			};

			graphStore.normType = 'Hz';
			graphStore.normHzValue = 60;
			dataProvider.renormalizeAll();
			const bass = snapshotDeltas();

			graphStore.normHzValue = 6000;
			dataProvider.renormalizeAll();
			const treble = snapshotDeltas();

			graphStore.normType = 'Avg';
			dataProvider.renormalizeAll();
			const avg = snapshotDeltas();

			expect(treble.lSpan).toHaveLength(bass.lSpan.length);
			for (let k = 0; k < bass.lSpan.length; k++) {
				expect(treble.lSpan[k]).toBeCloseTo(bass.lSpan[k], 6);
				expect(treble.rSpan[k]).toBeCloseTo(bass.rSpan[k], 6);
				expect(treble.combinedSpan[k]).toBeCloseTo(bass.combinedSpan[k], 6);
				expect(treble.lrGap[k]).toBeCloseTo(bass.lrGap[k], 6);

				expect(avg.lSpan[k]).toBeCloseTo(bass.lSpan[k], 6);
				expect(avg.rSpan[k]).toBeCloseTo(bass.rSpan[k], 6);
				expect(avg.combinedSpan[k]).toBeCloseTo(bass.combinedSpan[k], 6);
				expect(avg.lrGap[k]).toBeCloseTo(bass.lrGap[k], 6);
			}
			expect(Math.max(...bass.combinedSpan)).toBeGreaterThan(0);
		});

		// Under Hz normalization, the pooled L+R run mean — not each channel
		// independently — reads 0 dB at the reference frequency. This is the
		// single vertical anchor shared by every run value.
		it('positions the pooled mean at 0 dB at the Hz reference', () => {
			frStore.set(
				'p',
				makeFRDataObject('p', { channels: makeFullChannelData(), ...makeSampleSet() })
			);

			graphStore.normType = 'Hz';
			graphStore.normHzValue = 1000;
			dataProvider.renormalizeAll();
			const samples = frStore.get('p')!.samples!;

			const pts = samples[0].L!.data;
			let nearest = 0;
			for (let i = 0; i < pts.length; i++) {
				if (Math.abs(pts[i][0] - 1000) < Math.abs(pts[nearest][0] - 1000)) nearest = i;
			}

			// Pooled mean at reference bin across all L and R run values.
			let sum = 0;
			let count = 0;
			for (const s of samples) {
				if (s.L) {
					sum += s.L.data[nearest][1];
					count++;
				}
				if (s.R) {
					sum += s.R.data[nearest][1];
					count++;
				}
			}
			const pooledAtRef = sum / count;
			expect(pooledAtRef).toBeCloseTo(0, 1);
		});
	});

	// ── Fill-only phone edge cases ──────────────────────────────────────
	//
	// `hptfOnly` used to be a field of its own; it is now simply `showAvg: false`,
	// which is why these all assert the flag survives unrelated field updates.

	describe('phone drawn as a fill only', () => {
		it('stores a set with the average off and no main channels', () => {
			frStore.set(
				'h',
				makeFRDataObject('h', {
					channels: {},
					...makeSampleSet({ showAvg: false }),
					dispSamples: []
				})
			);
			const data = frStore.get('h')!;
			expect(data.showAvg).toBe(false);
			expect(Object.keys(data.channels)).toHaveLength(0);
			expect(data.samples).toHaveLength(2);
			expect(data.envelope!.AVG.upper.length).toBeGreaterThan(0);
		});

		it('preserves showAvg through visibility toggle', () => {
			frStore.set(
				'h',
				makeFRDataObject('h', { channels: {}, ...makeSampleSet({ showAvg: false }) })
			);
			dataProvider.updateVisibility('h', true);
			expect(frStore.get('h')!.showAvg).toBe(false);
			expect(frStore.get('h')!.samples).toBeDefined();
			dataProvider.updateVisibility('h', false);
			expect(frStore.get('h')!.showAvg).toBe(false);
		});

		it('preserves showAvg through y-offset update', () => {
			frStore.set(
				'h',
				makeFRDataObject('h', { channels: {}, ...makeSampleSet({ showAvg: false }) })
			);
			dataProvider.updateYOffset('h', 10);
			expect(frStore.get('h')!.showAvg).toBe(false);
			expect(frStore.get('h')!.yOffset).toBe(10);
		});

		it('preserves showAvg through color update', () => {
			frStore.set(
				'h',
				makeFRDataObject('h', { channels: {}, ...makeSampleSet({ showAvg: false }) })
			);
			dataProvider.updateColors('h', { AVG: '#ff0000' });
			expect(frStore.get('h')!.showAvg).toBe(false);
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
			expect(graphStore.targetOriginalData.get('t')!.AVG!.data[0][1]).toBe(
				targetData.AVG!.data[0][1]
			);
		});

		it('targetOriginalData is used for original baseline compensation', () => {
			const original: ParsedFRData = {
				AVG: {
					data: [
						[500, 70],
						[1000, 75],
						[2000, 72]
					],
					metadata: { minFreq: 20, maxFreq: 20000 }
				}
			};
			graphStore.targetOriginalData.set('t', original);

			const adjusted: ParsedFRData = {
				AVG: {
					data: [
						[500, 72],
						[1000, 77],
						[2000, 74]
					],
					metadata: { minFreq: 20, maxFreq: 20000 }
				}
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

	// ── reSmoothAll re-applies target adjustments ────────────────────────────
	// reSmoothAll rebuilds every curve from its cached raw source, which is
	// pre-adjustment data. It used to signal mounted TargetCustomizer instances via
	// targetOriginalVersion and let them re-apply — so changing smoothing while the
	// Graph tab was closed silently discarded the user's target adjustments, including
	// the operator's INITIAL_TARGET_FILTERS defaults. DataProvider now re-applies them
	// itself; these tests run with no component mounted at all.

	describe('target adjustments (applyTargetAdjustment + reSmoothAll)', () => {
		const ADJUSTED = 'adjusted-target';
		const PLAIN = 'plain-target';

		/** A target with cached raw data and a published pre-adjustment snapshot. */
		function seedTarget(uuid: string): void {
			const raw = makeFRPoints(75);
			frStore.set(
				uuid,
				makeTargetObject(uuid, {
					channels: { AVG: { data: raw, metadata: { minFreq: 20, maxFreq: 20000 } } },
					_rawData: {
						channels: { AVG: { data: raw, metadata: { minFreq: 20, maxFreq: 20000 } } }
					}
				})
			);
			graphStore.targetOriginalData.set(uuid, {
				AVG: {
					data: raw.map(([f, d]) => [f, d] as FRDataPoint),
					metadata: { minFreq: 20, maxFreq: 20000 }
				}
			});
		}

		/** Mean dB below 100 Hz — where a +6 dB low shelf shows up unambiguously. */
		function bassLevel(uuid: string): number {
			const low = frStore.get(uuid)!.channels.AVG!.data.filter(([f]) => f < 100);
			return low.reduce((sum, [, d]) => sum + d, 0) / low.length;
		}

		beforeEach(() => {
			targetAdjustmentStore.delete(ADJUSTED);
			targetAdjustmentStore.delete(PLAIN);
			graphStore.normType = 'Hz';
			graphStore.normHzValue = 1000;
		});

		// targetOriginalData is a snapshot of already-smoothed channels, so re-running
		// the adjusted result through the smoother would blur the target twice and
		// resample it onto a different grid than the cached original that baseline
		// compensation reads against. applyTargetAdjustment normalizes only.
		it('keeps the adjusted curve on the cached original frequency grid', () => {
			seedTarget(ADJUSTED);
			targetAdjustmentStore.ensure(ADJUSTED, 'Test Target');
			targetAdjustmentStore.addFilter(ADJUSTED, 'bass');
			targetAdjustmentStore.setValue(ADJUSTED, 'bass', 6);

			dataProvider.applyTargetAdjustment(ADJUSTED);

			const adjusted = frStore.get(ADJUSTED)!.channels.AVG!.data;
			const original = graphStore.targetOriginalData.get(ADJUSTED)!.AVG!.data;
			expect(adjusted).toHaveLength(original.length);
			for (let i = 0; i < original.length; i++) {
				expect(adjusted[i][0]).toBe(original[i][0]);
			}
		});

		it('re-applies the filter stack after re-smoothing, with nothing mounted', async () => {
			// Both targets start from identical source data; only one carries a shelf,
			// so the post-rebuild delta between them is the adjustment itself.
			seedTarget(ADJUSTED);
			seedTarget(PLAIN);
			targetAdjustmentStore.ensure(ADJUSTED, 'Test Target');
			targetAdjustmentStore.addFilter(ADJUSTED, 'bass');
			targetAdjustmentStore.setValue(ADJUSTED, 'bass', 6);

			await dataProvider.reSmoothAll();

			expect(bassLevel(ADJUSTED)).toBeGreaterThan(bassLevel(PLAIN) + 4);
		});

		it('restores the adjustment label after re-smoothing', async () => {
			seedTarget(ADJUSTED);
			targetAdjustmentStore.ensure(ADJUSTED, 'Test Target');
			targetAdjustmentStore.addFilter(ADJUSTED, 'bass');
			targetAdjustmentStore.setValue(ADJUSTED, 'bass', 6);

			await dataProvider.reSmoothAll();

			expect(frStore.get(ADJUSTED)!.adjustmentLabel).toBe('(Bass: +6.0dB)');
		});

		it('leaves a registered but unadjusted target untouched', async () => {
			seedTarget(ADJUSTED);
			seedTarget(PLAIN);
			targetAdjustmentStore.ensure(ADJUSTED, 'Test Target');

			await dataProvider.reSmoothAll();

			expect(bassLevel(ADJUSTED)).toBeCloseTo(bassLevel(PLAIN), 6);
			expect(frStore.get(ADJUSTED)!.adjustmentLabel).toBeNull();
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

	// ── insertRawFRData ──────────────────────────────────────────────────

	describe('insertRawFRData', () => {
		it('adds an entry typed `inserted-<sourceType>` with an `(Inserted)` suffix', async () => {
			await dataProvider.insertRawFRData('phone', 'My Upload', makeFullChannelData());

			expect(frStore.size).toBe(1);
			const entry = [...frStore.entries.values()][0];
			expect(entry.type).toBe('inserted-phone');
			expect(entry.identifier).toBe('My Upload');
			expect(entry.dispSuffix).toBe('(Inserted)');
		});

		it('processes the raw channels rather than storing them verbatim', async () => {
			const raw = makeFullChannelData();
			await dataProvider.insertRawFRData('phone', 'My Upload', raw);

			const entry = [...frStore.entries.values()][0];
			// Smoothing + normalization run, so the stored curve is not the input array.
			expect(entry.channels.AVG!.data).not.toBe(raw.AVG.data);
			expect(entry.channels.L).toBeDefined();
			expect(entry.channels.R).toBeDefined();
			expect(entry.channels.AVG).toBeDefined();
		});

		it('caches the untouched raw channels under `_rawData` for reSmoothAll', async () => {
			const raw = makeFullChannelData();
			await dataProvider.insertRawFRData('phone', 'My Upload', raw);

			const entry = [...frStore.entries.values()][0];
			expect(entry._rawData!.channels.AVG!.data).toEqual(raw.AVG.data);
		});

		it('honours dispChannel and dispSuffix passed in the input metadata', async () => {
			await dataProvider.insertRawFRData('phone', 'My Upload', makeFullChannelData(), {
				dispChannel: ['L', 'R'],
				dispSuffix: '(v2)'
			});

			const entry = [...frStore.entries.values()][0];
			expect(entry.dispChannel).toEqual(['L', 'R']);
			expect(entry.dispSuffix).toBe('(v2)');
		});

		it('assigns a solid dash for a non-target source', async () => {
			await dataProvider.insertRawFRData('phone', 'My Upload', makeFullChannelData());
			expect([...frStore.entries.values()][0].dash).toBe('1 0');
		});

		it('is undoable as a single command', async () => {
			await dataProvider.insertRawFRData('phone', 'My Upload', makeFullChannelData());
			expect(frStore.size).toBe(1);

			commandHistory.undo(frStore);
			expect(frStore.size).toBe(0);

			commandHistory.redo(frStore);
			expect(frStore.size).toBe(1);
		});

		it('gives each insert its own UUID, so the same name can be inserted twice', async () => {
			await dataProvider.insertRawFRData('phone', 'My Upload', makeFullChannelData(80));
			await dataProvider.insertRawFRData('phone', 'My Upload', makeFullChannelData(70));

			const uuids = [...frStore.entries.keys()];
			expect(uuids).toHaveLength(2);
			expect(uuids[0]).not.toBe(uuids[1]);
		});
	});

	// ── toggleFRData ─────────────────────────────────────────────────────

	describe('toggleFRData', () => {
		const PHONE_META: PhoneMetadata = {
			brand: 'Brand',
			name: 'Phone',
			identifier: 'Brand Phone',
			files: [phoneFile('Brand Phone', '')]
		};

		beforeEach(() => {
			vi.spyOn(MetadataParser, 'getFRMetadata').mockReturnValue(PHONE_META);
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue(
				makeFullChannelData() as FRParseResult
			);
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('adds the device when toggled on', async () => {
			await dataProvider.toggleFRData('phone', 'Brand Phone', true);

			expect(frStore.size).toBe(1);
			expect([...frStore.entries.values()][0].identifier).toBe('Brand Phone');
		});

		it('removes the device when toggled off', async () => {
			await dataProvider.toggleFRData('phone', 'Brand Phone', true);
			await dataProvider.toggleFRData('phone', 'Brand Phone', false);

			expect(frStore.size).toBe(0);
		});

		it('is a no-op when toggling on something already loaded', async () => {
			await dataProvider.toggleFRData('phone', 'Brand Phone', true);
			await dataProvider.toggleFRData('phone', 'Brand Phone', true);

			expect(frStore.size).toBe(1);
			expect(FRParser.getFRDataFromMetadata).toHaveBeenCalledTimes(1);
		});

		it('is a no-op when toggling off something that was never loaded', async () => {
			await dataProvider.toggleFRData('phone', 'Brand Phone', false);
			expect(frStore.size).toBe(0);
		});

		it('forwards dispSuffix so variants toggle independently', async () => {
			await dataProvider.toggleFRData('phone', 'Brand Phone', true, 'Sample 1');
			await dataProvider.toggleFRData('phone', 'Brand Phone', true, 'Sample 2');
			expect(frStore.size).toBe(2);

			await dataProvider.toggleFRData('phone', 'Brand Phone', false, 'Sample 1');

			expect(frStore.size).toBe(1);
			expect([...frStore.entries.values()][0].dispSuffix).toBe('Sample 2');
		});

		it('leaves the store untouched when the fetch fails', async () => {
			vi.mocked(FRParser.getFRDataFromMetadata).mockRejectedValueOnce(new Error('404'));

			await dataProvider.toggleFRData('phone', 'Brand Phone', true);

			expect(frStore.size).toBe(0);
		});
	});

	// ── updateVariant ────────────────────────────────────────────────────

	describe('updateVariant', () => {
		const PHONE_META: PhoneMetadata = {
			brand: 'Brand',
			name: 'Phone',
			identifier: 'Brand Phone',
			files: [
				phoneFile('Brand Phone', ''),
				{ ...phoneFile('Brand Phone v2', 'v2'), sampleDescription: 'v2 fit variation' }
			]
		};

		function seedPhone(overrides: Partial<FRDataObject> = {}) {
			frStore.set(
				'p',
				makeFRDataObject('p', {
					identifier: 'Brand Phone',
					meta: PHONE_META,
					channels: makeFullChannelData(),
					dispChannel: ['AVG'],
					...overrides
				})
			);
		}

		function makeSamples(count: number): SampleData[] {
			return Array.from({ length: count }, (_, i) => ({
				L: { data: makeFRPoints(80 + i), metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: makeFRPoints(78 + i), metadata: { minFreq: 20, maxFreq: 20000 } }
			}));
		}

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('throws when the UUID has no metadata to resolve the variant against', async () => {
			frStore.set('p', makeFRDataObject('p'));
			await expect(dataProvider.updateVariant('p', 'v2')).rejects.toThrow(/No data found/);
		});

		it('throws for a UUID that is not in the store', async () => {
			await expect(dataProvider.updateVariant('missing', 'v2')).rejects.toThrow(/No data found/);
		});

		it('swaps in the new variant channels and suffix', async () => {
			seedPhone();
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue(
				makeFullChannelData(90) as FRParseResult
			);

			await dataProvider.updateVariant('p', 'v2');

			const updated = frStore.get('p')!;
			expect(updated.dispSuffix).toBe('v2');
			expect(updated.identifier).toBe('Brand Phone');
			expect(updated.channels.AVG!.data.length).toBeGreaterThan(0);
		});

		it('caches the new variant raw channels for reSmoothAll', async () => {
			seedPhone();
			const raw = makeFullChannelData(90);
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue(raw as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			expect(frStore.get('p')!._rawData!.channels.AVG!.data).toEqual(raw.AVG.data);
		});

		it('keeps the existing dispChannel when the variant still has those channels', async () => {
			seedPhone({ dispChannel: ['L', 'R'] });
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue(
				makeFullChannelData(90) as FRParseResult
			);

			await dataProvider.updateVariant('p', 'v2');

			expect(frStore.get('p')!.dispChannel).toEqual(['L', 'R']);
		});

		it('falls back to the first available channel when the variant drops one', async () => {
			seedPhone({ dispChannel: ['L', 'R'] });
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue({
				AVG: { data: makeFRPoints(90), metadata: { minFreq: 20, maxFreq: 20000 } }
			} as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			expect(frStore.get('p')!.dispChannel).toEqual(['AVG']);
		});

		it('leaves the entry untouched and surfaces no throw when the fetch fails', async () => {
			seedPhone();
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockRejectedValue(new Error('404'));

			await expect(dataProvider.updateVariant('p', 'v2')).resolves.toBeUndefined();

			expect(frStore.get('p')!.dispSuffix).toBe('');
		});

		it('is undoable as one atomic command', async () => {
			seedPhone();
			const before = frStore.get('p')!.channels.AVG!.data;
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue(
				makeFullChannelData(90) as FRParseResult
			);

			await dataProvider.updateVariant('p', 'v2');
			expect(frStore.get('p')!.dispSuffix).toBe('v2');

			commandHistory.undo(frStore);
			const restored = frStore.get('p')!;
			expect(restored.dispSuffix).toBe('');
			expect(restored.channels.AVG!.data).toEqual(before);
		});

		it('attaches sample data and per-run colors when the variant has samples', async () => {
			seedPhone();
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue({
				...makeFullChannelData(90),
				_samples: makeSamples(2)
			} as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			const updated = frStore.get('p')!;
			expect(updated.samples).toHaveLength(2);
			expect(updated.colors.samples!.sample0_L).toBe(updated.colors.L);
			expect(updated.colors.samples!.sample1_R).toBe(updated.colors.R);
		});

		it('clears sample data when the new variant has none', async () => {
			seedPhone({
				samples: makeSamples(2),
				dispSamples: ['sample0_L', 'sample0_R'],
				showFill: true,
				envelope: {
					L: { upper: [], lower: [] },
					R: { upper: [], lower: [] },
					AVG: { upper: [], lower: [] }
				}
			});
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue(
				makeFullChannelData(90) as FRParseResult
			);

			await dataProvider.updateVariant('p', 'v2');

			const updated = frStore.get('p')!;
			expect(updated.samples).toBeUndefined();
			expect(updated.dispSamples).toBeUndefined();
			expect(updated.envelope).toBeUndefined();
			expect(updated.showFill).toBeUndefined();
			expect(updated.showAvg).toBeUndefined();
		});

		it('builds the envelope and carries the set description', async () => {
			seedPhone();
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue({
				...makeFullChannelData(90),
				_samples: [
					{
						label: 'Fit A',
						L: { data: makeFRPoints(80), metadata: { minFreq: 20, maxFreq: 20000 } },
						R: { data: makeFRPoints(78), metadata: { minFreq: 20, maxFreq: 20000 } }
					},
					{
						label: 'Fit B',
						L: { data: makeFRPoints(84), metadata: { minFreq: 20, maxFreq: 20000 } },
						R: { data: makeFRPoints(82), metadata: { minFreq: 20, maxFreq: 20000 } }
					}
				],
				_sampleDisplay: ['avg', 'fill'],
				_sampleDescription: 'v2 fit variation'
			} as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			const updated = frStore.get('p')!;
			expect(updated.samples!.map((s) => s.label)).toEqual(['Fit A', 'Fit B']);
			expect(updated.sampleDescription).toBe('v2 fit variation');
			expect(updated.showAvg).toBe(true);
			expect(updated.showFill).toBe(true);
			// Two runs means a real envelope; upper must sit at or above lower everywhere.
			expect(updated.envelope!.L.upper.length).toBeGreaterThan(0);
			expect(
				updated.envelope!.L.upper.every(([, db], i) => db >= updated.envelope!.L.lower[i][1])
			).toBe(true);
		});

		it('computes the envelope even when the variant is not drawn as a fill', async () => {
			// The user can turn the fill on at any time, so it cannot be conditional
			// on the declared display.
			seedPhone();
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue({
				...makeFullChannelData(90),
				_samples: makeSamples(3),
				_sampleDisplay: ['avg']
			} as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			expect(frStore.get('p')!.showFill).toBe(false);
			expect(frStore.get('p')!.envelope!.L.upper.length).toBeGreaterThan(0);
		});

		it('seeds the run picks from a `curves` display', async () => {
			seedPhone();
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue({
				...makeFullChannelData(90),
				_samples: makeSamples(2),
				_sampleDisplay: ['fill', 'curves']
			} as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			// One key per run — AVG, since both channels loaded.
			expect(frStore.get('p')!.dispSamples).toEqual(['sample0_AVG', 'sample1_AVG']);
			expect(frStore.get('p')!.showAvg).toBe(false);
		});

		it('drops carried-over run picks that no longer name a loaded run', async () => {
			// Switching to a shorter set must not leave a key pointing past its end.
			seedPhone({
				samples: makeSamples(4),
				dispSamples: ['sample0_AVG', 'sample3_AVG']
			});
			vi.spyOn(FRParser, 'getFRDataFromMetadata').mockResolvedValue({
				...makeFullChannelData(90),
				_samples: makeSamples(2),
				_sampleDisplay: ['avg']
			} as FRParseResult);

			await dataProvider.updateVariant('p', 'v2');

			expect(frStore.get('p')!.dispSamples).toEqual(['sample0_AVG']);
		});
	});
});
