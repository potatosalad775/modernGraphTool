import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const config = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock('#lib/utils/config.js', () => ({
	getConfigValue: (path: string) => config.values[path]
}));
vi.mock('#lib/stores/squiglink-store.svelte.js', () => ({ squiglinkStore: { isEnabled: true } }));

const SCRIPT = 'script[src^="https://www.googletagmanager.com/gtag/js"]';

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
	document.querySelectorAll(SCRIPT).forEach((el) => el.remove());
	window.dataLayer = [];
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
	document.querySelectorAll(SCRIPT).forEach((el) => el.remove());
	vi.restoreAllMocks();
});

describe('analyticsService.init', () => {
	it('injects gtag.js at low fetch priority', async () => {
		(await freshService()).init();
		const script = document.querySelector<HTMLScriptElement>(SCRIPT);
		expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123');
		expect(script?.fetchPriority).toBe('low');
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

	it('loads nothing when no ID is valid', async () => {
		config.values['SQUIGLINK.ANALYTICS_MEASUREMENT_IDS'] = ['"><script>', 'UA-1'];
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('x');
		expect(document.querySelector(SCRIPT)).toBeNull();
		expect(window.dataLayer).toEqual([]);
	});

	it('loads nothing for a visitor who sends Global Privacy Control', async () => {
		setGpc(true);
		const service = await freshService();
		service.init();
		service.trackGeneralEvent('x');
		expect(document.querySelector(SCRIPT)).toBeNull();
		expect(window.dataLayer).toEqual([]);
	});

	it('is not switched off by a Global Privacy Control of false', async () => {
		setGpc(false);
		(await freshService()).init();
		expect(document.querySelector(SCRIPT)).not.toBeNull();
	});
});

/** Every queued gtag command as a plain array. */
function commands(): unknown[][] {
	return window.dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>));
}

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
		expect(document.querySelector(SCRIPT)).toBeNull();
		expect(window.dataLayer).toEqual([]);
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
		expect(localStorage.getItem('gt-analytics-consent')).toBe('denied');

		const before = window.dataLayer.length;
		service.trackGeneralEvent('x');
		expect(window.dataLayer.length).toBe(before);

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
		expect(document.querySelector(SCRIPT)).toBeNull();
	});
});
