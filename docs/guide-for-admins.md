---
title: Guide for Operators
description: "Run your own frequency response database with modernGraphTool:
  deploy it, add measurements, and customize the page."
editUrl: true
head: []
template: doc
sidebar:
  label: Overview
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

This guide is for people who **run** a measurement database — deploying modernGraphTool, adding measurements to it, and making the page their own. If you're browsing someone else's database, the [Guide for Users](../guide-for-users/index.mdx) is the one you want.

A new database takes four steps, in this order:

1. **[Choose a deployment](./setup-env.mdx)** — GitHub Pages, CDN, a pre-built release, or a source build. Each option has its own setup page.
2. **[Prepare your measurements](./preprocessing-measurement.mdx)** — export FR data in the plain `.txt` format modernGraphTool reads. Skip this if you already have CrinGraph data.
3. **[Add them to the database](./manage-data.mdx)** — the `data/` folder layout and `phone_book.json`, which lists every device and its variants.
4. **[Customize the page](./customize-page.mdx)** — page metadata, `theme.css`, and every `config.js` option.

The [Config Editor](/config-generator), [phone_book.json Editor](/phone-book-editor) and [Theme Generator](/theme-generator) let you build those three files visually instead of editing them by hand.

## Already running a database?

- **On modernGraphTool v1** — see [What's New in v2](../whats-new-in-v2.mdx), then [Migrating from v1 to v2](../migrating-v1-to-v2.mdx).
- **On CrinGraph or one of its forks** — see [Migrating from CrinGraph](../migrating-from-cringraph.mdx). To run both tools side by side instead, see [Dual-Hosting with CrinGraph](../database-tips/dual-hosting/index.mdx).