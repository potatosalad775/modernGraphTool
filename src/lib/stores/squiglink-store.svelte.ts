import { SvelteMap } from 'svelte/reactivity';
import { browser } from '$app/environment';
import { getConfigValue } from '$lib/utils/config.js';
import type {
	SquiglinkSite,
	SquiglinkBrandEntry,
	ShopLinkEntry,
	SponsorContent,
	CrossSiteSearchResult,
	SquiglinkUrlType
} from '$lib/types/squiglink-types.js';

const SQUIGLINK_DOMAIN = 'squig.link';

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
	sponsorContent = $state<SponsorContent | null>(null);
	isLoading = $state(false);
	error = $state<string | null>(null);

	searchQuery = $state('');

	readonly #phoneBooks = new SvelteMap<string, SquiglinkBrandEntry[]>();
	#sitesFetched = false;
	#shopLinksFetched = false;
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

		for (const [siteUsername, brands] of this.#phoneBooks) {
			// Skip current site's own results
			if (siteUsername === currentUser) continue;

			const site = this.sites.find((s) => s.username === siteUsername);
			if (!site) continue;

			const siteUrl = this.buildSiteUrl(site);
			const dbType = site.dbs[0]?.type ?? '';

			for (const brand of brands) {
				for (const phone of brand.phones) {
					const name =
						typeof phone.name === 'string' ? phone.name : String(phone.name);
					if (name.toLowerCase().includes(q)) {
						results.push({
							siteName: site.name,
							siteUsername: site.username,
							siteUrl,
							brand: brand.name,
							phoneName: name,
							dbType
						});
					}
				}
			}
		}

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
		if (this.#phoneBooks.has(site.username)) return;

		const siteUrl = this.buildSiteUrl(site);
		try {
			const res = await fetch(`${siteUrl}/data/phone_book.json`);
			if (!res.ok) return;
			const data = await res.json();
			// phone_book.json can have either { brandPhones: [...] } or be the array directly
			const brands: SquiglinkBrandEntry[] = Array.isArray(data)
				? data
				: data.brandPhones ?? [];
			this.#phoneBooks.set(site.username, brands);
		} catch {
			// Silently skip sites that fail to load
		}
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

	async fetchSponsorContent(): Promise<void> {
		if (this.#sponsorFetched || !this.isEnabled) return;
		this.#sponsorFetched = true;

		try {
			await new Promise<void>((resolve, reject) => {
				const script = document.createElement('script');
				script.src = `https://${SQUIGLINK_DOMAIN}/squiglink-intro.js`;
				script.onload = () => resolve();
				script.onerror = () => reject();
				document.head.appendChild(script);
			});

			// squiglink-intro.js declares contentSponsor as a top-level let,
			// which becomes a global when loaded via <script> tag
			const data = (window as unknown as Record<string, unknown>).contentSponsor;
			if (Array.isArray(data) && data.length > 0) {
				this.sponsorContent = data[0] as SponsorContent;
			}
		} catch {
			// Silently skip if sponsor script is unavailable
		}
	}

	getPhoneBook(siteUsername: string): SquiglinkBrandEntry[] | undefined {
		return this.#phoneBooks.get(siteUsername);
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
