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

import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
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

/** A store surface to count writes against. */
interface WriteTarget {
	label: string;
	target: object;
	/** Count assignment to every `$state` accessor on the prototype chain. */
	accessors?: boolean;
	/** Count calls to these write methods (the `SvelteMap` shape). */
	methods?: readonly string[];
}

export interface WriteBudget {
	/** Total instrumented writes so far. */
	get count(): number;
	/** Per-key totals, e.g. `{ 'frStore.set': 5, 'graphStore.yScale': 1 }`. */
	get breakdown(): Record<string, number>;
	restore: () => void;
}

/**
 * Trip a circuit breaker if the app writes reactive state more times than a
 * healthy boot ever needs.
 *
 * This is what actually catches a runaway effect. A reactive feedback loop blocks
 * the main thread synchronously, so it starves the event loop and vitest's own
 * timeout — which is a timer — never fires: the run would hang instead of failing.
 * Throwing from inside the write unwinds the loop and surfaces it as an ordinary
 * test failure, naming the key that ran away.
 *
 * Store-level rather than tied to any one component, so any write loop during boot
 * trips it — not just the one that prompted these tests. `$state` class fields
 * compile to accessor pairs on the prototype, so instrumenting every setter on the
 * chain covers the whole store without naming its fields here.
 */
export function installWriteBudget(limit: number): WriteBudget {
	const counts: Record<string, number> = {};
	const undo: (() => void)[] = [];
	let total = 0;
	let tripped = false;

	function record(key: string): void {
		counts[key] = (counts[key] ?? 0) + 1;
		total++;
		if (total > limit && !tripped) {
			tripped = true;
			for (const fn of undo) fn();
			throw new Error(
				`Reactive write budget exceeded during boot: ${total} writes (budget ${limit}), ` +
					`last was ${key}. Totals: ${JSON.stringify(counts)}. ` +
					'This is a runaway reactive write loop.'
			);
		}
	}

	function replace(obj: object, key: string, descriptor: PropertyDescriptor): void {
		const previous = Object.getOwnPropertyDescriptor(obj, key);
		Object.defineProperty(obj, key, { configurable: true, ...descriptor });
		undo.push(() => {
			if (previous) Object.defineProperty(obj, key, previous);
			else delete (obj as Record<string, unknown>)[key];
		});
	}

	for (const { label, target, accessors, methods } of writeTargets()) {
		if (accessors) {
			for (const key of accessorKeys(target)) {
				const proto = Object.getOwnPropertyDescriptor(prototypeOwning(target, key)!, key)!;
				replace(target, key, {
					get: () => proto.get!.call(target),
					set: (value: unknown) => {
						record(`${label}.${key}`);
						proto.set!.call(target, value);
					}
				});
			}
		}
		for (const name of methods ?? []) {
			const original = (target as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
			replace(target, name, {
				writable: true,
				value: (...args: unknown[]) => {
					record(`${label}.${name}`);
					return original.apply(target, args);
				}
			});
		}
	}

	return {
		get count() {
			return total;
		},
		get breakdown() {
			return { ...counts };
		},
		restore: () => {
			if (tripped) return;
			for (const fn of undo) fn();
		}
	};
}

/**
 * The reactive surfaces a boot legitimately writes. Listed here rather than
 * discovered so a new store has to be opted in deliberately.
 */
function writeTargets(): readonly WriteTarget[] {
	return [
		{ label: 'frStore', target: frStore, methods: ['set', 'delete'] },
		{ label: 'graphStore', target: graphStore, accessors: true },
		{
			label: 'targetOriginalData',
			target: graphStore.targetOriginalData,
			methods: ['set', 'delete']
		},
		{ label: 'eqStore', target: eqStore, accessors: true },
		{ label: 'eqModifiedData', target: eqStore.eqModifiedData, methods: ['set', 'delete'] }
	];
}

/** Prototype in `target`'s chain that owns `key`. */
function prototypeOwning(target: object, key: string): object | null {
	let proto = Object.getPrototypeOf(target);
	while (proto && proto !== Object.prototype) {
		if (Object.getOwnPropertyDescriptor(proto, key)) return proto;
		proto = Object.getPrototypeOf(proto);
	}
	return null;
}

/** Every get/set accessor pair on the prototype chain — i.e. every `$state` field. */
function accessorKeys(target: object): string[] {
	const keys: string[] = [];
	let proto = Object.getPrototypeOf(target);
	while (proto && proto !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (key === 'constructor' || keys.includes(key)) continue;
			const desc = Object.getOwnPropertyDescriptor(proto, key);
			if (desc?.get && desc.set) keys.push(key);
		}
		proto = Object.getPrototypeOf(proto);
	}
	return keys;
}

/** The demo target that `INITIAL_TARGETS` loads, once it lands in `frStore`. */
export function findTarget(identifier: string): [string, FRDataObject] | undefined {
	for (const entry of frStore.entries) {
		if (entry[1].type === 'target' && entry[1].identifier === identifier) return entry;
	}
	return undefined;
}
