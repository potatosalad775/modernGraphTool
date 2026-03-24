import { browser } from '$app/environment';
import { getConfigValue } from '$lib/utils/config.js';
import { squiglinkStore } from '$lib/stores/squiglink-store.svelte.js';

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	}
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

		const measurementIds = (getConfigValue('SQUIGLINK.ANALYTICS_MEASUREMENT_IDS') as string[]) ?? [];
		if (measurementIds.length === 0) return;

		this.#siteName = (getConfigValue('SQUIGLINK.ANALYTICS_SITE') as string) ?? '';
		this.#logEvents = (getConfigValue('SQUIGLINK.LOG_ANALYTICS') as boolean) !== false;

		// Inject gtag.js with the first measurement ID
		const primaryId = measurementIds[0];
		const script = document.createElement('script');
		script.async = true;
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
