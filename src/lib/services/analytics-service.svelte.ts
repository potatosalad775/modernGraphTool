import { browser } from '$app/env';
import { getConfigValue } from '#lib/utils/config.js';
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

class AnalyticsService {
	#initialized = false;
	#siteName = '';
	#logEvents = true;
	#enabled = false;

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

		this.#siteName = (getConfigValue('SQUIGLINK.ANALYTICS_SITE') as string) ?? '';
		this.#logEvents = (getConfigValue('SQUIGLINK.LOG_ANALYTICS') as boolean) !== false;

		// Inject gtag.js with the first measurement ID. Low priority: the script has no part in
		// the first graph, and it should not compete with the phone book and the first curves.
		const primaryId = measurementIds[0];
		const script = document.createElement('script');
		script.async = true;
		script.fetchPriority = 'low';
		script.src = `https://www.googletagmanager.com/gtag/js?id=${primaryId}`;
		document.head.appendChild(script);

		// Initialize dataLayer and gtag function
		window.dataLayer = window.dataLayer || [];
		window.gtag = function (...args: unknown[]) {
			window.dataLayer.push(args);
		};
		window.gtag('js', new Date());

		// Configure all measurement IDs
		for (const id of measurementIds) {
			window.gtag('config', id);
		}

		this.#initialized = true;
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
