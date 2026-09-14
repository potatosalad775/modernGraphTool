/**
 * `RankingService` — the fetching half of the ranking feature.
 *
 * Runs in the browser project because the class holds `$state` and because
 * `CONFIG_URL` resolves through a real `<script>` injection. The matching and
 * rendering it delegates to are covered by `ranking-core.spec.ts`.
 *
 * A fresh instance per test: the singleton caches a loaded sheet for the page's
 * lifetime, which is the point of it and the opposite of what a test wants.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RankingService } from './ranking-service.svelte.js';

type ConfigWindow = Window & {
	GRAPHTOOL_CONFIG?: Record<string, unknown>;
	RANKING_CONFIG?: unknown;
};

const SHEET = 'https://sheets.example/ranks.csv';
const CSV = 'Brand,Model,Rank\nSennheiser,HD 600,S\n';

function configure(ranking: Record<string, unknown>): void {
	(window as ConfigWindow).GRAPHTOOL_CONFIG = { RANKING: ranking };
}

function stubFetch(body: string, ok = true): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => ({ ok, status: ok ? 200 : 404, text: async () => body }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('RankingService', () => {
	let service: RankingService;

	beforeEach(() => {
		service = new RankingService();
	});

	afterEach(() => {
		delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
		delete (window as ConfigWindow).RANKING_CONFIG;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('stays inert — and off the network — when no sheet is configured', async () => {
		const fetchMock = stubFetch(CSV);
		configure({ URL: '/ranking/#{slug}' });

		expect(await service.load()).toBe(false);
		expect(service.status).toBe('disabled');
		expect(fetchMock).not.toHaveBeenCalled();
		expect(service.lookup('Sennheiser', 'HD 600')).toBeNull();
	});

	it('loads an inline SOURCE sheet and answers lookups from it', async () => {
		stubFetch(CSV);
		configure({ SOURCE: { CSV_URL: SHEET, SCALE: [{ value: 'S', color: '#b71c1c' }] } });

		expect(await service.load()).toBe(true);
		expect(service.status).toBe('ready');
		expect(service.lookup('Sennheiser', 'HD 600')).toMatchObject({
			value: 'S',
			slug: 'sennheiser-hd-600'
		});
		expect(service.scale).toEqual([{ value: 'S', color: '#b71c1c' }]);
	});

	it('reuses the loaded sheet until CACHE_TTL expires, then reads it again', async () => {
		const fetchMock = stubFetch(CSV);
		configure({ SOURCE: { CSV_URL: SHEET }, CACHE_TTL: 900 });

		await service.load();
		await service.load();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Past the window: the next visit to the device list picks up an edit.
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
		await service.load();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('shares one in-flight fetch between concurrent callers', async () => {
		const fetchMock = stubFetch(CSV);
		configure({ SOURCE: { CSV_URL: SHEET } });

		await Promise.all([service.load(), service.load(), service.load()]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('falls back silently when the sheet is unreachable, warning the operator once', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		stubFetch('', false);
		configure({ SOURCE: { CSV_URL: SHEET } });

		expect(await service.load()).toBe(false);
		expect(service.status).toBe('failed');
		expect(service.lookup('Sennheiser', 'HD 600')).toBeNull();

		// A panel switch inside the TTL must not retry, nor warn again.
		await service.load();
		expect(warn).toHaveBeenCalledOnce();
	});

	it('reads a squigRanking config that is already on the page', async () => {
		const fetchMock = stubFetch(CSV);
		(window as ConfigWindow).RANKING_CONFIG = {
			types: { earphone: { source: { url: SHEET } } },
			columns: [{ id: 'rank', source: 'Rank', role: 'rank', scale: [{ value: 'S' }] }]
		};
		configure({ CONFIG_URL: '/ranking/ranking-config.js', TYPE: 'earphone' });

		expect(await service.load()).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(SHEET, { cache: 'no-store' });
		expect(service.lookup('Sennheiser', 'HD 600')).toMatchObject({ value: 'S' });
	});

	it('falls back when the ranking config script cannot be loaded', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		stubFetch(CSV);
		configure({ CONFIG_URL: '/does-not-exist/ranking-config.js' });

		expect(await service.load()).toBe(false);
		expect(service.status).toBe('failed');
	});
});
