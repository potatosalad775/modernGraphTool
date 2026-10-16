---
title: Contributing
description: Setting up modernGraphTool locally, the code style CI enforces, and
  how to open a pull request.
editUrl: true
head: []
template: doc
sidebar:
  order: 2
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

Contributions are always welcome, no matter how small or large. This page covers what you need before
your first pull request; the [Overview](./overview.mdx) has the architecture and project layout.

## What to contribute

- **Bug fixes** — always welcome.
- **Accessibility improvements** — the target is WCAG AAA.
- **Translations** — no code required. See the [translation flow](./i18n.mdx#translation-contribution-flow).
- **Documentation** — typo fixes, clarifications, new guides. The sources live in
  `docs/src/content/docs/`.
- **Features** — please [open an issue](https://github.com/potatosalad775/modernGraphTool/issues)
  first to discuss the approach.

## Setup

You need [Node.js](https://nodejs.org/) 24 or later (CI runs the latest 24.x) and npm, which ships with it.

```bash
git clone https://github.com/potatosalad775/modernGraphTool.git
cd modernGraphTool
npm install
npm run dev        # http://localhost:5173
```

To run `npm run lint`, also install the docs site's dependencies once with `cd docs && npm ci`. The
root lint reaches files under `docs/`, and ESLint resolves their config through
`docs/tsconfig.json`, which cannot load without `docs/node_modules`.

## Code style

**Prettier** and **ESLint** are authoritative: tabs, single quotes, no trailing commas, 100-character
lines.

```bash
npm run lint       # check
npm run format     # fix
```

CI runs `npm run lint` on Linux and Windows, so a PR that is not Prettier-clean will not merge.

### Line endings

Every text file is **LF**, pinned by `.gitattributes`. That overrides `core.autocrlf`, which the Git
for Windows installer turns on by default, so there is nothing to configure locally. Just don't
commit CRLF. `.editorconfig` tells your editor the same thing; install the EditorConfig extension if
your editor doesn't read it natively.

### git blame

One commit reformatted the whole repository. To keep `git blame` pointing at real authorship rather
than that commit, run this once per clone:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub's blame view already honours the file.

## Svelte 5 conventions

The project uses **Svelte 5 runes**, enforced globally:

| Use                       | Don't use         |
| ------------------------- | ----------------- |
| `let x = $state(value)`   | `writable(value)` |
| `let y = $derived(expr)`  | `$: y = expr`     |
| `$effect(() => { ... })`  | `afterUpdate`     |
| `let { prop } = $props()` | `export let prop` |

Stores are reactive class instances in `.svelte.ts` files, not plain `.ts`. Most directories under
`src/lib/` have an `AGENTS.md` with the rules specific to that area; read it before changing code
there.

## Shared components

Build UI out of the wrappers in `src/lib/components/atoms/`, such as `Button`, `Input`, `Switch`,
`Accordion`, `PopoverPanel`, `ScrollArea` and `Skeleton`, rather than the bare HTML element. They
carry the focus-visible ring, the transition, the disabled styling and the operator-customizable
palette. A raw `<button>` quietly opts out of all of that and drifts as themes change.

- `Button` takes `variant` and `size` props instead of a class list. Check whether a size already
  covers what you need (`toolbar`, `icon`, `icon-sm`, `icon-xs`) before writing padding classes by
  hand. Its required `title` also becomes the `aria-label`, so keep the title and the visible text
  saying the same thing.
- Anything passed to `Button` in `class` is merged with
  [tailwind-merge](https://github.com/dcastil/tailwind-merge), so an override beats the built-in
  style **without** a `!` modifier: write `class="rounded-full"`, not `class="rounded-full!"`. On a
  raw element, conflicting utilities tie on specificity and `!` is still needed.
- Checkboxes and radios are the exception. No atom covers them, so they stay raw. Elements bits-ui
  owns through a `child` snippet stay as bits-ui renders them.

Colors always go through the semantic tokens (`bg-base-100`, `text-base-content/60`,
`text-primary`, …), never a literal palette value like `text-zinc-500`, so that operator themes stay
coherent.

## Pull requests

1. **Branch** from `main`, and keep each PR to a single concern.
2. **Run the checks** before pushing:
   ```bash
   npm run check    # TypeScript + Svelte type checking
   npm run lint     # ESLint + Prettier
   npm run test     # all tests
   ```
   CI runs exactly these on Linux and Windows, plus builds of the app, the CDN distribution and the
   docs site. See [Testing](./testing.mdx) for the two test projects and the coverage ratchet.
3. **Update the docs** in the same PR when a change affects what users see, what operators
   configure, or how developers contribute.
4. **Open the PR** with a clear description of what changed and why. Keep commit messages short;
   the reasoning belongs in the PR description.

By contributing, you agree that your contributions will be licensed under the
[MIT License](https://github.com/potatosalad775/modernGraphTool/blob/main/LICENSE).