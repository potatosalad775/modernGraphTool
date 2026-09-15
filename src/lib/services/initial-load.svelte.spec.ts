import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MetadataParser from '$lib/utils/metadata-parser.js';
import { startInitialLoad, claimInitialLoad } from './initial-load.js';

describe('initial load hand-off', () => {
	let init: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// No INITIAL_PHONES / INITIAL_TARGETS, so a run touches nothing past the phone book.
		window.GRAPHTOOL_CONFIG = {};
		init = vi.spyOn(MetadataParser, 'init').mockResolvedValue();
	});

	afterEach(() => {
		init.mockRestore();
	});

	it('lets the mount claim the run the client hook started', async () => {
		startInitialLoad();
		startInitialLoad();
		await claimInitialLoad();

		expect(init).toHaveBeenCalledTimes(1);
	});

	it('starts a fresh run for every claim once the early one is taken', async () => {
		startInitialLoad();
		await claimInitialLoad();
		await claimInitialLoad();

		expect(init).toHaveBeenCalledTimes(2);
	});
});
