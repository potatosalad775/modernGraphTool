import { describe, it, expect, beforeEach } from 'vitest';
import { baseline, compensateAt, resolveBaselineChannelData } from './baseline.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import type { FRDataObject, FRDataPoint, ParsedFRData } from '#lib/types/data-types.js';

function makeTarget(uuid: string, avg: FRDataPoint[]): FRDataObject {
	return {
		uuid,
		type: 'target',
		identifier: `target-${uuid}`,
		channels: {
			AVG: { data: avg, metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		colors: { AVG: '#666' },
		dash: '4 4'
	};
}

function makePhone(uuid: string, avg: FRDataPoint[]): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `phone-${uuid}`,
		channels: {
			AVG: { data: avg, metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		colors: { AVG: '#f00' },
		dash: '1 0'
	};
}

const ORIGINAL: FRDataPoint[] = [
	[500, 70],
	[1000, 75],
	[2000, 72]
];
const ADJUSTED: FRDataPoint[] = [
	[500, 72],
	[1000, 77],
	[2000, 74]
];

describe('resolveBaselineChannelData', () => {
	beforeEach(() => {
		frStore.clear();
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.targetOriginalData.clear();
	});

	it('returns null when UUID is null', () => {
		expect(resolveBaselineChannelData(null, 'withoutAdjustment')).toBeNull();
		expect(resolveBaselineChannelData(null, 'withAdjustment')).toBeNull();
		expect(resolveBaselineChannelData(null, 'off')).toBeNull();
	});

	it('withoutAdjustment returns pre-adjustment target data from targetOriginalData', () => {
		const original: ParsedFRData = {
			AVG: { data: ORIGINAL, metadata: { minFreq: 20, maxFreq: 20000 } }
		};
		graphStore.targetOriginalData.set('t', original);
		frStore.set('t', makeTarget('t', ADJUSTED));

		const resolved = resolveBaselineChannelData('t', 'withoutAdjustment');
		expect(resolved).toBe(ORIGINAL);
	});

	it('withAdjustment returns current (adjusted) channels from frStore', () => {
		const original: ParsedFRData = {
			AVG: { data: ORIGINAL, metadata: { minFreq: 20, maxFreq: 20000 } }
		};
		graphStore.targetOriginalData.set('t', original);
		frStore.set('t', makeTarget('t', ADJUSTED));

		const resolved = resolveBaselineChannelData('t', 'withAdjustment');
		expect(resolved).toBe(ADJUSTED);
	});

	it('withoutAdjustment falls through to frStore when target has no cached original', () => {
		// Simulates a customizable target whose TargetCustomizer has not mounted yet,
		// or a target that never had adjustments applied.
		frStore.set('t', makeTarget('t', ADJUSTED));
		expect(graphStore.targetOriginalData.has('t')).toBe(false);

		const resolved = resolveBaselineChannelData('t', 'withoutAdjustment');
		expect(resolved).toBe(ADJUSTED);
	});

	it('withoutAdjustment falls through to frStore for phones', () => {
		// SelectionList sets baselineMode = 'withoutAdjustment' for phone baselines too,
		// via the simple toggle branch. Phones never populate targetOriginalData.
		frStore.set('p', makePhone('p', ADJUSTED));

		const resolved = resolveBaselineChannelData('p', 'withoutAdjustment');
		expect(resolved).toBe(ADJUSTED);
	});

	it('returns null when UUID is unknown to both stores', () => {
		expect(resolveBaselineChannelData('missing', 'withoutAdjustment')).toBeNull();
		expect(resolveBaselineChannelData('missing', 'withAdjustment')).toBeNull();
	});

	it('picks L or R channel for phones displaying a single channel', () => {
		frStore.set('p', {
			...makePhone('p', ADJUSTED),
			dispChannel: ['L'],
			channels: {
				L: { data: ORIGINAL, metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: ADJUSTED, metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: ADJUSTED, metadata: { minFreq: 20, maxFreq: 20000 } }
			}
		});

		expect(resolveBaselineChannelData('p', 'withAdjustment')).toBe(ORIGINAL);
	});
});

// ── The baseline module ────────────────────────────────────────────────────────

const META = { minFreq: 20, maxFreq: 20000 };

function resetStores() {
	frStore.clear();
	graphStore.baselineUUID = null;
	graphStore.baselineMode = 'off';
	graphStore.targetOriginalData.clear();
}

/** A target with a cached original, i.e. one the Target Customizer has adjusted. */
function addCustomizableTarget(uuid: string) {
	frStore.set(uuid, makeTarget(uuid, ADJUSTED));
	graphStore.targetOriginalData.set(uuid, { AVG: { data: ORIGINAL, metadata: META } });
}

describe('baseline.cycle', () => {
	beforeEach(() => {
		resetStores();
		frStore.set('p', makePhone('p', ADJUSTED));
		frStore.set('q', makePhone('q', ORIGINAL));
		frStore.set('plain', makeTarget('plain', ADJUSTED));
		addCustomizableTarget('t');
		addCustomizableTarget('u');
	});

	it('starts with no baseline', () => {
		expect(baseline.uuid).toBeNull();
		expect(baseline.mode).toBe('off');
		expect(baseline.channelData).toBeNull();
	});

	describe('a phone, or a target without a cached original', () => {
		for (const uuid of ['p', 'plain']) {
			it(`${uuid}: off → withoutAdjustment → off, never withAdjustment`, () => {
				baseline.cycle(uuid);
				expect(graphStore.baselineUUID).toBe(uuid);
				expect(graphStore.baselineMode).toBe('withoutAdjustment');
				expect(baseline.modeFor(uuid)).toBe('withoutAdjustment');

				baseline.cycle(uuid);
				expect(graphStore.baselineUUID).toBeNull();
				expect(graphStore.baselineMode).toBe('off');
				expect(baseline.modeFor(uuid)).toBe('off');
			});
		}

		it('a phone that is the baseline in withAdjustment (a hand-edited URL) goes straight to off', () => {
			graphStore.baselineUUID = 'p';
			graphStore.baselineMode = 'withAdjustment';
			baseline.cycle('p');
			expect(graphStore.baselineUUID).toBeNull();
			expect(graphStore.baselineMode).toBe('off');
		});

		it('replaces another item that is the baseline', () => {
			baseline.cycle('q');
			baseline.cycle('p');
			expect(graphStore.baselineUUID).toBe('p');
			expect(graphStore.baselineMode).toBe('withoutAdjustment');
			expect(baseline.modeFor('q')).toBe('off');
		});

		it('replaces a customizable target that is in withAdjustment', () => {
			baseline.cycle('t');
			baseline.cycle('t');
			expect(graphStore.baselineMode).toBe('withAdjustment');
			baseline.cycle('p');
			expect(graphStore.baselineUUID).toBe('p');
			expect(graphStore.baselineMode).toBe('withoutAdjustment');
		});
	});

	describe('a customizable target', () => {
		it('cycles off → withoutAdjustment → withAdjustment → off', () => {
			baseline.cycle('t');
			expect([graphStore.baselineUUID, graphStore.baselineMode]).toEqual([
				't',
				'withoutAdjustment'
			]);
			baseline.cycle('t');
			expect([graphStore.baselineUUID, graphStore.baselineMode]).toEqual(['t', 'withAdjustment']);
			baseline.cycle('t');
			expect([graphStore.baselineUUID, graphStore.baselineMode]).toEqual([null, 'off']);
		});

		it('clicking a different item while one is the baseline starts that item at withoutAdjustment', () => {
			baseline.cycle('t');
			baseline.cycle('t'); // t is now withAdjustment
			baseline.cycle('u');
			expect([graphStore.baselineUUID, graphStore.baselineMode]).toEqual([
				'u',
				'withoutAdjustment'
			]);

			baseline.cycle('p');
			baseline.cycle('t');
			expect([graphStore.baselineUUID, graphStore.baselineMode]).toEqual([
				't',
				'withoutAdjustment'
			]);
		});
	});

	it('ignores an item the store does not have', () => {
		baseline.cycle('missing');
		expect(graphStore.baselineUUID).toBeNull();
		expect(graphStore.baselineMode).toBe('off');
	});
});

describe('baseline.restoreFromURL', () => {
	beforeEach(() => {
		resetStores();
		frStore.set('a', { ...makePhone('a', ADJUSTED), identifier: 'Phone A', dispSuffix: 'V2' });
		frStore.set('b', { ...makePhone('b', ORIGINAL), identifier: 'Phone B', dispSuffix: '' });
	});

	it('restores the item matched by its share key, in either active mode', () => {
		baseline.restoreFromURL({ key: 'Phone A V2', mode: 'withoutAdjustment' });
		expect([baseline.uuid, baseline.mode]).toEqual(['a', 'withoutAdjustment']);

		baseline.restoreFromURL({ key: 'Phone B', mode: 'withAdjustment' });
		expect([baseline.uuid, baseline.mode]).toEqual(['b', 'withAdjustment']);
	});

	it('resolves the data straight away — nothing else has to run first', () => {
		baseline.restoreFromURL({ key: 'Phone A V2', mode: 'withoutAdjustment' });
		expect(baseline.channelData).toBe(ADJUSTED);
	});

	for (const mode of ['off', 'bogus', '', 42, null, undefined]) {
		it(`treats the mode ${JSON.stringify(mode) ?? 'undefined'} as no baseline`, () => {
			baseline.cycle('a');
			baseline.restoreFromURL({ key: 'Phone A V2', mode });
			expect(baseline.uuid).toBeNull();
			expect(graphStore.baselineUUID).toBeNull();
			expect(graphStore.baselineMode).toBe('off');
		});
	}

	it('treats a key no item has as no baseline', () => {
		baseline.restoreFromURL({ key: 'Phone A V2', mode: 'withoutAdjustment' });
		baseline.restoreFromURL({ key: 'Never Loaded', mode: 'withoutAdjustment' });
		expect(graphStore.baselineUUID).toBeNull();
		expect(graphStore.baselineMode).toBe('off');
	});
});

describe('a baseline whose item is removed', () => {
	beforeEach(() => {
		resetStores();
		frStore.set('p', makePhone('p', ADJUSTED));
		baseline.cycle('p');
	});

	it('goes dormant: not in effect, the stored fields untouched', () => {
		const item = frStore.get('p')!;
		frStore.delete('p');

		expect(baseline.uuid).toBeNull();
		expect(baseline.mode).toBe('off');
		expect(baseline.channelData).toBeNull();
		expect(baseline.modeFor('p')).toBe('off');
		expect(graphStore.baselineUUID).toBe('p');
		expect(graphStore.baselineMode).toBe('withoutAdjustment');

		// What an undo of the removal does: the same uuid goes back into the store.
		frStore.set('p', item);
		expect(baseline.uuid).toBe('p');
		expect(baseline.mode).toBe('withoutAdjustment');
		expect(baseline.channelData).toBe(ADJUSTED);
	});

	it('is replaced by picking another baseline while dormant', () => {
		frStore.set('q', makePhone('q', ORIGINAL));
		frStore.delete('p');
		baseline.cycle('q');
		expect([graphStore.baselineUUID, baseline.uuid]).toEqual(['q', 'q']);

		frStore.set('p', makePhone('p', ADJUSTED));
		expect(baseline.uuid).toBe('q');
	});

	it('is still the baseline when its item is merely hidden', () => {
		frStore.set('p', { ...makePhone('p', ADJUSTED), hidden: true });
		expect(baseline.uuid).toBe('p');
		expect(baseline.channelData).toBe(ADJUSTED);
	});
});

describe('baseline.channelData', () => {
	beforeEach(resetStores);

	function setBaseline(item: FRDataObject) {
		frStore.set(item.uuid, item);
		graphStore.baselineUUID = item.uuid;
		graphStore.baselineMode = 'withoutAdjustment';
	}

	const L: FRDataPoint[] = [[1000, 1]];
	const R: FRDataPoint[] = [[1000, 2]];
	const AVG: FRDataPoint[] = [[1000, 3]];
	const channels = {
		L: { data: L, metadata: META },
		R: { data: R, metadata: META },
		AVG: { data: AVG, metadata: META }
	};

	for (const type of ['phone', 'inserted-phone'] as const) {
		describe(type, () => {
			const make = (
				dispChannel: ('L' | 'R' | 'AVG')[],
				ch: FRDataObject['channels'] = channels
			): FRDataObject => ({
				...makePhone('x', AVG),
				type,
				channels: ch,
				dispChannel
			});

			it('uses the channel it shows', () => {
				setBaseline(make(['L']));
				expect(baseline.channelData).toBe(L);
				setBaseline(make(['R']));
				expect(baseline.channelData).toBe(R);
				setBaseline(make(['AVG']));
				expect(baseline.channelData).toBe(AVG);
			});

			it('uses AVG when both L and R are shown', () => {
				setBaseline(make(['L', 'R']));
				expect(baseline.channelData).toBe(AVG);
			});

			it('subtracts nothing when the channel it shows does not exist', () => {
				setBaseline(make(['AVG'], { L: channels.L, R: channels.R }));
				expect(baseline.channelData).toBeNull();
			});
		});
	}

	it('an inserted phone that has only L and R uses the one it shows', () => {
		setBaseline({
			...makePhone('x', AVG),
			type: 'inserted-phone',
			channels: { L: channels.L, R: channels.R },
			dispChannel: ['R']
		});
		expect(baseline.channelData).toBe(R);
	});

	for (const type of ['target', 'inserted-target', 'eq', 'inserted-eq'] as const) {
		it(`${type} always uses AVG, whatever dispChannel says`, () => {
			setBaseline({ ...makePhone('x', AVG), type, channels, dispChannel: ['L'] });
			expect(baseline.channelData).toBe(AVG);
		});
	}

	it('follows a targetOriginalData edit immediately', () => {
		addCustomizableTarget('t');
		baseline.cycle('t');
		expect(baseline.channelData).toBe(ORIGINAL);

		const edited: FRDataPoint[] = [[1000, 1]];
		graphStore.targetOriginalData.set('t', { AVG: { data: edited, metadata: META } });
		expect(baseline.channelData).toBe(edited);
	});

	it('follows a change of the baseline item immediately', () => {
		frStore.set('p', makePhone('p', ORIGINAL));
		baseline.cycle('p');
		expect(baseline.channelData).toBe(ORIGINAL);
		frStore.set('p', makePhone('p', ADJUSTED));
		expect(baseline.channelData).toBe(ADJUSTED);
	});

	it('follows a mode change immediately', () => {
		addCustomizableTarget('t');
		baseline.cycle('t');
		expect(baseline.channelData).toBe(ORIGINAL);
		baseline.cycle('t');
		expect(baseline.channelData).toBe(ADJUSTED);
		baseline.cycle('t');
		expect(baseline.channelData).toBeNull();
	});
});

describe('compensateAt', () => {
	const data: FRDataPoint[] = [
		[100, 0],
		[1000, 10],
		[10000, 4]
	];

	it('subtracts the baseline interpolated linearly between its points', () => {
		// Halfway (linear in frequency) between 100 → 0 dB and 1000 → 10 dB.
		expect(compensateAt(20, 550, data)).toBeCloseTo(20 - 5, 9);
	});

	it('subtracts the exact value on a hit', () => {
		expect(compensateAt(20, 1000, data)).toBe(10);
		expect(compensateAt(20, 100, data)).toBe(20);
	});

	it('holds the end values outside the baseline range', () => {
		expect(compensateAt(20, 20, data)).toBe(20 - 0);
		expect(compensateAt(20, 20000, data)).toBe(20 - 4);
	});

	it('leaves the value alone for an empty or missing baseline', () => {
		expect(compensateAt(20, 1000, [])).toBe(20);
		expect(compensateAt(20, 1000, null)).toBe(20);
		expect(compensateAt(20, 1000, undefined)).toBe(20);
	});
});
