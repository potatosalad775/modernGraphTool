# Utils

`config.ts`, `data-processor.ts`, `fr-smoother.ts`, `fr-normalizer.ts`, `fr-lookup.ts`,
`listening-range.ts`, `log-scale.ts`, `metadata-parser.ts`, `sample-config.ts`, `equalizer.ts`,
`url-provider.ts`, `url-state.ts`, `base62.ts`, `html-sanitizer.ts`.

## `html-sanitizer.ts`

The allowlist sanitizer for operator-authored strings — currently the `description` field in
`phone_book.json`, which `PhoneSelector` renders through `{@html}`. It exports:

- `sanitizeHtml` — inline tags only, unknown tags unwrapped, `<script>`/`<style>`/`<iframe>` dropped
  with their content, output always balanced
- `stripHtml` — the same input flattened to text, for `title` attributes
- `sanitizeUrl` — http / https / mailto / tel / relative only, after entity and control-character
  decoding. `metadata-parser` uses it to validate a phone's `links[]`.

Hand-rolled rather than DOMPurify-backed: it has to give identical results in the `server` (node, no
DOM) test project and the browser, and this is a static site operators self-host.

## URL state

`url-state.ts` holds the **pure** share-URL encoding/decoding (`smartSplit`, `parseShareParam`,
`parseStateParam`, `encodeShareNames`, `hasNonDefaultState`, `buildQueryString`); `URLProvider` keeps
only what touches `window`, `document`, `replaceState` and the stores, and delegates the rest.

- Share names go through `encodeURIComponent`, **not** `encodeURI` — the latter leaves `&`, `+` and
  `#` untouched, and over a thousand device names contain one of them. Reading is unaffected either
  way, since `URLSearchParams` decodes both forms identically.
- `url-provider.ts` uses SvelteKit's `replaceState` from `$app/navigation` directly — **not**
  `goto()`.

## Sample sets

A **sample set** is a variant measured more than once — repeat runs, seating positions, one
measurement per ear pad. `samples` and `hptfs` in `phone_book.json` used to be two separate concepts
for this, with parallel state, fetch, process and render paths; they are now one.

- **Schema:** `variants[]` with a per-variant `samples` (a number, or
  `{ count | files, labels, display, description }`). `variants` takes precedence over the terse
  phone-level `file`/`suffix`/`prefix`/`samples`/`hptfs` form — no merging. `metadata-parser` emits
  the same `PhoneFileVariant[]` from either, so **nothing downstream branches on which form was
  authored**.
- **The CrinGraph dialect stays readable permanently** — `file` / `suffix` / `prefix` arrays and the
  phone-level `samples: N`. Operators hand-author `phone_book.json`, and most existing databases
  predate `variants[]`; those files have to keep loading untouched. Cross-site search is _not_ the
  reason: the GraphAggregator index carries its own schema, and the squig.link phone-book crawl — the
  legacy fallback in `squiglink-store` — only lifts brand and device names out of a foreign book,
  never its file or sample keys.
- **`hptfs[]` is deprecated and slated for removal**, along with the `MULTI_SAMPLE` / `HPTF` config
  sections. It was modernGraphTool's own invention — no other CrinGraph-derived tool ever wrote it —
  so the argument above covers it far more thinly than it covers the rest of the dialect. Keep the
  read path working until it is removed; do not add new features to it. The docs' phone_book.json
  Editor converts a file in one import/export round-trip.
- **Model:** `FRDataObject.samples[]` (each run carrying an optional `label`), `dispSamples` keyed
  `sample{n}_{ch}` (zero-based — legacy `?state=` URLs already use this shape), plus `showAvg` /
  `showFill` / `envelope` / `sampleDescription`. `showAvg` absent means **drawn**; an item with no
  set is just the averaged-channels layer.
- **`display` is a set, not an enum:** `avg` · `curves` · `fill` compose. `['avg','fill']` is an
  averaged line with a variance band, which neither old schema could express.
- **Processing anchor-normalizes** (`anchorAndNormalizeSamples`): every run shares one pooled offset,
  so run-to-run spread survives the user's normalization choice. The old multi-sample path normalized
  each run independently and flattened that spread at the anchor frequency. The pooled offset is the
  same one `normalizeChannels` computes for the main channels, so runs and average stay on a common
  reference.
- **The envelope is always computed** when a set is present, not only when `showFill` is on — the
  user can toggle the fill at any time and recomputing on toggle would mean threading the processing
  params through the UI.
- **Config:** `SAMPLES` (`DEFAULT_COUNT` / `DEFAULT_DISPLAY` / `FILL_OPACITY`), resolved in
  `sample-config.ts`, which also maps the deprecated `MULTI_SAMPLE` / `HPTF` sections onto the new
  tokens.
- **Share URLs:** `sampleDisplay` carries `{ keys, fill, avg }`. `normalizeSampleDisplay` in
  `url-state.ts` folds in the two legacy shapes (a flat `L{n}`/`R{n}` array, and the separate
  `hptfDisplay` key). Only the current shape is written.
