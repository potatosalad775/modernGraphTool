import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MetadataParser from '#lib/utils/metadata-parser.js';
import { urlProvider } from '#lib/services/url-provider.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { dataProvider } from './data-provider.svelte.js';
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

describe('initial selection', () => {
	const band = { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 } as const;
	let addFRData: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		window.GRAPHTOOL_CONFIG = { INITIAL_PHONES: ['Default Phone'] } as never;
		vi.spyOn(MetadataParser, 'init').mockResolvedValue();
		vi.spyOn(MetadataParser, 'searchFRInfoWithFullName').mockReturnValue({
			identifier: 'Default Phone',
			dispSuffix: ''
		} as never);
		addFRData = vi.spyOn(dataProvider, 'addFRData').mockResolvedValue(undefined as never);
		frStore.clear();
		eqStore.filters = [];
		eqStore.isEnabled = false;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		sessionStorage.clear();
		eqStore.filters = [];
		eqStore.isEnabled = false;
		delete (window as { GRAPHTOOL_CONFIG?: unknown }).GRAPHTOOL_CONFIG;
	});

	it('loads the config defaults on an ordinary visit', async () => {
		await claimInitialLoad();

		expect(addFRData).toHaveBeenCalledWith('phone', 'Default Phone', { dispSuffix: '' });
	});

	it('keeps an emptied session empty, with its EQ, after a reload', async () => {
		eqStore.filters = [band];
		eqStore.isEnabled = true;
		urlProvider.keepAcrossReload();
		eqStore.filters = [];
		eqStore.isEnabled = false;

		await claimInitialLoad();

		expect(addFRData).not.toHaveBeenCalled();
		expect(eqStore.filters).toHaveLength(1);
		expect(eqStore.isEnabled).toBe(true);
	});
});
