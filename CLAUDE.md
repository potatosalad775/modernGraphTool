# modernGraphTool (SvelteKit) — Development Guide

## What This Is
Web-based frequency response (FR) visualization tool for audio devices.
SvelteKit 5 (Runes) rewrite of the legacy Vanilla JS/Web Components version.
Fully static SPA, deployed via FTP. Users copy the `dist/` folder to their server.

## Legacy Reference
Original implementation: `../modernGraphTool_legacy/`
Refer to it for: config schema (dist/config.js), phone_book format, FR file format,
original D3 implementations (src/features/graph/graph-engine.ts), extension logic being ported.

## Tech Stack
- SvelteKit 2 + Svelte 5 (Runes, enforced globally in svelte.config.js)
- Tailwind CSS 4 (all UI styling) + bits-ui (headless accessible components)
- Paraglide JS i18n (compile-time, messages/en.json + messages/ko.json)
- D3.js for graph rendering (SVG, no Tailwind inside SVG — uses CSS vars from theme.css)
- Vitest (unit) + Playwright (E2E)
- adapter-static → outputs to dist/ (Apache-hosted via .htaccess fallback)

## Svelte 5 Runes — Required Conventions
ALWAYS use runes, NEVER the legacy Options API or writable stores:
- State:   `let x = $state(value)`        NOT `writable(value)`
- Derived: `let y = $derived(expr)`       NOT `$: y = expr`
- Effects: `$effect(() => { ... })`       NOT `afterUpdate`
- Props:   `let { prop } = $props()`      NOT `export let prop`
- Module-level reactive state: use `.svelte.ts` files (NOT plain `.ts` files)

## Architecture
Data flow: User action → DataProvider service → frStore (SvelteMap)
           → $effect in GraphContainer → graphEngine.drawFRCurve()

Stores (src/lib/stores/):
  fr-store.svelte.ts         — FRDataStore wrapping SvelteMap<uuid, FRDataObject>
  graph-store.svelte.ts      — GraphStore: yScale, baselineUUID
  menu-store.svelte.ts       — MenuStore: currentPanel; MENU_PANELS const
  eq-store.svelte.ts         — EQStore: filters, preamp, isEnabled
  app-store.svelte.ts        — AppStore: theme, isMobile, isReady
  squiglink-store.svelte.ts  — SquiglinkStore: squig.link integration (domain guard, site registry,
                               cross-site search, shop links, sponsor content)

Services (src/lib/services/):
  data-provider.svelte.ts      — DataProvider singleton: addFRData(), removeFRData(), toggleFRData(),
                                 insertRawFRData(), updateVariant(), updateDisplayChannel(),
                                 updateColors(), updateVisibility(), updateYOffset(),
                                 renormalizeAll(), reSmoothAll() — orchestrates commands + frStore
  commands.ts                  — Command pattern (Add/Remove/Update*) with execute()/undo()
  command-history.ts           — Undo/redo stack; exports `commandHistory` singleton
  analytics-service.svelte.ts  — GA4 analytics (gtag.js, multi-measurement-ID support)

Utils (src/lib/utils/):
  config.ts          — getConfigValue(path) reads window.GRAPHTOOL_CONFIG
  fr-parser.ts       — parse raw FR text files → ParsedFRData
  fr-smoother.ts     — octave-band smoothing
  fr-normalizer.ts   — dB normalization
  metadata-parser.ts — phone_book.json reader
  url-provider.ts    — share URL building (uses history.replaceState directly, NOT goto())
  base62.ts          — Base62 encode/decode for URL compression

## Stores — Class Pattern
All stores are reactive class instances exported from .svelte.ts files.

FRStore uses SvelteMap from svelte/reactivity (NOT $state(new Map())):
```ts
import { SvelteMap } from 'svelte/reactivity';
class FRDataStore {
  readonly #map = new SvelteMap<string, FRDataObject>();
  get entries() { return this.#map; }  // for {#each frStore.entries.values() as item}
  get size() { return this.#map.size; }
  get(uuid: string) { return this.#map.get(uuid) ?? null; }
  set(uuid: string, obj: FRDataObject) { this.#map.set(uuid, obj); }
  delete(uuid: string) { this.#map.delete(uuid); }
}
export const frStore = new FRDataStore();
```

Other stores use $state class fields:
```ts
class GraphStore {
  yScale = $state(60);
  baselineUUID = $state<string | null>(null);
}
export const graphStore = new GraphStore();
```

NEVER: `export const store = { yScale: $state(60) }` (plain object literal)
DO:    `export const store = new StoreClass()`        (class instance)
NEVER: `export let count = $state(0)` in .svelte.ts   (reassignable export)

## Config System
static/config.js sets window.GRAPHTOOL_CONFIG (plain <script> in app.html, NOT type="module")
Access via getConfigValue(path) from $lib/utils/config.
Config-level i18n uses resolveI18nValue() for these operator-configured fields ONLY:
  DESCRIPTION, TOPBAR.TITLE, TOPBAR.LINK_LIST, TARGET_MANIFEST
This is SEPARATE from Paraglide UI string i18n.

## Graph Engine
D3.js in src/lib/graph/GraphEngine.svelte.ts
Initialize in GraphContainer.svelte's onMount: graphEngine.init(svgEl) with bind:this={svgEl}
NEVER use d3.select('#fr-graph') — always pass the bound SVG element reference.
SVG viewBox: 800x450. X: log frequency 20–20000 Hz. Y: linear dB, configurable scale.
React to store changes with $effect reading frStore.size (SvelteMap reactive).

## i18n
UI strings: Paraglide — messages/en.json, messages/ko.json
Generated functions in src/lib/paraglide/ (DO NOT EDIT manually)
Usage: `import * as m from '$lib/paraglide/messages'; m.some_key()`
Key format: underscore_separated (NOT dot.separated — "menu.item" → "menu_item")
ALL keys must exist in catalog — no fallback default string.
Language switch: setLanguageTag('ko') from $lib/paraglide/runtime

## CSS / Theming
Tailwind CSS 4 for all component styling. Dark mode via .dark class on <html>:
  `document.documentElement.classList.toggle('dark', appStore.theme === 'dark')`
static/theme.css — minimal D3 graph CSS variables only (user-editable post-build):
  --gt-graph-grid-major, --gt-graph-grid-minor, --gt-graph-axis-label, etc.
bits-ui for interactive components: Combobox, Slider, Dialog, Popover, Select, Switch, Tooltip

## Static Output
Build: `npm run build` → outputs to dist/
static/ contents copied verbatim to dist/
User-editable files in dist/: config.js, theme.css, data/, assets/strings/
NEVER import files from static/ as modules — fetch() them at runtime.

## Build Commands
npm run dev      — dev server (http://localhost:5173)
npm run build    — production build to dist/
npm run preview  — preview built output
npm run check    — TypeScript + Svelte type checking
npm run test     — run all Vitest tests
npm run lint     — ESLint + Prettier check
npm run format   — auto-format code

## Core Feature Panels (formerly extensions)
All active extensions from the legacy project are now built-in Svelte components
in src/lib/components/features/:
- DevicePeq.svelte         — USB device bridge for hardware EQ (WebHID/WebSerial)
- FrequencyTutorial.svelte — Educational frequency range overlay on graph
- TargetCustomizer.svelte  — Custom HRTF target with Tilt/Bass/Treble sliders
- GraphColorWheel.svelte   — Color picker for graph curves (uses bits-ui Popover)
- PreferenceBound.svelte   — Preference bound D3 overlay on graph
- CrossSiteSearch.svelte   — Cross-site device search across squig.link network
- SponsorBanner.svelte     — Sponsor modal on first visit (bits-ui Dialog)
- ShopLink.svelte          — "Buy Now" button when a matching shop link exists

## squig.link Integration
Native Svelte reimplementation of the legacy squiglink-integration extension.
Active ONLY when hosted on *.squig.link domains (domain guard in squiglink-store).

Design: fetches data from squig.link JSON endpoints (squigsites.json, shoplinks.json)
and loads squiglink-intro.js for sponsor content. Does NOT load squigsites.js.
All UI is Svelte-native — no external DOM manipulation.

Key files:
  Types:      src/lib/types/squiglink-types.ts
  Store:      src/lib/stores/squiglink-store.svelte.ts
  Analytics:  src/lib/services/analytics-service.svelte.ts
  Components: CrossSiteSearch, SponsorBanner, ShopLink (features/), SiteSelector (controls/)

Config section (static/config.js):
  SQUIGLINK.ENABLED                  — master toggle (default: true)
  SQUIGLINK.ANALYTICS_MEASUREMENT_IDS — array of GA4 IDs (multi-tag support)
  SQUIGLINK.ANALYTICS_SITE           — site name for analytics attribution
  SQUIGLINK.ENABLE_ANALYTICS         — analytics toggle
  SQUIGLINK.ENABLE_CROSS_SITE_SEARCH — cross-site search toggle
  SQUIGLINK.ENABLE_SPONSOR           — sponsor features toggle

Data sources (all from squig.link):
  squigsites.json      — site registry (fetched at runtime)
  shoplinks.json       — per-device shop links
  squiglink-intro.js   — sponsor content (loaded as script, reads window.contentSponsor)
  {site}/data/phone_book.json — per-site device catalogs (lazy-loaded)

## Migration Status
See full migration plan at: ../.claude/plans/dynamic-squishing-dusk.md
Phases:
  0: Foundation (DONE) — adapter-static, static assets, folder structure, CLAUDE.md
  1: Data Layer (DONE) — types, stores, utils (fr-parser, fr-smoother, etc.), commands
  2: Config & i18n (DONE) — config.ts, Paraglide message migration
  3: CSS / Theme (DONE) — theme.css written; Tailwind dark mode in layout
  4: Core Layout (DONE) — AppShell, TopNavBar, DragDivider, MenuCarousel
  5: Graph Engine (DONE) — D3 GraphEngine port, GraphContainer
  6: Panels (DONE)     — DataProvider service, PhoneSelector, SelectionList, TargetSelector,
                         NormalizerInput, SmoothingButton, YAxisScaleButton, ScreenshotButton,
                         ShareButton, InspectionToggle; DevicePanel, GraphPanel,
                         EqualizerPanel (scaffold), MiscPanel; AppShell panel routing
  7: Extensions (DONE) — FrequencyTutorial, TargetCustomizer, GraphColorWheel, PreferenceBound, DevicePeq
  7b: squig.link Integration (DONE) — squiglink-store, analytics-service, CrossSiteSearch,
                         SiteSelector, SponsorBanner, ShopLink; config SQUIGLINK section;
                         see ../.claude/plans/replicated-whistling-pine.md for design decisions
  8: URL Provider (DONE) — url-provider.ts, ShareButton integration, URL state encoding/decoding,
                         initial data loading from URL or config (AppShell bootstrap),
                         auto-update URL on store changes, config defaults (INITIAL_PANEL, normalization, yScale)
  9: Testing (DONE)    — DataProvider integration tests (33 tests), FR Normalizer (+6), FR Smoother (+5),
                         FR Store (+5), URL Provider (20 tests); total 231 tests passing

## Documentation References (for AI agents in this project)
- **Svelte 5 + SvelteKit docs**: Available via the MCP plugin `mcp__plugin_svelte_svelte__*` tools.
  Use `list-sections` first, then `get-documentation` with relevant section names.
- **bits-ui docs**: Fetch https://bits-ui.com/llms.txt for the component index.
  Each component also has its own llms.txt, e.g. https://bits-ui.com/docs/components/combobox/llms.txt
  DO NOT use /llms-full.txt (returns 404).
