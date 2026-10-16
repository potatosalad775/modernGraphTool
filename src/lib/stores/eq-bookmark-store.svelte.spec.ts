import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EQFilter } from '#lib/utils/equalizer.js';
import type { FRDataObject } from '#lib/types/data-types.js';
import {
	BOOKMARK_CAP,
	BOOKMARK_LS_KEY,
	currentEqDevice,
	eqBookmarkStore,
	sortBookmarks,
	type EqBookmark
} from './eq-bookmark-store.svelte.js';
import { eqStore } from './eq-store.svelte.js';
import { frStore } from './fr-store.svelte.js';

function pk(o: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 0, ...o };
}

const HD600 = { identifier: 'Sennheiser HD 600' };

function add(name: string, o: Partial<Parameters<typeof eqBookmarkStore.add>[0]> = {}) {
	return eqBookmarkStore.add({ name, filters: [pk()], preamp: 0, device: HD600, ...o });
}

function stored(): { v: number; items: EqBookmark[] } {
	return JSON.parse(localStorage.getItem(BOOKMARK_LS_KEY)!);
}

describe('eqBookmarkStore', () => {
	beforeEach(() => {
		localStorage.clear();
		eqBookmarkStore.items = [];
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('persistence', () => {
		it('round-trips through localStorage as versioned JSON', () => {
			const filters = [pk({ gain: -3, channel: 'L' }), pk({ type: 'LSQ', freq: 105, gain: 4 })];
			const saved = add('Bass-light v2', {
				filters,
				preamp: -4,
				device: { uuid: 'u-1', identifier: 'HD 600', variant: '(Sample 2)' }
			})!;
			expect(stored().v).toBe(1);

			eqBookmarkStore.items = [];
			eqBookmarkStore.hydrate();
			expect(eqBookmarkStore.items).toHaveLength(1);
			const [loaded] = eqBookmarkStore.items;
			expect(loaded.id).toBe(saved.id);
			expect(loaded.name).toBe('Bass-light v2');
			expect(loaded.filters).toEqual(filters);
			expect(loaded.preamp).toBe(-4);
			// A UUID from a previous page load means nothing — it's matched by name.
			expect(loaded.device).toEqual({ identifier: 'HD 600', variant: '(Sample 2)' });
		});

		it('copies the filters, so later edits to the source don’t leak in', () => {
			const filters = [pk({ gain: 1 })];
			add('a', { filters });
			filters[0].gain = 9;
			expect(eqBookmarkStore.items[0].filters[0].gain).toBe(1);
		});

		it('hydrates to an empty list when the key is missing', () => {
			eqBookmarkStore.hydrate();
			expect(eqBookmarkStore.items).toEqual([]);
		});

		it.each([
			['not JSON', '{oops'],
			['the wrong version', JSON.stringify({ v: 2, items: [] })],
			['no items array', JSON.stringify({ v: 1, items: 'x' })],
			['a bare array', JSON.stringify([])]
		])('hydrates to an empty list from %s', (_, raw) => {
			localStorage.setItem(BOOKMARK_LS_KEY, raw);
			eqBookmarkStore.hydrate();
			expect(eqBookmarkStore.items).toEqual([]);
		});

		it('drops malformed entries and keeps the valid ones', () => {
			const good = add('good')!;
			const items = [
				...stored().items,
				{ ...good, id: 'h-123' }, // not a bookmark id
				{ ...good, id: 'bm-2', name: '  ' },
				{ ...good, id: 'bm-3', filters: [{ ...pk(), type: 'XX' }] },
				{ ...good, id: 'bm-4', preamp: 'loud' },
				good // duplicate id
			];
			localStorage.setItem(BOOKMARK_LS_KEY, JSON.stringify({ v: 1, items }));
			eqBookmarkStore.hydrate();
			expect(eqBookmarkStore.items.map((b) => b.id)).toEqual([good.id]);
		});

		it('keeps working when storage throws', () => {
			vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
				throw new DOMException('full', 'QuotaExceededError');
			});
			expect(add('a')).not.toBeNull();
			expect(eqBookmarkStore.items).toHaveLength(1);

			vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
				throw new DOMException('denied', 'SecurityError');
			});
			eqBookmarkStore.hydrate();
			expect(eqBookmarkStore.items).toEqual([]);
		});
	});

	describe('rename', () => {
		it('renames and persists, trimming whitespace', () => {
			const b = add('old')!;
			eqBookmarkStore.rename(b.id, '  Treble tame ');
			expect(eqBookmarkStore.get(b.id)?.name).toBe('Treble tame');
			expect(stored().items[0].name).toBe('Treble tame');
		});

		it('ignores a blank name', () => {
			const b = add('keep')!;
			eqBookmarkStore.rename(b.id, '   ');
			expect(eqBookmarkStore.get(b.id)?.name).toBe('keep');
		});
	});

	describe('remove', () => {
		it('deletes one bookmark and persists', () => {
			const a = add('a')!;
			const b = add('b')!;
			eqBookmarkStore.remove(a.id);
			expect(eqBookmarkStore.items.map((x) => x.id)).toEqual([b.id]);
			expect(stored().items.map((x) => x.id)).toEqual([b.id]);
		});
	});

	describe('cap', () => {
		it(`refuses an add past ${BOOKMARK_CAP} instead of evicting`, () => {
			for (let i = 0; i < BOOKMARK_CAP; i++) expect(add(`b${i}`)).not.toBeNull();
			expect(eqBookmarkStore.isFull).toBe(true);
			expect(add('one too many')).toBeNull();
			expect(eqBookmarkStore.items).toHaveLength(BOOKMARK_CAP);
			expect(eqBookmarkStore.items[0].name).toBe('b0');
		});
	});

	describe('findMatch', () => {
		it('finds the bookmark holding exactly this state', () => {
			const b = add('x', { filters: [pk({ gain: 2 })], preamp: -2 })!;
			expect(eqBookmarkStore.findMatch([pk({ gain: 2 })], -2)?.id).toBe(b.id);
			expect(eqBookmarkStore.findMatch([pk({ gain: 2 })], 0)).toBeNull();
		});
	});
});

describe('sortBookmarks', () => {
	const mk = (id: string, createdAt: number, identifier: string, variant?: string) =>
		({
			id,
			name: id,
			createdAt,
			filters: [],
			preamp: 0,
			device: { identifier, ...(variant ? { variant } : {}) }
		}) as EqBookmark;

	it("puts the current device's bookmarks first, then newest first", () => {
		const items = [
			mk('old-mine', 1, 'HD 600'),
			mk('new-other', 4, 'IE 900'),
			mk('new-mine', 3, 'HD 600'),
			mk('other-variant', 5, 'HD 600', '(Sample 2)')
		];
		expect(sortBookmarks(items, { identifier: 'HD 600' }).map((b) => b.id)).toEqual([
			'new-mine',
			'old-mine',
			'other-variant',
			'new-other'
		]);
	});

	it('sorts newest first when no device is picked', () => {
		const items = [mk('a', 1, 'X'), mk('b', 2, 'Y')];
		expect(sortBookmarks(items, null).map((b) => b.id)).toEqual(['b', 'a']);
	});
});

describe('currentEqDevice', () => {
	afterEach(() => {
		eqStore.sourcePhoneUUID = null;
		frStore.delete('src-1');
	});

	it('names the source device by identifier and variant', () => {
		frStore.set('src-1', {
			uuid: 'src-1',
			identifier: 'Sennheiser HD 600',
			dispSuffix: '(Sample 2)'
		} as FRDataObject);
		eqStore.sourcePhoneUUID = 'src-1';
		expect(currentEqDevice()).toEqual({
			uuid: 'src-1',
			identifier: 'Sennheiser HD 600',
			variant: '(Sample 2)'
		});
	});

	it('is null with no source picked', () => {
		expect(currentEqDevice()).toBeNull();
	});
});
