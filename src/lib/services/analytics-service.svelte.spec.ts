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
