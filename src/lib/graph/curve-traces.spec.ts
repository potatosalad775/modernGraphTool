import { describe, it, expect } from 'vitest';
import {
	combineEnvelopes,
	curveTraces,
	listedTraces,
	selectEnvelope,
	type CurveTrace
} from './curve-traces.js';
import type {
	ChannelData,
	FRDataObject,
	FRDataPoint,
	SampleEnvelope
} from '#lib/types/data-types.js';

/**
 * "Which traces does this item draw?" — the one answer the engine, the labels
 * and the hover readout all read. Table cases over item shapes; that each
 * reader actually uses it is covered by their own specs.
 */

function channel(db: number): ChannelData {
	const data: FRDataPoint[] = [
		[20, db],
		[1000, db],
		[20000, db]
	];
	return { data, metadata: { minFreq: 20, maxFreq: 20000 } };
}

function envelope(upper: number, lower: number): SampleEnvelope {
	return {
		upper: channel(upper).data,
		lower: channel(lower).data
	};
}

function item(extra: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'a',
		type: 'phone',
		identifier: 'Phone A',
		channels: { L: channel(80), R: channel(78), AVG: channel(79) },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '',
		...extra
	};
}

/** A set with two labelled runs and an envelope — the fullest shape an item takes. */
function sampleSet(extra: Partial<FRDataObject> = {}): FRDataObject {
	return item({
		samples: [
			{ label: 'Center', L: channel(81), R: channel(79), AVG: channel(80) },
			{ label: 'Front', L: channel(83), R: channel(77), AVG: channel(80) }
		],
		envelope: { L: envelope(83, 81), R: envelope(79, 77), AVG: envelope(82, 78) },
		...extra
	});
}

const summary = (traces: CurveTrace[]) => traces.map((t) => `${t.kind}:${t.key}`);

describe('curveTraces', () => {
	describe('an item with no sample set', () => {
		it('draws its displayed channels as main traces, in dispChannel order', () => {
			const traces = curveTraces(item({ dispChannel: ['R', 'L'] }), null);

			expect(summary(traces)).toEqual(['main:R', 'main:L']);
			expect(traces.map((t) => t.name)).toEqual(['Phone A (R)', 'Phone A (L)']);
			expect(traces.map((t) => t.color)).toEqual(['#0000ff', '#ff0000']);
			expect(traces.every((t) => !t.ghost)).toBe(true);
		});

		it('binds the stored channel array as the trace data', () => {
			const phone = item();
			const [trace] = curveTraces(phone, null);
			expect(trace.kind === 'main' && trace.data).toBe(phone.channels.AVG!.data);
		});

		it('falls back to the AVG colour for a channel with none of its own', () => {
			const [trace] = curveTraces(item({ dispChannel: ['L'], colors: { AVG: '#00ff00' } }), null);
			expect(trace.color).toBe('#00ff00');
		});

		it('skips a dispChannel entry that has no data', () => {
			const phone = item({ dispChannel: ['L', 'R'], channels: { L: channel(80) } });
			expect(summary(curveTraces(phone, null))).toEqual(['main:L']);
		});

		it('ignores showAvg being absent — absent means drawn', () => {
			expect(curveTraces(item({ showAvg: undefined }), null)).toHaveLength(1);
		});
	});

	describe('a sample set', () => {
		it('draws only the fill for a fill-only set', () => {
			const traces = curveTraces(sampleSet({ showFill: true, showAvg: false }), null);

			expect(summary(traces)).toEqual(['fill:fill']);
			const fill = traces[0];
			expect(fill.kind === 'fill' && fill.channel).toBeNull();
			expect(fill.color).toBe('#00ff00');
			expect(fill.name).toBe('Phone A');
			expect(fill.kind === 'fill' && fill.envelope.upper.length).toBeGreaterThan(0);
		});

		it('draws only runs for a runs-only set', () => {
			const traces = curveTraces(
				sampleSet({ showAvg: false, dispSamples: ['sample0_L', 'sample1_R'] }),
				null
			);

			expect(summary(traces)).toEqual(['run:sample0_L', 'run:sample1_R']);
			expect(traces.map((t) => t.name)).toEqual(['Phone A (Center, L)', 'Phone A (Front, R)']);
			expect(traces.every((t) => !t.ghost)).toBe(true);
		});

		it('orders fill, then runs, then main traces', () => {
			const traces = curveTraces(
				sampleSet({ showFill: true, showAvg: true, dispSamples: ['sample1_AVG', 'sample0_AVG'] }),
				null
			);
			expect(summary(traces)).toEqual([
				'fill:fill',
				'run:sample1_AVG',
				'run:sample0_AVG',
				'main:AVG'
			]);
		});

		it('colours a run by its own key, else by AVG — never by its channel', () => {
			const traces = curveTraces(
				sampleSet({
					showAvg: false,
					dispSamples: ['sample0_L', 'sample1_L'],
					colors: { L: '#ff0000', AVG: '#00ff00', samples: { sample1_L: '#123456' } }
				}),
				null
			);
			expect(traces.map((t) => t.color)).toEqual(['#00ff00', '#123456']);
		});

		it('labels an unlabelled run with a 1-based ordinal', () => {
			const phone = item({ samples: [{ L: channel(81) }, { L: channel(83) }], showAvg: false });
			phone.dispSamples = ['sample1_L'];
			expect(curveTraces(phone, null)[0].name).toBe('Phone A (Sample 2, L)');
		});

		it('draws no fill without an envelope, or when the picked envelope is empty', () => {
			expect(curveTraces(sampleSet({ showFill: true, envelope: undefined }), null)).toHaveLength(1);
			const empty = { upper: [], lower: [] };
			const bare = sampleSet({ showFill: true, envelope: { L: empty, R: empty, AVG: empty } });
			expect(summary(curveTraces(bare, null))).toEqual(['main:AVG']);
		});

		it('draws the fill only while showFill is on', () => {
			expect(summary(curveTraces(sampleSet({ showFill: false }), null))).toEqual(['main:AVG']);
		});

		it('keeps the main traces with showAvg true or absent, drops them when false', () => {
			expect(curveTraces(sampleSet({ showAvg: true }), null)).toHaveLength(1);
			expect(curveTraces(sampleSet({ showAvg: undefined }), null)).toHaveLength(1);
			expect(curveTraces(sampleSet({ showAvg: false }), null)).toHaveLength(0);
		});

		it('skips undrawable run keys: unparseable, past the set, or a channel the run lacks', () => {
			const phone = sampleSet({
				samples: [{ label: 'Only', L: channel(81) }],
				showAvg: false
			});
			phone.dispSamples = ['sample0_L', 'sample0_R', 'sample9_L', 'nonsense' as never];
			expect(summary(curveTraces(phone, null))).toEqual(['run:sample0_L']);
		});

		it('does not let an undrawable key stand in for a drawn trace', () => {
			const phone = sampleSet({ showFill: true, showAvg: false });
			phone.dispSamples = ['sample9_L'];
			expect(summary(curveTraces(phone, null))).toEqual(['fill:fill']);
		});
	});

	describe('the EQ source', () => {
		const eqAvg = { sample: null };

		it('ghosts the average and the fill when the average is the source', () => {
			const traces = curveTraces(
				sampleSet({ showFill: true, dispSamples: ['sample0_AVG'] }),
				eqAvg
			);

			expect(summary(traces)).toEqual(['fill:fill', 'run:sample0_AVG', 'main:AVG']);
			expect(traces.map((t) => t.ghost)).toEqual([true, false, true]);
			const main = traces[2];
			expect(main.name).toBe('Phone A (AVG)');
			expect(main.kind === 'main' && main.fromRun).toBe(false);
		});

		it('draws the source run in place of the average, ghosted and named by the run', () => {
			const phone = sampleSet({ dispChannel: ['L', 'R'] });
			const traces = curveTraces(phone, { sample: { index: 1, variant: '' } });

			expect(traces.map((t) => t.name)).toEqual(['Phone A (Front, L)', 'Phone A (Front, R)']);
			expect(traces.every((t) => t.ghost && t.kind === 'main' && t.fromRun)).toBe(true);
			const [l] = traces;
			expect(l.kind === 'main' && l.data).toBe(phone.samples![1].L!.data);
		});

		it('still draws the run with the average toggled off', () => {
			const traces = curveTraces(sampleSet({ showAvg: false }), {
				sample: { index: 0, variant: '' }
			});
			expect(summary(traces)).toEqual(['main:AVG']);
			expect(traces[0].ghost).toBe(true);
			expect(traces[0].name).toBe('Phone A (Center, AVG)');
		});

		it('names an unlabelled source run by its ordinal', () => {
			const phone = item({ samples: [{ AVG: channel(70) }, { AVG: channel(71) }] });
			const [trace] = curveTraces(phone, { sample: { index: 1, variant: '' } });
			expect(trace.name).toBe('Phone A (Sample 2, AVG)');
		});

		it('skips a channel the source run lacks, rather than drawing the average there', () => {
			const phone = item({
				dispChannel: ['L', 'AVG'],
				samples: [{ AVG: channel(70) }]
			});
			const traces = curveTraces(phone, { sample: { index: 0, variant: '' } });
			expect(summary(traces)).toEqual(['main:AVG']);
		});

		it('reads a stale pick as the average', () => {
			const phone = sampleSet({ dispSuffix: 'Modded' });
			const traces = curveTraces(phone, { sample: { index: 0, variant: 'Stock' } });

			expect(traces).toHaveLength(1);
			expect(traces[0].ghost).toBe(true);
			expect(traces[0].kind === 'main' && traces[0].data).toBe(phone.channels.AVG!.data);
			expect(traces[0].name).toBe('Phone A Modded (AVG)');
		});

		it('leaves the average-off set empty for a stale pick', () => {
			const phone = sampleSet({ showAvg: false });
			expect(curveTraces(phone, { sample: { index: 5, variant: '' } })).toHaveLength(0);
		});

		it('keeps the run traces un-ghosted next to a ghosted source run', () => {
			const traces = curveTraces(sampleSet({ dispSamples: ['sample0_AVG'] }), {
				sample: { index: 0, variant: '' }
			});
			expect(summary(traces)).toEqual(['run:sample0_AVG', 'main:AVG']);
			expect(traces.map((t) => t.ghost)).toEqual([false, true]);
		});

		it('never dims an inserted-phone, as the engine never has', () => {
			const [trace] = curveTraces(item({ type: 'inserted-phone' }), eqAvg);
			expect(trace.ghost).toBe(false);
		});

		it('does not ghost a target', () => {
			const [trace] = curveTraces(item({ type: 'target', channels: { AVG: channel(75) } }), eqAvg);
			expect(trace.ghost).toBe(false);
		});
	});

	describe('targets', () => {
		it('draws one AVG main trace, named without a channel tag', () => {
			const traces = curveTraces(
				item({
					type: 'target',
					identifier: 'Harman',
					adjustmentLabel: '(Tilt: -1dB/oct)',
					channels: { AVG: channel(75) },
					colors: { AVG: '#666666' }
				}),
				null
			);

			expect(summary(traces)).toEqual(['main:AVG']);
			expect(traces[0].name).toBe('Harman (Tilt: -1dB/oct)');
			expect(traces[0].color).toBe('#666666');
		});

		it('falls back to the base content colour', () => {
			const [trace] = curveTraces(
				item({ type: 'target', channels: { AVG: channel(75) }, colors: {} as never }),
				null
			);
			expect(trace.color).toBe('var(--color-base-content)');
		});

		it('draws an uploaded target by the same rule, whatever dispChannel names', () => {
			const traces = curveTraces(
				item({
					type: 'inserted-target',
					identifier: 'Mine',
					channels: { AVG: channel(75), L: channel(70) },
					dispChannel: ['L', 'R']
				}),
				null
			);
			expect(summary(traces)).toEqual(['main:AVG']);
			expect(traces[0].name).toBe('Mine');
		});

		it('ignores sample-set fields', () => {
			const traces = curveTraces(
				sampleSet({
					type: 'target',
					channels: { AVG: channel(75) },
					showFill: true,
					showAvg: false,
					dispSamples: ['sample0_L']
				}),
				null
			);
			expect(summary(traces)).toEqual(['main:AVG']);
		});

		it('draws nothing for a target with no AVG data', () => {
			expect(curveTraces(item({ type: 'target', channels: {} }), null)).toEqual([]);
		});
	});

	describe('other item types', () => {
		it.each(['eq', 'inserted-phone', 'inserted-eq'] as const)(
			'%s follows the phone rule over its dispChannel',
			(type) => {
				const traces = curveTraces(item({ type, dispChannel: ['L', 'R'] }), null);
				expect(summary(traces)).toEqual(['main:L', 'main:R']);
				expect(traces[0].name).toBe('Phone A (L)');
			}
		);

		it('skips a dispChannel entry with no data instead of throwing', () => {
			const eq = item({ type: 'eq', dispChannel: ['AVG', 'L'], channels: { AVG: channel(79) } });
			expect(summary(curveTraces(eq, null))).toEqual(['main:AVG']);
		});
	});

	it('does not filter hidden items', () => {
		expect(curveTraces(item({ hidden: true }), null)).toHaveLength(1);
	});
});

describe('listedTraces', () => {
	it('lists main traces then runs, and leaves the fill out', () => {
		const traces = curveTraces(
			sampleSet({ showFill: true, dispSamples: ['sample0_L'], dispChannel: ['L', 'R'] }),
			null
		);
		expect(summary(listedTraces(traces))).toEqual(['main:L', 'main:R', 'run:sample0_L']);
	});

	describe('when the EQ source run is also shown as a run', () => {
		const pick = { sample: { index: 0, variant: '' } };

		it('draws both traces but lists the run once', () => {
			const traces = curveTraces(sampleSet({ dispSamples: ['sample0_AVG'] }), pick);

			expect(summary(traces)).toEqual(['run:sample0_AVG', 'main:AVG']);
			expect(summary(listedTraces(traces))).toEqual(['run:sample0_AVG']);
		});

		it('lists the ghost row when that run is not shown as a run', () => {
			const traces = curveTraces(sampleSet({ dispSamples: ['sample1_AVG'] }), pick);

			expect(summary(listedTraces(traces))).toEqual(['main:AVG', 'run:sample1_AVG']);
		});

		it('lists the ghost row when the run is shown on another channel only', () => {
			const traces = curveTraces(sampleSet({ dispSamples: ['sample0_L'] }), pick);

			expect(summary(listedTraces(traces))).toEqual(['main:AVG', 'run:sample0_L']);
		});

		it('drops only the channel that is also a run', () => {
			const traces = curveTraces(
				sampleSet({ dispChannel: ['L', 'R'], dispSamples: ['sample0_R'] }),
				pick
			);
			expect(summary(listedTraces(traces))).toEqual(['main:L', 'run:sample0_R']);
		});

		it('keeps an ordinary average that merely shares a channel with a run', () => {
			const traces = curveTraces(sampleSet({ dispSamples: ['sample0_AVG'] }), null);
			expect(summary(listedTraces(traces))).toEqual(['main:AVG', 'run:sample0_AVG']);
		});
	});
});

describe('selectEnvelope', () => {
	it('is empty without an envelope', () => {
		expect(selectEnvelope(item())).toEqual({ upper: [], lower: [] });
	});

	it('uses one channel alone when it is the only one displayed', () => {
		const phone = sampleSet({ dispChannel: ['R'] });
		expect(selectEnvelope(phone)).toBe(phone.envelope!.R);
	});

	it('combines L and R for an AVG display, not envelope.AVG', () => {
		const picked = selectEnvelope(sampleSet({ dispChannel: ['AVG'] }));
		expect(picked.upper[0][1]).toBe(83);
		expect(picked.lower[0][1]).toBe(77);
	});

	it('falls back to envelope.AVG when neither L nor R has data', () => {
		const empty = { upper: [], lower: [] };
		const phone = sampleSet({ envelope: { L: empty, R: empty, AVG: envelope(2, -2) } });
		expect(selectEnvelope(phone)).toBe(phone.envelope!.AVG);
	});
});

describe('combineEnvelopes', () => {
	it('takes the widest spread at each index', () => {
		const combined = combineEnvelopes([envelope(4, -2), envelope(2, -6)]);
		expect(combined.upper[0][1]).toBe(4);
		expect(combined.lower[0][1]).toBe(-6);
	});

	it('is empty when nothing is usable', () => {
		expect(combineEnvelopes([{ upper: [], lower: [] }])).toEqual({ upper: [], lower: [] });
	});
});
