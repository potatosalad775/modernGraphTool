import { SvelteMap } from 'svelte/reactivity';
import { browser } from '$app/environment';
import { getConfigValue } from '$lib/utils/config.js';
import type {
	SquiglinkSite,
	SquiglinkBrandEntry,
	ShopLinkEntry,
	SponsorContent,
	CrossSiteSearchResult,
	SquiglinkUrlType,
	SponsorDetail,
	SponsorProductData
} from '$lib/types/squiglink-types.js';

const SQUIGLINK_DOMAIN = 'squig.link';

interface PhoneBookEntry {
	brands: SquiglinkBrandEntry[];
	dbType: string;
	folder: string;
	deltaReady: boolean;
}

const OPT_OUT_SITES = new Set([
	'64audio',
	'cammyfi',
	'crinacle',
	'eliseaudio',
	'hbb',
	'joycesreview',
	'kr0mka',
	'graph',
	'vsg'
]);

class SquiglinkStore {
	// ── Domain guard ─────────────────────────────────────────────────────────
	readonly isSquiglinkHost: boolean;
	readonly isEnabled: boolean;

	// ── State ────────────────────────────────────────────────────────────────
	sites = $state<SquiglinkSite[]>([]);
	shopLinks = $state<ShopLinkEntry[]>([]);
	sponsorDetail = $state<SponsorDetail | null>(null);
	sponsorContent = $state<SponsorContent | null>(null);
	isLoading = $state(false);
	error = $state<string | null>(null);

	searchQuery = $state('');

	readonly #phoneBooks = new SvelteMap<string, PhoneBookEntry>();
	#sitesFetched = false;
	#shopLinksFetched = false;
	#sponsorDetailFetched = false;
	#sponsorFetched = false;

	constructor() {
		if (!browser) {
			this.isSquiglinkHost = false;
			this.isEnabled = false;
			return;
		}

		const host = window.location.host;
		const debug = getConfigValue('SQUIGLINK.DEBUG') === true;
		this.isSquiglinkHost =
			debug || host === SQUIGLINK_DOMAIN || host.endsWith('.' + SQUIGLINK_DOMAIN);

		const configEnabled = getConfigValue('SQUIGLINK.ENABLED') as boolean | undefined;
		this.isEnabled = this.isSquiglinkHost && configEnabled !== false;
	}

	// ── Computed ─────────────────────────────────────────────────────────────

	get currentSiteUsername(): string | null {
		if (!browser || !this.isSquiglinkHost) return null;
		const host = window.location.host;
		if (host === SQUIGLINK_DOMAIN) {
			// Root domain — check for lab folder path
			const pathMatch = window.location.pathname.match(/^\/lab\/([^/]+)/);
			return pathMatch ? pathMatch[1] : 'graph';
		}
		// Subdomain: "username.squig.link"
		return host.replace('.' + SQUIGLINK_DOMAIN, '');
	}

	get isCurrentSiteOptedOut(): boolean {
		const username = this.currentSiteUsername;
		return username !== null && OPT_OUT_SITES.has(username);
	}

	searchResults: CrossSiteSearchResult[] = $derived.by(() => {
		const q = this.searchQuery.trim().toLowerCase();
		if (q.length < 2) return [];

		const results: CrossSiteSearchResult[] = [];
		const currentUser = this.currentSiteUsername;
		const siteByUsername = new Map(this.sites.map((s) => [s.username, s]));

		for (const [key, entry] of this.#phoneBooks) {
			const siteUsername = key.split('\0')[0];

			// Skip current site's own results
			if (siteUsername === currentUser) continue;

			const site = siteByUsername.get(siteUsername);
			if (!site) continue;

			const siteUrl = this.buildSiteUrl(site);
			const folderPath = entry.folder === '/' ? '' : entry.folder.replace(/\/$/, '');
			const resultSiteUrl = `${siteUrl}${folderPath}`;
			const { dbType, deltaReady } = entry;

			for (const brand of entry.brands) {
				if (brand.name.toLowerCase().includes(q)) {
					results.push(
						...brand.phones.map(
							(phone) =>
								({
									siteName: site.name,
									siteUsername: site.username,
									siteUrl: resultSiteUrl,
									brand: brand.name,
									phoneName: typeof phone.name === 'string' ? phone.name : String(phone.name),
									dbType,
									deltaReady
								}) as CrossSiteSearchResult
						)
					);
					continue; // Skip individual phones if brand matches
				}

				for (const phone of brand.phones) {
					const name = typeof phone.name === 'string' ? phone.name : String(phone.name);
					if (name.toLowerCase().includes(q)) {
						results.push({
							siteName: site.name,
							siteUsername: site.username,
							siteUrl: resultSiteUrl,
							brand: brand.name,
							phoneName: name,
							dbType,
							deltaReady
						});
					}
				}
			}
		}

		// Sort: dbType (5128 → IEMs → Headphones → Earbuds), deltaReady first, then site name, phone name
		const DB_TYPE_ORDER = ['5128', 'IEMs', 'Headphones', 'Earbuds'];
		results.sort((a, b) => {
			if (a.dbType !== b.dbType) {
				const aIdx = DB_TYPE_ORDER.indexOf(a.dbType);
				const bIdx = DB_TYPE_ORDER.indexOf(b.dbType);
				if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
				if (aIdx !== -1) return -1;
				if (bIdx !== -1) return 1;
				return a.dbType.localeCompare(b.dbType);
			}
			// Prioritize deltaReady dbs within the same dbType
			if (a.deltaReady !== b.deltaReady) return a.deltaReady ? -1 : 1;
			if (a.siteName !== b.siteName) {
				return a.siteName.localeCompare(b.siteName);
			}
			return a.phoneName.localeCompare(b.phoneName);
		});
		return results;
	});

	// ── Data fetching ────────────────────────────────────────────────────────

	async fetchSiteRegistry(): Promise<void> {
		if (this.#sitesFetched || !this.isEnabled) return;

		this.isLoading = true;
		this.error = null;

		try {
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/squigsites.json`);
			if (!res.ok) throw new Error(`Failed to fetch site registry: ${res.status}`);
			this.sites = (await res.json()) as SquiglinkSite[];
			this.#sitesFetched = true;
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Failed to fetch site registry';
		} finally {
			this.isLoading = false;
		}
	}

	async fetchPhoneBook(site: SquiglinkSite): Promise<void> {
		const siteUrl = this.buildSiteUrl(site);

		const fetches = site.dbs.map(async (db) => {
			const folder = db.folder || '/';
			const key = site.username + '\0' + folder;
			if (this.#phoneBooks.has(key)) return;

			const folderPath = folder === '/' ? '' : folder.replace(/\/$/, '');
			const url = `${siteUrl}${folderPath}/data/phone_book.json`;

			try {
				const res = await fetch(url);
				if (!res.ok) return;
				const data = await res.json();
				// phone_book.json can have either { brandPhones: [...] } or be the array directly
				const brands: SquiglinkBrandEntry[] = Array.isArray(data) ? data : (data.brandPhones ?? []);
				this.#phoneBooks.set(key, { brands, dbType: db.type, folder, deltaReady: !!db.deltaReady });
			} catch {
				// Silently skip dbs that fail to load
			}
		});

		await Promise.all(fetches);
	}

	async fetchShopLinks(): Promise<void> {
		if (this.#shopLinksFetched || !this.isEnabled) return;

		try {
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/shoplinks.json`);
			if (!res.ok) return;
			this.shopLinks = (await res.json()) as ShopLinkEntry[];
			this.#shopLinksFetched = true;
		} catch {
			// Silently skip if shoplinks are unavailable
		}
	}

	async fetchSponsorDetail(): Promise<void> {
		if (this.#sponsorDetailFetched || !this.isEnabled) return;
		this.#sponsorDetailFetched = true;

		try {
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/shoplinks.js`);
			if (!res.ok) return;
			let text = await res.text();

			// Hoist sponsorDetails onto window so it survives eval scope —
			// the script declares it with `let` which stays local to eval.
			text = text.replace(/\blet\s+sponsorDetails\b/, 'window.sponsorDetails');

			// Execute in global scope — the script may attempt DOM manipulation
			// targeting CrinGraph elements that don't exist in this app,
			// so we catch and continue after extracting the data.
			try {
				(0, eval)(text);
			} catch {
				// Ignore DOM errors from legacy CrinGraph code
			}

			const data = (window as unknown as Record<string, unknown>).sponsorDetails;
			if (data && typeof data === 'object' && !Array.isArray(data)) {
				this.sponsorDetail = data as SponsorDetail;
			}
		} catch {
			// Silently skip if sponsor script is unavailable
		}
	}

	async fetchSponsorContent(): Promise<void> {
		if (this.#sponsorFetched || !this.isEnabled) return;
		this.#sponsorFetched = true;

		try {
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/squiglink-intro.js`);
			if (!res.ok) return;
			let text = await res.text();

			// Hoist contentSponsor onto window so it survives eval scope —
			// the script declares it with `let` which stays local to eval.
			text = text.replace(/\blet\s+contentSponsor\b/, 'window.contentSponsor');

			// Execute in global scope — the script may attempt DOM manipulation
			// targeting CrinGraph elements that don't exist in this app,
			// so we catch and continue after extracting the data.
			try {
				(0, eval)(text);
			} catch {
				// Ignore DOM errors from legacy CrinGraph code
			}

			const data = (window as unknown as Record<string, unknown>).contentSponsor;
			if (Array.isArray(data) && data.length > 0) {
				this.sponsorContent = data[0] as SponsorContent;
			}
		} catch {
			// Silently skip if sponsor script is unavailable
		}
	}

	async fetchSponsorProductData(hfg_com: string): Promise<SponsorProductData | null> {
		if (!this.isEnabled) return null;

		try {
			const res = await fetch(`${hfg_com}.json`);
			if (!res.ok) return null;
			const data = await res.json();
			return {
				currentPrice: data.product.variants[0].price,
				originalPrice: data.product.variants[0].compare_at_price,
				onSale: data.product.variants[0].price < data.product.variants[0].compare_at_price
			} as SponsorProductData;
		} catch {
			// Silently skip if shoplinks are unavailable
			return null;
		}
	}

	getPhoneBook(siteUsername: string, folder: string = '/'): SquiglinkBrandEntry[] | undefined {
		return this.#phoneBooks.get(siteUsername + '\0' + folder)?.brands;
	}

	getSponsorDetail(): SponsorDetail | null {
		return this.sponsorDetail;
	}

	findShopLink(modelName: string): ShopLinkEntry | undefined {
		const lower = modelName.toLowerCase();
		return this.shopLinks.find((entry) => entry.model.toLowerCase() === lower);
	}

	// ── URL construction ─────────────────────────────────────────────────────

	buildSiteUrl(site: SquiglinkSite): string {
		const urlBuilders: Record<SquiglinkUrlType, () => string> = {
			root: () => `https://${SQUIGLINK_DOMAIN}`,
			altDomain: () => site.altDomain ?? `https://${site.username}.${SQUIGLINK_DOMAIN}`,
			subdomain: () => `https://${site.username}.${SQUIGLINK_DOMAIN}`,
			labFolder: () => `https://${SQUIGLINK_DOMAIN}/lab/${site.username}`
		};

		return (urlBuilders[site.urlType] ?? urlBuilders.subdomain)();
	}
}

export const squiglinkStore = new SquiglinkStore();
