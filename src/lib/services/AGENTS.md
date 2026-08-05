# Services

Long-lived singletons. For reactive subscriptions in a module-level singleton, wrap effects in
`$effect.root(() => $effect(() => ...))`, install lazily on first interaction, and never dispose —
these outlive every panel. Precedent: `audio-player-service.svelte.ts`.

## Inventory

- `commands.ts` — Command pattern (Add/Remove/Update\*) with `execute()` / `undo()`
- `command-history.svelte.ts` — undo/redo stack; exports `commandHistory` singleton
- `analytics-service.svelte.ts` — GA4 (multi-measurement-ID) for squig.link deployments
- `data-provider.svelte.ts` — see below
- `audio-player-service.svelte.ts` — see below
- `aggregate-index.svelte.ts` — see below

## `data-provider.svelte.ts`

Orchestrates commands + `frStore`: add/remove/toggle FR, insertRaw, updateVariant /
DisplayChannel / Colors / Visibility / YOffset, renormalizeAll, reSmoothAll, applyTargetAdjustment.

- `reSmoothAll` rebuilds curves from cached **raw** (pre-adjustment) data, so it re-applies target
  adjustments itself afterwards.
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
`getCrossSiteSearchConfig`, `buildShareUrl`, `deriveShareSlug` and `sortCrossSiteResults`, which
`squiglink-store`'s fallback path reuses so both sources emit an identical `CrossSiteSearchResult`.

Configured via `CROSS_SITE_SEARCH` in `defaults/config.js`; `SQUIGLINK.ENABLE_CROSS_SITE_SEARCH` is
deprecated and read only as a fallback for configs that predate the new section.

Source order, resolved in `CrossSiteSearchResults.svelte`:

1. **GraphAggregator index** — one JSON document, ~360 KB gzip, fetched lazily on the first query of
   ≥2 chars. Operators can override `INDEX_URLS` to self-host; the defaults are the official URL plus
   its GitHub Pages mirror, tried in order. Schema: https://github.com/HarutoHiroki/GraphAggregator
2. **squig.link phone-book crawl** (`squiglink-store`) — legacy path, one request per database. Runs
   only if no index URL resolved **and** the deployment is on squig.link **and** `SQUIGLINK_FALLBACK`
   is on.

Both sources emit `CrossSiteSearchResult` and share `buildShareUrl` / `sortCrossSiteResults`, so the
UI never branches on which one produced a hit. Share slugs **must** go through `buildShareUrl` — over
a thousand device names contain `+`, `&` or non-ASCII characters that break `?share=` links if
concatenated raw.

## squig.link integration

Active **only** when hosted on a `*.squig.link` domain (domain guard in `squiglink-store`). Fetches
site registry and shop links from squig.link JSON endpoints and loads `squiglink-intro.js` for
sponsor content. All UI is Svelte-native — no external DOM manipulation. Toggled via the `SQUIGLINK`
section in `defaults/config.js`.
