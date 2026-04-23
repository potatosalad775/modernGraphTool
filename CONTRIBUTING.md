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

UI strings are managed with [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs):

- Source files: `messages/en.json` (English) and `messages/ko.json` (Korean)
- Key format: `underscore_separated` (e.g., `menu_graph_panel`, not `menu.graphPanel`)
- All keys must exist in **both** language files
- Generated files in `src/lib/paraglide/` are auto-generated — **do not edit manually**

To add a new translation key, add it to both `messages/en.json` and `messages/ko.json`.

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
