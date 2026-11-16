import { browser } from '$app/env';
import { getConfigValue } from '#lib/utils/config.js';
import { trustedScriptUrl } from '#lib/utils/trusted-types.js';
import { squiglinkStore } from '#lib/stores/squiglink-store.svelte.js';

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	}
}

/** A GA4 measurement ID. The value goes into a script URL, so nothing else gets through. */
const MEASUREMENT_ID = /^G-[A-Z0-9]+$/;

/** Global Privacy Control: the visitor's browser says "do not sell or share my data". */
function privacyControlOn(): boolean {
	return (
		(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
	);
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
		const measurementIds: string[] = [];
		for (const id of Array.isArray(configured) ? configured : []) {
			if (typeof id === 'string' && MEASUREMENT_ID.test(id)) measurementIds.push(id);
			else console.warn('[Analytics] Skipping an invalid measurement ID:', id);
		}

		if (measurementIds.length === 0) return;

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
		// gtag.js stays in the page until the next load; this stops our own events meanwhile.
		this.#enabled = granted;
	}

	#load(): void {
		// Inject gtag.js with the first measurement ID. Low priority: the script has no part in
		// the first graph, and it should not compete with the phone book and the first curves.
		const script = document.createElement('script');
		script.async = true;
		script.fetchPriority = 'low';
		script.src = trustedScriptUrl(
			`https://www.googletagmanager.com/gtag/js?id=${this.#measurementIds[0]}`
		);
		document.head.appendChild(script);

		// gtag.js only acts on `arguments` objects in the data layer. An array (rest parameters)
		// is silently ignored, so this must stay a plain function.
		window.dataLayer = window.dataLayer || [];
		window.gtag = function () {
			// eslint-disable-next-line prefer-rest-params
			window.dataLayer.push(arguments);
		};

		// Consent Mode v2: the defaults have to be queued ahead of `config`. This tool shows no
		// ads, so the three advertising signals are always denied.
		window.gtag('consent', 'default', {
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied',
			analytics_storage: this.consent
		});
		window.gtag('js', new Date());

		// Configure all measurement IDs
		for (const id of this.#measurementIds) {
			window.gtag('config', id);
		}

		this.#loaded = true;
		this.#enabled = true;
	}

	trackPhoneEvent(
		eventName: string,
		phoneData: { brand?: string; model?: string; variant?: string }
	): void {
		if (!this.#enabled) return;

		const params = {
			site: this.#siteName,
			phone_brand: phoneData.brand ?? '',
			phone_model: phoneData.model ?? '',
			phone_variant: phoneData.variant ?? '',
			value: 1
		};

		if (this.#logEvents) {
			console.log(`[Analytics] ${eventName}`, params);
		}

		window.gtag('event', eventName, params);
	}

	trackGeneralEvent(eventName: string, data?: Record<string, unknown>): void {
		if (!this.#enabled) return;

		const params = {
			site: this.#siteName,
			...data,
			value: 1
		};

		if (this.#logEvents) {
			console.log(`[Analytics] ${eventName}`, params);
		}

		window.gtag('event', eventName, params);
	}
}

export const analyticsService = new AnalyticsService();
