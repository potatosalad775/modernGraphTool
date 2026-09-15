---
title: Why modernGraphTool?
editUrl: true
head: []
template: doc
sidebar:
  order: 2
  label: Why modernGraphTool?
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

The audio measurement community's needs have outgrown the tools that once served it well.

modernGraphTool is a ground-up rewrite — built on modern web technologies with a modular architecture — designed to give measurement operators and enthusiasts a tool that can evolve with the community.

## The CrinGraph Legacy

[CrinGraph](https://github.com/mlochbaum/CrinGraph) appeared around 2019 and quickly became the de facto standard for frequency response visualization in the audio enthusiast community.

It did its original job well: load measurements, overlay curves, compare headphones. Simple and effective.

Most measurement databases in the squig.link network still run CrinGraph or a derivative of it, and its influence on how we visualize FR data is undeniable.

:::note[Full data compatibility]
modernGraphTool is not a 'rejection' of CrinGraph — it's a continuation.

It uses the same data format, the same folder structure, and the same `phone_book.json`. Your existing measurement data works without any changes.
:::

## At a Glance

"CrinGraph" today usually means one of three codebases. [Vanilla CrinGraph](https://github.com/mlochbaum/CrinGraph) is the original. [squiglink lab](https://github.com/squiglink/lab) is the lightweight fork most squig.link databases run. [PublicGraphTool](https://github.com/HarutoHiroki/PublicGraphTool) is the most feature-rich fork, carrying most of the community's add-ons.

|                                   | Vanilla CrinGraph      | squiglink lab                  | PublicGraphTool                         | modernGraphTool                                                                                     |
| --------------------------------- | ---------------------- | ------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Codebase**                      | One ~2,500-line script | ~4,100 lines in three scripts  | ~14,400 lines in 40+ unbundled scripts  | Bundled TypeScript components                                                                       |
| **Parametric EQ + AutoEQ**        | —                      | ✓                              | ✓                                       | ✓ [with undo/redo](./features/equalizer.mdx)                                                        |
| **A/B compare of EQ revisions**   | —                      | —                              | —                                       | ✓ History & Compare panel, momentary bypass key                                                     |
| **Per-channel (L / R) EQ**        | —                      | —                              | Balance slider only                     | ✓ [Shared + per-ear bands](./features/equalizer.mdx#per-channel-eq)                                 |
| **Audio preview with live EQ**    | —                      | Tone generator                 | ✓                                       | ✓ Your own audio files, noise, tones, sine sweep                                            |
| **Preference Bound**              | —                      | —                              | ✓                                       | ✓ [Built in](./features/preference-bound.mdx)                                                       |
| **Target customization**          | —                      | —                              | Tilt, bass, ear gain, treble            | ✓ [Configurable filters, presets, per-target defaults](./features/target-customizer.mdx)            |
| **Interface languages**           | English                | English                        | English                                 | English, Korean, Czech, Russian, Ukrainian                                                          |
| **Theming**                       | Edit CSS + JS          | Edit several CSS files         | Edit several CSS files                  | One `theme.css` + [Theme Generator](/theme-generator)                                               |
| **Configuration**                 | Hand-edit `config.js`  | Hand-edit `config.js`          | Hand-edit `config.js`                   | Structured `config.js` + [Config Editor](/config-generator) and [phone_book Editor](/phone-book-editor) |
| **Updates**                       | Re-upload files        | Re-upload files                | Re-upload files                         | Automatic in [CDN mode](./guide-for-admins/deployment/cdn.mdx)                                     |
| **Data format**                   | `phone_book.json` + FR `.txt` | Same                    | Same                                    | Same — drop-in compatible                                                                           |

The sections below walk through what these differences mean in practice.

## Every Feature, in One Place

In the CrinGraph world, features live in various places. PublicGraphTool has Preference Bound and a Device PEQ bridge; squiglink lab is what most sites deploy. To get a feature your fork lacks, you port it by hand — merging thousands of lines of unbundled JavaScript that were never designed to be combined, and hoping nothing else breaks.

modernGraphTool ships every feature in the same build, each one switchable from `config.js`:

- **[Equalizer](./features/equalizer.mdx)** — interactive parametric EQ, AutoEQ with shelf filters, per-channel bands, undo/redo, a History & Compare panel for A/B-ing revisions, and import/export.
- **Live audio preview** — play your own audio file, white or pink noise, a test tone or a sine sweep through your EQ.
- **[Device PEQ](./features/device-peq.mdx)** — push filters straight to 20+ hardware devices over USB, Serial, Bluetooth or the network.
- **[Target Customizer](./features/target-customizer.mdx)** — tilt, bass, treble and ear-gain filters on any target, with presets and per-target starting values. Operators can add more filters to the set.
- **[Preference Bound](./features/preference-bound.mdx)**, **[Average Curves](./features/average-curves.mdx)**, and multi-sample measurements drawn as averaged, per-run, min/max-band curves, or HpTF range.
- **[Cross-Site Search](./features/cross-site-search.mdx)** and the **[Site Selector](./features/site-selector.mdx)** — find a device across every database in the network, and jump between them.
- **[Frequency Tutorial](./features/frequency-tutorial.mdx)**, shareable URLs, screenshots and watermarks.

## Updates Without Touching Code

A CrinGraph site stays exactly as it was on the day it was uploaded. Every bug fix or new feature means downloading files, re-applying your edits, and uploading again — which is why most sites never update at all.

In [CDN mode](./guide-for-admins/deployment/cdn.mdx), your server keeps only your data, `config.js` and `theme.css`. The app itself loads from a CDN, and your site picks up each new release within minutes, with no action on your part.

And there is a steady stream of releases. modernGraphTool has been in active development since March 2025, and v2 has shipped various new features since its April 2026 launch — among them:

- **Per-channel EQ** — separate bands for each ear, so AutoEQ can fix channel imbalance and match a target in one go.
- **History & Compare** — A/B between EQ revisions, with full undo/redo.
- **Three new interface languages** — Czech, Russian and Ukrainian, contributed by the community.

See the [changelog](./changelog.mdx) for everything else.

## Configure Without Code

CrinGraph's `config.js` is a list of loose JavaScript variables, and the look of the page is spread across several stylesheets and inline styles inside the scripts. Customizing either means reading source code.

modernGraphTool keeps each concern in one place, and gives you tools so you rarely need to open a text editor:

- **[`config.js`](./guide-for-admins/customize-page.mdx)** — one structured object covering initial devices and targets, normalization, labels, watermarks, panel layout, rankings, languages, and every feature toggle.
- **[Config Editor](/config-generator)** — a form for every option. Import your current file, change what you need, export it back.
- **[Theme Generator](/theme-generator)** — pick a few colors and get a complete light and dark `theme.css`.
- **[phone_book.json Editor](/phone-book-editor)** — manage brands, devices and variants without hand-writing JSON.

## Keep Your Data, and Your Options

Switching doesn't lock you in.

- **Same data** — keep your `data/` folder and `phone_book.json`. modernGraphTool-only fields add to the CrinGraph format rather than replacing it, so the same files stay readable by CrinGraph.
- **Dual-hosting** — run modernGraphTool alongside your existing CrinGraph on the same domain and [transition gradually](./database-tips/dual-hosting/main-cringraph.mdx).
- **Choose your deployment** — CDN mode for automatic updates, a [pre-built release](./guide-for-admins/deployment/prebuilt.mdx) when you want control over when versions change, or [GitHub Pages](./guide-for-admins/deployment/github-pages.mdx) with no server at all.

:::note[Ready to get started?]
Coming from CrinGraph? Follow [Migrating from CrinGraph](./migrating-from-cringraph.mdx). Starting fresh? Head to the [Setup Guide](./guide-for-admins/setup-env.mdx).
:::