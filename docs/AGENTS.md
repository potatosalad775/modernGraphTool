# modernGraphTool Docs — Development Guide

The user-facing documentation site: **Astro 7 + Starlight**, deployed to GitHub Pages at
`https://potatosalad775.github.io/modernGraphTool/docs`. Migrated from Docusaurus; the
sections below are mostly about not re-breaking things that migration had to get right.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

`npm run build` writes to `dist/`, and is the real check — it fails on invalid frontmatter,
a sidebar entry pointing at a missing slug, or MDX that will not parse. There is
deliberately no `astro check` script: it needs `@astrojs/check` + `typescript`, two
dependencies this site would otherwise not carry, and the only TypeScript here is
`content.config.ts`.

`npm test` runs Vitest over `src/**/*.spec.ts`, and CI runs it before the build. Most of it
covers `src/utils/` — the framework-free converters that emit the `config.js` and
`phone_book.json` operators paste into live deployments. The tools' form components are
deliberately uncovered: **a mis-wired field surfaces as a failing round-trip assertion**
(`state → file → state`), so porting or editing one means running the suite, not eyeballing
the output.

The two `*-store.spec.ts` files exist because the editors mutate `$state` in place while the
converters were written against plain objects; they pin that the converters cannot tell a
Svelte proxy from a plain object, which is what makes leaving the forms uncovered safe.
`vitest.config.ts` loads `@sveltejs/vite-plugin-svelte` so specs can import `.svelte.ts`
stores — it comes from `@astrojs/svelte` and costs no extra dependency.

## Layout

```
astro.config.mjs           # site/base, i18n, the whole sidebar, /category/* redirects
svelte.config.js           # vitePreprocess, so `lang="ts"` compiles in the islands
scripts/check-links.mjs    # post-build link check, runs as part of `npm run build`
src/
├── content.config.ts      # docs collection + the custom generateId (see below)
├── routeData.ts           # Starlight route middleware: base-resolves hero action links
├── content/docs/          # ALL content
│   ├── *.mdx              #   English (the root locale) → /intro, /changelog, …
│   ├── <section>/index.mdx#   section overview pages → /features/, /guide-for-users/, …
│   ├── ko/                #   Korean → /ko/*
│   └── 1.x/  ko/1.x/      #   frozen v1 snapshot → /1.x/*, /ko/1.x/*
├── pages/[...locale]/     # the three tool routes (see "The interactive tools")
├── components/tools/      # their Svelte islands
├── utils/                 # framework-free converters + their specs
├── i18n/tools.ts          # the tools' own strings, keyed by English source
├── plugins/               # two small local remark plugins (see below)
└── styles/
    ├── custom.css         # accent tokens only
    └── infima-compat.css  # --ifm-* → --sl-* bridge, tool pages only
public/                    # .nojekyll + img/ (favicon, social card)
```

## Rules that keep URLs working

The old Docusaurus site published ~178 routes that are linked from the app, from
`README.md`, and from outside. Each of these exists because breaking it is silent.

- **Never prefix a filename with a number.** Docusaurus stripped `01-` from the URL;
  Starlight does not, so `01-faq.mdx` would publish as `/guide-for-users/01-faq/`.
  Ordering lives in `sidebar: { order: N }` frontmatter, or in the explicit sidebar.
- **`site` and `base` are split** in `astro.config.mjs` — `site` is the origin only,
  `base` is `/modernGraphTool/docs`. Astro does _not_ derive `base` from `site`; putting
  the whole URL in `site` makes every internal link resolve one level too high.
- **`content.config.ts` overrides `generateId`.** Astro's default slugifies each path
  segment, which rewrites `1.x/` to `1x/` and moves all 49 v1 pages off their published
  URLs. The override is path-as-id; don't drop it.
- **`astro.config.mjs` `redirects` destinations must include `base` themselves.** Astro
  applies `base` to the redirect's own route but not to the target it writes into the
  meta-refresh. The loop at the top of the config does this — 30 `/category/*` routes
  depend on it.
- **The sidebar is explicit, not `autogenerate`.** Section order and group labels came
  from Docusaurus `_category_.json` files and are not alphabetical. Adding a page means
  adding a sidebar entry. Group labels carry their Korean via `translations: { ko: … }`.

## Writing content

- Every page needs `title:` in frontmatter. Starlight renders the title itself — do not
  also write an `# H1`.
- **Asides**: Starlight ships only `note` / `tip` / `caution` / `danger`. There is no
  `info` or `warning`. Titles use the bracket form: `:::caution[Advanced Mode]`.
- **Internal links**: write them relative and with the extension — `[x](./manage-data.mdx)`,
  `[y](../features/equalizer.mdx#eq)`. `src/plugins/remark-docs-links.mjs` resolves these
  to real base-prefixed URLs at build time. Astro does **not** do this on its own, so a
  bare `./manage-data` or an extensionless path ships to the browser verbatim and 404s.
  Root-absolute links (`/theme-generator`) are fine too — the same plugin adds the base.
- **`href` on a JSX component** (`<LinkCard href="./cdn/">`) is rewritten by the same
  plugin, which also visits MDX JSX attributes. Write these as **routes**, not files:
  `./cdn/`, not `./cdn.mdx`.
- **`hero.actions[].link` is frontmatter**, so remark never sees it — the content layer
  validates and stores frontmatter before remark runs, and Starlight reads it back off
  `entry.data`. `src/routeData.ts` (a Starlight route middleware) base-resolves it instead.
  Anything else added to frontmatter that holds a URL needs the same treatment.
  **Never leave an internal link relative in the emitted HTML.** The browser resolves it
  against the current URL, so it silently points somewhere different depending on whether
  the page was served with a trailing slash — `href="intro/"` on the landing page reached
  `/modernGraphTool/intro/`. `npm run build` fails on this now; see below.
- **Explicit heading ids** (`## Base path \{#base-path\}`) are supported via
  `src/plugins/remark-heading-ids.mjs`, and the braces **must stay backslash-escaped** or
  MDX parses them as a JS expression and the build fails. They matter on the Korean pages,
  where the heading text is Korean but the anchor other pages link to is English.
- **Code fences are case-sensitive.** Shiki wants ` ```javascript `, not ` ```JavaScript `
  (Docusaurus used Prism, which did not care).
- **Tabs** come from `@astrojs/starlight/components`, and `<TabItem>` takes `label` only —
  no `value`, no `default`.
- Images live next to the page that uses them (`./img/foo.png`); Astro optimises them.

## Korean

Korean is a **partial** translation and that is fine — Starlight falls back to the English
page per slug, so an untranslated page simply renders in English. Add `ko/<same path>.mdx`
to translate one. UI chrome comes from Starlight's own `ko.json`; only sidebar group labels
are ours, in `astro.config.mjs`.

## The frozen v1 tree

`1.x/` and `ko/1.x/` are a snapshot of the v1 docs. **Content fixes go to the current docs
only.** Every page there carries an "unmaintained" `banner` in its frontmatter — that
banner plus the collapsed sidebar group is what replaces the old Docusaurus version
dropdown.

## Verifying a change that touches URLs

`npm run build` runs `scripts/check-links.mjs` over `dist/` and **fails the build** on
either of the two silent failures:

- an internal `href` that is not absolute under the base — it renders fine but resolves
  against the current URL, so it depends on the trailing slash;
- a base-absolute `href` with no built page behind it — sidebar `link:` entries and
  hand-written hrefs are not validated the way content-collection slugs are.

Run it alone against an existing `dist/` with `npm run check:links`. Because it is part of
`build`, both CI and the GitHub Pages deploy already gate on it.

Anchors are not resolved — only the page part of each URL.

## The interactive tools

`/config-generator`, `/phone-book-editor` and `/theme-generator` are Svelte 5 islands, ported
from the Docusaurus site's React sources. Everything else on the site stays zero-JS; the
islands hydrate on these three routes only.

- **One file builds both locales.** Each lives at `src/pages/[...locale]/<tool>.astro` with a
  `getStaticPaths` returning `undefined` and `'ko'`. Starlight localises sidebar `link`
  hrefs, and the Korean landing page links relatively, so `/ko/<tool>` has to exist —
  Docusaurus generated it implicitly. Drop `getStaticPaths` and both links 404.
- **`template: 'splash'`** gives the tools full page width and suppresses Starlight's own
  `<h1>`, which is why two of the pages render their own heading.
- **Sidebar entries are `link`, not `slug`**, so Starlight cannot validate them. A typo 404s
  silently.
- **State lives in a `.svelte.ts` store**, mutated in place. The React originals used
  `useReducer` + Context with immutable path helpers; deep `$state` made all of that
  unnecessary, and the field access is now type-checked rather than stringly-typed.
- **Their CSS came from Docusaurus and still uses `--ifm-*` variables**, redefined in terms of
  Starlight's `--sl-*` tokens by `styles/infima-compat.css`. That file explains the mapping —
  it is not a colour-for-colour copy, because Starlight's scales flip between light and dark
  and Infima's did not. Solid accent buttons are the exception and use `--sl-color-bg-accent`
  / `--sl-color-text-invert` directly; the Infima pairing lands light-on-light here.
- `config-editor.css` and `phone-book-editor.css` are **global, not scoped**: their classes
  are shared across the section components, and Svelte scoping is per-component. The `ce` /
  `pb` prefixes are what keep them apart. Single-component stylesheets (the theme generator)
  use scoped `<style>` instead.
- **The tools' strings are keyed by their English source text** in `src/i18n/tools.ts`,
  mirroring the old `<Translate>` + `i18n/ko/code.json` setup so they stay greppable against
  it. Untranslated keys fall back to English and are simply absent from the dictionary. This
  is separate from Starlight's own UI i18n.

## Leftovers from the Docusaurus era

- **`src/content/` is `.prettierignore`d.** Unignoring it rewrites ~180 MDX files at once,
  which is worth doing on its own with a build to confirm nothing stopped parsing — not
  folded into an unrelated change.
- **`editLink.baseUrl` still points at `/docs/`**, which is correct again now that this
  directory is `docs/`.
- Astro writes to `dist/`, where Docusaurus wrote to `build/`. `deploy-gh-pages.yml` copies
  `docs/dist/*`; anything else still naming `docs/build` is stale.
