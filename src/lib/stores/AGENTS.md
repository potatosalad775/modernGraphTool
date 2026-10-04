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
- `device-peq-store.svelte.ts` — the connected EQ device (`DeviceConnection`), target preset, busy flags
- `eq-constraints-store.svelte.ts` — active EQ constraint (an eqcaps `Profile`) + picker entries, and the
  per-band slot/violation analysis of `eqStore.filters`
- `eq-history-store.svelte.ts` — session-scoped snapshots for the History & Compare panel; A/B selection ids
- `squiglink-store.svelte.ts` — squig.link domain guard, sponsor content and shop links. The site
  registry and phone-book crawl it used to own moved to `services/site-index.svelte.ts` and
  `services/aggregate-index.svelte.ts` respectively — both host-agnostic; see `services/AGENTS.md`

## Invariants worth keeping

**`eq-constraints-store.svelte.ts` — constraints are eqcaps profiles; the catalog is eqcaps'.**
Each entry (`EqConstraintPreset`) wraps an eqcaps `Profile` — per-slot types and domains, steps and
value sets, rules, preamp — and every check goes through `utils/eq-constraint.ts` onto
`@potatosalad775/eqcaps-core`. Entries come from three places: `BUILTIN_PRESETS` (unlimited, generic
10-band graphic), the connected device (`setDeviceConstraint`, session-only), and a profile picked
from the eqcaps database in `EqOptionButton` (`addCatalogProfile`, stored with its profile under
`gt-eq-constraint-catalog` so a saved `eqcaps:` id resolves on first paint, offline, with nothing
fetched at boot).

- **Don't reintroduce a bundled or config-authored device list.** One used to exist (a bundled
  `eq-constraints.json`, an `EQ` config section, a phone-name auto-match) and was removed: it went
  stale faster than it helped, and the auto-match silently clamped filters with the picker hidden.
  eqcaps is the shared service that replaced it; device data is fixed there.
- **Activating a constraint never edits the filters by itself.** The picker folds the list
  (`eqCommands.reclampToActiveConstraint`, one undo entry) because the user asked; a connected device
  only flags. Keep `setDeviceConstraint` free of filter writes.
- **`slots` / `violations` are one class-field `$derived` over `eqStore.filters`**, so every
  `EqFilterCard` reads one assignment instead of running eqcaps' `assign` per card. Cards therefore
  only show violations for bands that are in `eqStore` — specs mount the filter there too.

**`eq-store.svelte.ts` — per-channel EQ is one flat array plus an optional field.**
`EQFilter.channel` is `'L' | 'R' | undefined`, and **absent means shared** (the band reaches both
ears). Don't split `filters` into three arrays: every command in `services/eq-commands.ts`, the burst
coalescer, `EqFilterCard`'s `index` prop and `GraphEqOverlay`'s d3 join key all address bands by
their integer position in the one array, and a `{channel, index}` address buys nothing. The optional
field is also what keeps `?state=`, history snapshots and device-PEQ mapping byte-identical for an
ordinary EQ — `JSON.stringify` drops `undefined` — so old share links decode as shared bands.
Read the effective set for an ear through `utils/eq-channel.ts` (`effectiveFilters`), never by
re-deriving the union; `countBandsPerOutput` is the matching rule for `maxBands`, since a shared band
costs a slot on both ears.

**`eq-store.svelte.ts` — `channelScope` is UI state, deliberately outside undo and `?state=`.**
It selects which bucket the band list shows. Nothing moves between buckets when it changes, so
recording it would bury real edits under navigation, and a share link reopening on someone else's
scope is noise. `EqualizerPanel` resets it to `'BOTH'` on a source-phone change — leaving it on `L`
would open the next device on an empty list.

**`eq-store.svelte.ts` — `momentaryRestore` is not derivable from `momentaryOverride`.**
The two are set together by the `\` press-and-hold in `AppShell` and look redundant (`'bypass'`
implies restore `true`, `'audition'` implies `false`). They stopped being redundant when
`eqCommands.ensureEnabled()` gained the ability to redirect the post-release state: an import or
AutoEQ run started mid-hold writes `momentaryRestore = true` and leaves the override alone, so the
result survives keyup instead of being reverted by it. Collapsing the field back into a `$derived`
re-breaks that. The restore value also has to live on the store rather than in `AppShell`, since
`eqCommands` is where the redirect happens.

**`preference-bound-store.svelte.ts` — state must not move back into `PreferenceBound.svelte`.**
The store holds the preference-range overlay: `isEnabled`/`isVisible` plus the fetched bound + DF-target
curves, with smoothing/normalization applied as `$derived`. Hydrated from `AppShell.onMount`.
That button renders inside `GraphToolbar`, which on mobile lives in a collapsed accordion that
genuinely unmounts, so component-scoped visibility broke the `ENABLE_BOUND_ON_INITIAL_LOAD` default.
`GraphContainer` owns the effects that call `load()` and push state into the overlay. `load()` runs
on the first `isVisible`, not on `isEnabled` — the shipped config enables the feature with the
overlay hidden, and loading eagerly put three fetches plus their smoothing ahead of the first graph.
`dfNormalized` is aligned by the band's center, not the DF — see `preference-bound.ts` in
`utils/AGENTS.md`.

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
