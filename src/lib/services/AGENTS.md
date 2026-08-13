# Services

Long-lived singletons. For reactive subscriptions in a module-level singleton, wrap effects in
`$effect.root(() => $effect(() => ...))`, install lazily on first interaction, and never dispose —
these outlive every panel. Precedent: `audio-player-service.svelte.ts`.

## Inventory

- `commands.ts` — Command pattern (Add/Remove/Update\*) with `execute()` / `undo()`
- `eq-commands.ts` — EQ filter edits routed through `commandHistory`, plus `ensureEnabled()` — see below
- `command-history.svelte.ts` — undo/redo stack; exports `commandHistory` singleton
- `analytics-service.svelte.ts` — GA4 (multi-measurement-ID) for squig.link deployments
- `data-provider.svelte.ts` — see below
- `audio-player-service.svelte.ts` — see below
- `aggregate-index.svelte.ts` — see below
- `site-index.svelte.ts` — see below

## `eq-commands.ts` — `ensureEnabled()`

Flips the master EQ toggle on after an action that only makes sense with EQ live: file import,
AutoEQ run, device PEQ pull, and the first band added to an empty stack. Without it those land
silently and the graph never moves, which is the single most-reported EQ confusion.

- **Call it from the call site, never from `replaceFilters`.** Undo/redo, the sort button and the
  History & Compare A/B switch all route through `replaceFilters`; hooking it there re-enables EQ on
  an _undo_.
- **Not a command.** Undo restores filters, not toggle state.
- **Editing an existing band is deliberately excluded.** Toggling EQ off to compare against the raw
  curve while tweaking is a real workflow — the `\` momentary key exists for exactly that — so
  auto-enabling on every edit would fight the user.
- It writes `eqStore.momentaryRestore` instead of `isEnabled` while a `\` hold is active, otherwise
  keyup would revert the enable. See the eq-store note in `stores/AGENTS.md`.

## `data-provider.svelte.ts`

Orchestrates commands + `frStore`: add/remove/toggle FR, insertRaw, averageVisiblePhones,
updateVariant / DisplayChannel / Colors / Visibility / YOffset, renormalizeAll, reSmoothAll,
applyTargetAdjustment.

- `reSmoothAll` rebuilds curves from cached **raw** (pre-adjustment) data, so it re-applies target
  adjustments itself afterwards.
- `averageVisiblePhones` inserts the mean of every visible phone as an `inserted-phone`, which is
  what makes it hideable / recolorable / EQ-able / undoable for free. It is a **snapshot** — later
  add/remove of a source does not update it, and the suffix carries the contributor count so a stale
  one is self-describing. It averages the cached raw channels, not the drawn ones; see
  `utils/AGENTS.md#fr-averagets--average-all-visible` for why the two are equivalent and why raw wins.
- `renormalizeAll` normalizes the already-adjusted channels in place and must **not** re-apply — it
  would be a no-op, since normalization only removes a constant offset, so the adjustment lands on
  the same curve either way.
- `applyTargetAdjustment` **normalizes only, never re-smooths.** `targetOriginalData` already holds
  smoothed+normalized channels, so a second smoothing pass would blur the target and resample it off
  the cached original's frequency grid, which baseline compensation reads against.
- `installEqCurveSync()` owns the reactive rebuild of the on-graph EQ curve, installed once from
  `AppShell.onMount` and never disposed. It must **not** live in `EqualizerPanel.svelte`: that panel
  unmounts on every panel switch, while the `\` momentary A/B key is bound on AppShell's
  `<svelte:window>` and fires from any tab — a panel-scoped effect left the curve showing the EQ'd
  response until the user reopened the Equalizer tab.

## `audio-player-service.svelte.ts`

Web Audio engine (context, gain, analyser, source/oscillator/buffer, filter chain) + playback state.
Outlives the `EqAudioPlayer` view so audio survives panel switches. Subscribes to `eqStore.filters` /
`eqStore.preamp` via a lazy `$effect.root` installed on first `play()`.

- **EQ bypass** is `eqStore.isEnabled && filtersEnabled` (the `#eqActive` predicate). The master
  "Equalizer" toggle, the `\` momentary-bypass key and the player's own "EQ Effect" switch all have
  to reach the audio, and all have to pick up the K-weighted bypass-match trim.
- **The listening-range bandpass is for broadband sources only** (`#rangeGatingApplies`). Tone and
  sweep carry energy at a single frequency, so filtering them can only attenuate. Both are
  constrained by **clamping** instead (`clampToBand` in `utils/listening-range.ts`): the tone's
  frequency, and the sweep's `sweepFromHz`/`sweepToHz` endpoints. One rule across every source — the
  band is the region you're auditioning. The bandpass also carries a makeup stage (`rangeMakeupGain`)
  so a narrow band doesn't just read as "quieter". Clamps are sticky: leaving range mode keeps the
  clamped values rather than restoring what they were before.

## `aggregate-index.svelte.ts` — cross-site search

Fetches the GraphAggregator index (one JSON doc listing every known site/database/device), normalizes
both `flat` and `collapsed` phone formats, and answers queries against a prebuilt lowercase row set.
Host-agnostic — **not** squig.link-gated. Exports `aggregateIndexService`, plus
`getCrossSiteSearchConfig`, `buildShareUrl`, `deriveShareSlug`, `sortCrossSiteResults` and
`rankDbType`.

One JSON document, ~360 KB gzip, fetched lazily on the first query of ≥2 chars — so it costs nothing
for visitors who never search. Operators can override `INDEX_URLS` to self-host; the defaults are the
official URL plus its GitHub Pages mirror, tried in order.
Schema: https://github.com/HarutoHiroki/GraphAggregator

Configured via `CROSS_SITE_SEARCH` in `defaults/config.js`; `SQUIGLINK.ENABLE_CROSS_SITE_SEARCH` is
deprecated and read only as a fallback for configs that predate the new section.

Share slugs **must** go through `buildShareUrl` — over a thousand device names contain `+`, `&` or
non-ASCII characters that break `?share=` links if concatenated raw.

**A squig.link `phone_book.json` crawl used to back this up** when no index resolved, living in
`squiglink-store` behind `CROSS_SITE_SEARCH.SQUIGLINK_FALLBACK`. It was removed: one request per
database (146 and climbing) to reproduce a strictly worse result set than the one document, and it
only ever ran when both aggregator mirrors were down. Don't reintroduce it — if the index is
unreachable, cross-site search returning nothing is the intended degradation.

## `site-index.svelte.ts` — site selector

Fetches the GAA site index — a directory of every known site and database, with URLs already
resolved and **no** device corpus, so it is ~4.5 KB gzip against the aggregate index's ~360 KB.
Small enough to load on mount rather than lazily. Host-agnostic; exports `siteIndexService` plus
`getSiteSelectorConfig`, `fetchSiteIndex`, `findCurrentDbId`, `buildSiteEntries` and
`groupSiteEntries`. Schema: https://github.com/potatosalad775/GAA

GAA unions GraphAggregator's index with squig.link's registry, which is the point: the aggregator
drops any database whose phone book failed its nightly crawl, and a site that 502'd at 06:00 UTC
disappearing from the site switcher for a day is wrong for navigation even though it's right for
search. Union entries carry `verified: false` and render dimmed. **A missing `verified` field means
verified**, so an aggregator-shaped document doesn't dim every row.

- **`SITE_SELECTOR.ENABLED` defaults to `'auto'`**, not `true`: show the switcher only where the
  deployment is in the index or is on squig.link. An unregistered standalone site would otherwise get
  a dropdown listing a hundred other people's databases and none of its own. `SiteSelector.svelte`
  resolves that tri-state; the core stays pure and never reads the squig.link store.
- **`findCurrentDbId` takes an optional `href`.** Browser-mode specs can't navigate the page they run
  on, so the parameter is what makes current-site matching testable. Longest path match wins — a site
  hosting both `/` and `/headphones/` would otherwise always resolve to the root database.
- `rankDbType` is imported from `aggregate-index-core`, so search results and the site dropdown order
  rig classes identically. Don't copy the array.

This replaced a `squigsites.json` fetch in `squiglink-store`, along with its `urlType` / `altDomain` /
lab-folder URL construction — GAA resolves all of that server-side into absolute URLs.

## squig.link integration

Active **only** when hosted on a `*.squig.link` domain (domain guard in `squiglink-store`). Fetches
shop links from squig.link JSON endpoints and loads `squiglink-intro.js` for sponsor content. All UI
is Svelte-native — no external DOM manipulation. Toggled via the `SQUIGLINK` section in
`defaults/config.js`.
