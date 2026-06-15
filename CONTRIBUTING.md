# Contributing to modernGraphTool

Contributions are always welcome, no matter how small or large! Thank you for your interest in helping improve modernGraphTool.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- npm (included with Node.js)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/potatosalad775/modernGraphTool.git
cd modernGraphTool

# Install dependencies
npm install

# Start the development server
npm run dev
```

The dev server runs at `http://localhost:5173`.

## Code Style

This project uses **Prettier** and **ESLint** for consistent code formatting:

- **Tabs** for indentation
- **Single quotes**
- **No trailing commas**
- **100 character** line width

```bash
# Check for lint/format issues
npm run lint

# Auto-format code
npm run format
```

## Svelte 5 Conventions

This project uses **Svelte 5 with Runes** (enforced globally). Always use the Runes API:

| Use | Don't use |
|-----|-----------|
| `let x = $state(value)` | `writable(value)` |
| `let y = $derived(expr)` | `$: y = expr` |
| `$effect(() => { ... })` | `afterUpdate` |
| `let { prop } = $props()` | `export let prop` |

Stores are reactive class instances in `.svelte.ts` files, not plain `.ts` files. See `CLAUDE.md` for detailed architecture and conventions.

## Internationalization (i18n)

UI strings are managed with [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
(compile-time i18n). There is **no runtime translation** — message functions are generated at
build time into `src/lib/paraglide/`, so adding strings or locales always means regenerating.

### How it fits together

| Piece | Location | Role |
|-------|----------|------|
| Locale list | `project.inlang/settings.json` | `baseLocale` + `locales` array — the source of truth for which languages exist |
| Message sources | `messages/<locale>.json` | One file per locale; flat `key → string` map |
| Generated code | `src/lib/paraglide/` | Auto-generated message functions + `runtime` — **never hand-edit** |
| Build hook | `paraglideVitePlugin` in `vite.config.ts` | Regenerates `src/lib/paraglide/` on every `dev` / `build` |
| Language picker | `MiscPanel.svelte` | Reads `locales` from the runtime — no per-language code needed |

The picker dropdown derives its options from the generated `locales` array and labels each with
the language's own endonym via `Intl.DisplayNames`, so a newly registered locale shows up
automatically with no UI changes.

The active locale is resolved by the strategy `['localStorage', 'preferredLanguage', 'baseLocale']`
(see `vite.config.ts`): a saved choice wins, else the browser's preferred language, else `en`.

### Conventions

- Key format: `underscore_separated` (e.g., `menu_graph_panel`, not `menu.graphPanel`)
- **Every key must exist in every locale file.** There is no runtime fallback string — a missing
  key is a build/type error, not a silent default.
- Generated files in `src/lib/paraglide/` are auto-generated — **do not edit manually**

### Using strings in components

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<span>{m.menu_graph_panel()}</span>
```

To read or change the locale programmatically, import from the generated runtime:

```ts
import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

getLocale();        // 'en'
setLocale('ko');    // switch (persists via localStorage strategy)
```

### Adding a new translation key

1. Add the key to **all** locale files (`messages/en.json`, `messages/ko.json`, …).
2. Run `npm run dev` (or `npm run build`) — the Vite plugin regenerates the message functions.
3. Use it as `m.your_new_key()`.

### Adding a new language option

Example: adding Japanese (`ja`).

1. **Register the locale.** Add it to `locales` in `project.inlang/settings.json`:
   ```json
   "baseLocale": "en",
   "locales": ["en", "ko", "ja"]
   ```
2. **Create the message file.** Copy `messages/en.json` to `messages/ja.json` and translate
   every value. Keep all keys — every key present in `en.json` must exist here.
3. **Regenerate + verify.** Run `npm run dev` (regenerates `src/lib/paraglide/`), then
   `npm run check` to confirm no key is missing. The new language appears in the Misc panel
   dropdown automatically (label resolved via `Intl.DisplayNames`) and is auto-selected for
   visitors whose browser prefers it.

> **No component edit needed.** The dropdown reads the `locales` array, so the locale code
> (`ja`) is the only thing linking the two places: the `locales` entry in `settings.json` and the
> `messages/<locale>.json` filename. Keep them identical.
>
> `Intl.DisplayNames` covers all standard BCP-47 codes. If you ever need a custom label, add a
> small code→label override in `MiscPanel.svelte`'s `localeLabel`.

## Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:unit
```

- Tests are co-located with source files using `*.spec.ts` naming
- Write tests for new utility functions and services
- The test framework is [Vitest](https://vitest.dev/) with Playwright for browser testing

## Pull Request Process

1. **Branch** from the current development branch
2. **Make your changes** — keep PRs focused on a single concern
3. **Run checks** before submitting:
   ```bash
   npm run check    # TypeScript + Svelte type checking
   npm run lint     # ESLint + Prettier
   npm run test     # All tests
   ```
4. **Open a PR** with a clear description of what changed and why

## What to Contribute

- **Bug fixes** — always welcome
- **Accessibility improvements** — we aim for WCAG AAA compliance
- **New language translations** — add a new JSON file in `messages/`
- **Documentation improvements** — typo fixes, clarifications, new guides
- **Feature requests** — please open an issue first to discuss the approach

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
