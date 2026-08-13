# modernGraphTool — Development Guide

## What This Is

Web-based frequency response (FR) visualization tool for headphones and other audio devices.
Fully static SPA — operators copy the `dist/` folder to any web host.
Successor to the legacy CrinGraph / vanilla-JS modernGraphTool; built for operators who
run measurement databases (e.g. sites on squig.link) as well as end users browsing them.

**User-facing docs:** [docs/docs/](docs/docs/) (Docusaurus site). Start at
`intro.mdx`, `why-moderngraphtool.mdx`, and `guide-for-developers/overview.mdx`.
**Contributor rules:** [CONTRIBUTING.md](CONTRIBUTING.md).

## Where the Rest of This Guide Lives

This file covers what applies everywhere. Anything specific to one area lives in that area's own
`AGENTS.md`, which loads automatically when you work on files there:

| Directory                                           | Covers                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| [src/lib/components/](src/lib/components/AGENTS.md) | Atoms / `Button` API, directory map, component + boot tests |
| [src/lib/stores/](src/lib/stores/AGENTS.md)         | Class pattern, store inventory, per-store invariants        |
| [src/lib/services/](src/lib/services/AGENTS.md)     | DataProvider, audio player, cross-site search, squig.link   |
| [src/lib/graph/](src/lib/graph/AGENTS.md)           | D3 engine, overlays, baseline modes, d3/rAF test traps      |
| [src/lib/utils/](src/lib/utils/AGENTS.md)           | Sanitizer, URL state, sample sets                           |
| [src/lib/device-peq/](src/lib/device-peq/AGENTS.md) | Hardware EQ transports, fake-device fixtures                |

Each of those directories also holds a one-line `CLAUDE.md` (`@AGENTS.md`) — that shim is what makes
the guide load. **If you add a new area guide, add the shim too**, or nothing will read it.

Deeper contributor documentation lives in the Docusaurus site:
[testing](docs/docs/guide-for-developers/testing.mdx),
[build & deployment internals](docs/docs/guide-for-developers/build-and-deploy.mdx),
[i18n](docs/docs/guide-for-developers/i18n.mdx).

## Tech Stack

- **SvelteKit 2 + Svelte 5** (Runes API, enforced globally)
- **TypeScript** (strict)
- **Tailwind CSS 4** — config is inlined via `@theme` in [src/routes/layout.css](src/routes/layout.css); no separate `tailwind.config.js`; **tailwind-merge** resolves class conflicts in the `Button` atom
- **bits-ui** for headless accessible components (Combobox, Dialog, Popover, Slider, Switch, Tooltip, …)
- **D3.js** for SVG graph rendering (no Tailwind inside SVG — uses CSS vars from `defaults/theme.css`)
- **Paraglide JS** for compile-time i18n (`en`, `cs`, `ko`, `ru`, `uk`)
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
- For long-lived reactive subscriptions in module-level singletons, wrap effects in
  `$effect.root(() => $effect(() => ...))`. Install lazily on first interaction; never
  dispose for page-lifetime singletons. Precedent: [audio-player-service.svelte.ts](src/lib/services/audio-player-service.svelte.ts).

## Code Style (from CONTRIBUTING.md)

- Tabs for indentation · single quotes · no trailing commas · 100-char line width
- `npm run lint` (Prettier + ESLint) and `npm run format` are authoritative
- Target **WCAG AAA** accessibility

## Rules That Apply Everywhere

- **Panels unmount on every panel switch.** Anything that must survive that belongs in a store or in
  a service installed once from `AppShell.onMount` — never in a panel-scoped `$effect`.
- **Never import from `static/` or `defaults/` as modules** — `fetch()` them at runtime. They are
  operator-editable deployment artifacts; importing one bakes a copy into the bundle and the
  operator's edit silently stops taking effect.
- **No hardcoded palette values in components.** Everything goes through the semantic tokens (see
  CSS / Theming below), so operator themes stay coherent.
- **Reach for the atoms** in [src/lib/components/atoms/](src/lib/components/atoms/) before a raw
  HTML element — a raw `<button>` opts out of the focus ring, transitions, disabled styling and
  the token palette all at once.
- **Share slugs go through `buildShareUrl`**, never raw concatenation — over a thousand device
  names contain `+`, `&` or non-ASCII characters.
- **The CrinGraph `phone_book.json` dialect stays readable permanently.** Operators hand-author
  these files and most databases predate the current schema. A modernGraphTool-only key must
  **compose** with the dialect rather than override it — CrinGraph reads `file` and nothing else, so
  a key that suppresses `file` silently makes the entry unreadable there and forces operators to
  choose between our features and dual-hosting. Precedent: `variants[]` (`_mergeVariants`).
- **Keep commit messages short. Default to a subject line alone.** Add a body only when the _why_
  can't be read off the diff, and cap it at one paragraph of two or three lines. Never one paragraph
  per design decision — long bodies are hard to read in VS Code's commit view and drown out
  `git log --oneline`. "Two or three lines" is the literal budget, not a vibe: if the body explains
  the bug, the fix, and a caveat, it is already too long. Pick the one thing a reader needs.
  Everything else — alternatives considered, per-decision tradeoffs, secondary fixes, follow-up
  caveats — belongs in the PR description, and the doc/code comments are where the durable rationale
  already lives.

## Project Layout

```
src/
├── routes/              # SvelteKit pages — single-page SPA, +layout + +page
│   └── layout.css       # Tailwind v4 entry + @theme tokens (Pretendard font, semantic palette)
├── app.html             # Loads config.js + theme.css as plain <script>/<link> tags
└── lib/
    ├── components/      # → AGENTS.md · atoms, controls, equalizer, features, graph, layout, panels
    ├── stores/          # → AGENTS.md · reactive class instances in .svelte.ts
    ├── services/        # → AGENTS.md · DataProvider, commands, aggregate index, audio, analytics
    ├── graph/           # → AGENTS.md · D3 engine + overlays
    ├── device-peq/      # → AGENTS.md · hardware EQ bridge (WebHID/WebSerial/BLE/Network)
    ├── utils/           # → AGENTS.md · parsing, normalization, smoothing, URL encoding, config
    ├── workers/         # Web workers for heavy FR processing
    ├── types/           # data-types.ts, squiglink-types.ts
    └── paraglide/       # GENERATED i18n functions — do not edit
defaults/                # Operator-editable templates, copied to dist/ by a Vite plugin
├── config.js            # window.GRAPHTOOL_CONFIG (plain <script>, not type=module)
├── theme.css            # Graph + UI CSS variables (OKLCH, light+dark, semantic tokens)
├── assets/              # Default images / string overrides
└── data/                # Sample phone_book.json + FR files + targets
messages/                # Paraglide sources: en.json, cs.json, ko.json, ru.json, uk.json
scripts/                 # build-cdn.js, build-site-template.js, generate-boot-manifest.js
site-template/           # Sources for the GitHub Pages template repo
static/                  # Project assets (local overrides; gitignored where noted)
```

## Config System

`defaults/config.js` sets `window.GRAPHTOOL_CONFIG` via a plain `<script>` in `app.html`
(NOT `type="module"`). Read it with `getConfigValue(path)` from `$lib/utils/config`.
Operator-configured fields use `resolveI18nValue()` for inline multilingual values:
`DESCRIPTION`, `TOPBAR.TITLE`, `TOPBAR.LINK_LIST`, `TARGET_MANIFEST`.
This is separate from Paraglide UI-string i18n.

**`defaults/config.js` is a starting point, not a reference.** It carries live values only for what
most deployments edit; optional features appear as commented stubs with a `→ docs:` pointer, and the
exhaustive option lists live in [customize-page.mdx](docs/docs/guide-for-admins/customize-page.mdx)
and the docs-site config generator. When adding a config key:

- Add it to the docs page and the generator — those are the reference surfaces.
- Add it to `config.js` only if a typical deployment must set it. Otherwise extend a stub, or add a
  new one-line stub, so the feature stays discoverable to operators who never open the docs.
- **Give it a code-side default and verify the absent case**, since a stub means the key ships
  commented out. `getConfigValue` returns `undefined` for a missing path and each call site applies
  its own `??`. Not every default is the obvious one — `LANGUAGE.ENABLE_I18N` reads as falsy when
  absent, which hides the language picker entirely, so `LANGUAGE` has to stay uncommented.
- **Make the code default reproduce the shipped look**, so omitting the section is a no-op rather
  than a silent visual change. `VISUALIZATION.LABEL` / `BASELINE_LABEL` are the precedent: their
  offsets apply as `x + RIGHT - LEFT` / `y + DOWN - UP` for _every_ anchor corner, so the defaults
  in `GraphContainer` carry the shipped `44` / `43` / `39` values rather than `0`.
- **A list-valued key replaces, never extends.** `TARGET_CUSTOMIZER.FILTERS` discards the built-in
  filters outright, so the config.js example restates the defaults alongside the additions and the
  docs flag it. Prefer this shape over merging — merging makes "remove a default" unexpressible.

A stub block must sit **above** a live key. Prettier strips the trailing comma from the last
property, so stubs at the end of an object turn into a syntax error the moment one is uncommented.
`DESCRIPTION` closes `defaults/config.js` for exactly this reason.

## i18n

UI strings go through Paraglide: `import * as m from '$lib/paraglide/messages'; m.some_key()`.
Keys are `underscore_separated` (`menu_graph_panel`, not `menu.graphPanel`). Generated code in
`src/lib/paraglide/` is gitignored and never hand-edited.

**Missing keys in a non-`en` locale are fine** — Paraglide falls back to `baseLocale` per key, so
partial translations are welcome and untranslated strings just render in English.

Run `npm run i18n:check` after adding, renaming or removing keys in `messages/en.json`.
Full details — adding a locale, the `i18n:missing` / `i18n:apply` translator flow, why `check`
compiles first — are in [guide-for-developers/i18n.mdx](docs/docs/guide-for-developers/i18n.mdx).

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

Other tokens: **Typography** — Pretendard via `@theme`; text-xs (metadata), text-sm (body/controls),
text-lg (headings); weights 400 / 500 / 600. **Spacing** — Tailwind defaults; common gap-1..4,
px-2..4, py-1..2; radius `rounded`..`rounded-xl`. **Borders** — `border-base-content/15` to `/25`.
**Shadows** — minimal, `shadow-xl` on popovers and dialogs only. **Motion** — 0.15s
`transition-colors` globally on interactive elements; a 0.3s cross-fade only during theme toggle via
`html.theme-transition`; no spring physics; respect `prefers-reduced-motion`.

Dark mode: toggle `.dark` on `<html>` — `document.documentElement.classList.toggle('dark', settingsStore.theme === 'dark')`.
All theme.css variables switch automatically.

bits-ui provides interactive primitives; style them with semantic tokens, not literal colors.

## Build Commands

| Command                       | What it does                                             |
| ----------------------------- | -------------------------------------------------------- |
| `npm run dev`                 | Dev server at http://localhost:5173                      |
| `npm run build`               | Production build to `dist/`                              |
| `npm run build:cdn`           | CDN-optimized build to `dist-cdn/`                       |
| `npm run build:site-template` | GitHub Pages template to `dist-site-template/`           |
| `npm run preview`             | Preview built output                                     |
| `npm run check`               | `svelte-kit sync` + `svelte-check` (TypeScript + Svelte) |
| `npm run test`                | Vitest (client + server, Playwright browser mode)        |
| `npm run test:coverage`       | Full suite + v8 coverage report into `coverage/`         |
| `npm run test:smoke`          | Boots the built `dist/` in a browser (run `build` first) |
| `npm run lint`                | Prettier + ESLint                                        |
| `npm run format`              | Auto-format code                                         |

Specs are co-located as `*.spec.ts`; the filename decides the project (`*.svelte.spec.ts` → real
Chromium, everything else → node). Coverage `thresholds` in `vite.config.ts` is a **ratchet** — raise
it when coverage improves, never lower it to turn a red run green. See
[guide-for-developers/testing.mdx](docs/docs/guide-for-developers/testing.mdx) for the full picture,
and each area's `AGENTS.md` for its own test traps.

## Built-in Features

All active features are first-class Svelte components in `src/lib/components/features/` and
`src/lib/components/equalizer/` — **not** separate extensions, and not fork-based: Parametric EQ
(AutoEQ, live audio preview, import/export), Device PEQ Bridge, Sample Sets, Average Curves, Target
Customizer, Graph Color Wheel, Preference Bound, Frequency Tutorial, Tutorial Modal, Cross-Site
Search, and the squig.link-gated Sponsor Banner / Shop Link.

Per-feature user docs: [docs/docs/features/](docs/docs/features/).

## Keeping Docs in Sync

When a task materially changes architecture, conventions, feature behavior, configuration,
build/deployment flow, or folder structure, update the relevant docs as part of the same
change — don't leave them for later. Pick the surface by scope:

- **This file** — only what applies project-wide: stack, conventions, cross-cutting rules, config
  policy, the folder map. Keep it short; if a note only matters inside one directory, it belongs in
  that directory's `AGENTS.md` instead.
- **A directory's `AGENTS.md`** — inventories, per-module invariants, and the "don't undo this"
  notes for that area. This is the default home for detail. New area guide ⇒ add the `CLAUDE.md`
  shim alongside it.
- **[docs/docs/](docs/docs/)** — anything a human operator, user or contributor needs (Docusaurus).
  Update the relevant section (`guide-for-developers/`, `guide-for-admins/`, `features/`,
  `intro.mdx`, …) whenever a change affects what an operator configures, what a user sees, or how a
  developer contributes.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — only when contributor workflow or code-style rules change.

Prefer one home per fact and link to it rather than restating it. Drift is the main reason this
guide had to be rewritten. If you're unsure whether a change warrants a doc update, ask.

## Documentation References (for AI agents)

- **Svelte 5 + SvelteKit docs** — available via `mcp__plugin_svelte_svelte__*` MCP tools.
  Call `list-sections` first, then `get-documentation` for the section you need.
- **bits-ui docs** — fetch `https://bits-ui.com/llms.txt` for the component index; each
  component has its own `llms.txt` (e.g. `https://bits-ui.com/docs/components/combobox/llms.txt`).
  Do **not** use `/llms-full.txt` (404).
- **Project docs** — [docs/docs/](docs/docs/) (Docusaurus sources).

## Design Context

Clean, restrained chrome with **operator-customizable theming** — the default palette is only a
starting point. Every color flows through the semantic tokens in
[defaults/theme.css](defaults/theme.css), so a deployment can re-skin the tool without touching
source. The FR curves themselves carry the informational color; the chrome stays quiet regardless of
which theme an operator picks.

1. **Data first, chrome second.** The FR graph is the hero.
2. **Quiet confidence.** Restraint in color, motion, and decoration.
3. **Instant clarity.** Obvious labels, states, and affordances. No mystery icons.
4. **Accessible by default.** WCAG AAA target. Keyboard, focus, contrast, SR support.
5. **Responsive without compromise.** Desktop and mobile both feel intentional.
