/**
 * Type definitions for the GraphAggregator cross-site index.
 *
 * The index is a single JSON document that lists every site, database and
 * device known to the aggregator, replacing the per-site `phone_book.json`
 * crawl. Schema: https://github.com/HarutoHiroki/GraphAggregator
 */

// ── Raw index document ───────────────────────────────────────────────────────

export interface AggregateSite {
	id: string;
	name: string;
	url: string;
	github?: string;
	lastVerified?: string;
	/** Absent for federated sites, `"squigsites"` for entries mirrored from squig.link. */
	source?: string;
}

export interface AggregateDb {
	id: string;
	siteId: string;
	/** `IEMs` | `Headphones` | `Earbuds` | `5128` — free-form in practice. */
	type: string;
	rig?: string;
	url: string;
	phoneBookUrl?: string;
	deltaReady?: boolean;
	source?: string;
}

/** A single measurement of a device in one database. */
export interface AggregateMeasurement {
	/** Database id, references `AggregateDb.id`. */
	db: string;
	/** Share slug. Derived from brand + name when absent. */
	s?: string;
}

/**
 * `phonesFormat: 'flat'` yields one entry per (device, database) pair with the
 * measurement inlined; `'collapsed'` groups measurements under `m`.
 */
export interface AggregatePhone {
	/** Index into `AggregateIndex.brands`. */
	b: number;
	/** Device name, without the brand. */
	n: string;
	db?: string;
	s?: string;
	m?: AggregateMeasurement[];
}

export interface AggregateIndex {
	v: number;
	generatedAt: string;
	phonesFormat: 'flat' | 'collapsed';
	brands: string[];
	sites: AggregateSite[];
	dbs: AggregateDb[];
	phones: AggregatePhone[];
}

// ── Cross-site search (computed, shared by both data sources) ────────────────

/**
 * One search hit. Produced from the aggregate index, or synthesized by the
 * squig.link phone-book fallback in `squiglink-store`.
 */
export interface CrossSiteSearchResult {
	siteId: string;
	siteName: string;
	dbId: string;
	dbType: string;
	deltaReady: boolean;
	brand: string;
	phoneName: string;
	/** Ready-to-use link into the other site, share slug already encoded. */
	url: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface CrossSiteSearchConfig {
	ENABLED: boolean;
	/** Empty → the built-in official aggregator URLs are used. */
	INDEX_URLS: string[];
	SQUIGLINK_FALLBACK: boolean;
}
