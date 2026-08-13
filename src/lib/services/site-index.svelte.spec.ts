import { describe, it, expect, afterEach, vi } from 'vitest';
import { SiteIndexService } from './site-index.svelte.js';
import {
	buildSiteEntries,
	DEFAULT_SITE_INDEX_URLS,
	fetchSiteIndex,
	findCurrentDbId,
	getSiteSelectorConfig,
	groupSiteEntries
} from './site-index-core.js';
import type { SiteIndex } from '$lib/types/site-index-types.js';

/** Narrow view of the operator config global the tests write to. */
type ConfigWindow = Window & { GRAPHTOOL_CONFIG?: Record<string, unknown> };

function setConfig(config: Record<string, unknown>) {
	(window as ConfigWindow).GRAPHTOOL_CONFIG = config;
}

function makeIndex(overrides: Partial<SiteIndex> = {}): SiteIndex {
	return {
		v: 1,
		generatedAt: '2026-08-13T08:00:00.000Z',
		sites: [
			{ id: 'alice', name: 'Alice', url: 'https://alice.squig.link', source: 'squigsites' },
			{ id: 'bob', name: 'Bob', url: 'https://bob.squig.link', source: 'squigsites' },
			{ id: 'carol', name: 'Carol', url: 'https://carol.example.com', source: 'federated' }
		],
		dbs: [
			{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' },
			{
				id: 'alice:hp',
				siteId: 'alice',
				type: 'Headphones',
				url: 'https://alice.squig.link/headphones/',
				verified: false
			},
			{
				id: 'bob:5128',
				siteId: 'bob',
				type: '5128',
				url: 'https://bob.squig.link/',
				deltaReady: true
			},
			{ id: 'carol:iems', siteId: 'carol', type: 'IEMs', url: 'https://carol.example.com/' }
		],
		...overrides
	};
}

/** Stubs fetch so each URL either resolves to an index document or fails. */
function stubFetch(responders: Record<string, SiteIndex | number>) {
	const fetchMock = vi.fn(async (input: string | URL | Request) => {
		const url = String(input);
		const responder = responders[url];
		if (responder === undefined) throw new TypeError('Failed to fetch');
		if (typeof responder === 'number') return new Response(null, { status: responder });
		return new Response(JSON.stringify(responder), { status: 200 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
});

describe('getSiteSelectorConfig', () => {
	it('defaults to auto with the official index when the section is absent', () => {
		const config = getSiteSelectorConfig();

		expect(config.ENABLED).toBe('auto');
		expect(config.INDEX_URLS).toEqual(DEFAULT_SITE_INDEX_URLS);
	});

	it('keeps an explicit boolean', () => {
		setConfig({ SITE_SELECTOR: { ENABLED: false } });
		expect(getSiteSelectorConfig().ENABLED).toBe(false);

		setConfig({ SITE_SELECTOR: { ENABLED: true } });
		expect(getSiteSelectorConfig().ENABLED).toBe(true);
	});

	it('falls back to auto for a value that is neither boolean nor auto', () => {
		setConfig({ SITE_SELECTOR: { ENABLED: 'yes' } });
		expect(getSiteSelectorConfig().ENABLED).toBe('auto');
	});

	it('takes operator index URLs over the official one', () => {
		setConfig({ SITE_SELECTOR: { INDEX_URLS: ['https://self.hosted/index.json'] } });
		expect(getSiteSelectorConfig().INDEX_URLS).toEqual(['https://self.hosted/index.json']);
	});

	it('ignores an empty or blank URL list', () => {
		setConfig({ SITE_SELECTOR: { INDEX_URLS: ['', '  '] } });
		expect(getSiteSelectorConfig().INDEX_URLS).toEqual(DEFAULT_SITE_INDEX_URLS);
	});
});

describe('findCurrentDbId', () => {
	const index = makeIndex();

	it('matches the database the tool is served from', () => {
		expect(findCurrentDbId(index, 'https://alice.squig.link/')).toBe('alice:iems');
	});

	it('prefers the longest path match over the site root', () => {
		// Both `/` and `/headphones/` match this location; the root database would
		// otherwise claim every folder on the site.
		expect(findCurrentDbId(index, 'https://alice.squig.link/headphones/')).toBe('alice:hp');
	});

	it('ignores a missing trailing slash', () => {
		expect(findCurrentDbId(index, 'https://alice.squig.link/headphones')).toBe('alice:hp');
	});

	it('ignores query strings and fragments', () => {
		expect(findCurrentDbId(index, 'https://alice.squig.link/?share=Sennheiser_HD_600')).toBe(
			'alice:iems'
		);
	});

	it('is case-insensitive on the host', () => {
		expect(findCurrentDbId(index, 'https://ALICE.squig.link/')).toBe('alice:iems');
	});

	it('returns null for a deployment that is not listed', () => {
		expect(findCurrentDbId(index, 'https://unknown.example.org/')).toBeNull();
	});

	it('does not match a sibling path that merely shares a prefix', () => {
		const siblings = makeIndex({
			dbs: [
				{ id: 'x:hp', siteId: 'alice', type: 'Headphones', url: 'https://alice.squig.link/hp/' }
			]
		});

		expect(findCurrentDbId(siblings, 'https://alice.squig.link/hpx/')).toBeNull();
	});
});

describe('buildSiteEntries', () => {
	it('joins each database to its owning site', () => {
		const entries = buildSiteEntries(makeIndex(), null);

		expect(entries).toHaveLength(4);
		expect(entries[0]).toMatchObject({
			dbId: 'alice:iems',
			siteId: 'alice',
			siteName: 'Alice',
			type: 'IEMs',
			url: 'https://alice.squig.link/',
			deltaReady: false,
			verified: true,
			isCurrent: false
		});
	});

	it('marks the current database', () => {
		const entries = buildSiteEntries(makeIndex(), 'bob:5128');

		expect(entries.filter((entry) => entry.isCurrent).map((entry) => entry.dbId)).toEqual([
			'bob:5128'
		]);
	});

	it('carries the unverified flag through', () => {
		const entries = buildSiteEntries(makeIndex(), null);

		expect(entries.find((entry) => entry.dbId === 'alice:hp')!.verified).toBe(false);
	});

	it('treats an absent verified flag as verified', () => {
		// Only GAA-shaped documents carry it; an aggregator-shaped one is verified
		// by construction, so a missing flag must not dim every entry.
		const entries = buildSiteEntries(makeIndex(), null);

		expect(entries.find((entry) => entry.dbId === 'alice:iems')!.verified).toBe(true);
	});

	it('drops a database whose site is missing', () => {
		const orphaned = makeIndex({
			dbs: [{ id: 'ghost:iems', siteId: 'ghost', type: 'IEMs', url: 'https://ghost.test/' }]
		});

		expect(buildSiteEntries(orphaned, null)).toEqual([]);
	});

	it('drops a database with no usable URL', () => {
		const broken = makeIndex({
			dbs: [{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: '' }]
		});

		expect(buildSiteEntries(broken, null)).toEqual([]);
	});
});

describe('groupSiteEntries', () => {
	it('orders rig classes by measurement quality, not alphabetically', () => {
		const groups = groupSiteEntries(buildSiteEntries(makeIndex(), null));

		expect(groups.map((group) => group.type)).toEqual(['5128', 'IEMs', 'Headphones']);
	});

	it('sorts sites alphabetically within a group', () => {
		const index = makeIndex({
			dbs: [
				{ id: 'carol:iems', siteId: 'carol', type: 'IEMs', url: 'https://carol.example.com/' },
				{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' }
			]
		});

		const iems = groupSiteEntries(buildSiteEntries(index, null))[0];
		expect(iems.entries.map((entry) => entry.siteName)).toEqual(['Alice', 'Carol']);
	});

	it('sorts an unknown rig class last', () => {
		const index = makeIndex({
			dbs: [
				{
					id: 'a:weird',
					siteId: 'alice',
					type: 'Bone Conduction',
					url: 'https://alice.squig.link/b/'
				},
				{ id: 'a:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' }
			]
		});

		expect(groupSiteEntries(buildSiteEntries(index, null)).map((g) => g.type)).toEqual([
			'IEMs',
			'Bone Conduction'
		]);
	});
});

describe('fetchSiteIndex', () => {
	it('returns the first mirror that answers', async () => {
		const index = makeIndex();
		stubFetch({ 'https://a.test/i.json': 500, 'https://b.test/i.json': index });

		const result = await fetchSiteIndex(['https://a.test/i.json', 'https://b.test/i.json']);

		expect(result).toEqual(index);
	});

	it('skips a mirror that throws', async () => {
		const index = makeIndex();
		stubFetch({ 'https://b.test/i.json': index });

		expect(await fetchSiteIndex(['https://dead.test/i.json', 'https://b.test/i.json'])).toEqual(
			index
		);
	});

	it('rejects a document missing the expected arrays', async () => {
		stubFetch({ 'https://a.test/i.json': { v: 1, generatedAt: 'x' } as unknown as SiteIndex });

		expect(await fetchSiteIndex(['https://a.test/i.json'])).toBeNull();
	});

	it('returns null when every mirror fails', async () => {
		stubFetch({});

		expect(await fetchSiteIndex(['https://a.test/i.json'])).toBeNull();
	});
});

describe('SiteIndexService', () => {
	it('loads, flattens and groups the index', async () => {
		setConfig({ SITE_SELECTOR: { INDEX_URLS: ['https://a.test/i.json'] } });
		stubFetch({ 'https://a.test/i.json': makeIndex() });
		const service = new SiteIndexService();

		expect(await service.load()).toBe(true);
		expect(service.status).toBe('ready');
		expect(service.isReady).toBe(true);
		expect(service.entries).toHaveLength(4);
		expect(service.generatedAt).toBe('2026-08-13T08:00:00.000Z');
		expect(service.groups.map((group) => group.type)).toEqual(['5128', 'IEMs', 'Headphones']);
	});

	it('fetches once for concurrent callers', async () => {
		setConfig({ SITE_SELECTOR: { INDEX_URLS: ['https://a.test/i.json'] } });
		const fetchMock = stubFetch({ 'https://a.test/i.json': makeIndex() });
		const service = new SiteIndexService();

		await Promise.all([service.load(), service.load()]);
		await service.load();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports failure and retries on the next call', async () => {
		setConfig({ SITE_SELECTOR: { INDEX_URLS: ['https://a.test/i.json'] } });
		const fetchMock = stubFetch({});
		const service = new SiteIndexService();

		expect(await service.load()).toBe(false);
		expect(service.status).toBe('failed');
		expect(service.entries).toEqual([]);

		// Page-lifetime singleton: a later interaction must be able to try again.
		await service.load();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('reports no current entry for a deployment that is not listed', async () => {
		setConfig({ SITE_SELECTOR: { INDEX_URLS: ['https://a.test/i.json'] } });
		stubFetch({ 'https://a.test/i.json': makeIndex() });
		const service = new SiteIndexService();

		await service.load();

		// The spec host is localhost, which no fixture site claims.
		expect(service.currentDbId).toBeNull();
		expect(service.currentEntry).toBeNull();
	});
});
