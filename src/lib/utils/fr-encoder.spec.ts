import { describe, it, expect } from 'vitest';
import { encodeFRDataForDownload, encodeSampleRunsForDownload } from './fr-encoder.js';
import type { ChannelData, FRDataObject } from '$lib/types/data-types.js';

function makeItem(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'uuid-1',
		type: 'phone',
		identifier: 'Foo Bar',
		channels: {
			L: {
				data: [
					[20, 50.111],
					[20000, 60.222]
				],
				metadata: { minFreq: 20, maxFreq: 20000 }
			},
			R: {
				data: [
					[20, 51.333],
					[20000, 61.444]
				],
				metadata: { minFreq: 20, maxFreq: 20000 }
			}
		},
		dispChannel: ['L', 'R'],
		dispSuffix: 'Variant',
		colors: { AVG: '#000' },
		dash: '1 0',
		...overrides
	};
}

describe('encodeFRDataForDownload', () => {
	it('emits one payload per displayed channel, in L/R/AVG order', () => {
		const payloads = encodeFRDataForDownload(makeItem());
		expect(payloads.map((p) => p.filename)).toEqual([
			'Foo Bar Variant L.txt',
			'Foo Bar Variant R.txt'
		]);
	});

	it('omits channels the item does not have', () => {
		const payloads = encodeFRDataForDownload(
			makeItem({
				dispChannel: ['AVG'],
				channels: { AVG: { data: [[20, 50]], metadata: { minFreq: 20, maxFreq: 20 } } }
			})
		);
		expect(payloads).toHaveLength(1);
		expect(payloads[0].filename).toBe('Foo Bar Variant AVG.txt');
	});

	it('omits channels that are loaded but not currently displayed', () => {
		// L and R are both loaded, but only L is toggled on in dispChannel — the
		// download should follow what's on screen, not everything that's cached.
		const payloads = encodeFRDataForDownload(makeItem({ dispChannel: ['L'] }));
		expect(payloads.map((p) => p.filename)).toEqual(['Foo Bar Variant L.txt']);
	});

	it('drops the suffix from the filename when absent', () => {
		const payloads = encodeFRDataForDownload(
			makeItem({
				dispSuffix: undefined,
				dispChannel: ['AVG'],
				channels: { AVG: { data: [[20, 50]], metadata: { minFreq: 20, maxFreq: 20 } } }
			})
		);
		expect(payloads[0].filename).toBe('Foo Bar AVG.txt');
	});

	it('encodes as tab-separated Frequency/dB text, one point per line, rounded to 2 decimals', () => {
		const payloads = encodeFRDataForDownload(
			makeItem({
				dispChannel: ['AVG'],
				channels: {
					AVG: {
						data: [
							[20, 50.1],
							[1000, -3.256]
						],
						metadata: { minFreq: 20, maxFreq: 1000 }
					}
				}
			})
		);
		expect(payloads[0].text).toBe('Frequency\tdB\n20.00\t50.10\n1000.00\t-3.26\n');
	});

	it('replaces characters a filename cannot hold', () => {
		const payloads = encodeFRDataForDownload(
			makeItem({ identifier: 'HD650/HD6XX', dispSuffix: 'a:b', dispChannel: ['L'] })
		);
		expect(payloads[0].filename).toBe('HD650_HD6XX a_b L.txt');
	});
});

describe('encodeSampleRunsForDownload', () => {
	const ch = (db: number): ChannelData => ({
		data: [[20, db]],
		metadata: { minFreq: 20, maxFreq: 20 }
	});

	it('emits each run on the displayed channels, named by label or fallback', () => {
		const payloads = encodeSampleRunsForDownload(
			makeItem({
				dispChannel: ['L', 'R'],
				samples: [
					{ label: 'Pad A', L: ch(1), R: ch(2), AVG: ch(1.5) },
					{ L: ch(3), R: ch(4), AVG: ch(3.5) }
				]
			})
		);
		expect(payloads.map((p) => p.filename)).toEqual([
			'Foo Bar Variant - Pad A L.txt',
			'Foo Bar Variant - Pad A R.txt',
			'Foo Bar Variant - Sample 2 L.txt',
			'Foo Bar Variant - Sample 2 R.txt'
		]);
		expect(payloads[3].text).toBe('Frequency\tdB\n20.00\t4.00\n');
	});

	it('skips channels a run lacks, and uses the given fallback label', () => {
		const payloads = encodeSampleRunsForDownload(
			makeItem({ dispChannel: ['L', 'R'], samples: [{ L: ch(1) }] }),
			(i) => `Run #${i + 1}`
		);
		expect(payloads.map((p) => p.filename)).toEqual(['Foo Bar Variant - Run #1 L.txt']);
	});

	it('is empty for an item without a sample set', () => {
		expect(encodeSampleRunsForDownload(makeItem())).toEqual([]);
	});
});
