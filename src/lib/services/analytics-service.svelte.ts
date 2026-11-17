import { browser } from '$app/env';
import { getConfigValue } from '#lib/utils/config.js';
import { trustedScriptUrl } from '#lib/utils/trusted-types.js';
import { squiglinkStore } from '#lib/stores/squiglink-store.svelte.js';

declare global {
	interface Window {
		dataLayer: unknown[];
		gtmDataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	}
}

/**
 * squig.link's shared Tag Manager container, the one `graphAnalytics.js` loads on every
 * CrinGraph site there. It forwards the events below to squig.link's own GA4 property, so it is
 * built in: an operator sets a site name, not an ID.
 */
export const SQUIGLINK_CONTAINER = 'GTM-N74Z5L8';

/**
 * A GA4 measurement ID (`G-`) or a Tag Manager container (`GTM-`). The value goes into a script
 * URL, so nothing else gets through.
 */
const TAG_ID = /^(G|GTM)-[A-Z0-9]+$/;

/**
 * The containers' own data layer. Not `dataLayer`: a container also fires on a `gtag('event')`
 * queued there, so with a GA4 ID of the operator's next to it every event name the two share
 * (`clicked_download`, `shoplink_click`) would be counted twice.
 */
const CONTAINER_LAYER = 'gtmDataLayer';

/** The name the squig.link container's triggers know an event by, where ours differs. */
const CONTAINER_EVENT_NAMES: Record<string, string> = { phone_added: 'phone_displayed' };

/**
 * A gtag command in the only form Google's scripts read from a data layer: an `arguments`
 * object. An array (rest parameters) is silently ignored, so this must stay a plain function.
 */
function gtagCommand(...args: unknown[]): IArguments;
function gtagCommand(): IArguments {
	// eslint-disable-next-line prefer-rest-params
	return arguments;
}

/** Global Privacy Control: the visitor's browser says "do not sell or share my data". */
function privacyControlOn(): boolean {
	return (
		(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
	);
}

/** The devices in `?share=`, the way the CrinGraph script reports them; `'null'` without any. */
function activePhones(): string {
	const share = new URLSearchParams(window.location.search).get('share');
	return share ? share.replace(/_/g, ' ').replace(/,/g, ', ') : 'null';
}

type Consent = 'granted' | 'denied';

/** The visitor's own answer from the Misc panel switch. Absent until they touch it. */
const CONSENT_KEY = 'gt-analytics-consent';

function storedConsent(): Consent | null {
	try {
		const value = localStorage.getItem(CONSENT_KEY);
		return value === 'granted' || value === 'denied' ? value : null;
	} catch {
		return null;
	}
}

class AnalyticsService {
	#initialized = false;
	#loaded = false;
	/** Tag Manager containers: squig.link's, then any of the operator's. */
	#containers: string[] = [];
	/** The operator's own GA4 properties. */
	#measurementIds: string[] = [];
	#siteName = '';
	#logEvents = true;
	#enabled = false;

	/** This deployment has analytics for this visitor, so the Misc panel offers the switch. */
	available = $state(false);
	/** Consent Mode's `analytics_storage`: the visitor's answer, else the operator's default. */
	consent = $state<Consent>('granted');

	init(): void {
		if (!browser || this.#initialized || !squiglinkStore.isEnabled) return;

		const enableAnalytics = getConfigValue('SQUIGLINK.ENABLE_ANALYTICS') as boolean | undefined;
		if (enableAnalytics === false) return;

		// A visitor who sends the signal loads no analytics at all: no script, no events.
		if (privacyControlOn()) return;

		const configured = getConfigValue('SQUIGLINK.ANALYTICS_MEASUREMENT_IDS');
		const containers = [SQUIGLINK_CONTAINER];
		const measurementIds: string[] = [];
		for (const id of Array.isArray(configured) ? configured : []) {
			if (typeof id !== 'string' || !TAG_ID.test(id)) {
				console.warn('[Analytics] Skipping an ID that is neither G-… nor GTM-…:', id);
				continue;
			}
			const list = id.startsWith('GTM-') ? containers : measurementIds;
			if (!list.includes(id)) list.push(id);
		}

		this.#containers = containers;
		this.#measurementIds = measurementIds;
		this.#siteName = (getConfigValue('SQUIGLINK.ANALYTICS_SITE') as string) ?? '';
		this.#logEvents = (getConfigValue('SQUIGLINK.LOG_ANALYTICS') as boolean) !== false;
		this.#initialized = true;
		this.available = true;

		const stored = storedConsent();
		const fallback =
			getConfigValue('SQUIGLINK.ANALYTICS_CONSENT') === 'denied' ? 'denied' : 'granted';
		this.consent = stored ?? fallback;

		// A visitor who switched it off gets what Global Privacy Control gets: nothing loads.
		// The operator's `denied` default is different: Consent Mode still runs, without storage.
		if (stored === 'denied') return;
		this.#load();
	}

	/** The Misc panel switch. The answer is kept, and outranks the operator's default. */
	setConsent(granted: boolean): void {
		if (!this.available) return;
		this.consent = granted ? 'granted' : 'denied';
		try {
			localStorage.setItem(CONSENT_KEY, this.consent);
		} catch {
			// Private mode: the answer lasts for this page only.
		}

		if (!this.#loaded) {
			if (granted) this.#load();
			return;
		}
		window.gtag('consent', 'update', { analytics_storage: this.consent });
		// The scripts stay in the page until the next load; this stops our own events meanwhile.
		this.#enabled = granted;
	}

	/** Low priority: no script here has a part in the first graph or should compete with it. */
	#inject(url: string): void {
		const script = document.createElement('script');
		script.async = true;
		script.fetchPriority = 'low';
		script.src = trustedScriptUrl(url);
		document.head.appendChild(script);
	}

	#load(): void {
		window.dataLayer = window.dataLayer || [];
		window[CONTAINER_LAYER] = window[CONTAINER_LAYER] || [];
		// A consent command has to reach both layers, also when a banner of the operator's
		// sends it; everything else stays on gtag.js's own layer.
		window.gtag = function () {
			// eslint-disable-next-line prefer-rest-params
			window.dataLayer.push(arguments);
			// eslint-disable-next-line prefer-rest-params
			if (arguments[0] === 'consent') window[CONTAINER_LAYER].push(arguments);
		};

		// Consent Mode v2: the defaults have to be queued ahead of `config` and of a container's
		// start. This tool shows no ads, so the three advertising signals are always denied.
		window.gtag('consent', 'default', {
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied',
			analytics_storage: this.consent
		});

		window[CONTAINER_LAYER].push({ 'gtm.start': Date.now(), event: 'gtm.js' });
		for (const id of this.#containers) {
			this.#inject(`https://www.googletagmanager.com/gtm.js?id=${id}&l=${CONTAINER_LAYER}`);
		}

		if (this.#measurementIds.length > 0) {
			// gtag.js is loaded once, with the first ID, and configured for all of them.
			this.#inject(`https://www.googletagmanager.com/gtag/js?id=${this.#measurementIds[0]}`);
			window.gtag('js', new Date());
			for (const id of this.#measurementIds) {
				window.gtag('config', id);
			}
		}

		this.#loaded = true;
		this.#enabled = true;
	}

	/**
	 * One event, to both kinds of destination: `containerFields` as a plain object for the
	 * containers (the shape `graphAnalytics.js` pushes, which squig.link's triggers read), and
	 * `params` as a gtag event for the operator's GA4 IDs.
	 */
	#send(
		eventName: string,
		params: Record<string, unknown>,
		containerFields: Record<string, unknown>
	): void {
		if (this.#logEvents) {
			console.log(`[Analytics] ${eventName}`, params);
		}

		window[CONTAINER_LAYER].push({
			event: CONTAINER_EVENT_NAMES[eventName] ?? eventName,
			trigger: 'user',
			site: this.#siteName,
			...containerFields,
			value: 1
		});
		if (this.#measurementIds.length > 0) {
			window.dataLayer.push(gtagCommand('event', eventName, params));
		}
	}

	trackPhoneEvent(
		eventName: string,
		phoneData: { brand?: string; model?: string; variant?: string }
	): void {
		if (!this.#enabled) return;

		const brand = phoneData.brand ?? '';
		const model = phoneData.model ?? '';
		const variant = phoneData.variant ?? '';

		this.#send(
			eventName,
			{
				site: this.#siteName,
				phone_brand: brand,
				phone_model: model,
				phone_variant: variant,
				value: 1
			},
			{
				phoneBrand: brand,
				phoneModel: model,
				// CrinGraph's `dispName`: the name the variant is listed under
				phoneVariant: variant ? `${model} ${variant}` : model,
				phoneName: `${brand} ${model}`.trim()
			}
		);
	}

	/**
	 * @param other  the event's one free-text detail in the container's shape (CrinGraph's
	 *               `other`), e.g. `"<sponsor>: <model>"` for a shop link
	 */
	trackGeneralEvent(eventName: string, data?: Record<string, unknown>, other?: string): void {
		if (!this.#enabled) return;

		this.#send(
			eventName,
			{ site: this.#siteName, ...data, value: 1 },
			{ activePhones: activePhones(), other: other ?? 'null' }
		);
	}
}

export const analyticsService = new AnalyticsService();
