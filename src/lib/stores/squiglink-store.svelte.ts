import { browser } from '$app/env';
import { getConfigValue } from '#lib/utils/config.js';
import { sanitizeHttpUrl } from '#lib/utils/html-sanitizer.js';
import { extractDeclaredLiteral } from '#lib/utils/js-literal.js';
import type {
	ShopLinkEntry,
	SponsorContent,
	SponsorDetail,
	SponsorProductData
} from '#lib/types/squiglink-types.js';

const SQUIGLINK_DOMAIN = 'squig.link';

/** One day, as in the legacy script: a dismissed sponsor comes back the next day. */
const SPONSOR_DISMISS_SECONDS = 86400;

/**
 * The legacy `squiglink-intro.js` cookie, shared on purpose: set on the `squig.link`
 * domain, one dismissal covers every squig.link site, CrinGraph and modernGraphTool alike.
 */
export function sponsorDismissedCookie(sponsorId: string): string {
	return `squiglink-sponsor-${sponsorId}-closed`;
}

/**
 * The `Set-Cookie` string for a dismissal. `SameSite=Lax` always; `Secure` only on https, so a
 * local http `SQUIGLINK.DEBUG` run still keeps its cookie (browsers drop a `Secure` cookie
 * set from an insecure page). `domain` is the squig.link domain, or omitted off it.
 */
export function sponsorDismissCookieString(
	sponsorId: string,
	opts: { domain: boolean; secure: boolean }
): string {
	return (
		`${sponsorDismissedCookie(sponsorId)}=true` +
		`;max-age=${SPONSOR_DISMISS_SECONDS};path=/` +
		(opts.domain ? `;domain=${SQUIGLINK_DOMAIN}` : '') +
		';SameSite=Lax' +
		(opts.secure ? ';Secure' : '')
	);
}

// ── Remote data is untrusted text ────────────────────────────────────────────
// squig.link is trusted to host the data, not to be a source of markup or script. Every value
// below is checked here, so `ShopLink` and `SponsorBanner` only ever see values that are safe
// to put in an `href`, a `src` or a `fetch`. A URL that fails drops its field: required fields
// become '' (the templates already `{#if}` on them), optional ones are omitted.

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** A sponsor id ends up in a cookie name and a URL parameter, so it stays an identifier. */
const SPONSOR_ID = /^[A-Za-z0-9_.-]+$/;

/** Appended to a shop URL: a query string and nothing that could move the host or add a path. */
const UTM_PARAMS = /^\?[A-Za-z0-9_.~%=&+,:/-]*$/;

function sanitizeSponsorDetail(raw: unknown): SponsorDetail | null {
	if (!isRecord(raw)) return null;
	const utm = text(raw.utmParams);
	return {
		sponsorName: text(raw.sponsorName),
		// A CSS value for CrinGraph's overlay; nothing here renders it
		sponsorLogo: text(raw.sponsorLogo),
		utmParams: UTM_PARAMS.test(utm) ? utm : ''
	};
}

function sanitizeSponsorContent(raw: unknown): SponsorContent | null {
	if (!isRecord(raw)) return null;
	const sponsorId = text(raw.sponsorId);
	if (!SPONSOR_ID.test(sponsorId)) return null;

	const content: SponsorContent = {
		sponsorId,
		heading: text(raw.heading),
		sponsorshipName: text(raw.sponsorshipName),
		sponsorLogo: text(raw.sponsorLogo),
		sponsorMessage: text(raw.sponsorMessage),
		type: text(raw.type),
		creative: sanitizeHttpUrl(raw.creative) ?? '',
		creativeBgColor: text(raw.creativeBgColor),
		ctaText: text(raw.ctaText),
		ctaLink: sanitizeHttpUrl(raw.ctaLink) ?? ''
	};
	const cta2Text = text(raw.cta2Text);
	if (cta2Text) content.cta2Text = cta2Text;
	const cta2Link = sanitizeHttpUrl(raw.cta2Link);
	if (cta2Link) content.cta2Link = cta2Link;
	return content;
}

function sanitizeShopLinks(raw: unknown): ShopLinkEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: ShopLinkEntry[] = [];
	for (const entry of raw) {
		if (!isRecord(entry) || typeof entry.model !== 'string') continue;
		out.push({
			...(entry as unknown as ShopLinkEntry),
			hfg_com: sanitizeHttpUrl(entry.hfg_com) ?? '',
			hfg_amzus: sanitizeHttpUrl(entry.hfg_amzus) ?? '',
			hfg_amzjp: sanitizeHttpUrl(entry.hfg_amzjp) ?? '',
			hfg_ali: sanitizeHttpUrl(entry.hfg_ali) ?? ''
		});
	}
	return out;
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
	/** The sponsor script has answered (with a sponsor or without one). */
	#sponsorSettled = $state(false);
	#sponsorDismissedNow = $state(false);

	#shopLinksFetched = false;
	#sponsorDetailFetched = false;
	#sponsorContentLoad: Promise<void> | null = null;

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

	/** Whether the landing sponsor dialog runs on this site at all. */
	get isSponsorEnabled(): boolean {
		if (!this.isEnabled || this.isCurrentSiteOptedOut) return false;
		return getConfigValue('SQUIGLINK.ENABLE_SPONSOR') !== false;
	}

	/**
	 * Dismissal is per sponsor, so a new sponsorship shows straight away — which
	 * sponsor is live is only known after `squiglink-intro.js` loads.
	 */
	isSponsorDismissed(sponsorId: string): boolean {
		const name = sponsorDismissedCookie(sponsorId) + '=';
		return document.cookie.split(';').some((c) => c.trim().startsWith(name));
	}

	/**
	 * True while the landing sponsor dialog is still to come or is on screen: the sponsor
	 * script has not answered yet, or it named a sponsor this visitor has not dismissed.
	 * `AppShell` holds the version toast back on it — a toast shown behind a modal is
	 * unreachable. The dismissal cookie is not reactive, so `#sponsorSettled` and
	 * `#sponsorDismissedNow` are what make this re-evaluate.
	 */
	get sponsorBlocking(): boolean {
		if (!this.isSponsorEnabled) return false;
		if (!this.#sponsorSettled) return true;
		const sponsor = this.sponsorContent;
		if (!sponsor || this.#sponsorDismissedNow) return false;
		return !this.isSponsorDismissed(sponsor.sponsorId);
	}

	dismissSponsor(): void {
		this.#sponsorDismissedNow = true;
		if (!this.sponsorContent) return;
		// No domain attribute on a DEBUG host — a cookie naming another domain is rejected
		const host = window.location.hostname;
		const onSquiglink = host === SQUIGLINK_DOMAIN || host.endsWith('.' + SQUIGLINK_DOMAIN);
		document.cookie = sponsorDismissCookieString(this.sponsorContent.sponsorId, {
			domain: onSquiglink,
			secure: window.location.protocol === 'https:'
		});
	}

	// ── Data fetching ────────────────────────────────────────────────────────

	async fetchShopLinks(): Promise<void> {
		if (this.#shopLinksFetched || !this.isEnabled) return;

		try {
			// Low priority: the table only matters once a single device is on the graph, and
			// these requests would otherwise compete with the first curves
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/shoplinks.json`, { priority: 'low' });
			if (!res.ok) return;
			this.shopLinks = sanitizeShopLinks(await res.json());
			this.#shopLinksFetched = true;
		} catch {
			// Silently skip if shoplinks are unavailable
		}
	}

	async fetchSponsorDetail(): Promise<void> {
		if (this.#sponsorDetailFetched || !this.isEnabled) return;
		this.#sponsorDetailFetched = true;

		try {
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/shoplinks.js`, { priority: 'low' });
			if (!res.ok) return;

			// The script is CrinGraph code that declares `let sponsorDetails = { … };` ahead of
			// DOM work. Only the literal is read, as data: the script itself never runs, so
			// the page needs no `'unsafe-eval'`.
			const data = extractDeclaredLiteral(await res.text(), 'sponsorDetails');
			this.sponsorDetail = sanitizeSponsorDetail(data) ?? this.sponsorDetail;
		} catch {
			// Silently skip if the sponsor script is unavailable or not a plain literal
		}
	}

	/**
	 * Load the landing sponsor from `squiglink-intro.js`. `hooks.client.ts` starts
	 * this before the app mounts — on a first visit the sponsor creative is the
	 * page's LCP element — and `SponsorBanner` awaits the same run, so every
	 * caller shares one promise rather than returning before the data lands.
	 */
	fetchSponsorContent(): Promise<void> {
		if (!this.isEnabled) return Promise.resolve();
		this.#sponsorContentLoad ??= this.#loadSponsorContent();
		return this.#sponsorContentLoad;
	}

	async #loadSponsorContent(): Promise<void> {
		try {
			const res = await fetch(`https://${SQUIGLINK_DOMAIN}/squiglink-intro.js`);
			if (!res.ok) return;

			// Read `let contentSponsor = [ … ];` as data; the rest of the legacy script (its
			// overlay DOM code) never runs. See `sanitizeSponsorContent` for what survives.
			const data = extractDeclaredLiteral(await res.text(), 'contentSponsor');
			const sponsor = Array.isArray(data) ? sanitizeSponsorContent(data[0]) : null;
			if (sponsor) {
				this.sponsorContent = sponsor;
				// Start the creative download now instead of when the dialog mounts —
				// unless this sponsor was dismissed and the dialog will not open.
				const { creative, sponsorId } = sponsor;
				if (creative && !this.isSponsorDismissed(sponsorId)) {
					const img = new Image();
					img.fetchPriority = 'high';
					img.src = creative;
				}
			}
		} catch {
			// Silently skip if sponsor script is unavailable
		} finally {
			this.#sponsorSettled = true;
		}
	}

	async fetchSponsorProductData(hfg_com: string): Promise<SponsorProductData | null> {
		if (!this.isEnabled) return null;
		// The table is checked on load; this is a public method, so check the argument too
		const url = sanitizeHttpUrl(hfg_com);
		if (!url) return null;

		try {
			const res = await fetch(`${url}.json`, { priority: 'low' });
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
