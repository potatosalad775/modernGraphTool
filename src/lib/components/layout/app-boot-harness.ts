/**
 * Test-only helpers for booting the whole app in a browser-mode test.
 *
 * These smoke tests exist because the rest of the suite never renders anything:
 * every other spec drives stores and services directly. A freeze on the default
 * config — no `?share=` parameter, operator defaults only — was therefore
 * invisible to a green suite, even though it made the app unusable.
 *
 * Not imported by any production module.
 */

import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/**
 * Load the real `defaults/config.js` into `window.GRAPHTOOL_CONFIG`.
 *
 * The file is fetched from the dev server (served out of `defaults/` by
 * `vite-plugin-defaults`) and executed the same way `app.html` executes it — as a
 * plain script that assigns the global. Using the shipped file rather than a
 * hand-written fixture is the point: these tests are meant to fail when the
 * defaults an operator actually receives stop working.
 */
export async function loadDefaultConfig(
	overrides: (cfg: Record<string, unknown>) => void = () => {}
): Promise<void> {
	const source = await fetch('/config.js').then((r) => r.text());
	new Function(source)();

	const cfg = window.GRAPHTOOL_CONFIG as Record<string, unknown>;

	// `defaults/config.js` uses paths relative to the deployment root ('./data/…').
	// The test page is served from a nested vitest URL, so make them absolute —
	// vite-plugin-defaults answers them out of `defaults/`.
	cfg.PATH = {
		PHONE_MEASUREMENT: '/data/phones',
		TARGET_MEASUREMENT: '/data/target',
		PHONE_BOOK: '/data/phone_book.json'
	};

	// `urlProvider.autoUpdate()` calls SvelteKit's `replaceState`, which throws
	// outside a mounted router. Component tests have no router.
	cfg.URL = { ...(cfg.URL as object), AUTO_UPDATE_URL: false };

	overrides(cfg);
}

/**
 * Trip a circuit breaker if the app writes to `frStore` more times than a healthy
 * boot ever needs.
 *
 * This is what actually catches a runaway effect. A reactive feedback loop blocks
 * the main thread synchronously, so it starves the event loop and vitest's own
 * timeout — which is a timer — never fires: the run would hang instead of failing.
 * Throwing from inside the write unwinds the loop and surfaces it as an ordinary
 * test failure.
 *
 * Deliberately store-level rather than tied to one component, so any write loop
 * during boot trips it, not just the one that prompted these tests.
 */
export function installFrWriteBudget(limit: number): { get count(): number; restore: () => void } {
	const original = frStore.set.bind(frStore);
	let count = 0;

	frStore.set = (uuid: string, obj: FRDataObject) => {
		if (++count > limit) {
			frStore.set = original;
			throw new Error(
				`frStore.set called ${count} times during boot (budget ${limit}) — ` +
					'runaway reactive write loop.'
			);
		}
		return original(uuid, obj);
	};

	return {
		get count() {
			return count;
		},
		restore: () => {
			frStore.set = original;
		}
	};
}

/** The demo target that `INITIAL_TARGETS` loads, once it lands in `frStore`. */
export function findTarget(identifier: string): [string, FRDataObject] | undefined {
	for (const entry of frStore.entries) {
		if (entry[1].type === 'target' && entry[1].identifier === identifier) return entry;
	}
	return undefined;
}
