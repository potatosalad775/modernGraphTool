import { EQ_FILTER_TYPES, type EQFilter } from '$lib/utils/equalizer.js';
import { eqStore } from './eq-store.svelte.js';
import { frStore } from './fr-store.svelte.js';
import { snapshotMatches } from '$lib/utils/eq-snapshot.js';

/**
 * The device a bookmark was made on. Saved by name: a UUID is minted per load
 * and means nothing after a reload, so `identifier` + `variant` are what match
 * a bookmark back to the current source device. `uuid` is only a same-session
 * shortcut.
 */
export interface EqBookmarkDevice {
	uuid?: string;
	identifier: string;
	variant?: string;
}

/**
 * A named EQ state the user chose to keep. Unlike history snapshots these
 * outlive a device change and a reload (localStorage, this browser and site
 * only), and are listed for every device rather than just the current one.
 */
export interface EqBookmark {
	id: string;
	name: string;
	createdAt: number;
	filters: EQFilter[];
	preamp: number;
	device: EqBookmarkDevice | null;
}

export const BOOKMARK_LS_KEY = 'gt-eq-bookmarks';
const STORAGE_VERSION = 1;
/** Refused past this, never evicted — bookmarks carry names the user typed. */
export const BOOKMARK_CAP = 200;
/** Every bookmark id starts with this, so it can never collide with a history id. */
export const BOOKMARK_ID_PREFIX = 'bm-';

class EqBookmarkStore {
	items = $state<EqBookmark[]>([]);

	get isFull(): boolean {
		return this.items.length >= BOOKMARK_CAP;
	}

	/** Read the saved bookmarks. Called once from `AppShell.onMount`. */
	hydrate(): void {
		this.items = readStorage();
	}

	get(id: string): EqBookmark | null {
		return this.items.find((b) => b.id === id) ?? null;
	}

	/** The bookmark holding exactly this EQ state, if any (same rule as history dedup). */
	findMatch(filters: EQFilter[], preamp: number): EqBookmark | null {
		return this.items.find((b) => snapshotMatches(b, filters, preamp)) ?? null;
	}

	/**
	 * Save a new bookmark. Returns `null` when the cap is reached — the caller
	 * tells the user, since dropping an old bookmark to make room would lose a
	 * name they chose.
	 */
	add(input: {
		name: string;
		filters: EQFilter[];
		preamp: number;
		device: EqBookmarkDevice | null;
	}): EqBookmark | null {
		if (this.isFull) return null;
		const now = Date.now();
		const bookmark: EqBookmark = {
			id: `${BOOKMARK_ID_PREFIX}${now}-${Math.random().toString(36).slice(2, 8)}`,
			name: input.name.trim() || 'Bookmark',
			createdAt: now,
			filters: input.filters.map((f) => ({ ...f })),
			preamp: input.preamp,
			device: input.device ? { ...input.device } : null
		};
		this.items = [...this.items, bookmark];
		this.#persist();
		return bookmark;
	}

	/** Rename a bookmark. A blank name is ignored rather than saved. */
	rename(id: string, name: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		let changed = false;
		this.items = this.items.map((b) => {
			if (b.id !== id || b.name === trimmed) return b;
			changed = true;
			return { ...b, name: trimmed };
		});
		if (changed) this.#persist();
	}

	remove(id: string): void {
		const next = this.items.filter((b) => b.id !== id);
		if (next.length === this.items.length) return;
		this.items = next;
		this.#persist();
	}

	#persist(): void {
		try {
			localStorage.setItem(
				BOOKMARK_LS_KEY,
				JSON.stringify({ v: STORAGE_VERSION, items: this.items })
			);
		} catch {
			/* Private mode or quota — the bookmarks last the session. */
		}
	}
}

/** The current EQ source device, as a bookmark records it. `null` with no source picked. */
export function currentEqDevice(): EqBookmarkDevice | null {
	const uuid = eqStore.sourcePhoneUUID;
	if (!uuid) return null;
	const data = frStore.get(uuid);
	if (!data) return null;
	return {
		uuid,
		identifier: data.identifier,
		...(data.dispSuffix ? { variant: data.dispSuffix } : {})
	};
}

/** Whether a bookmark was made on `device`. Matched by name, since UUIDs don't survive a reload. */
export function isSameDevice(
	a: EqBookmarkDevice | null | undefined,
	b: EqBookmarkDevice | null | undefined
): boolean {
	if (!a || !b) return false;
	return a.identifier === b.identifier && (a.variant ?? null) === (b.variant ?? null);
}

/** `device`'s bookmarks first, then newest first within each group. */
export function sortBookmarks(
	items: readonly EqBookmark[],
	device: EqBookmarkDevice | null
): EqBookmark[] {
	return [...items].sort((x, y) => {
		const dx = isSameDevice(x.device, device) ? 0 : 1;
		const dy = isSameDevice(y.device, device) ? 0 : 1;
		return dx - dy || y.createdAt - x.createdAt;
	});
}

function readStorage(): EqBookmark[] {
	let raw: string | null;
	try {
		raw = localStorage.getItem(BOOKMARK_LS_KEY);
	} catch {
		return [];
	}
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!isRecord(parsed) || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
	const out: EqBookmark[] = [];
	for (const item of parsed.items) {
		const bookmark = parseBookmark(item);
		if (!bookmark || out.some((b) => b.id === bookmark.id)) continue;
		out.push(bookmark);
		if (out.length >= BOOKMARK_CAP) break;
	}
	return out;
}

function parseBookmark(v: unknown): EqBookmark | null {
	if (!isRecord(v)) return null;
	const { id, name, createdAt, filters, preamp, device } = v;
	if (typeof id !== 'string' || !id.startsWith(BOOKMARK_ID_PREFIX)) return null;
	if (typeof name !== 'string' || !name.trim()) return null;
	if (!isFiniteNumber(createdAt) || !isFiniteNumber(preamp)) return null;
	if (!Array.isArray(filters)) return null;
	const parsedFilters: EQFilter[] = [];
	for (const f of filters) {
		const filter = parseFilter(f);
		if (!filter) return null;
		parsedFilters.push(filter);
	}
	return {
		id,
		name,
		createdAt,
		filters: parsedFilters,
		preamp,
		device: parseDevice(device)
	};
}

function parseFilter(v: unknown): EQFilter | null {
	if (!isRecord(v)) return null;
	const { enabled, type, freq, q, gain, channel } = v;
	if (typeof enabled !== 'boolean') return null;
	if (!(EQ_FILTER_TYPES as readonly unknown[]).includes(type)) return null;
	if (![freq, q, gain].every((n) => n === null || isFiniteNumber(n))) return null;
	if (channel !== undefined && channel !== 'L' && channel !== 'R') return null;
	return {
		enabled,
		type: type as EQFilter['type'],
		freq: freq as number | null,
		q: q as number | null,
		gain: gain as number | null,
		...(channel ? { channel } : {})
	};
}

function parseDevice(v: unknown): EqBookmarkDevice | null {
	if (!isRecord(v) || typeof v.identifier !== 'string') return null;
	// The UUID is dropped on purpose: it was minted by a previous page load.
	return {
		identifier: v.identifier,
		...(typeof v.variant === 'string' && v.variant ? { variant: v.variant } : {})
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

export const eqBookmarkStore = new EqBookmarkStore();
