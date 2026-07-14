import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AggregateIndexService } from './aggregate-index.svelte.js';
import {
	buildShareUrl,
	DEFAULT_INDEX_URLS,
	deriveShareSlug,
	getCrossSiteSearchConfig,
	sortCrossSiteResults,
	MAX_RESULTS
} from './aggregate-index-core.js';
import type { AggregateIndex, CrossSiteSearchResult } from '$lib/types/aggregate-index-types.js';

const OFFICIAL_URLS = DEFAULT_INDEX_URLS;

/** Narrow view of the operator config global the tests write to. */
type ConfigWindow = Window & { GRAPHTOOL_CONFIG?: Record<string, unknown> };

function setConfig(config: Record<string, unknown>) {
	(window as ConfigWindow).GRAPHTOOL_CONFIG = config;
}

function clearConfig() {
	delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
}

function makeIndex(overrides: Partial<AggregateIndex> = {}): AggregateIndex {
	return {
		v: 2,
		generatedAt: '2026-07-13T09:39:19.816Z',
		phonesFormat: 'flat',
		brands: ['64Audio', 'Sennheiser'],
		sites: [
			{ id: 'alice', name: 'Alice', url: 'https://alice.squig.link' },
			{ id: 'bob', name: 'Bob', url: 'https://bob.squig.link' }
		],
		dbs: [
			{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' },
			{
				id: 'bob:hp',
				siteId: 'bob',
				type: 'Headphones',
				url: 'https://bob.squig.link/headphones/',
				deltaReady: true
			}
		],
		phones: [
			{ db: 'alice:iems', b: 0, n: 'U12t', s: '64Audio_U12t' },
			{ db: 'bob:hp', b: 1, n: 'HD 600', s: 'Sennheiser_HD_600' }
		],
		...overrides
	};
}

/** Stubs fetch so each URL either resolves to an index document or fails. */
function stubFetch(responders: Record<string, AggregateIndex | number>) {
	const fetchMock = vi.fn(async (input: string | URL | Request) => {
		const url = String(input);
		const responder = responders[url];
		if (responder === undefined) throw new TypeError('Failed to fetch');
		if (typeof responder === 'number') {
			return new Response(null, { status: responder });
		}
		return new Response(JSON.stringify(responder), { status: 200 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function makeResult(overrides: Partial<CrossSiteSearchResult> = {}): CrossSiteSearchResult {
	return {
		siteId: 'alice',
		siteName: 'Alice',
		dbId: 'alice:iems',
		dbType: 'IEMs',
		deltaReady: false,
		brand: '64Audio',
		phoneName: 'U12t',
		url: 'https://alice.squig.link/?share=64Audio_U12t',
		...overrides
	};
}

describe('cross-site search helpers', () => {
	describe('deriveShareSlug', () => {
		it('joins brand and name with underscores', () => {
			expect(deriveShareSlug('Campfire Audio', 'Andromeda (2023)')).toBe(
				'Campfire_Audio_Andromeda_(2023)'
			);
		});
	});

	describe('buildShareUrl', () => {
		// `+` would otherwise be decoded back as a space by the receiving site.
		it('percent-encodes slugs carrying URL-significant characters', () => {
			expect(buildShareUrl('https://alice.squig.link/', 'CCA_CRA+')).toBe(
				'https://alice.squig.link/?share=CCA_CRA%2B'
			);
			expect(buildShareUrl('https://alice.squig.link/', 'Tipsy_x_EPZ_Star_&_One')).toBe(
				'https://alice.squig.link/?share=Tipsy_x_EPZ_Star_%26_One'
			);
		});

		it('preserves the database folder path', () => {
			expect(buildShareUrl('https://bob.squig.link/headphones/', 'Sennheiser_HD_600')).toBe(
				'https://bob.squig.link/headphones/?share=Sennheiser_HD_600'
			);
		});
	});

	describe('sortCrossSiteResults', () => {
		it('orders by rig class, then delta-ready, then site, then device', () => {
			const sorted = sortCrossSiteResults([
				makeResult({ dbType: 'Earbuds', phoneName: 'Earbud' }),
				makeResult({ dbType: 'IEMs', siteName: 'Zoe', phoneName: 'IEM Zoe' }),
				makeResult({ dbType: 'IEMs', siteName: 'Alice', phoneName: 'IEM Alice' }),
				makeResult({ dbType: 'IEMs', deltaReady: true, siteName: 'Zoe', phoneName: 'IEM Delta' }),
				makeResult({ dbType: '5128', phoneName: '5128 Device' })
			]);

			expect(sorted.map((r) => r.phoneName)).toEqual([
				'5128 Device',
				'IEM Delta',
				'IEM Alice',
				'IEM Zoe',
				'Earbud'
			]);
		});

		it('sorts unknown rig classes after the known ones', () => {
			const sorted = sortCrossSiteResults([
				makeResult({ dbType: 'Speakers', phoneName: 'Speaker' }),
				makeResult({ dbType: 'Earbuds', phoneName: 'Earbud' })
			]);
			expect(sorted.map((r) => r.dbType)).toEqual(['Earbuds', 'Speakers']);
		});
	});

	describe('getCrossSiteSearchConfig', () => {
		afterEach(clearConfig);

		it('defaults to enabled with the official index URLs when unconfigured', () => {
			const config = getCrossSiteSearchConfig();
			expect(config.ENABLED).toBe(true);
			expect(config.INDEX_URLS).toEqual(OFFICIAL_URLS);
			expect(config.SQUIGLINK_FALLBACK).toBe(true);
		});

		it('falls back to the deprecated squig.link toggle', () => {
			setConfig({ SQUIGLINK: { ENABLE_CROSS_SITE_SEARCH: false } });
			expect(getCrossSiteSearchConfig().ENABLED).toBe(false);
		});

		it('lets CROSS_SITE_SEARCH.ENABLED win over the deprecated toggle', () => {
			setConfig({
				CROSS_SITE_SEARCH: { ENABLED: true },
				SQUIGLINK: { ENABLE_CROSS_SITE_SEARCH: false }
			});
			expect(getCrossSiteSearchConfig().ENABLED).toBe(true);
		});

		it('uses operator INDEX_URLS when provided', () => {
			setConfig({ CROSS_SITE_SEARCH: { INDEX_URLS: ['https://example.com/index.json', ''] } });
			expect(getCrossSiteSearchConfig().INDEX_URLS).toEqual(['https://example.com/index.json']);
		});

		it('falls back to the official URLs when INDEX_URLS is empty', () => {
			setConfig({ CROSS_SITE_SEARCH: { INDEX_URLS: [] } });
			expect(getCrossSiteSearchConfig().INDEX_URLS).toEqual(OFFICIAL_URLS);
		});
	});
});

describe('AggregateIndexService', () => {
	let service: AggregateIndexService;

	beforeEach(() => {
		service = new AggregateIndexService();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearConfig();
	});

	describe('load', () => {
		it('indexes the primary URL and reports ready', async () => {
			stubFetch({ [OFFICIAL_URLS[0]]: makeIndex() });

			await expect(service.load()).resolves.toBe(true);
			expect(service.status).toBe('ready');
			expect(service.generatedAt).toBe('2026-07-13T09:39:19.816Z');
		});

		it('falls through to the mirror when the primary URL fails', async () => {
			const fetchMock = stubFetch({
				[OFFICIAL_URLS[0]]: 500,
				[OFFICIAL_URLS[1]]: makeIndex()
			});

			await expect(service.load()).resolves.toBe(true);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(service.search('u12t').results).toHaveLength(1);
		});

		it('reports failure when every URL is unreachable', async () => {
			stubFetch({});

			await expect(service.load()).resolves.toBe(false);
			expect(service.status).toBe('failed');
			expect(service.search('u12t')).toEqual({ results: [], total: 0 });
		});

		it('rejects a document that is missing the expected arrays', async () => {
			stubFetch({ [OFFICIAL_URLS[0]]: { v: 2 } as unknown as AggregateIndex });

			await expect(service.load()).resolves.toBe(false);
			expect(service.status).toBe('failed');
		});

		it('fetches once for concurrent callers', async () => {
			const fetchMock = stubFetch({ [OFFICIAL_URLS[0]]: makeIndex() });

			await Promise.all([service.load(), service.load(), service.load()]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('search', () => {
		it('matches on brand and on device name', async () => {
			stubFetch({ [OFFICIAL_URLS[0]]: makeIndex() });
			await service.load();

			expect(service.search('64audio').results.map((r) => r.phoneName)).toEqual(['U12t']);
			expect(service.search('hd 6').results.map((r) => r.phoneName)).toEqual(['HD 600']);
		});

		it('ignores queries shorter than 2 characters', async () => {
			stubFetch({ [OFFICIAL_URLS[0]]: makeIndex() });
			await service.load();

			expect(service.search('u')).toEqual({ results: [], total: 0 });
		});

		it('carries database metadata onto each hit', async () => {
			stubFetch({ [OFFICIAL_URLS[0]]: makeIndex() });
			await service.load();

			expect(service.search('hd 600').results[0]).toEqual({
				siteId: 'bob',
				siteName: 'Bob',
				dbId: 'bob:hp',
				dbType: 'Headphones',
				deltaReady: true,
				brand: 'Sennheiser',
				phoneName: 'HD 600',
				url: 'https://bob.squig.link/headphones/?share=Sennheiser_HD_600'
			});
		});

		it('reads the collapsed phones format', async () => {
			stubFetch({
				[OFFICIAL_URLS[0]]: makeIndex({
					phonesFormat: 'collapsed',
					phones: [
						{
							b: 0,
							n: 'U12t',
							m: [{ db: 'alice:iems', s: '64Audio_U12t' }, { db: 'bob:hp' }]
						}
					]
				})
			});
			await service.load();

			const results = service.search('u12t').results;
			expect(results).toHaveLength(2);
			expect(results.map((r) => r.url)).toEqual([
				// Rig class outranks delta-ready, so the IEM db comes first.
				'https://alice.squig.link/?share=64Audio_U12t',
				'https://bob.squig.link/headphones/?share=64Audio_U12t'
			]);
		});

		it('derives the share slug when the index omits one', async () => {
			stubFetch({
				[OFFICIAL_URLS[0]]: makeIndex({
					phonesFormat: 'collapsed',
					brands: ['Campfire Audio'],
					phones: [{ b: 0, n: 'Andromeda 2023', m: [{ db: 'alice:iems' }] }]
				})
			});
			await service.load();

			expect(service.search('andromeda').results[0].url).toBe(
				'https://alice.squig.link/?share=Campfire_Audio_Andromeda_2023'
			);
		});

		it('drops measurements pointing at an unknown database', async () => {
			stubFetch({
				[OFFICIAL_URLS[0]]: makeIndex({
					phones: [{ db: 'ghost:iems', b: 0, n: 'U12t', s: '64Audio_U12t' }]
				})
			});
			await service.load();

			expect(service.search('u12t').results).toEqual([]);
		});

		it('excludes databases hosted on the current site', async () => {
			const host = window.location.origin;
			stubFetch({
				[OFFICIAL_URLS[0]]: makeIndex({
					sites: [
						{ id: 'self', name: 'This Site', url: host },
						{ id: 'bob', name: 'Bob', url: 'https://bob.squig.link' }
					],
					dbs: [
						{ id: 'self:iems', siteId: 'self', type: 'IEMs', url: `${host}/` },
						{ id: 'bob:iems', siteId: 'bob', type: 'IEMs', url: 'https://bob.squig.link/' }
					],
					phones: [
						{ db: 'self:iems', b: 0, n: 'U12t', s: '64Audio_U12t' },
						{ db: 'bob:iems', b: 0, n: 'U12t', s: '64Audio_U12t' }
					]
				})
			});
			await service.load();

			const results = service.search('u12t').results;
			expect(results).toHaveLength(1);
			expect(results[0].siteId).toBe('bob');
		});

		it('caps results and reports the uncapped total', async () => {
			const phoneCount = MAX_RESULTS + 25;
			stubFetch({
				[OFFICIAL_URLS[0]]: makeIndex({
					phones: Array.from({ length: phoneCount }, (_, i) => ({
						db: 'alice:iems',
						b: 0,
						n: `U12t ${i}`,
						s: `64Audio_U12t_${i}`
					}))
				})
			});
			await service.load();

			const hits = service.search('u12t');
			expect(hits.results).toHaveLength(MAX_RESULTS);
			expect(hits.total).toBe(phoneCount);
		});
	});
});
