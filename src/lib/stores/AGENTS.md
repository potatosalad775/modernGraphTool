# Stores

All stores are exported as class instances from `.svelte.ts` files.

- **Never** `export const store = { yScale: $state(60) }` (plain object literal).
- **Do** `export const store = new StoreClass()`.
- **Never** `export let count = $state(0)` in `.svelte.ts`.

```ts
import { SvelteMap } from 'svelte/reactivity';
class FRDataStore {
	readonly #map = new SvelteMap<string, FRDataObject>();
	get entries() {
		return this.#map;
	}
	get size() {
		return this.#map.size;
	}
	get(uuid: string) {
		return this.#map.get(uuid) ?? null;
	}
	set(uuid: string, obj: FRDataObject) {
		this.#map.set(uuid, obj);
	}
	delete(uuid: string) {
		this.#map.delete(uuid);
	}
}
export const frStore = new FRDataStore();
```

## Inventory

- `fr-store.svelte.ts` — `FRDataStore` wraps `SvelteMap<uuid, FRDataObject>` from `svelte/reactivity`
- `graph-store.svelte.ts` — yScale, baseline UUID, normalization type, smoothing, target-original data map
- `eq-store.svelte.ts` — filters, preamp, enable flag, source/target UUIDs, modified-data map
- `menu-store.svelte.ts` — current panel + slide direction
- `app-store.svelte.ts` — isMobile, isReady
- `settings-store.svelte.ts` — user preferences: theme, AutoEQ options (with `session` / `local` persistence mode),
  `linkEqNormalization` flag. Persists through `gt-settings-*` localStorage keys (and `sessionStorage` for
  AutoEQ options when that mode is active). Hydrated once from `AppShell.onMount` via `settingsStore.hydrate()`.
- `audio-spectrum-store.svelte.ts` — live spectrum overlay toggle (`isEnabled`, sole source of truth — bound
  directly by the EQ player view) + `AnalyserNode` reference written by `audio-player-service`, read by
  `GraphContainer`/`GraphSpectrumOverlay`
- `device-peq-store.svelte.ts` — hardware EQ device connection state
- `eq-history-store.svelte.ts` — session-scoped snapshots for the History & Compare panel; A/B selection ids
- `squiglink-store.svelte.ts` — squig.link site registry, sponsor content, domain guard, and the
  phone-book-crawling fallback search used only when no aggregate index is reachable

## Invariants worth keeping

**`eq-constraints-store.svelte.ts` — don't reintroduce a bundled or config-authored catalog.**
It holds the active EQ constraint preset plus the catalog. Two general-purpose presets (Default
unlimited PEQ, Generic 10-band Graphic EQ) are baked in as `BUILTIN_PRESETS`; the only other entry
is the profile derived from a hardware device the user connected (`setDeviceConstraint`). Nothing is
fetched and there is **no operator config** — the store is fully resolved from construction.

A curated device dictionary used to sit on top of this (a bundled `eq-constraints.json`, an `EQ`
config section, and a `matchPhones` auto-selector keyed on the source phone's name). It was removed
pending a shared constraints service: a device list hand-maintained in this repo goes stale faster
than it helps, and with the picker not rendered the auto-select silently clamped the user's filters
with no way back. That's what the service is for. The picker (`EqOptionButton`) is commented out in
`EqFilterList` and returns when the service lands.

**`preference-bound-store.svelte.ts` — state must not move back into `PreferenceBound.svelte`.**
The store holds the preference-range overlay: `isEnabled`/`isVisible` plus the fetched bound + DF-target
curves, with smoothing/normalization applied as `$derived`. Hydrated from `AppShell.onMount`.
That button renders inside `GraphToolbar`, which on mobile lives in a collapsed accordion that
genuinely unmounts, so component-scoped visibility broke the `ENABLE_BOUND_ON_INITIAL_LOAD` default.
`GraphContainer` owns the effects that call `load()` and push state into the overlay.

**`target-adjustment-store.svelte.ts` — the state lives here, not in the component.**
Target Customizer slider stacks keyed by FR-data UUID, plus the `TARGET_CUSTOMIZER` config (filters,
presets, `INITIAL_TARGET_FILTERS`) and the tilt/shelf math (`adjustedChannels`, `label`).
`TargetCustomizer.svelte` is UI only. Keeping the state here is what lets
`DataProvider.applyTargetAdjustment()` rebuild a target with no component mounted — `GraphPanel` is
torn down on every panel switch.

## Boot-time writes

`installWriteBudget()` in `components/layout/app-boot-harness.ts` instruments `frStore`, `graphStore`
and `eqStore` so a runaway boot-time effect fails loudly instead of hanging. Add a store to
`writeTargets()` when one starts carrying boot-time state.
