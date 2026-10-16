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
- `tutorial-store.svelte.ts` — which guided tour is open + its step, per-tour dismissal keys. The
  tours render in AppShell's one `TutorialModal`, never inside a panel (panels unmount)
- `app-store.svelte.ts` — isMobile, isReady
- `settings-store.svelte.ts` — user preferences: theme, AutoEQ options (with `session` / `local` persistence mode),
  `linkEqNormalization` flag, `frequencyTutorialVisible` (the strip `AppShell` renders under the graph;
  the toolbar button lives in `GraphPanel` on mobile and unmounts with it, so the flag can't). Persists through `gt-settings-*` localStorage keys (and `sessionStorage` for
  AutoEQ options when that mode is active). Hydrated once from `AppShell.onMount` via `settingsStore.hydrate()`.
- `audio-spectrum-store.svelte.ts` — live spectrum overlay toggle (`isEnabled`, sole source of truth — bound
  directly by the EQ player view) + `AnalyserNode` reference written by `audio-player-service`, read by
  `GraphContainer`/`GraphSpectrumOverlay`
- `device-peq-store.svelte.ts` — the connected EQ device (`DeviceConnection`), target preset, busy flags
- `link-store.svelte.ts` — the uniPEQ link as the UI sees it: phase, room, uniPEQ's device and status,
  the start dialog's question. Written only by `services/link-service.svelte.ts`
- `eq-constraints-store.svelte.ts` — active EQ constraint (an eqcaps `Profile`) + picker entries, and the
  per-band slot/violation analysis of `eqStore.filters`
- `eq-history-store.svelte.ts` — session-scoped snapshots for the History & Compare panel; A/B selection ids.
  Records and clears itself through `install()`, called once from `AppShell.onMount`
- `eq-bookmark-store.svelte.ts` — named EQ states the user kept, persisted under `gt-eq-bookmarks`.
  Hydrated once from `AppShell.onMount`
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
scope is noise. The `sourcePhoneUUID` setter resets it to `'BOTH'` when the device changes (not when the
first one is picked) — leaving it on `L` would open the next device on an empty list. It used to be
an `EqualizerPanel` effect, which missed a device change made while another panel was open.

**`eq-store.svelte.ts` — `sourceSample` is reset by the `sourcePhoneUUID` setter, and only there.**
A run index means nothing on another device, so changing device drops it inside the store rather
than in each caller. A variant switch is _not_ reset anywhere: the pick records its variant and
`eqSourceRun` (`utils/eq-source.ts`) treats a mismatch as the average, which also covers undoing a
switch — a path no reset hook would see.

**`eq-store.svelte.ts` — `momentaryRestore` is not derivable from `momentaryOverride`.**
The two are set together by the `\` press-and-hold in `AppShell` and look redundant (`'bypass'`
implies restore `true`, `'audition'` implies `false`). They stopped being redundant when
`eqCommands.ensureEnabled()` gained the ability to redirect the post-release state: an import or
AutoEQ run started mid-hold writes `momentaryRestore = true` and leaves the override alone, so the
result survives keyup instead of being reverted by it. Collapsing the field back into a `$derived`
re-breaks that. The restore value also has to live on the store rather than in `AppShell`, since
`eqCommands` is where the redirect happens.

**`eq-history-store.svelte.ts` / `eq-bookmark-store.svelte.ts` — one A/B pick, two lists.**
History is an automatic, session-only log of the current device; bookmarks are named, kept in
localStorage (`{ v: 1, items }`, every read and write in try/catch) and listed for every device.
A and B are ids resolved by `eqHistoryStore.findEntry` against both, so A can be a bookmark and B a
history entry; ids can't collide because bookmark ids carry `bm-` and history ids `h-`. Read the
picks through `aEntry` / `bEntry` — a deleted bookmark leaves its id resolving to nothing.

- **Recording and the device-change clear are page-lifetime effects** (`eqHistoryStore.install()`).
  They used to live in `EqualizerPanel`, which unmounts on every panel switch, so edits and device
  changes made from another panel were never seen.
- **`matchLoudness` / `showOnGraph` live on `eqHistoryStore`, not in the component.** The audio
  player and `GraphContainer` read them with the Equalizer panel unmounted. Both default to on and
  are not persisted.
- **Clearing history (the trash button, a device change) keeps a bookmark pick.** Whether a
  bookmark still fits the active constraint is decided where it is used, never by dropping it.
- **A bookmark's device is saved by `identifier` + `variant`, not UUID** — UUIDs are minted per
  page load. `hydrate` drops a stored UUID for that reason; `sortBookmarks` matches by name.
- **Past `BOOKMARK_CAP` an add is refused (`add` returns `null`) and the caller tells the user.**
  Don't evict: every bookmark carries a name the user chose.
- `snapshotMatches` lives in `utils/eq-snapshot.ts` so the bookmark store can use it without an
  import cycle (the history store imports the bookmark store for `findEntry`).

**`preference-bound-store.svelte.ts` — state must not move into the selector row.**
The store holds the preference-range overlay: the configured `entries`, the `selectedName` (at most
one; `null` hides the overlay) and the selected entry's parsed curves, with smoothing/normalization
applied as `$derived`. Hydrated from `AppShell.onMount`. The selector is a row in `TargetSelector`,
which unmounts with a collapsed target list and on every panel switch, so component-scoped state
would break the `ENABLE_BOUND_ON_INITIAL_LOAD` default (it selects the first entry).
`GraphContainer` owns the effects that call `load()` and push state into the overlay. `load()` runs
on selection, not on `isEnabled` — the shipped config enables the feature with the overlay hidden,
and loading eagerly put three fetches plus their smoothing ahead of the first graph. Curves are
cached per URL, so entries sharing a target or bound file fetch it once. The parsed curves are
tagged with their entry's name and only used while that entry is selected, so a slow fetch for a
previous selection never draws under the new one.
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
