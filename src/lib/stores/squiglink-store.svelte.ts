import { browser } from '$app/environment';
import { getConfigValue } from '$lib/utils/config.js';
import type {
	ShopLinkEntry,
	SponsorContent,
	SponsorDetail,
	SponsorProductData
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

/**
 * squig.link-only integration: sponsor content and shop links, gated on the
 * deployment actually being hosted there. The site registry and phone-book
 * crawl this used to own now come from the GAA site index and the
 * GraphAggregator index respectively — both host-agnostic.
 *
 * Exported for tests only — the app uses the `squiglinkStore` singleton below.
 * The domain guard runs in the constructor, so covering the enabled paths means
 * building an instance after `SQUIGLINK.DEBUG` is in place.
 */
export class SquiglinkStore {
	// ── Domain guard ─────────────────────────────────────────────────────────
	readonly isSquiglinkHost: boolean;
	readonly isEnabled: boolean;

	// ── State ────────────────────────────────────────────────────────────────
	shopLinks = $state<ShopLinkEntry[]>([]);
	sponsorDetail = $state<SponsorDetail | null>(null);
	sponsorContent = $state<SponsorContent | null>(null);

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

	// ── Data fetching ────────────────────────────────────────────────────────

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

	getSponsorDetail(): SponsorDetail | null {
		return this.sponsorDetail;
	}

	findShopLink(modelName: string): ShopLinkEntry | undefined {
		const lower = modelName.toLowerCase();
		return this.shopLinks.find((entry) => entry.model.toLowerCase() === lower);
	}
}

export const squiglinkStore = new SquiglinkStore();
