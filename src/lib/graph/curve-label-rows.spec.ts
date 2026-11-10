import { describe, it, expect } from 'vitest';
import { labelRows } from './curve-label-rows.js';
import { curveTraces } from './curve-traces.js';
import type { ChannelData, FRDataObject, FRDataPoint } from '#lib/types/data-types.js';

/**
 * How the traces an item draws read as legend rows: the fill-only collapse,
 * the captions, and the rows that must not exist.
 */

function channel(db: number): ChannelData {
	const data: FRDataPoint[] = [
		[20, db],
		[20000, db]
	];
	return { data, metadata: { minFreq: 20, maxFreq: 20000 } };
}

const band = { upper: channel(83).data, lower: channel(77).data };

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
		samples: [
			{ label: 'Center', L: channel(81), R: channel(79), AVG: channel(80) },
			{ label: 'Front', L: channel(83), R: channel(77), AVG: channel(80) }
		],
		envelope: { L: band, R: band, AVG: band },
		...extra
	};
}

const rows = (
	obj: FRDataObject,
	eq: { sample: { index: number; variant: string } | null } | null = null
) => labelRows(obj, curveTraces(obj, eq));

describe('labelRows', () => {
	describe('the fill-only collapse', () => {
		it('emits one combined row for a set that draws only its fill', () => {
			const obj = item({
				showFill: true,
				showAvg: false,
				dispChannel: ['L', 'R'],
				sampleDescription: 'Pad wear'
			});
			expect(rows(obj)).toEqual([
				{ key: 'fill', text: 'Phone A Pad wear (L+R)', color: '#00ff00' }
			]);
		});

		it('joins other channel sets with a plus, and omits an empty one', () => {
			expect(rows(item({ showFill: true, showAvg: false, dispChannel: ['AVG'] }))[0].text).toBe(
				'Phone A (AVG)'
			);
			expect(
				rows(item({ showFill: true, showAvg: false, dispChannel: ['AVG', 'L', 'R'] }))[0].text
			).toBe('Phone A (AVG+L+R)');
			expect(rows(item({ showFill: true, showAvg: false, dispChannel: [] }))[0].text).toBe(
				'Phone A'
			);
		});

		it('does not collapse once the average is drawn: the fill gets no row', () => {
			const result = rows(item({ showFill: true, showAvg: true }));
			expect(result.map((r) => r.key)).toEqual(['AVG']);
		});

		it('does not collapse once a run is drawn', () => {
			const result = rows(item({ showFill: true, showAvg: false, dispSamples: ['sample1_L'] }));
			expect(result.map((r) => r.key)).toEqual(['sample1_L']);
		});

		it('still collapses when the only run key is undrawable', () => {
			const obj = item({ showFill: true, showAvg: false });
			obj.dispSamples = ['sample9_L'];
			expect(rows(obj).map((r) => r.key)).toEqual(['fill']);
		});

		it('emits nothing when the fill has no envelope to draw', () => {
			expect(rows(item({ showFill: true, showAvg: false, envelope: undefined }))).toEqual([]);
		});
	});

	describe('main and run rows', () => {
		it('emits a row per displayed channel, then one per run, coloured by the trace', () => {
			const obj = item({
				dispChannel: ['L', 'R'],
				dispSamples: ['sample1_L'],
				colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00', samples: { sample1_L: '#123456' } }
			});
			expect(rows(obj)).toEqual([
				{ key: 'L', text: 'Phone A (L)', color: '#ff0000' },
				{ key: 'R', text: 'Phone A (R)', color: '#0000ff' },
				{ key: 'sample1_L', text: 'Phone A (Front, L)', color: '#123456' }
			]);
		});

		it('appends the set caption to the average line only', () => {
			const obj = item({
				showFill: true,
				sampleDescription: 'Pad wear',
				dispSamples: ['sample0_AVG']
			});
			expect(rows(obj).map((r) => r.text)).toEqual([
				'Phone A (AVG) Pad wear',
				'Phone A (Center, AVG)'
			]);
		});

		it('gives no row to a channel without data', () => {
			const obj = item({ dispChannel: ['L', 'R'], channels: { L: channel(80) } });
			expect(rows(obj).map((r) => r.key)).toEqual(['L']);
		});

		it('gives no row to an undrawable run key', () => {
			const obj = item({ showAvg: false });
			obj.dispSamples = ['sample0_L', 'sample9_L', 'sample0_nope' as never];
			expect(rows(obj).map((r) => r.key)).toEqual(['sample0_L']);
		});

		it('names a target without a channel tag', () => {
			const obj = item({
				type: 'target',
				identifier: 'Harman',
				channels: { AVG: channel(75) },
				colors: { AVG: '#666666' }
			});
			expect(rows(obj)).toEqual([{ key: 'AVG', text: 'Harman', color: '#666666' }]);
		});
	});

	describe('the EQ source run', () => {
		const pick = { sample: { index: 1, variant: '' } };

		it('labels the ghosted run with the average off, named by the run', () => {
			const obj = item({ showAvg: false });
			expect(rows(obj, pick)).toEqual([
				{ key: 'AVG', text: 'Phone A (Front, AVG)', color: '#00ff00' }
			]);
		});

		it('names the stand-in for the average by the run, not (AVG)', () => {
			expect(rows(item(), pick).map((r) => r.text)).toEqual(['Phone A (Front, AVG)']);
		});

		it('keeps the average label when the average itself is the source', () => {
			expect(rows(item(), { sample: null }).map((r) => r.text)).toEqual(['Phone A (AVG)']);
		});

		it('does not hang the set caption on the run', () => {
			const obj = item({ showFill: true, sampleDescription: 'Pad wear' });
			expect(rows(obj, pick).map((r) => r.text)).toEqual(['Phone A (Front, AVG)']);
		});

		it('does not collapse to the fill row while a ghosted run is on screen', () => {
			const obj = item({ showFill: true, showAvg: false });
			expect(rows(obj, pick).map((r) => r.key)).toEqual(['AVG']);
		});
	});
});
