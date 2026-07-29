/**
 * The exported singleton is constructed against the real `window.location`, so
 * on a localhost test host it is permanently disabled — every fetch method
 * early-returns. Tests that need the enabled store build a fresh instance with
 * `SQUIGLINK.DEBUG` set, which is the same escape hatch operators use to
 * develop off-domain (see `enabledStore` below).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { squiglinkStore, SquiglinkStore } from './squiglink-store.svelte.js';
import type { SquiglinkSite, ShopLinkEntry } from '$lib/types/squiglink-types.js';

function makeSite(overrides: Partial<SquiglinkSite> = {}): SquiglinkSite {
	return {
		username: 'testsite',
		name: 'Test Site',
		urlType: 'subdomain',
		dbs: [{ type: 'IEM', folder: 'data' }],
		...overrides
	};
}

function makeShopLink(overrides: Partial<ShopLinkEntry> = {}): ShopLinkEntry {
	return {
		model: 'Test Model',
		squiglink_url: 'https://squig.link/test',
		embed_code: '',
		type: 'IEM',
		hfg_com: '',
		hfg_amzus: '',
		hfg_amzjp: '',
		hfg_ali: '',
		...overrides
	};
}

describe('SquiglinkStore', () => {
	// ── buildSiteUrl ──────────────────────────────────────────────────────

	describe('buildSiteUrl', () => {
		it('builds root URL for root urlType', () => {
			const site = makeSite({ urlType: 'root' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://squig.link');
		});

		it('uses altDomain when urlType is altDomain and altDomain is set', () => {
			const site = makeSite({ urlType: 'altDomain', altDomain: 'https://custom.example.com' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://custom.example.com');
		});

		it('falls back to subdomain URL when altDomain urlType but altDomain is missing', () => {
			const site = makeSite({ urlType: 'altDomain', username: 'bob' });
			// altDomain is undefined, so fallback: `https://${username}.squig.link`
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://bob.squig.link');
		});

		it('builds subdomain URL for subdomain urlType', () => {
			const site = makeSite({ urlType: 'subdomain', username: 'alice' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://alice.squig.link');
		});

		it('builds lab folder URL for labFolder urlType', () => {
			const site = makeSite({ urlType: 'labFolder', username: 'labuser' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://squig.link/lab/labuser');
		});

		it('defaults to subdomain for unknown urlType', () => {
			const site = makeSite({
				urlType: 'unknown' as unknown as SquiglinkSite['urlType'],
				username: 'fallback'
			});
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://fallback.squig.link');
		});
	});

	// ── findShopLink ──────────────────────────────────────────────────────

	describe('findShopLink', () => {
		beforeEach(() => {
			squiglinkStore.shopLinks = [];
		});

		it('returns undefined when shopLinks is empty', () => {
			expect(squiglinkStore.findShopLink('Test Model')).toBeUndefined();
		});

		it('finds exact case-insensitive match', () => {
			squiglinkStore.shopLinks = [
				makeShopLink({ model: 'Sennheiser HD 600' }),
				makeShopLink({ model: 'Moondrop Blessing 3' })
			];
			const result = squiglinkStore.findShopLink('sennheiser hd 600');
			expect(result).toBeDefined();
			expect(result!.model).toBe('Sennheiser HD 600');
		});

		it('returns undefined when no match', () => {
			squiglinkStore.shopLinks = [makeShopLink({ model: 'Sennheiser HD 600' })];
			expect(squiglinkStore.findShopLink('NonExistent')).toBeUndefined();
		});
	});

	// ── searchResults ─────────────────────────────────────────────────────

	describe('searchResults', () => {
		beforeEach(() => {
			squiglinkStore.searchQuery = '';
			squiglinkStore.sites = [];
			squiglinkStore.shopLinks = [];
		});

		it('returns empty array for query shorter than 2 chars', () => {
			squiglinkStore.searchQuery = 'a';
			expect(squiglinkStore.searchResults).toEqual([]);
		});

		it('returns empty array for empty query', () => {
			squiglinkStore.searchQuery = '';
			expect(squiglinkStore.searchResults).toEqual([]);
		});

		it('returns empty when no phoneBooks loaded', () => {
			squiglinkStore.sites = [makeSite({ username: 'othersite' })];
			squiglinkStore.searchQuery = 'HD 600';
			expect(squiglinkStore.searchResults).toEqual([]);
		});
	});

	// ── Domain guard ──────────────────────────────────────────────────────

	describe('domain guard', () => {
		it('is inert on a non-squig.link host', () => {
			// The whole integration hangs off this: the singleton built against a
			// localhost `window.location` must never fetch squig.link endpoints.
			expect(squiglinkStore.isSquiglinkHost).toBe(false);
			expect(squiglinkStore.isEnabled).toBe(false);
		});

		it('reports no current site while disabled', () => {
			expect(squiglinkStore.currentSiteUsername).toBeNull();
			expect(squiglinkStore.isCurrentSiteOptedOut).toBe(false);
		});

		it('refuses sponsor product lookups while disabled', async () => {
			await expect(
				squiglinkStore.fetchSponsorProductData('https://shop.test/x')
			).resolves.toBeNull();
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Everything below runs against a store instance that believes it is hosted
// on squig.link, which is the only configuration where the fetch paths do
// anything at all.
// ─────────────────────────────────────────────────────────────────────────

/** Fresh instance with the domain guard satisfied via `SQUIGLINK.DEBUG`. */
function enabledStore(config: Record<string, unknown> = { DEBUG: true }): SquiglinkStore {
	window.GRAPHTOOL_CONFIG = { SQUIGLINK: config } as never;
	return new SquiglinkStore();
}

/** A site with a single root-folder database — the common single-db layout. */
function rootDbSite(overrides: Partial<SquiglinkSite> = {}): SquiglinkSite {
	return makeSite({ username: 'alice', dbs: [{ type: 'IEMs', folder: '/' }], ...overrides });
}

function jsonResponse(body: unknown, ok = true, status = 200) {
	return {
		ok,
		status,
		json: async () => body,
		text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
	};
}

describe('SquiglinkStore (enabled)', () => {
	let store: SquiglinkStore;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		store = enabledStore();
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete (window as { GRAPHTOOL_CONFIG?: unknown }).GRAPHTOOL_CONFIG;
		delete (window as unknown as Record<string, unknown>).sponsorDetails;
		delete (window as unknown as Record<string, unknown>).contentSponsor;
	});

	it('treats a DEBUG deployment as a squig.link host', () => {
		expect(store.isSquiglinkHost).toBe(true);
		expect(store.isEnabled).toBe(true);
	});

	it('stays disabled when the operator turns the section off', () => {
		const off = enabledStore({ DEBUG: true, ENABLED: false });

		expect(off.isSquiglinkHost).toBe(true);
		expect(off.isEnabled).toBe(false);
	});

	// ── Site registry ─────────────────────────────────────────────────────

	describe('fetchSiteRegistry', () => {
		it('loads the registry from the root domain', async () => {
			const sites = [makeSite({ username: 'alice' })];
			fetchMock.mockResolvedValue(jsonResponse(sites));

			await store.fetchSiteRegistry();

			expect(fetchMock).toHaveBeenCalledWith('https://squig.link/squigsites.json');
			expect(store.sites).toEqual(sites);
			expect(store.error).toBeNull();
			expect(store.isLoading).toBe(false);
		});

		it('records the status code when the registry is missing', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await store.fetchSiteRegistry();

			expect(store.sites).toEqual([]);
			expect(store.error).toBe('Failed to fetch site registry: 404');
			expect(store.isLoading).toBe(false);
		});

		it('records a network failure', async () => {
			fetchMock.mockRejectedValue(new Error('offline'));

			await store.fetchSiteRegistry();

			expect(store.error).toBe('offline');
		});

		it('fetches only once per session', async () => {
			fetchMock.mockResolvedValue(jsonResponse([makeSite()]));

			await store.fetchSiteRegistry();
			await store.fetchSiteRegistry();

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('retries after a failure, since nothing was cached', async () => {
			fetchMock.mockRejectedValueOnce(new Error('offline'));
			fetchMock.mockResolvedValueOnce(jsonResponse([makeSite()]));

			await store.fetchSiteRegistry();
			await store.fetchSiteRegistry();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(store.error).toBeNull();
		});
	});

	// ── Phone books ───────────────────────────────────────────────────────

	describe('fetchPhoneBook', () => {
		const BRANDS = [{ name: 'Sennheiser', phones: [{ name: 'HD 600' }] }];

		it('requests one phone_book.json per database', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ brandPhones: BRANDS }));
			const site = makeSite({
				username: 'alice',
				dbs: [
					{ type: 'IEMs', folder: '/' },
					{ type: 'Headphones', folder: '/headphones' }
				]
			});

			await store.fetchPhoneBook(site);

			// Every squig site keeps its phone book under `<folder>/data/`.
			expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
				'https://alice.squig.link/data/phone_book.json',
				'https://alice.squig.link/headphones/data/phone_book.json'
			]);
		});

		it('accepts a bare array as well as the brandPhones wrapper', async () => {
			fetchMock.mockResolvedValue(jsonResponse(BRANDS));

			await store.fetchPhoneBook(rootDbSite());

			expect(store.getPhoneBook('alice', '/')).toEqual(BRANDS);
		});

		it('drops the trailing slash from a folder when building the URL', async () => {
			fetchMock.mockResolvedValue(jsonResponse(BRANDS));

			await store.fetchPhoneBook(
				makeSite({ username: 'alice', dbs: [{ type: 'IEMs', folder: '/headphones/' }] })
			);

			expect(fetchMock.mock.calls[0][0]).toBe(
				'https://alice.squig.link/headphones/data/phone_book.json'
			);
		});

		it('treats a database with no folder as the site root', async () => {
			fetchMock.mockResolvedValue(jsonResponse(BRANDS));

			await store.fetchPhoneBook(
				makeSite({ username: 'alice', dbs: [{ type: 'IEMs', folder: '' }] })
			);

			expect(fetchMock.mock.calls[0][0]).toBe('https://alice.squig.link/data/phone_book.json');
			expect(store.getPhoneBook('alice')).toEqual(BRANDS);
		});

		it('skips a database that 404s', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await store.fetchPhoneBook(rootDbSite());

			expect(store.getPhoneBook('alice', '/')).toBeUndefined();
		});

		it('skips a database whose request throws', async () => {
			fetchMock.mockRejectedValue(new Error('CORS'));

			await store.fetchPhoneBook(rootDbSite());

			expect(store.getPhoneBook('alice', '/')).toBeUndefined();
		});

		it('does not refetch a database it already holds', async () => {
			fetchMock.mockResolvedValue(jsonResponse(BRANDS));
			const site = rootDbSite();

			await store.fetchPhoneBook(site);
			await store.fetchPhoneBook(site);

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	// ── Fallback search ───────────────────────────────────────────────────

	describe('searchResults', () => {
		const BRANDS = [
			{ name: 'Sennheiser', phones: [{ name: 'HD 600' }, { name: 'HD 800 S' }] },
			{ name: 'Moondrop', phones: [{ name: 'Blessing 3' }] }
		];

		async function seed(site: SquiglinkSite, brands: unknown = BRANDS) {
			fetchMock.mockResolvedValue(jsonResponse(brands));
			store.sites = [site];
			await store.fetchPhoneBook(site);
		}

		it('matches on "<brand> <model>"', async () => {
			await seed(rootDbSite({ name: 'Alice Audio' }));
			store.searchQuery = 'sennheiser hd 6';

			expect(store.searchResults).toHaveLength(1);
			expect(store.searchResults[0]).toMatchObject({
				siteId: 'alice',
				siteName: 'Alice Audio',
				dbType: 'IEMs',
				brand: 'Sennheiser',
				phoneName: 'HD 600'
			});
		});

		it('encodes the share slug', async () => {
			await seed(rootDbSite({ dbs: [{ type: 'IEMs', folder: '/headphones' }] }), [
				{ name: 'Brand+Co', phones: [{ name: 'Model & More' }] }
			]);
			store.searchQuery = 'brand';

			// Raw, a `+` in the slug decodes back to a space on the receiving site.
			expect(store.searchResults[0].url).toBe(
				'https://alice.squig.link/headphones?share=Brand%2BCo_Model_%26_More'
			);
		});

		it('carries the database type and delta readiness through', async () => {
			await seed(rootDbSite({ dbs: [{ type: 'Headphones', folder: '/', deltaReady: true }] }));
			store.searchQuery = 'blessing';

			expect(store.searchResults[0]).toMatchObject({
				dbType: 'Headphones',
				deltaReady: true,
				dbId: 'alice\0/'
			});
		});

		it('coerces a non-string phone name', async () => {
			await seed(rootDbSite(), [{ name: 'Brand', phones: [{ name: 12345 }] }]);
			store.searchQuery = '12345';

			expect(store.searchResults[0].phoneName).toBe('12345');
		});

		it('ignores phone books whose site is not in the registry', async () => {
			fetchMock.mockResolvedValue(jsonResponse(BRANDS));
			await store.fetchPhoneBook(rootDbSite());
			store.sites = [];
			store.searchQuery = 'sennheiser';

			expect(store.searchResults).toEqual([]);
		});

		it('excludes the site the tool is served from', async () => {
			const self = store.currentSiteUsername!;
			await seed(rootDbSite({ username: self }));
			store.searchQuery = 'sennheiser';

			expect(store.searchResults).toEqual([]);
		});

		it('orders headphones after IEMs regardless of insertion order', async () => {
			const site = rootDbSite({
				dbs: [
					{ type: 'Headphones', folder: '/hp' },
					{ type: 'IEMs', folder: '/' }
				]
			});
			fetchMock.mockResolvedValue(jsonResponse([{ name: 'Brand', phones: [{ name: 'Thing' }] }]));
			store.sites = [site];
			await store.fetchPhoneBook(site);
			store.searchQuery = 'brand thing';

			expect(store.searchResults.map((r) => r.dbType)).toEqual(['IEMs', 'Headphones']);
		});
	});

	// ── Shop links ────────────────────────────────────────────────────────

	describe('fetchShopLinks', () => {
		it('loads the shop link table', async () => {
			const links = [makeShopLink({ model: 'HD 600' })];
			fetchMock.mockResolvedValue(jsonResponse(links));

			await store.fetchShopLinks();

			expect(fetchMock).toHaveBeenCalledWith('https://squig.link/shoplinks.json');
			expect(store.shopLinks).toEqual(links);
		});

		it('leaves the table empty when the endpoint fails', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 500));

			await store.fetchShopLinks();

			expect(store.shopLinks).toEqual([]);
		});

		it('swallows a network error', async () => {
			fetchMock.mockRejectedValue(new Error('offline'));

			await expect(store.fetchShopLinks()).resolves.toBeUndefined();
			expect(store.shopLinks).toEqual([]);
		});

		it('fetches only once', async () => {
			fetchMock.mockResolvedValue(jsonResponse([makeShopLink()]));

			await store.fetchShopLinks();
			await store.fetchShopLinks();

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	// ── Sponsor payloads ──────────────────────────────────────────────────

	describe('fetchSponsorDetail', () => {
		it('hoists the script-local binding onto window and keeps the object', async () => {
			fetchMock.mockResolvedValue(jsonResponse("let sponsorDetails = { brand: 'Acme' };"));

			await store.fetchSponsorDetail();

			expect(store.getSponsorDetail()).toEqual({ brand: 'Acme' });
		});

		it('ignores a payload that is not an object', async () => {
			fetchMock.mockResolvedValue(jsonResponse('let sponsorDetails = [1, 2];'));

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toBeNull();
		});

		it('keeps whatever was extracted before a DOM error in the legacy script', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse(
					"let sponsorDetails = { brand: 'Acme' }; document.querySelector('#x').click();"
				)
			);

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toEqual({ brand: 'Acme' });
		});

		it('skips a missing script', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toBeNull();
		});

		it('runs at most once', async () => {
			fetchMock.mockResolvedValue(jsonResponse('let sponsorDetails = { brand: 1 };'));

			await store.fetchSponsorDetail();
			await store.fetchSponsorDetail();

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('fetchSponsorContent', () => {
		it('takes the first entry of the content array', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse("let contentSponsor = [{ name: 'First' }, { name: 'Second' }];")
			);

			await store.fetchSponsorContent();

			expect(store.sponsorContent).toEqual({ name: 'First' });
		});

		it('ignores an empty content array', async () => {
			fetchMock.mockResolvedValue(jsonResponse('let contentSponsor = [];'));

			await store.fetchSponsorContent();

			expect(store.sponsorContent).toBeNull();
		});

		it('skips a missing script', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await store.fetchSponsorContent();

			expect(store.sponsorContent).toBeNull();
		});
	});

	describe('fetchSponsorProductData', () => {
		function shopifyPayload(price: number, compareAt: number | null) {
			return { product: { variants: [{ price, compare_at_price: compareAt }] } };
		}

		it('reads the first variant of the Shopify payload', async () => {
			fetchMock.mockResolvedValue(jsonResponse(shopifyPayload(100, 150)));

			const data = await store.fetchSponsorProductData('https://shop.test/product');

			expect(fetchMock).toHaveBeenCalledWith('https://shop.test/product.json');
			expect(data).toEqual({ currentPrice: 100, originalPrice: 150, onSale: true });
		});

		it('reports a full-price product as not on sale', async () => {
			fetchMock.mockResolvedValue(jsonResponse(shopifyPayload(150, 150)));

			const data = await store.fetchSponsorProductData('https://shop.test/product');

			expect(data!.onSale).toBe(false);
		});

		it('returns null on a failed request', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await expect(store.fetchSponsorProductData('https://shop.test/x')).resolves.toBeNull();
		});

		it('returns null when the payload has no variants', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ product: {} }));

			await expect(store.fetchSponsorProductData('https://shop.test/x')).resolves.toBeNull();
		});
	});

	// ── Opt-out list ──────────────────────────────────────────────────────

	it('does not flag an ordinary site as opted out', () => {
		expect(store.isCurrentSiteOptedOut).toBe(false);
	});
});
