import { describe, it, expect } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { zipTextFiles } from './zip-text.js';

async function unzip(blob: Blob): Promise<Record<string, string>> {
	const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
	return Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, strFromU8(data)]));
}

describe('zipTextFiles', () => {
	it('round-trips every file, typed as a zip', async () => {
		const blob = await zipTextFiles([
			{ filename: 'A L.txt', text: 'one' },
			{ filename: 'A R.txt', text: 'two' }
		]);
		expect(blob.type).toBe('application/zip');
		expect(await unzip(blob)).toEqual({ 'A L.txt': 'one', 'A R.txt': 'two' });
	});

	it('keeps files that share a name instead of overwriting one', async () => {
		const blob = await zipTextFiles([
			{ filename: 'A - Pad L.txt', text: '1' },
			{ filename: 'A - Pad L.txt', text: '2' },
			{ filename: 'A - Pad L.txt', text: '3' }
		]);
		expect(await unzip(blob)).toEqual({
			'A - Pad L.txt': '1',
			'A - Pad L (2).txt': '2',
			'A - Pad L (3).txt': '3'
		});
	});
});
