import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const config = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock('#lib/utils/config.js', () => ({
	getConfigValue: (path: string) => config.values[path]
}));
vi.mock('#lib/stores/squiglink-store.svelte.js', () => ({ squiglinkStore: { isEnabled: true } }));

const SCRIPT = 'script[src^="https://www.googletagmanager.com/gtag/js"]';
const CONTAINER = 'script[src^="https://www.googletagmanager.com/gtm.js"]';
const ANY_SCRIPT = 'script[src^="https://www.googletagmanager.com/"]';

let copies = 0;

/** A new service per case: the module is a singleton, and a query string makes a new copy. */
async function freshService() {
	const url = `./analytics-service.svelte.ts?copy=${++copies}`;
	return ((await import(/* @vite-ignore */ url)) as typeof import('./analytics-service.svelte.js'))
		.analyticsService;
}

function setGpc(value: boolean | undefined) {
	Object.defineProperty(navigator, 'globalPrivacyControl', { value, configurable: true });
}

beforeEach(() => {
	config.values = { 'SQUIGLINK.ANALYTICS_MEASUREMENT_IDS': ['G-ABC123'] };
	document.querySelectorAll(ANY_SCRIPT).forEach((el) => el.remove());
	window.dataLayer = [];
	window.gtmDataLayer = [];
	localStorage.removeItem('gt-analytics-consent');
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	// Never fetch the real gtag.js: a script of an unknown type is inert, but keeps its `src`
	// for the assertions. Loaded for real it pushes its own events into `dataLayer`.
	const append = document.head.appendChild.bind(document.head);
	vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
		if (node instanceof HTMLScriptElement) node.type = 'text/plain';
		return append(node);
	});
});

afterEach(() => {
	delete (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl;
	document.querySelectorAll(ANY_SCRIPT).forEach((el) => el.remove());
	vi.restoreAllMocks();
});

describe('analyticsService.init', () => {
	it('injects gtag.js at low fetch priority', async () => {
		(await freshService()).init();
		const script = document.querySelector<HTMLScriptElement>(SCRIPT);
		expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123');
		expect(script?.fetchPriority).toBe('low');
	});

	it("loads squig.link's container on its own data layer, with no ID configured", async () => {
		config.values = {};
		const service = await freshService();
		service.init();
		const scripts = [...document.querySelectorAll<HTMLScriptElement>(CONTAINER)];
		expect(scripts.map((s) => s.src)).toEqual([
			'https://www.googletagmanager.com/gtm.js?id=GTM-N74Z5L8&l=gtmDataLayer'
		]);
		expect(scripts[0].fetchPriority).toBe('low');
		expect(document.querySelector(SCRIPT)).toBeNull();
		expect(window.gtmDataLayer[1]).toMatchObject({ event: 'gtm.js' });
		expect(service.available).toBe(true);
	});

	it("adds an operator's container once, next to the built-in one", async () => {
		config.values['SQUIGLINK.ANALYTICS_MEASUREMENT_IDS'] = ['GTM-N74Z5L8', 'GTM-OWN1', 'GTM-OWN1'];
		(await freshService()).init();
		const ids = [...document.querySelectorAll<HTMLScriptElement>(CONTAINER)].map((s) =>
			new URL(s.src).searchParams.get('id')
		);
		expect(ids).toEqual(['GTM-N74Z5L8', 'GTM-OWN1']);
		expect(console.warn).not.toHaveBeenCalled();
	});

	it('skips an invalid measurement ID with a warning and keeps the valid ones', async () => {
		config.values['SQUIGLINK.ANALYTICS_MEASUREMENT_IDS'] = [
			'G-BAD&x=1',
			'g-lower',
			42,
			'G-GOOD1',
			'G-SECOND'
		];
		(await freshService()).init();
		expect(document.querySelector<HTMLScriptElement>(SCRIPT)?.src).toContain('id=G-GOOD1');
		const configured = window.dataLayer
			.map((entry) => Array.from(entry as ArrayLike<unknown>))
			.filter((args) => args[0] === 'config')
			.map((args) => args[1]);
		expect(configured).toEqual(['G-GOOD1', 'G-SECOND']);
		expect(console.warn).toHaveBeenCalledTimes(3);
	});

	it('loads no gtag.js when no measurement ID is valid', async () => {
		config.values['SQUIGLINK.ANALYTICS_MEASUREMENT_IDS'] = ['"><script>', 'UA-1'];
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('x');
		expect(document.querySelector(SCRIPT)).toBeNull();
		expect(commands().some((c) => c[0] === 'config' || c[0] === 'event')).toBe(false);
		expect(document.querySelectorAll(CONTAINER).length).toBe(1);
	});

	it('loads nothing for a visitor who sends Global Privacy Control', async () => {
		setGpc(true);
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('x');
		expect(document.querySelector(ANY_SCRIPT)).toBeNull();
		expect(window.dataLayer).toEqual([]);
		expect(window.gtmDataLayer).toEqual([]);
	});

	it('is not switched off by a Global Privacy Control of false', async () => {
		setGpc(false);
		(await freshService()).init();
		expect(document.querySelector(SCRIPT)).not.toBeNull();
	});
});

/** Every gtag command queued on a layer, as a plain array. */
function commands(layer: unknown[] = window.dataLayer): unknown[][] {
	return layer
		.filter((entry) => Object.prototype.toString.call(entry) === '[object Arguments]')
		.map((entry) => Array.from(entry as ArrayLike<unknown>));
}

describe('analyticsService events', () => {
	const pushed = () =>
		window.gtmDataLayer.filter(
			(e) => Object.prototype.toString.call(e) === '[object Object]'
		) as Record<string, unknown>[];

	it('sends a device to the container in the CrinGraph shape and under its name', async () => {
		config.values['SQUIGLINK.ANALYTICS_SITE'] = 'My Site';
		const service = await freshService();
		service.init();
		service.trackPhoneEvent('phone_added', { brand: 'KEFINE', model: 'Delci', variant: '(S)' });
		expect(pushed().at(-1)).toEqual({
			event: 'phone_displayed',
			trigger: 'user',
			site: 'My Site',
			phoneBrand: 'KEFINE',
			phoneModel: 'Delci',
			phoneVariant: 'Delci (S)',
			phoneName: 'KEFINE Delci',
			value: 1
		});
		expect(commands().at(-1)).toEqual([
			'event',
			'phone_added',
			{
				site: 'My Site',
				phone_brand: 'KEFINE',
				phone_model: 'Delci',
				phone_variant: '(S)',
				value: 1
			}
		]);
	});

	it('keeps every other event name, with its detail in the container field', async () => {
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('shoplink_click', { model: 'Delci' }, 'HiFiGo: Delci');
		service.trackGeneralEvent('clicked_download');
		expect(pushed().slice(-2)).toMatchObject([
			{ event: 'shoplink_click', other: 'HiFiGo: Delci', trigger: 'user', value: 1 },
			{ event: 'clicked_download', other: 'null' }
		]);
		expect(pushed().at(-1)).toHaveProperty('activePhones');
	});

	it('keeps the two kinds of event on their own layers, so none is counted twice', async () => {
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('clicked_download');
		expect(commands(window.gtmDataLayer).every((c) => c[0] === 'consent')).toBe(true);
		expect(
			window.dataLayer.every((e) => Object.prototype.toString.call(e) === '[object Arguments]')
		).toBe(true);
	});

	it('sends no gtag event without a measurement ID', async () => {
		config.values = {};
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('clicked_download');
		expect(commands().some((c) => c[0] === 'event')).toBe(false);
		expect(pushed().at(-1)).toMatchObject({ event: 'clicked_download' });
	});
});

describe('analyticsService consent', () => {
	it('queues commands as arguments objects, which is the only form gtag.js reads', async () => {
		(await freshService()).init();
		expect(window.dataLayer.length).toBeGreaterThan(0);
		for (const entry of window.dataLayer) {
			expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
		}
	});

	it('sets Consent Mode defaults ahead of config, granted unless configured', async () => {
		const service = await freshService();
		service.init();
		const queued = commands();
		expect(queued[0]).toEqual([
			'consent',
			'default',
			{
				ad_storage: 'denied',
				ad_user_data: 'denied',
				ad_personalization: 'denied',
				analytics_storage: 'granted'
			}
		]);
		expect(queued.findIndex((c) => c[0] === 'config')).toBeGreaterThan(0);
		// The container gets the same defaults, ahead of its start event
		expect(commands(window.gtmDataLayer)[0]).toEqual(queued[0]);
		expect(window.gtmDataLayer[0]).not.toHaveProperty('event');
		expect(service.available).toBe(true);
		expect(service.consent).toBe('granted');
	});

	it("starts denied under the operator's default and still loads", async () => {
		config.values['SQUIGLINK.ANALYTICS_CONSENT'] = 'denied';
		const service = await freshService();
		service.init();
		expect(document.querySelector(SCRIPT)).not.toBeNull();
		expect(commands()[0][2]).toMatchObject({ analytics_storage: 'denied' });
		expect(service.consent).toBe('denied');
	});

	it("lets the visitor's stored answer outrank the operator's default", async () => {
		config.values['SQUIGLINK.ANALYTICS_CONSENT'] = 'denied';
		localStorage.setItem('gt-analytics-consent', 'granted');
		(await freshService()).init();
		expect(commands()[0][2]).toMatchObject({ analytics_storage: 'granted' });
	});

	it('loads nothing for a visitor who switched it off, but keeps the switch', async () => {
		localStorage.setItem('gt-analytics-consent', 'denied');
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('x');
		expect(document.querySelector(ANY_SCRIPT)).toBeNull();
		expect(window.dataLayer).toEqual([]);
		expect(window.gtmDataLayer).toEqual([]);
		expect(service.available).toBe(true);
		expect(service.consent).toBe('denied');

		service.setConsent(true);
		expect(document.querySelector(SCRIPT)).not.toBeNull();
		expect(localStorage.getItem('gt-analytics-consent')).toBe('granted');
		expect(commands()[0][2]).toMatchObject({ analytics_storage: 'granted' });
	});

	it('updates consent and stops its own events when switched off mid-session', async () => {
		const service = await freshService();
		service.init();
		service.setConsent(false);
		expect(commands().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
		expect(commands(window.gtmDataLayer).at(-1)).toEqual(commands().at(-1));
		expect(localStorage.getItem('gt-analytics-consent')).toBe('denied');

		const before = window.dataLayer.length + window.gtmDataLayer.length;
		service.trackGeneralEvent('x');
		expect(window.dataLayer.length + window.gtmDataLayer.length).toBe(before);

		service.setConsent(true);
		service.trackGeneralEvent('x');
		expect(commands().at(-1)?.[0]).toBe('event');
	});

	it('offers no switch where analytics is off', async () => {
		config.values['SQUIGLINK.ENABLE_ANALYTICS'] = false;
		const service = await freshService();
		service.init();
		service.setConsent(true);
		expect(service.available).toBe(false);
		expect(document.querySelector(ANY_SCRIPT)).toBeNull();
	});
});
