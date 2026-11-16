/**
 * The exported singleton is constructed against the real `window.location`, so
 * on a localhost test host it is permanently disabled — every fetch method
 * early-returns. Tests that need the enabled store build a fresh instance with
 * `SQUIGLINK.DEBUG` set, which is the same escape hatch operators use to
 * develop off-domain (see `enabledStore` below).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	squiglinkStore,
	SquiglinkStore,
	sponsorDismissedCookie,
	sponsorDismissCookieString
} from './squiglink-store.svelte.js';
import type { ShopLinkEntry } from '#lib/types/squiglink-types.js';

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

/** A JS single-quoted string literal, the way the live scripts write their values. */
function q(value: string): string {
	return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

const LOGO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E")`;

/** Shaped like the live `squiglink-intro.js`: a literal, then CrinGraph DOM code. */
function introScript(overrides: Record<string, unknown> = {}): string {
	const fields: Record<string, unknown> = {
		sponsorId: 'dunu-vitruvian',
		heading: 'HiFiGo supports Squiglink',
		sponsorshipName: 'Dunu DaVinci Vitruvian',
		sponsorLogo: LOGO,
		sponsorMessage: 'New! Dunu DaVinci, refined',
		type: 'sponsorship',
		creative: 'https://squig.link/sponsorship/hifigo/dunu-vitruvian.jpg',
		creativeBgColor: '#120401',
		ctaText: 'HiFiGo',
		cta2Text: 'AliExpress',
		ctaLink: 'https://hifigo.com/products/dunu-davinci-vitruvian',
		cta2Link: 'https://www.aliexpress.us/item/3256813299587370.html',
		...overrides
	};
	const body = Object.entries(fields)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `            ${q(k)}: ${typeof v === 'string' ? q(v) : String(v)}`)
		.join(',\n');
	return `let introMode = 'prod';

let contentSponsor = [
        {
${body}
        }
    ];

let parent = document.querySelector('body');
document.body.appendChild(parent);
`;
}

const DETAILS_SCRIPT = `let shoplinksMode = 'prod';

let sponsorDetails = {
    'sponsorName': 'HiFiGo',
    'sponsorLogo': ${q(LOGO)},
    'utmParams': '?utm_source=squiglink&utm_medium=shoplink&utm_campaign=818sale2024Q3'
};

function shopLink() {
    document.querySelector('#fr-graph').click();
}
`;

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

			expect(fetchMock).toHaveBeenCalledWith('https://squig.link/shoplinks.json', {
				priority: 'low'
			});
			expect(store.shopLinks).toEqual(links);
		});

		it('keeps the shop URLs of a healthy table as they are', async () => {
			const links = [
				makeShopLink({
					model: 'HD 600',
					hfg_com: 'https://hifigo.com/products/sennheiser-hd600',
					hfg_amzus: 'https://www.amazon.com/dp/B00004SY4H?tag=x&th=1',
					hfg_ali: 'http://s.click.aliexpress.com/e/_abc'
				})
			];
			fetchMock.mockResolvedValue(jsonResponse(links));

			await store.fetchShopLinks();

			expect(store.shopLinks).toEqual(links);
		});

		it('empties a shop URL that is not http(s) and keeps the entry', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse([
					makeShopLink({
						model: 'A',
						hfg_com: 'javascript:alert(1)',
						hfg_amzus: 'data:text/html,<script>1</script>',
						hfg_amzjp: '//evil.test/x',
						hfg_ali: 'https://ok.test/x'
					}),
					makeShopLink({ model: 'B', hfg_com: 'unavailable' }),
					makeShopLink({ model: 'C', hfg_com: '  ' })
				])
			);

			await store.fetchShopLinks();

			const [a, b, c] = store.shopLinks;
			expect([a.hfg_com, a.hfg_amzus, a.hfg_amzjp]).toEqual(['', '', '']);
			expect(a.hfg_ali).toBe('https://ok.test/x');
			expect(b.hfg_com).toBe('');
			expect(c.hfg_com).toBe('');
			expect(store.findShopLink('a')?.model).toBe('A');
		});

		it('drops rows that are not shop link entries', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse([null, 'x', 7, [], { hfg_com: 'https://x.test' }, makeShopLink()])
			);

			await store.fetchShopLinks();

			expect(store.shopLinks).toEqual([makeShopLink()]);
		});

		it('ignores a table that is not an array', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ model: 'x' }));

			await store.fetchShopLinks();

			expect(store.shopLinks).toEqual([]);
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
		it('reads the details literal of a shoplinks.js-shaped script as data', async () => {
			fetchMock.mockResolvedValue(jsonResponse(DETAILS_SCRIPT));

			await store.fetchSponsorDetail();

			expect(fetchMock).toHaveBeenCalledWith('https://squig.link/shoplinks.js', {
				priority: 'low'
			});
			expect(store.getSponsorDetail()).toEqual({
				sponsorName: 'HiFiGo',
				sponsorLogo: LOGO,
				utmParams: '?utm_source=squiglink&utm_medium=shoplink&utm_campaign=818sale2024Q3'
			});
		});

		it('never runs the script: its trailing code is not executed', async () => {
			const g = globalThis as unknown as Record<string, unknown>;
			g.__ranLegacyCode = false;
			fetchMock.mockResolvedValue(
				jsonResponse(
					"let sponsorDetails = { 'sponsorName': 'HiFiGo' };\nglobalThis.__ranLegacyCode = true;"
				)
			);

			await store.fetchSponsorDetail();

			expect(g.__ranLegacyCode).toBe(false);
			expect(store.sponsorDetail?.sponsorName).toBe('HiFiGo');
			delete g.__ranLegacyCode;
		});

		it('does not read a payload that needs code to evaluate', async () => {
			const g = globalThis as unknown as Record<string, unknown>;
			g.__ranLegacyCode = false;
			fetchMock.mockResolvedValue(
				jsonResponse('let sponsorDetails = { sponsorName: (globalThis.__ranLegacyCode = true) };')
			);

			await store.fetchSponsorDetail();

			expect(g.__ranLegacyCode).toBe(false);
			expect(store.sponsorDetail).toBeNull();
			delete g.__ranLegacyCode;
		});

		it('ignores a payload that is not an object', async () => {
			fetchMock.mockResolvedValue(jsonResponse('let sponsorDetails = [1, 2];'));

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toBeNull();
		});

		it('ignores a script without the declaration', async () => {
			fetchMock.mockResolvedValue(jsonResponse("document.querySelector('#x').click();"));

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toBeNull();
		});

		it('blanks utm parameters that could change where the shop link goes', async () => {
			for (const utm of ['@evil.test/x', '#frag', '?a=1 b', "?a='x'", '?a=<b>']) {
				const fresh = enabledStore();
				fetchMock.mockResolvedValue(
					jsonResponse(`let sponsorDetails = { sponsorName: 'S', utmParams: ${q(utm)} };`)
				);
				await fresh.fetchSponsorDetail();
				expect(fresh.sponsorDetail?.utmParams, utm).toBe('');
			}
		});

		it('keeps only the known string fields', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse("let sponsorDetails = { sponsorName: 7, extra: 'x', utmParams: ['?a=1'] };")
			);

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toEqual({ sponsorName: '', sponsorLogo: '', utmParams: '' });
		});

		it('skips a missing script', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await store.fetchSponsorDetail();

			expect(store.sponsorDetail).toBeNull();
		});

		it('runs at most once', async () => {
			fetchMock.mockResolvedValue(jsonResponse(DETAILS_SCRIPT));

			await store.fetchSponsorDetail();
			await store.fetchSponsorDetail();

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('fetchSponsorContent', () => {
		it('reads the content literal of a squiglink-intro.js-shaped script as data', async () => {
			fetchMock.mockResolvedValue(jsonResponse(introScript()));

			await store.fetchSponsorContent();

			// Boot-critical: fetched with the default priority
			expect(fetchMock).toHaveBeenCalledWith('https://squig.link/squiglink-intro.js');
			expect(store.sponsorContent).toEqual({
				sponsorId: 'dunu-vitruvian',
				heading: 'HiFiGo supports Squiglink',
				sponsorshipName: 'Dunu DaVinci Vitruvian',
				sponsorLogo: LOGO,
				sponsorMessage: 'New! Dunu DaVinci, refined',
				type: 'sponsorship',
				creative: 'https://squig.link/sponsorship/hifigo/dunu-vitruvian.jpg',
				creativeBgColor: '#120401',
				ctaText: 'HiFiGo',
				cta2Text: 'AliExpress',
				ctaLink: 'https://hifigo.com/products/dunu-davinci-vitruvian',
				cta2Link: 'https://www.aliexpress.us/item/3256813299587370.html'
			});
		});

		it('takes the first entry of the content array', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse(
					"let contentSponsor = [{ sponsorId: 'first' }, { sponsorId: 'second' }]; let x = 1;"
				)
			);

			await store.fetchSponsorContent();

			expect(store.sponsorContent?.sponsorId).toBe('first');
		});

		it('reads a literal with comments and trailing commas', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse(`let contentSponsor = [
					// current sponsorship
					{ 'sponsorId': 'a', 'ctaLink': 'https://hifigo.com/x', /* ok */ },
				];`)
			);

			await store.fetchSponsorContent();

			expect(store.sponsorContent?.sponsorId).toBe('a');
			expect(store.sponsorContent?.ctaLink).toBe('https://hifigo.com/x');
		});

		it('never runs the script: its trailing code is not executed', async () => {
			const g = globalThis as unknown as Record<string, unknown>;
			g.__ranLegacyCode = false;
			fetchMock.mockResolvedValue(
				jsonResponse(introScript() + '\nglobalThis.__ranLegacyCode = true;')
			);

			await store.fetchSponsorContent();

			expect(g.__ranLegacyCode).toBe(false);
			expect(store.sponsorContent).not.toBeNull();
			delete g.__ranLegacyCode;
		});

		it('shows nothing for a payload that needs code to evaluate', async () => {
			const g = globalThis as unknown as Record<string, unknown>;
			g.__ranLegacyCode = false;
			fetchMock.mockResolvedValue(
				jsonResponse(
					"let contentSponsor = [{ sponsorId: 'a', heading: (globalThis.__ranLegacyCode = true) }];"
				)
			);

			await store.fetchSponsorContent();

			expect(g.__ranLegacyCode).toBe(false);
			expect(store.sponsorContent).toBeNull();
			delete g.__ranLegacyCode;
		});

		it('ignores an empty content array', async () => {
			fetchMock.mockResolvedValue(jsonResponse('let contentSponsor = [];'));

			await store.fetchSponsorContent();

			expect(store.sponsorContent).toBeNull();
		});

		it('ignores a content value that is not an array', async () => {
			fetchMock.mockResolvedValue(jsonResponse("let contentSponsor = { sponsorId: 'a' };"));

			await store.fetchSponsorContent();

			expect(store.sponsorContent).toBeNull();
		});

		it('skips a missing script', async () => {
			fetchMock.mockResolvedValue(jsonResponse(null, false, 404));

			await store.fetchSponsorContent();

			expect(store.sponsorContent).toBeNull();
		});

		it('drops a link that is not http(s) and keeps the rest of the sponsor', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse(
					introScript({
						ctaLink: 'javascript:alert(document.cookie)',
						cta2Link: 'data:text/html,<script>alert(1)</script>',
						creative: 'javascript:void(0)'
					})
				)
			);

			await store.fetchSponsorContent();

			const sponsor = store.sponsorContent!;
			expect(sponsor.ctaLink).toBe('');
			expect(sponsor).not.toHaveProperty('cta2Link');
			expect(sponsor.creative).toBe('');
			expect(sponsor.heading).toBe('HiFiGo supports Squiglink');
			expect(sponsor.ctaText).toBe('HiFiGo');
		});

		it.each([
			['a relative path', '/sponsorship/x.jpg'],
			['a protocol-relative URL', '//evil.test/x.jpg'],
			['a vbscript URL', 'vbscript:msgbox(1)'],
			['a URL with whitespace', 'https://a.test/ x'],
			['mailto', 'mailto:a@b.test'],
			['an empty string', '']
		])('drops %s from ctaLink', async (_label, link) => {
			fetchMock.mockResolvedValue(jsonResponse(introScript({ ctaLink: link })));

			await store.fetchSponsorContent();

			expect(store.sponsorContent?.ctaLink).toBe('');
		});

		it('omits optional fields the payload does not carry', async () => {
			fetchMock.mockResolvedValue(
				jsonResponse(introScript({ cta2Text: undefined, cta2Link: undefined }))
			);

			await store.fetchSponsorContent();

			expect(store.sponsorContent).not.toHaveProperty('cta2Text');
			expect(store.sponsorContent).not.toHaveProperty('cta2Link');
		});

		it('shows no sponsor when the id could not be a cookie name', async () => {
			for (const id of ['', 'a;domain=evil.test', 'a b', 'a=b']) {
				const fresh = enabledStore();
				fetchMock.mockResolvedValue(jsonResponse(introScript({ sponsorId: id })));
				await fresh.fetchSponsorContent();
				expect(fresh.sponsorContent, id).toBeNull();
			}
		});

		it('does not preload a creative that failed the URL check', async () => {
			const images: HTMLImageElement[] = [];
			const RealImage = window.Image;
			vi.stubGlobal(
				'Image',
				class extends RealImage {
					constructor() {
						super();
						images.push(this);
					}
				}
			);
			fetchMock.mockResolvedValue(jsonResponse(introScript({ creative: 'javascript:1' })));

			await store.fetchSponsorContent();

			expect(images).toHaveLength(0);
		});

		it('hands a second caller the in-flight load', async () => {
			// hooks.client.ts starts the load and SponsorBanner awaits it again on
			// mount — the second await must see the data, not return early.
			let resolve!: (r: unknown) => void;
			fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));

			const early = store.fetchSponsorContent();
			const onMount = store.fetchSponsorContent();
			resolve(jsonResponse(introScript({ sponsorId: 'first' })));
			await onMount;

			expect(store.sponsorContent?.sponsorId).toBe('first');
			expect(fetchMock).toHaveBeenCalledTimes(1);
			await early;
		});

		it('starts the creative download as soon as the content lands', async () => {
			const images: HTMLImageElement[] = [];
			const RealImage = window.Image;
			vi.stubGlobal(
				'Image',
				class extends RealImage {
					constructor() {
						super();
						images.push(this);
					}
				}
			);
			fetchMock.mockResolvedValue(
				jsonResponse(introScript({ creative: 'https://squig.link/s.jpg' }))
			);

			await store.fetchSponsorContent();

			expect(images).toHaveLength(1);
			expect(images[0].src).toBe('https://squig.link/s.jpg');
		});
	});

	describe('isSponsorEnabled', () => {
		it('is enabled on an enabled host', () => {
			expect(store.isSponsorEnabled).toBe(true);
		});

		it('respects ENABLE_SPONSOR: false', () => {
			expect(enabledStore({ DEBUG: true, ENABLE_SPONSOR: false }).isSponsorEnabled).toBe(false);
		});

		it('is never enabled while the integration is disabled', () => {
			expect(squiglinkStore.isSponsorEnabled).toBe(false);
		});
	});

	describe('sponsor dismissal', () => {
		function setCookie(sponsorId: string, maxAge = 60) {
			document.cookie = `${sponsorDismissedCookie(sponsorId)}=true;max-age=${maxAge};path=/`;
		}

		afterEach(() => {
			for (const id of ['spring-sale', 'summer-launch']) setCookie(id, 0);
		});

		async function loadSponsor(id: string) {
			fetchMock.mockResolvedValue(jsonResponse(introScript({ sponsorId: id })));
			await store.fetchSponsorContent();
		}

		it('remembers the dismissed sponsor for a day', async () => {
			await loadSponsor('spring-sale');

			store.dismissSponsor();

			expect(store.isSponsorDismissed('spring-sale')).toBe(true);
		});

		it('shows a new sponsor after an earlier one was dismissed', () => {
			setCookie('spring-sale');

			expect(store.isSponsorDismissed('summer-launch')).toBe(false);
		});

		it('honours a dismissal written by the legacy CrinGraph script', () => {
			// squiglink-intro.js writes the same name with no path
			document.cookie = 'squiglink-sponsor-spring-sale-closed=true;max-age=60';

			expect(store.isSponsorDismissed('spring-sale')).toBe(true);
			document.cookie = 'squiglink-sponsor-spring-sale-closed=;max-age=0';
		});

		it('writes the cookie with SameSite=Lax, and no Secure on an http page', async () => {
			// The browser project serves over http://localhost, where a Secure cookie would be dropped
			expect(window.location.protocol).toBe('http:');
			const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
			const writes: string[] = [];
			Object.defineProperty(document, 'cookie', {
				configurable: true,
				get: () => descriptor.get!.call(document),
				set: (v: string) => {
					writes.push(v);
					descriptor.set!.call(document, v);
				}
			});
			try {
				await loadSponsor('spring-sale');
				store.dismissSponsor();
			} finally {
				delete (document as { cookie?: string }).cookie;
			}

			expect(writes).toEqual([
				'squiglink-sponsor-spring-sale-closed=true;max-age=86400;path=/;SameSite=Lax'
			]);
		});

		describe('sponsorDismissCookieString', () => {
			it('adds the squig.link domain, SameSite=Lax and Secure on a secure squig.link page', () => {
				expect(sponsorDismissCookieString('spring-sale', { domain: true, secure: true })).toBe(
					'squiglink-sponsor-spring-sale-closed=true;max-age=86400;path=/;domain=squig.link;SameSite=Lax;Secure'
				);
			});

			it('leaves Secure off for an insecure page, so local http dev keeps the cookie', () => {
				expect(sponsorDismissCookieString('spring-sale', { domain: false, secure: false })).toBe(
					'squiglink-sponsor-spring-sale-closed=true;max-age=86400;path=/;SameSite=Lax'
				);
			});

			it('keeps the legacy cookie name', () => {
				expect(sponsorDismissCookieString('x', { domain: true, secure: true })).toMatch(
					new RegExp(`^${sponsorDismissedCookie('x')}=true;`)
				);
			});
		});

		it('does not match a sponsorId that is only a prefix of the dismissed one', () => {
			setCookie('summer-launch');

			expect(store.isSponsorDismissed('summer')).toBe(false);
		});

		it('skips the creative download for a dismissed sponsor', async () => {
			const images: HTMLImageElement[] = [];
			const RealImage = window.Image;
			vi.stubGlobal(
				'Image',
				class extends RealImage {
					constructor() {
						super();
						images.push(this);
					}
				}
			);
			setCookie('spring-sale');
			fetchMock.mockResolvedValue(
				jsonResponse(
					introScript({ sponsorId: 'spring-sale', creative: 'https://squig.link/s.jpg' })
				)
			);

			await store.fetchSponsorContent();

			expect(images).toHaveLength(0);
		});
	});

	describe('fetchSponsorProductData', () => {
		function shopifyPayload(price: number, compareAt: number | null) {
			return { product: { variants: [{ price, compare_at_price: compareAt }] } };
		}

		it('reads the first variant of the Shopify payload', async () => {
			fetchMock.mockResolvedValue(jsonResponse(shopifyPayload(100, 150)));

			const data = await store.fetchSponsorProductData('https://shop.test/product');

			expect(fetchMock).toHaveBeenCalledWith('https://shop.test/product.json', {
				priority: 'low'
			});
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

		it('does not fetch a URL that is not http(s)', async () => {
			for (const url of ['javascript:alert(1)', '//evil.test/p', '', 'unavailable']) {
				await expect(store.fetchSponsorProductData(url)).resolves.toBeNull();
			}
			expect(fetchMock).not.toHaveBeenCalled();
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
