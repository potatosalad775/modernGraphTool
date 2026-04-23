# modernGraphTool — Development Guide

## What This Is

Web-based frequency response (FR) visualization tool for headphones and other audio devices.
Fully static SPA — operators copy the `dist/` folder to any web host.
Successor to the legacy CrinGraph / vanilla-JS modernGraphTool; built for operators who
run measurement databases (e.g. sites on squig.link) as well as end users browsing them.

**User-facing docs:** [docs/docs/](docs/docs/) (Docusaurus site). Start at
`intro.mdx`, `why-moderngraphtool.mdx`, and `guide-for-developers/overview.mdx`.
**Contributor rules:** [CONTRIBUTING.md](CONTRIBUTING.md).

## Tech Stack

- **SvelteKit 2 + Svelte 5** (Runes API, enforced globally)
- **TypeScript** (strict)
- **Tailwind CSS 4** — config is inlined via `@theme` in [src/routes/layout.css](src/routes/layout.css); no separate `tailwind.config.js`
- **bits-ui** for headless accessible components (Combobox, Dialog, Popover, Slider, Switch, Tooltip, …)
- **D3.js** for SVG graph rendering (no Tailwind inside SVG — uses CSS vars from `defaults/theme.css`)
- **Paraglide JS** for compile-time i18n (English + Korean)
- **Vitest + Playwright** (browser mode) for tests, co-located as `*.spec.ts`
- **adapter-static** → outputs to `dist/` (Apache-hosted, `.htaccess` SPA fallback)
- Optional **CDN build** (`npm run build:cdn`) produces `dist-cdn/` with a thin loader for jsDelivr-hosted assets

## Svelte 5 Runes — Required Conventions

Always use the Runes API. Never the legacy Options API or writable stores:

- State: `let x = $state(value)` **not** `writable(value)`
- Derived: `let y = $derived(expr)` **not** `$: y = expr`
- Effects: `$effect(() => { ... })` **not** `afterUpdate`
- Props: `let { prop } = $props()` **not** `export let prop`
- Module-level reactive state lives in `.svelte.ts` files, not plain `.ts`.

## Code Style (from CONTRIBUTING.md)

- Tabs for indentation · single quotes · no trailing commas · 100-char line width
- `npm run lint` (Prettier + ESLint) and `npm run format` are authoritative
- Target **WCAG AAA** accessibility

## Keeping Docs in Sync

When a task materially changes architecture, conventions, feature behavior, configuration,
build/deployment flow, or folder structure, update the relevant docs as part of the same
change — don't leave them for later:

- **This file (`CLAUDE.md`)** — project overview, stack, conventions, folder map, stores/services/utils
  inventories, design context. Keep it concise; prune anything that's no longer true.
- **[docs/docs/](docs/docs/)** — user- and operator-facing docs (Docusaurus). Update the relevant
  section (`guide-for-developers/`, `guide-for-admins/`, `features/`, `intro.mdx`, etc.) whenever
  a change affects what an operator configures, what a user sees, or how a developer contributes.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — only when contributor workflow or code-style rules change.
  If you're unsure whether a change warrants a doc update, ask. Drift is the main reason this
  guide had to be rewritten.

## Project Layout

```
src/
├── routes/              # SvelteKit pages — single-page SPA, +layout + +page
│   └── layout.css       # Tailwind v4 entry + @theme tokens (Pretendard font, semantic palette)
├── app.html             # Loads config.js + theme.css as plain <script>/<link> tags
└── lib/
    ├── components/
    │   ├── atoms/       # Button, Input, Accordion, PopoverPanel, ScrollArea, Skeleton, Switch
    │   ├── controls/    # PhoneSelector, GraphUploader, SelectionList, ScreenshotButton,
    │   │                #   YAxisScaleButton, SampleChannelSelector, CrossSiteSearchResults, …
    │   ├── equalizer/   # EqAudioPlayer, EqAutoEq, EqAutoEqSelect, EqFilterCard,
    │   │                #   EqFilterList, EqPhoneSelect
    │   ├── features/    # DevicePeq, TargetCustomizer, GraphColorWheel, PreferenceBound,
    │   │                #   FrequencyTutorial, TutorialModal, SponsorBanner, ShopLink
    │   ├── graph/       # GraphContainer, GraphXAxis, GraphWatermark (Svelte ↔ D3 bridge)
    │   ├── layout/      # AppShell, TopNavBar, MenuCarousel, DragDivider
    │   └── panels/      # DevicePanel, GraphPanel, EqualizerPanel, MiscPanel
    ├── stores/          # Reactive class instances in .svelte.ts (see below)
    ├── services/        # DataProvider, commands, command history, analytics
    ├── graph/           # D3 engine + overlays (see below)
    ├── device-peq/      # Hardware EQ bridge (WebHID/WebSerial/BLE/Network) for 20+ devices
    ├── utils/           # Parsing, normalization, smoothing, URL encoding, config lookup, …
    ├── workers/         # Web workers for heavy FR processing
    ├── types/           # data-types.ts, squiglink-types.ts
    └── paraglide/       # GENERATED i18n functions — do not edit
defaults/                # Operator-editable templates, copied to dist/ by a Vite plugin
├── config.js            # window.GRAPHTOOL_CONFIG (plain <script>, not type=module)
├── theme.css            # Graph + UI CSS variables (OKLCH, light+dark, semantic tokens)
├── assets/              # Default images / string overrides
└── data/                # Sample phone_book.json + FR files + targets
messages/                # Paraglide sources: en.json, ko.json
scripts/                 # build-cdn.js, generate-boot-manifest.js
static/                  # Project assets (local overrides; gitignored where noted)
```

## Stores — Class Pattern

All stores are exported as class instances from `.svelte.ts` files.

- `fr-store.svelte.ts` — `FRDataStore` wraps `SvelteMap<uuid, FRDataObject>` from `svelte/reactivity`
- `graph-store.svelte.ts` — yScale, baseline UUID, normalization type, smoothing, target-original data map
- `eq-store.svelte.ts` — filters, preamp, enable flag, source/target UUIDs, modified-data map
- `menu-store.svelte.ts` — current panel + slide direction
- `app-store.svelte.ts` — isMobile, isReady
- `settings-store.svelte.ts` — user preferences: theme, AutoEQ options (with `session` / `local` persistence mode),
  `linkEqNormalization` flag. Persists through `gt-settings-*` localStorage keys (and `sessionStorage` for
  AutoEQ options when that mode is active). Hydrated once from `AppShell.onMount` via `settingsStore.hydrate()`.
- `audio-spectrum-store.svelte.ts` — live spectrum overlay toggle + `AnalyserNode`
- `device-peq-store.svelte.ts` — hardware EQ device connection state
- `squiglink-store.svelte.ts` — cross-site registry, sponsor content, domain guard

Pattern:

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

- **Never** `export const store = { yScale: $state(60) }` (plain object literal).
- **Do** `export const store = new StoreClass()`.
- **Never** `export let count = $state(0)` in `.svelte.ts`.

## Services

- `data-provider.svelte.ts` — orchestrates commands + `frStore`: add/remove/toggle FR, insertRaw,
  updateVariant/DisplayChannel/Colors/Visibility/YOffset, renormalizeAll, reSmoothAll
- `commands.ts` — Command pattern (Add/Remove/Update\*) with `execute()` / `undo()`
- `command-history.svelte.ts` — undo/redo stack; exports `commandHistory` singleton
- `analytics-service.svelte.ts` — GA4 (multi-measurement-ID) for squig.link deployments

## Utils

`config.ts`, `data-processor.ts`, `fr-smoother.ts`, `fr-normalizer.ts`, `fr-lookup.ts`,
`log-scale.ts`, `metadata-parser.ts`, `equalizer.ts`, `url-provider.ts`, `base62.ts`.
`url-provider.ts` uses `history.replaceState` directly — **not** `goto()`.

## Graph Engine

D3.js lives in [src/lib/graph/GraphEngine.svelte.ts](src/lib/graph/GraphEngine.svelte.ts) with overlays:

- `GraphHandle.ts` — drag/zoom interaction
- `GraphInspection.ts` — hover inspection overlay
- `GraphEqOverlay.ts` — EQ curve rendering
- `GraphSpectrumOverlay.ts` — live audio spectrum

Initialize in `GraphContainer.svelte`'s `onMount` via `graphEngine.init(svgEl)` using `bind:this={svgEl}`.
**Never** `d3.select('#fr-graph')` — always pass the bound SVG element.
Viewbox 800×450. X: log 20–20000 Hz. Y: linear dB, configurable scale.
React to store changes with `$effect(() => frStore.size)` (SvelteMap is reactive).

**Baseline** (`graphStore.baselineMode`) — cycles `off` → `withoutAdjustment` → `withAdjustment` → `off` on customizable targets, and simple `off` ↔ `withoutAdjustment` on phones / targets without cached originals:

- `withoutAdjustment` — baseline = original pre-adjustment channels from `graphStore.targetOriginalData`. Slider changes on the baseline target appear as a delta **on the target line**; other curves stay stable.
- `withAdjustment` — baseline = current (adjusted) channels from `frStore`. The target line snaps flat; other curves shift with adjustments.
- Single source of truth: [src/lib/graph/baseline.ts](src/lib/graph/baseline.ts) `resolveBaselineChannelData(uuid, mode)`. Both `GraphEngine.refreshBaselineData` and `PreferenceBound` go through it — **do not branch on `baselineMode` elsewhere**.
- `renormalizeAll` and `reSmoothAll` keep `targetOriginalData` aligned with `frStore.channels` so `withoutAdjustment` baselines stay at the same reference as the rest of the curves.

## Config System

`defaults/config.js` sets `window.GRAPHTOOL_CONFIG` via a plain `<script>` in `app.html`
(NOT `type="module"`). Read it with `getConfigValue(path)` from `$lib/utils/config`.
Operator-configured fields use `resolveI18nValue()` for inline multilingual values:
`DESCRIPTION`, `TOPBAR.TITLE`, `TOPBAR.LINK_LIST`, `TARGET_MANIFEST`.
This is separate from Paraglide UI-string i18n.

## i18n

- UI strings: Paraglide — `messages/en.json`, `messages/ko.json`
- Key format: `underscore_separated` (e.g. `menu_graph_panel`, not `menu.graphPanel`)
- **All keys must exist in both language files.** No runtime fallback string.
- Generated code in `src/lib/paraglide/` is **not** hand-edited
- Switch language: `setLanguageTag('ko')` from `$lib/paraglide/runtime`
- Usage: `import * as m from '$lib/paraglide/messages'; m.some_key()`

## CSS / Theming

All colors are operator-customizable via CSS variables in [defaults/theme.css](defaults/theme.css) —
**no hardcoded palette values in components**. [src/routes/layout.css](src/routes/layout.css) is the
Tailwind v4 entry; it declares `@custom-variant dark` and re-exports the theme.css variables into
`@theme` so Tailwind utilities (`bg-base-100`, `text-primary`, `border-accent`, …) resolve to them.

The token system follows DaisyUI naming (OKLCH color space, light + dark variants in theme.css):

- **Base surfaces:** `--color-base-100` / `-200` / `-300`, `--color-base-content`
- **Semantic roles:** `primary`, `secondary`, `accent`, `neutral`, `info`, `success`, `warning`, `error`
  — each with a `-content` counterpart for text-on-color
- **Graph-only (D3 SVG where Tailwind can't reach):** `--color-graph-bg`, `-grid-major`, `-grid-minor`,
  `-axis-label`, `-grid-text`, `-baseline`, `-watermark-opacity`

**UI chrome uses opacity modifiers on `base-content`**, e.g. `text-base-content/60` for secondary
text, `border-base-content/15` for subtle dividers. Do not hardcode zinc/gray Tailwind classes —
always go through the semantic tokens so operator themes stay consistent.

Dark mode: toggle `.dark` on `<html>` — `document.documentElement.classList.toggle('dark', settingsStore.theme === 'dark')`.
All theme.css variables switch automatically; add `html.theme-transition` briefly during toggle for
the cross-fade (handled in layout.css).

bits-ui provides interactive primitives; style them with semantic tokens, not literal colors.

## Static Output & Deployment

- `npm run build` → static SPA in `dist/` (prerendered; SPA fallback via `.htaccess`)
- `npm run build:cdn` → `dist-cdn/` with a thin `cdn-index.html` loader and `cdn/loader.js`
  for jsDelivr-hosted assets (set `MGT_CDN_BASE` to rewrite `_app/` URLs)
- A Vite plugin serves `defaults/` as fallback during dev and copies them into `dist/` at build
  (without overwriting files that already exist under `static/`)
- User-editable files in `dist/`: `config.js`, `theme.css`, `data/`, `assets/strings/`
- **Never** import from `static/` or `defaults/` as modules — `fetch()` them at runtime

## Build Commands

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Dev server at http://localhost:5173                      |
| `npm run build`     | Production build to `dist/`                              |
| `npm run build:cdn` | CDN-optimized build to `dist-cdn/`                       |
| `npm run preview`   | Preview built output                                     |
| `npm run check`     | `svelte-kit sync` + `svelte-check` (TypeScript + Svelte) |
| `npm run test`      | Vitest (client + server, Playwright browser mode)        |
| `npm run lint`      | Prettier + ESLint                                        |
| `npm run format`    | Auto-format code                                         |

## Built-in Features

All active features are first-class Svelte components in `src/lib/components/features/` and
`src/lib/components/equalizer/` — **not** separate extensions, and not fork-based:

- **Parametric EQ** with AutoEQ, real-time audio preview, import/export
- **Device PEQ Bridge** — push EQ to 20+ hardware devices via USB HID / Serial / BLE / Network
  (implementation under `src/lib/device-peq/`)
- **Target Customizer** — per-target Tilt / Bass / Treble / Ear / PSSR sliders with presets
- **Graph Color Wheel** — per-curve color picker (bits-ui Popover)
- **Preference Bound** — upper/lower preference-range overlay
- **Frequency Tutorial** — educational frequency-band overlay
- **Tutorial Modal** — first-visit walkthrough
- **Sponsor Banner / Shop Link** — squig.link-gated

See [docs/docs/features/](docs/docs/features/) for per-feature user docs.

## squig.link Integration

Active **only** when hosted on a `*.squig.link` domain (domain guard in `squiglink-store`).
Fetches site registry and shop links from squig.link JSON endpoints, loads `squiglink-intro.js`
for sponsor content, and performs cross-site device search. All UI is Svelte-native — no
external DOM manipulation. Toggled via the `SQUIGLINK` section in `defaults/config.js`:
`ENABLED`, `ANALYTICS_MEASUREMENT_IDS`, `ANALYTICS_SITE`, `ENABLE_ANALYTICS`,
`ENABLE_CROSS_SITE_SEARCH`, `ENABLE_SPONSOR`.

## Documentation References (for AI agents)

- **Svelte 5 + SvelteKit docs** — available via `mcp__plugin_svelte_svelte__*` MCP tools.
  Call `list-sections` first, then `get-documentation` for the section you need.
- **bits-ui docs** — fetch `https://bits-ui.com/llms.txt` for the component index; each
  component has its own `llms.txt` (e.g. `https://bits-ui.com/docs/components/combobox/llms.txt`).
  Do **not** use `/llms-full.txt` (404).
- **Project docs** — [docs/docs/](docs/docs/) (Docusaurus sources).

## Design Context

### Users

Audio enthusiasts, reviewers, and engineers who compare headphone/speaker FR measurements.
They visit the tool to load FR data, overlay curves, apply targets and EQ, and draw conclusions.
Range from casual hobbyists on squig.link to professionals doing serious analysis.
They expect precision and clarity — the graph is the center of attention; the UI should get
out of the way.

### Brand Personality

**Modern, minimal, confident.** Direct and precise, professional but not cold. The goals are
**confidence & trust** (data must feel accurate) and **focus & flow** (the UI should disappear).

### Aesthetic Direction

Clean, restrained chrome with **operator-customizable theming** — the default palette is only
a starting point. Every color flows through the semantic tokens in [defaults/theme.css](defaults/theme.css),
so a deployment can re-skin the tool without touching source. The FR curves themselves carry the
informational color; the chrome stays quiet regardless of which theme an operator picks.
References: squig.link / crinacle (familiarity), Linear / Vercel / Raycast (modern tool language),
Apple Music / Spotify (consumer-grade finish), DaisyUI (semantic token model). Anti-references:
dense legacy measurement tools (REW, ARTA).

### Design Principles

1. **Data first, chrome second.** The FR graph is the hero.
2. **Quiet confidence.** Restraint in color, motion, and decoration.
3. **Instant clarity.** Obvious labels, states, and affordances. No mystery icons.
4. **Accessible by default.** WCAG AAA target. Keyboard, focus, contrast, SR support.
5. **Responsive without compromise.** Desktop and mobile both feel intentional.

### Design Tokens

- **Colors:** Operator-customizable via [defaults/theme.css](defaults/theme.css). DaisyUI-style
  semantic tokens (OKLCH) with light + dark variants: `base-100/200/300/content`, `primary`,
  `secondary`, `accent`, `neutral`, `info`, `success`, `warning`, `error`, each with a
  `-content` counterpart. Graph-only variables (`--color-graph-*`) cover D3 SVG where Tailwind
  can't reach. **Never hardcode palette values in components** — always use the semantic
  utilities (`bg-base-200`, `text-primary`, `border-base-content/15`, …).
- **Typography:** Pretendard via `@theme` in [src/routes/layout.css](src/routes/layout.css);
  sizes text-xs (metadata), text-sm (body/controls), text-lg (headings); weights 400 / 500 / 600.
- **Spacing:** Tailwind defaults; common gap-1..4, px-2..4, py-1..2; radius `rounded`..`rounded-xl`.
- **Borders/dividers:** `border-base-content/15` to `/25` for structure and interactive outlines —
  opacity modifiers adapt to whatever base palette the operator picks.
- **Shadows:** Minimal — `shadow-xl` on popovers/dialogs only.
- **Motion:** 0.15s `transition-colors` globally on interactive elements (see `layout.css`);
  longer 0.3s cross-fade only during theme toggle via `html.theme-transition`; no spring physics;
  respect `prefers-reduced-motion`.
