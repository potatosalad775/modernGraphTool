/**
 * The exported singleton is constructed against the real `window.location`, so
 * on a localhost test host it is permanently disabled — every fetch method
 * early-returns. Tests that need the enabled store build a fresh instance with
 * `SQUIGLINK.DEBUG` set, which is the same escape hatch operators use to
 * develop off-domain (see `enabledStore` below).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { squiglinkStore, SquiglinkStore } from './squiglink-store.svelte.js';
import type { ShopLinkEntry } from '$lib/types/squiglink-types.js';

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
