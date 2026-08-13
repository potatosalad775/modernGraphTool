/**
 * Type definitions for the GAA site index — a small directory of every known
 * graph site and measurement database, used to render the site selector.
 *
 * Distinct from the GraphAggregator index in `aggregate-index-types.ts`: that
 * one carries the ~25k-device corpus for cross-site search, this one carries
 * only the directory. Schema: https://github.com/potatosalad775/GAA
 */

// ── Raw index document ───────────────────────────────────────────────────────

export interface SiteIndexSite {
	id: string;
	name: string;
	url: string;
	/** `federated` — registered with the aggregator directly; `squigsites` — mirrored. */
	source?: string;
	github?: string;
}

export interface SiteIndexDb {
	id: string;
	siteId: string;
	/** `IEMs` | `Headphones` | `Earbuds` | `5128` — free-form in practice. */
	type: string;
	/** Absolute, always ends in a slash. */
	url: string;
	deltaReady?: boolean;
	/**
	 * `false` when only the squig.link registry knew about this database — it is
	 * registered but was unreachable when the aggregator last crawled. Rendered
	 * dimmed rather than hidden, since a site that was briefly down should not
	 * disappear from navigation.
	 */
	verified?: boolean;
	rig?: string;
}

export interface SiteIndex {
	v: number;
	generatedAt: string;
	sources?: {
		aggregateIndex?: { url?: string; generatedAt?: string | null; fetchedAt?: string };
		squigsites?: { url?: string; fetchedAt?: string };
	};
	sites: SiteIndexSite[];
	dbs: SiteIndexDb[];
}

// ── Computed ─────────────────────────────────────────────────────────────────

/** One selectable database, flattened with its owning site for rendering. */
export interface SiteIndexEntry {
	dbId: string;
	siteId: string;
	siteName: string;
	type: string;
	url: string;
	deltaReady: boolean;
	verified: boolean;
	/** True when this database is the one the tool is currently served from. */
	isCurrent: boolean;
}

/** Databases of one rig class, for a grouped dropdown. */
export interface SiteIndexGroup {
	type: string;
	entries: SiteIndexEntry[];
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface SiteSelectorConfig {
	/**
	 * `auto` shows the selector when the current deployment appears in the index
	 * or is hosted on squig.link; `true` always shows it; `false` never does and
	 * skips the fetch entirely.
	 */
	ENABLED: 'auto' | boolean;
	/** Empty → the built-in official index URL is used. */
	INDEX_URLS: string[];
}
