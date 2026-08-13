/**
 * Type definitions for squig.link integration data structures.
 *
 * The site registry (`squigsites.json`) and per-site phone-book types that used
 * to live here are gone: the site selector reads the GAA site index instead
 * (`site-index-types.ts`), and cross-site search reads the GraphAggregator index
 * (`aggregate-index-types.ts`). What remains is the squig.link-only commercial
 * integration.
 */

// ── Shop Links (from shoplinks.json) ─────────────────────────────────────────

export interface ShopLinkEntry {
	model: string;
	squiglink_url: string;
	embed_code: string;
	type: string;
	hfg_com: string;
	hfg_amzus: string;
	hfg_amzjp: string;
	hfg_ali: string;
}

// ── Sponsor Detail (from sponsorDetails in shoplinks.js) ─────────────────────
export interface SponsorDetail {
	sponsorName: string;
	sponsorLogo: string;
	utmParams: string;
}

// ── Sponsor Content (from contentSponsor in squiglink-intro.js) ──────────────

export interface SponsorContent {
	sponsorId: string;
	heading: string;
	sponsorshipName: string;
	sponsorLogo: string;
	sponsorMessage: string;
	type: string;
	creative: string;
	creativeBgColor: string;
	ctaText: string;
	cta2Text?: string;
	ctaLink: string;
	cta2Link?: string;
}

// ── Sponsor Product Data ─────────────────────────────────────────────────────
export interface SponsorProductData {
	currentPrice: string;
	originalPrice: string;
	onSale: boolean;
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface SquiglinkConfig {
	ENABLED: boolean;
	ANALYTICS_MEASUREMENT_IDS: string[];
	ANALYTICS_SITE: string;
	LOG_ANALYTICS: boolean;
	ENABLE_ANALYTICS: boolean;
	/** @deprecated Use `CROSS_SITE_SEARCH.ENABLED`. Read as a fallback only. */
	ENABLE_CROSS_SITE_SEARCH: boolean;
	ENABLE_SPONSOR: boolean;
}
