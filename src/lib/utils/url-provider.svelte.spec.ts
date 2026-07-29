/**
 * `URLProvider` is the half of share-URL handling that touches the browser —
 * `window.location`, `document`, `replaceState` and the stores. The pure
 * encode/decode half lives in `url-state.ts` and has its own spec.
 *
 * Runs in the `client` project because it needs a real `document`, a real
 * `history` to drive `window.location.search`, and real store reactivity.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
import Base62 from './base62.js';
import { urlProvider } from './url-provider.js';
import { replaceState } from '$app/navigation';
import type { URLState } from './url-state.js';
import type { FRDataObject } from '$lib/types/data-types.js';

// `replaceState` throws outside a mounted SvelteKit router, which no component
// test has. Stubbing it lets the navigation branch be asserted directly.
vi.mock('$app/navigation', () => ({ replaceState: vi.fn() }));

const ORIGINAL_SEARCH = window.location.search;
// `init()` snapshots `document.title` as the base that device names get appended
// to, and `updateURL()` writes the combined title back. Without a reset between
// tests each `init()` would treat the previous test's decorated title as its base.
const ORIGINAL_TITLE = document.title;

function setSearch(search: string) {
	history.replaceState(null, '', window.location.pathname + search);
}

function makeEntry(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Phone ${uuid}`,
		channels: {
			AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: '#00ff00' },
		dash: '1 0',
		...overrides
	};
}

/** Encode a `state=` value the same way `buildQueryString` does. */
function encodeState(state: URLState): string {
	return Base62.encode(JSON.stringify(state));
}

describe('URLProvider', () => {
	beforeEach(() => {
		vi.mocked(replaceState).mockClear();
		frStore.clear();
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.targetOriginalData.clear();
		graphStore.yScale = 50;
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqStore.isEnabled = false;
		graphEngine.isInitialized = false;
		window.GRAPHTOOL_CONFIG = {
			URL: { AUTO_UPDATE_URL: true, COMPRESS_URL: false },
			VISUALIZATION: { DEFAULT_Y_SCALE: '50' }
		} as never;
		document.title = ORIGINAL_TITLE;
		setSearch('');
	});

	afterEach(() => {
		document.title = ORIGINAL_TITLE;
		setSearch(ORIGINAL_SEARCH);
		delete (window as { GRAPHTOOL_CONFIG?: unknown }).GRAPHTOOL_CONFIG;
	});

	// ── init + reads ─────────────────────────────────────────────────────────

	describe('init', () => {
		it('parses device names out of `?share=`', () => {
			setSearch('?share=Phone_A,Phone_B');
			urlProvider.init();
			expect(urlProvider.phoneDataFromURL).toEqual(['Phone A', 'Phone B']);
		});

		it('keeps a parenthesised variant as one name', () => {
			setSearch(`?share=${encodeURIComponent('Phone A (V2, black),Phone B')}`);
			urlProvider.init();
			expect(urlProvider.phoneDataFromURL).toEqual(['Phone A (V2, black)', 'Phone B']);
		});

		it('yields an empty list when there is no `share=`', () => {
			urlProvider.init();
			expect(urlProvider.phoneDataFromURL).toEqual([]);
			expect(urlProvider.stateFromURL).toBeNull();
		});

		it('decodes a `?state=` payload', () => {
			setSearch(`?state=${encodeState({ yScale: 80 })}`);
			urlProvider.init();
			expect(urlProvider.stateFromURL).toEqual({ yScale: 80 });
		});

		it('treats a malformed `?state=` as absent rather than throwing', () => {
			setSearch('?state=!!!not-base62!!!');
			urlProvider.init();
			expect(urlProvider.stateFromURL).toBeNull();
		});
	});

	// ── URL building ─────────────────────────────────────────────────────────

	describe('getCurrentURL', () => {
		beforeEach(() => urlProvider.init());

		it('returns the bare base URL when nothing is loaded', () => {
			expect(urlProvider.getCurrentURL()).not.toContain('?');
		});

		it('lists every loaded device in `share=`', () => {
			frStore.set('a', makeEntry('a'));
			frStore.set('b', makeEntry('b'));

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(params.get('share')).toBe('Phone a,Phone b');
		});

		it('appends dispSuffix to the shared name', () => {
			frStore.set('a', makeEntry('a', { dispSuffix: 'V2' }));

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(params.get('share')).toBe('Phone a V2');
		});

		it('escapes `&` in a device name so the parameter survives a round trip', () => {
			frStore.set('a', makeEntry('a', { identifier: 'Sennheiser HD 6XX & Friends' }));

			const url = urlProvider.getCurrentURL();
			expect(url).not.toContain('& Friends');

			const params = new URLSearchParams(new URL(url).search);
			expect(params.get('share')).toBe('Sennheiser HD 6XX & Friends');
		});

		it('omits `state=` while the graph sits at operator defaults', () => {
			frStore.set('a', makeEntry('a'));
			expect(urlProvider.getCurrentURL()).not.toContain('state=');
		});

		it('emits `state=` once yScale differs from the configured default', () => {
			frStore.set('a', makeEntry('a'));
			graphStore.yScale = 80;

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(JSON.parse(Base62.decode(params.get('state')!))).toMatchObject({ yScale: 80 });
		});

		it('records the baseline by name and mode', () => {
			frStore.set('a', makeEntry('a', { dispSuffix: 'V2' }));
			graphStore.baselineUUID = 'a';
			graphStore.baselineMode = 'withoutAdjustment';

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(JSON.parse(Base62.decode(params.get('state')!)).baseline).toEqual({
				key: 'Phone a V2',
				mode: 'withoutAdjustment'
			});
		});

		it('ignores a baseline UUID that is no longer in the store', () => {
			frStore.set('a', makeEntry('a'));
			graphStore.baselineUUID = 'gone';

			expect(urlProvider.getCurrentURL()).not.toContain('state=');
		});

		it('records non-zero y-offsets and skips zero ones', () => {
			frStore.set('a', makeEntry('a', { yOffset: 3 }));
			frStore.set('b', makeEntry('b', { yOffset: 0 }));

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(JSON.parse(Base62.decode(params.get('state')!)).yOffsets).toEqual({ 'Phone a': 3 });
		});

		it('records sample display selections', () => {
			frStore.set('a', makeEntry('a', { dispSamples: ['L1', 'R1'] }));

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(JSON.parse(Base62.decode(params.get('state')!)).sampleDisplay).toEqual({
				'Phone a': ['L1', 'R1']
			});
		});

		it('records HpTF display state for any entry that has HpTF data', () => {
			frStore.set(
				'a',
				makeEntry('a', {
					hptf: { samples: [], envelope: {}, labels: [], fillOnly: false } as never,
					dispHptf: ['sample0_AVG'],
					hptfFillVisible: true
				})
			);

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search);
			expect(JSON.parse(Base62.decode(params.get('state')!)).hptfDisplay).toEqual({
				'Phone a': { keys: ['sample0_AVG'], fill: true }
			});
		});

		it('omits EQ state — that is `getCurrentURLWithEQ`', () => {
			frStore.set('a', makeEntry('a'));
			eqStore.filters = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 }];
			eqStore.preamp = -3;

			expect(urlProvider.getCurrentURL()).not.toContain('state=');
		});
	});

	describe('getCurrentURLWithEQ', () => {
		beforeEach(() => urlProvider.init());

		it('embeds the filter stack and preamp', () => {
			frStore.set('a', makeEntry('a'));
			eqStore.filters = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 }];
			eqStore.preamp = -3;

			const params = new URLSearchParams(new URL(urlProvider.getCurrentURLWithEQ()).search);
			const state = JSON.parse(Base62.decode(params.get('state')!));
			expect(state.eq.preamp).toBe(-3);
			expect(state.eq.filters).toHaveLength(1);
			expect(state.eq.filters[0]).toMatchObject({ type: 'PK', freq: 1000, gain: 3 });
		});

		it('adds nothing when the filter stack is empty', () => {
			frStore.set('a', makeEntry('a'));
			expect(urlProvider.getCurrentURLWithEQ()).not.toContain('state=');
		});
	});

	describe('toggleBase62', () => {
		beforeEach(() => urlProvider.init());

		afterEach(() => urlProvider.toggleBase62(false));

		it('switches `share=` to the compressed form and back', () => {
			frStore.set('a', makeEntry('a'));

			urlProvider.toggleBase62(true);
			const compressed = new URLSearchParams(new URL(urlProvider.getCurrentURL()).search).get(
				'share'
			)!;
			expect(compressed.startsWith('b62_')).toBe(true);
			expect(Base62.decode(compressed.slice(4))).toBe('Phone a');

			urlProvider.toggleBase62(false);
			expect(new URLSearchParams(new URL(urlProvider.getCurrentURL()).search).get('share')).toBe(
				'Phone a'
			);
		});
	});

	// ── Navigation + document side effects ───────────────────────────────────

	describe('updateURL', () => {
		beforeEach(() => urlProvider.init());

		it('pushes the new query through replaceState', () => {
			frStore.set('a', makeEntry('a'));
			urlProvider.updateURL(true);

			expect(replaceState).toHaveBeenCalledTimes(1);
			expect(vi.mocked(replaceState).mock.calls[0][0]).toContain('share=Phone%20a');
		});

		it('does not navigate when the URL already matches', () => {
			urlProvider.updateURL(true); // nothing loaded → path is already current
			expect(replaceState).not.toHaveBeenCalled();
		});

		it('updates the document title with the loaded devices', () => {
			frStore.set('a', makeEntry('a'));
			frStore.set('b', makeEntry('b'));
			urlProvider.updateURL(false);

			expect(document.title).toContain('Phone a, Phone b');
		});

		it('leaves the title bare when nothing is loaded', () => {
			urlProvider.updateURL(false);
			expect(document.title).not.toContain(' - ');
		});

		it('skips navigation entirely when called with changeURL=false', () => {
			frStore.set('a', makeEntry('a'));
			urlProvider.updateURL(false);
			expect(replaceState).not.toHaveBeenCalled();
		});

		it('rewrites the canonical link and meta description when present', () => {
			const canonical = document.createElement('link');
			canonical.setAttribute('rel', 'canonical');
			const description = document.createElement('meta');
			description.setAttribute('name', 'description');
			document.head.append(canonical, description);

			try {
				frStore.set('a', makeEntry('a'));
				urlProvider.updateURL(false);

				expect(canonical.getAttribute('href')).toBe(window.location.href);
				expect(description.getAttribute('content')).toContain('Phone a');

				frStore.clear();
				urlProvider.updateURL(false);

				expect(description.getAttribute('content')).not.toContain('Phone a');
			} finally {
				canonical.remove();
				description.remove();
			}
		});
	});

	describe('autoUpdate', () => {
		it('navigates when URL.AUTO_UPDATE_URL is on', () => {
			urlProvider.init();
			frStore.set('a', makeEntry('a'));
			urlProvider.autoUpdate();
			expect(replaceState).toHaveBeenCalled();
		});

		it('stays put when the operator disabled URL.AUTO_UPDATE_URL', () => {
			window.GRAPHTOOL_CONFIG = {
				URL: { AUTO_UPDATE_URL: false },
				VISUALIZATION: { DEFAULT_Y_SCALE: '50' }
			} as never;
			urlProvider.init();
			frStore.set('a', makeEntry('a'));
			urlProvider.autoUpdate();
			expect(replaceState).not.toHaveBeenCalled();
		});
	});

	// ── State restoration ────────────────────────────────────────────────────

	describe('applyStateFromURL', () => {
		function initWith(state: URLState) {
			setSearch(`?state=${encodeState(state)}`);
			urlProvider.init();
		}

		it('does nothing when the URL carried no state', () => {
			urlProvider.init();
			graphStore.yScale = 50;
			urlProvider.applyStateFromURL();
			expect(graphStore.yScale).toBe(50);
		});

		it('restores yScale', () => {
			initWith({ yScale: 80 });
			urlProvider.applyStateFromURL();
			expect(graphStore.yScale).toBe(80);
		});

		it('resolves the baseline by name and stores the UUID when the engine is cold', () => {
			initWith({ baseline: { key: 'Phone a V2', mode: 'withoutAdjustment' } });
			frStore.set('a', makeEntry('a', { dispSuffix: 'V2' }));

			urlProvider.applyStateFromURL();

			expect(graphStore.baselineMode).toBe('withoutAdjustment');
			expect(graphStore.baselineUUID).toBe('a');
		});

		it('hands the baseline to the engine once it is initialized', () => {
			initWith({ baseline: { key: 'Phone a', mode: 'withoutAdjustment' } });
			frStore.set('a', makeEntry('a'));
			graphEngine.isInitialized = true;
			const spy = vi.spyOn(graphEngine, 'updateBaselineData').mockImplementation(() => {});

			try {
				urlProvider.applyStateFromURL();
				expect(spy).toHaveBeenCalledWith(true, expect.objectContaining({ uuid: 'a' }));
			} finally {
				spy.mockRestore();
			}
		});

		it('ignores a baseline whose device never loaded', () => {
			initWith({ baseline: { key: 'Some Other Phone', mode: 'withoutAdjustment' } });
			frStore.set('a', makeEntry('a'));

			urlProvider.applyStateFromURL();

			expect(graphStore.baselineUUID).toBeNull();
			expect(graphStore.baselineMode).toBe('off');
		});

		it('restores y-offsets onto the matching entries only', () => {
			initWith({ yOffsets: { 'Phone a': 4 } });
			frStore.set('a', makeEntry('a'));
			frStore.set('b', makeEntry('b'));

			urlProvider.applyStateFromURL();

			expect(frStore.get('a')!.yOffset).toBe(4);
			expect(frStore.get('b')!.yOffset).toBeUndefined();
		});

		it('restores sample display only for entries that actually have samples', () => {
			initWith({ sampleDisplay: { 'Phone a': ['L1'], 'Phone b': ['L1'] } });
			frStore.set('a', makeEntry('a', { samples: [{}], sampleCount: 1 }));
			frStore.set('b', makeEntry('b'));

			urlProvider.applyStateFromURL();

			expect(frStore.get('a')!.dispSamples).toEqual(['L1']);
			expect(frStore.get('b')!.dispSamples).toBeUndefined();
		});

		it('restores HpTF display only for entries that actually have HpTF data', () => {
			initWith({ hptfDisplay: { 'Phone a': { keys: ['sample0_AVG'], fill: false } } });
			frStore.set(
				'a',
				makeEntry('a', {
					hptf: { samples: [], envelope: {}, labels: [], fillOnly: false } as never,
					hptfFillVisible: true
				})
			);

			urlProvider.applyStateFromURL();

			expect(frStore.get('a')!.dispHptf).toEqual(['sample0_AVG']);
			expect(frStore.get('a')!.hptfFillVisible).toBe(false);
		});

		it('restores the EQ stack and switches the equalizer on', () => {
			initWith({
				eq: {
					preamp: -2,
					filters: [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 }]
				}
			});

			urlProvider.applyStateFromURL();

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.preamp).toBe(-2);
			expect(eqStore.filters).toHaveLength(1);
		});

		it('leaves the equalizer off when the shared stack was empty', () => {
			initWith({ eq: { preamp: -2, filters: [] } });

			urlProvider.applyStateFromURL();

			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.preamp).toBe(0);
		});
	});
});
