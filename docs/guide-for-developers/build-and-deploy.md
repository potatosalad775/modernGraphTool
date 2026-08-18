---
title: Build & Deployment Internals
editUrl: true
head: []
template: doc
sidebar:
  order: 3
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

How the three build outputs are produced. If you only want to _deploy_ modernGraphTool, see
[Guide for Admins → Deployment](../guide-for-admins/deployment/prebuilt.mdx) instead — this page is
about how the build itself works.

## Outputs

| Command                       | Output                | What it is                                            |
| ----------------------------- | --------------------- | ----------------------------------------------------- |
| `npm run build`               | `dist/`               | Static SPA, prerendered, SPA fallback via `.htaccess` |
| `npm run build:cdn`           | `dist-cdn/`           | Thin loader for jsDelivr-hosted assets                |
| `npm run build:site-template` | `dist-site-template/` | The GitHub Pages template repo                        |

The CDN build emits a thin `cdn-index.html` loader plus `cdn/loader.js`; set `MGT_CDN_BASE` to
rewrite the `_app/` URLs.

## The `defaults/` mechanism

A Vite plugin serves `defaults/` as a fallback during development and copies its contents into
`dist/` at build time — **without** overwriting files that already exist under `static/`. That is how
an operator's local customizations survive an upgrade.

Files an operator is expected to edit in `dist/`: `config.js`, `theme.css`, `data/`,
`assets/strings/`.

:::caution
**Never import from `static/` or `defaults/` as modules.** `fetch()` them at runtime. They are
operator-editable deployment artifacts, not build inputs — importing one bakes a copy into the bundle
and the operator's edit silently stops taking effect.
:::

## GitHub Pages template

[potatosalad775/modernGraphTool_site](https://github.com/potatosalad775/modernGraphTool_site) is a
separate repository that operators copy with "Use this template".

It is **generated output, not a hand-maintained repo.** `npm run build:site-template` assembles it,
and `.github/workflows/sync-site-template.yml` force-syncs the result on every push to `main` that
touches `defaults/`, `site-template/`, or the script. Edit the sources in the main repo — anything
committed straight to the template repo is overwritten on the next sync.

- Most of it is `defaults/` verbatim (`theme.css`, `data/`, `assets/`), which is the whole reason the
  sync exists — that content drifts the moment `defaults/` changes.
- `config.js` is `defaults/config.js` with the commented `CDN_MODE` stub spliced out and
  `site-template/config-cdn-mode.js` spliced in, so new config options reach the template for free.
  The splice is anchored on the stub's first and last lines and **throws** if it stops matching — a
  template with no live `CDN_MODE` is a blank page, since its `index.html` is only a loader. That
  file is a JS _fragment_, so it sits in `.prettierignore` and ESLint's ignores; the generated
  `config.js` is syntax-checked by the build script instead.
- `site-template/index.html` is source, **not** derived from `cdn/cdn-index.html` — keep the shared
  parts in sync by hand. Two deliberate divergences:
  1. It always loads `loader.js` from jsDelivr (no localhost branch — operators never iterate on the
     loader).
  2. It carries an inline base-path detector that sets `CDN_MODE.BASE_PATH` from the first path
     segment on `*.github.io` hosts, so both `username.github.io/<repo>/` and `username.github.io/`
     work with no config edit, and a repo rename survives. It defers to an explicit `BASE_PATH`.
     This lives in the template rather than in `cdn/loader.js` because a loader change only reaches
     deployments after the next `cdn` branch publish.
- The workflow needs a `SITE_TEMPLATE_TOKEN` secret (fine-grained PAT, `Contents: write` on the
  template repo) — `GITHUB_TOKEN` cannot push across repositories.