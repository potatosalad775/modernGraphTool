import { SvelteMap } from 'svelte/reactivity';
import type { FRDataObject } from '$lib/types/data-types.js';

class FRDataStore {
	// SvelteMap tracks .get(), .set(), .delete(), .size, iteration automatically
	readonly #map = new SvelteMap<string, FRDataObject>();

	// Read API — components access these reactively
	get(uuid: string): FRDataObject | null {
		return this.#map.get(uuid) ?? null;
	}
	has(uuid: string): boolean {
		return this.#map.has(uuid);
	}
	get size(): number {
		return this.#map.size;
	}
	// Expose map for reactive {#each} iteration in templates
	get entries() {
		return this.#map;
	}

	// Write API — called only by commands/services
	set(uuid: string, obj: FRDataObject): void {
		this.#map.set(uuid, obj);
	}
	delete(uuid: string): void {
		this.#map.delete(uuid);
	}
	clear(): void {
		this.#map.clear();
	}
	toJSON() {
		return [...this.#map.values()];
	}
}

export const frStore = new FRDataStore();
