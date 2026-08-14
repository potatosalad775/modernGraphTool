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

`npm test` runs Vitest over `src/**/*.spec.ts`. Today that is only the parked tools'
framework-free `utils/` — the converters that emit the `config.js` and `phone_book.json`
operators paste into live deployments — and it is the safety net for porting those tools off
React. See `src/tools-legacy/README.md`. CI runs it before the build.

## Layout

```
astro.config.mjs           # site/base, i18n, the whole sidebar, /category/* redirects
src/
├── content.config.ts      # docs collection + the custom generateId (see below)
├── content/docs/          # ALL content
│   ├── *.mdx              #   English (the root locale) → /intro, /changelog, …
│   ├── <section>/index.mdx#   section overview pages → /features/, /guide-for-users/, …
│   ├── ko/                #   Korean → /ko/*
│   └── 1.x/  ko/1.x/      #   frozen v1 snapshot → /1.x/*, /ko/1.x/*
├── plugins/               # two small local remark plugins (see below)
├── styles/custom.css      # accent tokens only
└── tools-legacy/          # parked React tools, NOT built — see its README
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

Build, then check that no internal link or anchor broke:

```sh
npm run build
# every <a href> that stays inside the site should resolve to a built route
```

The three tool URLs (`/config-generator`, `/phone-book-editor`, `/theme-generator`) are
expected to 404 until `src/tools-legacy/` is ported — see that directory's README.

## Not yet migrated

The site still lives at `docs_new/` while `docs/` (Docusaurus) remains the deployed
version. The cutover — deleting `docs/`, renaming this directory, and repointing
`deploy-gh-pages.yml`, `ci.yml` and `release.yml` — happens once the tools are ported.
